import type { CommunicationDraft, OdysseyAdminErrorCode } from "../domain/manage";

export type OdysseyAdminActionResult = { ok: true } | { ok: false; code: OdysseyAdminErrorCode };
export type SeedCommunicationsAction = () => Promise<OdysseyAdminActionResult>;
export type SaveCommunicationAction = (input: { id: string; draft: CommunicationDraft }) => Promise<OdysseyAdminActionResult>;
export type SetCommunicationActiveAction = (input: { id: string; active: boolean }) => Promise<OdysseyAdminActionResult>;
export type MoveCommunicationAction = (input: { id: string; to: number }) => Promise<OdysseyAdminActionResult>;
export type SaveStoryTitleAction = (input: { title: string }) => Promise<OdysseyAdminActionResult>;
