import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import {
  CERTIFICATES_COLLECTION,
  CERTIFICATE_CLAIMS_COLLECTION,
  eventCollection,
} from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { IssuedCertificate } from "../../domain/certificate";
import type { CertificateStore } from "../../domain/ports";
import type { CertificateTemplate } from "../../domain/template";
import { mapCertificateDoc, toCertificateDoc } from "./certificate.mapper";

const claimDocId = (uid: string, templateId: string) => `${uid}_${templateId}`;
const MAX_CODE_ATTEMPTS = 5;

const byIssuedNewest = (a: IssuedCertificate, b: IssuedCertificate) => b.issuedAt.getTime() - a.issuedAt.getTime();

function buildIssuedRecord(input: {
  code: string;
  eventId: string;
  eventName: string;
  template: CertificateTemplate;
  uid: string | null;
  recipientName: string;
  recipientEmail: string | null;
  now: Date;
}): IssuedCertificate {
  return {
    code: input.code,
    eventId: input.eventId,
    eventName: input.eventName,
    templateId: input.template.id,
    templateName: input.template.name,
    credentialTitle: input.template.credentialTitle,
    organizationName: input.template.organizationName,
    linkedinOrganizationId: input.template.linkedinOrganizationId,
    uid: input.uid,
    recipientName: input.recipientName,
    recipientEmail: input.recipientEmail,
    issuedAt: input.now,
    issueDate: input.template.issueDate ?? input.now,
    issueDateText: input.template.issueDateText,
    revokedAt: null,
    revokedReason: null,
    nameEditedByAdminAt: null,
    updatedAt: input.now,
  };
}

/**
 * Firestore adapter (Admin SDK) over global `certificates/{code}` and per-edition
 * `events/{eventId}/certificateClaims/{uid}_{templateId}`.
 *
 * All queries are designed to work on Firestore Spark without any composite index:
 * - Public `/verificar/{code}` is a single direct document read.
 * - Cross-edition user history reads `where("uid", "==", uid)` and sorts in memory.
 * - Edition admin list reads `where("eventId", "==", eventId)` and sorts in memory.
 */
export class FirestoreCertificateStore implements CertificateStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  async claim(input: {
    eventId: string;
    eventName: string;
    template: CertificateTemplate;
    uid: string;
    recipientName: string;
    recipientEmail: string | null;
    now: Date;
    generateCode: () => string;
  }): Promise<Result<{ certificate: IssuedCertificate; alreadyClaimed: boolean }, { code: string }>> {
    try {
      const db = this.getDb();
      const claims = eventCollection(db, input.eventId, CERTIFICATE_CLAIMS_COLLECTION);
      const claimRef = claims.doc(claimDocId(input.uid, input.template.id));
      const certs = db.collection(CERTIFICATES_COLLECTION);

      return await db.runTransaction(async (tx) => {
        const existingClaim = await tx.get(claimRef);
        if (existingClaim.exists) {
          const existingCode = existingClaim.data()?.code;
          if (typeof existingCode === "string") {
            const existingCert = await tx.get(certs.doc(existingCode));
            const mapped = existingCert.exists ? mapCertificateDoc(existingCert.id, existingCert.data()) : null;
            if (mapped) return ok({ certificate: mapped, alreadyClaimed: true });
          }
        }

        for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
          const code = input.generateCode();
          const certRef = certs.doc(code);
          const collision = await tx.get(certRef);
          if (collision.exists) continue;

          const certificate = buildIssuedRecord({ ...input, code });
          tx.create(certRef, toCertificateDoc(certificate));
          tx.set(claimRef, {
            code,
            uid: input.uid,
            templateId: input.template.id,
            recipientName: input.recipientName,
            issuedAt: input.now,
          });
          return ok({ certificate, alreadyClaimed: false });
        }

        return err({ code: "unknown" });
      });
    } catch (cause) {
      logServerError("certificates.store.claim", cause);
      return err({ code: "unknown" });
    }
  }

  async issueManual(input: {
    eventId: string;
    eventName: string;
    template: CertificateTemplate;
    recipientName: string;
    recipientEmail: string | null;
    now: Date;
    generateCode: () => string;
  }): Promise<Result<IssuedCertificate, { code: string }>> {
    try {
      const db = this.getDb();
      const certs = db.collection(CERTIFICATES_COLLECTION);

      return await db.runTransaction(async (tx) => {
        for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
          const code = input.generateCode();
          const certRef = certs.doc(code);
          const collision = await tx.get(certRef);
          if (collision.exists) continue;

          const certificate = buildIssuedRecord({ ...input, uid: null, code });
          tx.create(certRef, toCertificateDoc(certificate));
          return ok(certificate);
        }
        return err({ code: "unknown" });
      });
    } catch (cause) {
      logServerError("certificates.store.issueManual", cause);
      return err({ code: "unknown" });
    }
  }

  async findByCode(code: string): Promise<Result<IssuedCertificate | null, { code: string }>> {
    try {
      const snapshot = await this.getDb().collection(CERTIFICATES_COLLECTION).doc(code).get();
      if (!snapshot.exists) return ok(null);
      return ok(mapCertificateDoc(snapshot.id, snapshot.data()));
    } catch (cause) {
      logServerError("certificates.store.findByCode", cause);
      return err({ code: "unknown" });
    }
  }

  async listByUid(uid: string, email?: string | null): Promise<Result<readonly IssuedCertificate[], { code: string }>> {
    try {
      const certs = this.getDb().collection(CERTIFICATES_COLLECTION);
      const cleanEmail = email ? email.trim().toLowerCase() : null;
      const [byUid, byEmail] = await Promise.all([
        certs.where("uid", "==", uid).get(),
        cleanEmail ? certs.where("recipientEmail", "==", cleanEmail).get() : Promise.resolve(null),
      ]);
      const seen = new Map<string, IssuedCertificate>();
      for (const doc of [...byUid.docs, ...(byEmail?.docs ?? [])]) {
        if (seen.has(doc.id)) continue;
        const mapped = mapCertificateDoc(doc.id, doc.data());
        if (mapped) seen.set(doc.id, mapped);
      }
      return ok([...seen.values()].sort(byIssuedNewest));
    } catch (cause) {
      logServerError("certificates.store.listByUid", cause);
      return err({ code: "unknown" });
    }
  }

  async listByCurrentEdition(): Promise<Result<readonly IssuedCertificate[], { code: string }>> {
    try {
      const eventId = await this.getEventId();
      const snapshot = await this.getDb().collection(CERTIFICATES_COLLECTION).where("eventId", "==", eventId).get();
      const list = snapshot.docs.flatMap((doc) => mapCertificateDoc(doc.id, doc.data()) ?? []).sort(byIssuedNewest);
      return ok(list);
    } catch (cause) {
      logServerError("certificates.store.listByCurrentEdition", cause);
      return err({ code: "unknown" });
    }
  }

  async countByTemplate(): Promise<Result<ReadonlyMap<string, number>, { code: string }>> {
    try {
      const eventId = await this.getEventId();
      const snapshot = await this.getDb().collection(CERTIFICATES_COLLECTION).where("eventId", "==", eventId).select("templateId").get();
      const counts = new Map<string, number>();
      for (const doc of snapshot.docs) {
        const templateId = doc.data().templateId;
        if (typeof templateId === "string") counts.set(templateId, (counts.get(templateId) ?? 0) + 1);
      }
      return ok(counts);
    } catch (cause) {
      logServerError("certificates.store.countByTemplate", cause);
      return err({ code: "unknown" });
    }
  }

  async countForTemplate(templateId: string): Promise<Result<number, { code: string }>> {
    try {
      const eventId = await this.getEventId();
      const snapshot = await this.getDb().collection(CERTIFICATES_COLLECTION).where("eventId", "==", eventId).select("templateId").get();
      const count = snapshot.docs.filter((doc) => doc.data().templateId === templateId).length;
      return ok(count);
    } catch (cause) {
      logServerError("certificates.store.countForTemplate", cause);
      return err({ code: "unknown" });
    }
  }

  async rename(code: string, recipientName: string, now: Date): Promise<Result<{ before: IssuedCertificate; after: IssuedCertificate } | null, { code: string }>> {
    try {
      const db = this.getDb();
      const ref = db.collection(CERTIFICATES_COLLECTION).doc(code);
      return await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const before = snap.exists ? mapCertificateDoc(snap.id, snap.data()) : null;
        if (!before) return ok(null);

        const after: IssuedCertificate = {
          ...before,
          recipientName,
          nameEditedByAdminAt: now,
          updatedAt: now,
        };
        tx.update(ref, { recipientName, nameEditedByAdminAt: now, updatedAt: now });
        if (before.uid) {
          const claimRef = eventCollection(db, before.eventId, CERTIFICATE_CLAIMS_COLLECTION).doc(claimDocId(before.uid, before.templateId));
          tx.set(claimRef, { recipientName }, { merge: true });
        }
        return ok({ before, after });
      });
    } catch (cause) {
      logServerError("certificates.store.rename", cause);
      return err({ code: "unknown" });
    }
  }

  async setRevoked(
    code: string,
    revocation: { reason: string; at: Date } | null,
    now: Date,
  ): Promise<Result<{ before: IssuedCertificate; after: IssuedCertificate } | null, { code: string }>> {
    try {
      const db = this.getDb();
      const ref = db.collection(CERTIFICATES_COLLECTION).doc(code);
      return await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const before = snap.exists ? mapCertificateDoc(snap.id, snap.data()) : null;
        if (!before) return ok(null);

        const after: IssuedCertificate = {
          ...before,
          revokedAt: revocation?.at ?? null,
          revokedReason: revocation?.reason ?? null,
          updatedAt: now,
        };
        tx.update(ref, { revokedAt: after.revokedAt, revokedReason: after.revokedReason, updatedAt: now });
        return ok({ before, after });
      });
    } catch (cause) {
      logServerError("certificates.store.setRevoked", cause);
      return err({ code: "unknown" });
    }
  }
}
