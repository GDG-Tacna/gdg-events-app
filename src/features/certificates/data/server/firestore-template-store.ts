import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { effectiveModules, parseOffModules } from "@/features/event/server";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import {
  CERTIFICATE_TEMPLATES_COLLECTION,
  EVENTS_COLLECTION,
  EVENT_CONFIG_COLLECTION,
  eventCollection,
} from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { isEventId } from "@/shared/types/event";
import type { CertificateTemplateStore, PublishedTemplateEntry } from "../../domain/ports";
import type { CertificateTemplate } from "../../domain/template";
import { mapTemplateDoc, toDate, toTemplateDoc } from "./certificate.mapper";

const isAlreadyExists = (cause: unknown) =>
  typeof cause === "object" && cause !== null && ((cause as { code?: unknown }).code === 6 || (cause as { code?: unknown }).code === "already-exists");

const byOrder = (a: CertificateTemplate, b: CertificateTemplate) => a.order - b.order || a.createdAt.getTime() - b.createdAt.getTime();

/** Firestore adapter (Admin SDK) over `events/{eventId}/certificateTemplates`. */
export class FirestoreCertificateTemplateStore implements CertificateTemplateStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  private async collection() {
    return eventCollection(this.getDb(), await this.getEventId(), CERTIFICATE_TEMPLATES_COLLECTION);
  }

  async list(): Promise<Result<readonly CertificateTemplate[], { code: string }>> {
    try {
      const snapshot = await (await this.collection()).get();
      const templates = snapshot.docs.flatMap((doc) => mapTemplateDoc(doc.id, doc.data()) ?? []).sort(byOrder);
      return ok(templates);
    } catch (cause) {
      logServerError("certificates.templates.list", cause);
      return err({ code: "unknown" });
    }
  }

  async get(id: string): Promise<Result<CertificateTemplate | null, { code: string }>> {
    try {
      const snapshot = await (await this.collection()).doc(id).get();
      if (!snapshot.exists) return ok(null);
      return ok(mapTemplateDoc(snapshot.id, snapshot.data()));
    } catch (cause) {
      logServerError("certificates.templates.get", cause);
      return err({ code: "unknown" });
    }
  }

  async getForEdition(eventId: string, templateId: string): Promise<Result<CertificateTemplate | null, { code: string }>> {
    try {
      if (!isEventId(eventId)) return ok(null);
      const snapshot = await eventCollection(this.getDb(), eventId, CERTIFICATE_TEMPLATES_COLLECTION).doc(templateId).get();
      if (!snapshot.exists) return ok(null);
      return ok(mapTemplateDoc(snapshot.id, snapshot.data()));
    } catch (cause) {
      logServerError("certificates.templates.getForEdition", cause);
      return err({ code: "unknown" });
    }
  }

  async listAllPublished(): Promise<Result<readonly PublishedTemplateEntry[], { code: string }>> {
    try {
      const db = this.getDb();
      const refs = (await db.collection(EVENTS_COLLECTION).listDocuments()).filter((ref) => isEventId(ref.id));
      if (refs.length === 0) return ok([]);
      const editionDocs = await db.getAll(...refs);

      const results = await Promise.all(
        editionDocs.map(async (editionDoc): Promise<PublishedTemplateEntry[]> => {
          const eventId = editionDoc.id;
          const [modulesSnap, templatesSnap] = await Promise.all([
            eventCollection(db, eventId, EVENT_CONFIG_COLLECTION).doc("modules").get(),
            eventCollection(db, eventId, CERTIFICATE_TEMPLATES_COLLECTION).where("published", "==", true).get(),
          ]);
          if (templatesSnap.empty) return [];
          const switches = effectiveModules(parseOffModules(modulesSnap.data()));
          if (!switches.certificates) return [];

          const data = editionDoc.data();
          const edition = {
            id: eventId,
            name: typeof data?.name === "string" && data.name.trim() !== "" ? data.name : eventId,
            startsAt: toDate(data?.startsAt),
            endsAt: toDate(data?.endsAt),
          };
          const templates = templatesSnap.docs
            .flatMap((doc) => mapTemplateDoc(doc.id, doc.data()) ?? [])
            .filter((template) => template.published && template.background !== null)
            .sort(byOrder);
          return templates.map((template) => ({ edition, template }));
        }),
      );
      return ok(results.flat());
    } catch (cause) {
      logServerError("certificates.templates.listAllPublished", cause);
      return err({ code: "unknown" });
    }
  }

  async create(template: CertificateTemplate): Promise<Result<void, { code: "already-exists" | "unknown" }>> {
    try {
      await (await this.collection()).doc(template.id).create(toTemplateDoc(template));
      return ok(undefined);
    } catch (cause) {
      if (isAlreadyExists(cause)) return err({ code: "already-exists" });
      logServerError("certificates.templates.create", cause);
      return err({ code: "unknown" });
    }
  }

  async update(template: CertificateTemplate): Promise<Result<void, { code: string }>> {
    try {
      await (await this.collection()).doc(template.id).set(toTemplateDoc(template));
      return ok(undefined);
    } catch (cause) {
      logServerError("certificates.templates.update", cause);
      return err({ code: "unknown" });
    }
  }

  async remove(id: string): Promise<Result<void, { code: string }>> {
    try {
      await (await this.collection()).doc(id).delete();
      return ok(undefined);
    } catch (cause) {
      logServerError("certificates.templates.remove", cause);
      return err({ code: "unknown" });
    }
  }
}

/**
 * In-memory TTL cache decorator for certificate templates.
 * Keeps `getForEdition` (public `/verificar/{code}`) and `listAllPublished` (`/certificados`)
 * virtually free on Firestore Spark reads while admin mutations call `invalidate()` immediately.
 */
export class CachedCertificateTemplateStore implements CertificateTemplateStore {
  private readonly byKey = new Map<string, { value: CertificateTemplate | null; expiresAt: number }>();
  private publishedCache: { value: readonly PublishedTemplateEntry[]; expiresAt: number } | null = null;

  constructor(
    private readonly store: CertificateTemplateStore,
    private readonly ttlMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  list() {
    // Admin screens always read live data.
    return this.store.list();
  }

  get(id: string) {
    return this.store.get(id);
  }

  async getForEdition(eventId: string, templateId: string): Promise<Result<CertificateTemplate | null, { code: string }>> {
    const key = `${eventId}:${templateId}`;
    const hit = this.byKey.get(key);
    if (hit && hit.expiresAt > this.now()) return ok(hit.value);
    const read = await this.store.getForEdition(eventId, templateId);
    if (read.ok) this.byKey.set(key, { value: read.value, expiresAt: this.now() + this.ttlMs });
    return read;
  }

  async listAllPublished(): Promise<Result<readonly PublishedTemplateEntry[], { code: string }>> {
    if (this.publishedCache && this.publishedCache.expiresAt > this.now()) return ok(this.publishedCache.value);
    const read = await this.store.listAllPublished();
    if (read.ok) this.publishedCache = { value: read.value, expiresAt: this.now() + this.ttlMs };
    return read;
  }

  create(template: CertificateTemplate) {
    return this.store.create(template);
  }

  update(template: CertificateTemplate) {
    return this.store.update(template);
  }

  remove(id: string) {
    return this.store.remove(id);
  }

  invalidate(): void {
    this.byKey.clear();
    this.publishedCache = null;
    this.store.invalidate?.();
  }
}
