import "server-only";
import { randomBytes } from "node:crypto";
import { cache } from "react";
import { FirestoreAuditLog } from "@/features/admin/server";
import {
  CachedCertificateTemplateStore,
  FirestoreCertificateEditionReader,
  FirestoreCertificateStore,
  FirestoreCertificateTemplateStore,
  FirestoreEligibilityLookup,
  getUserCertificatesOverview,
  verifyCertificateByCode,
  type CertificateDeps,
} from "@/features/certificates/server";
import { currentEditionOf } from "@/features/event/server";
import { ConsoleAnalytics } from "@/shared/lib/analytics/console-analytics";
import { recordImages } from "./media.server";

const templateStore = new CachedCertificateTemplateStore(new FirestoreCertificateTemplateStore(undefined, currentEditionOf));
const certificateStore = new FirestoreCertificateStore(undefined, currentEditionOf);
const eligibilityLookup = new FirestoreEligibilityLookup();
const editionReader = new FirestoreCertificateEditionReader(undefined, currentEditionOf);

/** Composition root for event certificates (admin, user portal and public verification). */
export const certificateDeps: CertificateDeps = {
  templates: templateStore,
  certificates: certificateStore,
  eligibility: eligibilityLookup,
  editions: editionReader,
  images: recordImages,
  audit: new FirestoreAuditLog(),
  analytics: new ConsoleAnalytics(),
  randomBytes: (size) => new Uint8Array(randomBytes(size)),
  now: () => new Date(),
};

/** Memoized per-request public verification lookup (shared between `generateMetadata` and `page.tsx`). */
export const readPublicCertificate = cache((rawCode: string) => verifyCertificateByCode(certificateDeps, rawCode));

/** Lightweight per-request user certificate overview (shared by entry-point callouts on Dashboard/Speaker/Staff/Onboarding). */
export const readUserCertificates = cache((actor: { uid: string; email: string | null; displayName: string | null }) =>
  getUserCertificatesOverview(certificateDeps, actor),
);
