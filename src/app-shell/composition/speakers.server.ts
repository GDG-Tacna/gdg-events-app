import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { FirestoreAuditLog } from "@/features/admin/server";
import { currentEditionOf } from "@/features/event/server";
import { QrCodeEncoder } from "@/features/ephemeral-qr/server";
import { FirestoreSpeakerAccessStore, FirestoreSpeakerStore, type SpeakerAccessDeps, type SpeakerAdminDeps, type SpeakerCodeDeps } from "@/features/speakers/server";
import { err, ok } from "@/shared/lib/result";
import { ttlCached } from "@/shared/lib/ttl-cache";
import { recordImages } from "./media.server";
import { qrSigner } from "./qr-signer.server";

/** The edition's speakers. */
export const speakerStore = new FirestoreSpeakerStore();

/** Composition root for the admin "Speakers" screen. Photos go through the media feature. */
export const speakerAdminDeps: SpeakerAdminDeps = {
  store: speakerStore,
  images: recordImages,
  audit: new FirestoreAuditLog(),
  now: () => new Date(),
};

/** Speakers' linked accounts and invitations, on the same documents. */
export const speakerAccessStore = new FirestoreSpeakerAccessStore();

/**
 * Composition root for speakers' access: links are secrets hashed like the team invitations, and name the edition
 * they belong to (the admin's working one).
 */
export const speakerAccessDeps: SpeakerAccessDeps = {
  access: speakerAccessStore,
  audit: new FirestoreAuditLog(),
  newSecret: () => randomBytes(32).toString("base64url"),
  hash: (secret) => createHash("sha256").update(secret).digest("hex"),
  editionId: currentEditionOf,
  now: () => new Date(),
};

/** The speakers kept for a minute per edition, for screens that only name them (the agenda). An admin change clears it. */
export const keptSpeakers = ttlCached(() => speakerStore.list(), { key: currentEditionOf });

/**
 * Composition root for speakers' codes: signed with the secret the talk codes and passes use (each kind signs its own
 * prefix), drawn by the same encoder. The speaker is read fresh, so a deactivated or unlinked one stops having a code at once.
 */
export const speakerCodeDeps: SpeakerCodeDeps = {
  signer: qrSigner,
  encoder: new QrCodeEncoder(),
  speakers: {
    find: async (id) => {
      const rows = await speakerAccessStore.rows();
      if (!rows.ok) return err({ code: "unknown" });
      const row = rows.value.find((candidate) => candidate.speakerId === id);
      return ok(row ? { id: row.speakerId, name: row.name, active: row.active, uid: row.accountUid } : null);
    },
  },
  now: Date.now,
};
