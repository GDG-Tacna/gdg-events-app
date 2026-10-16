import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { parseLook, type AvatarLook } from "@/shared/ui/pixel/avatar-look";

export type AvatarErrorCode = "invalid-look" | "unauthenticated" | "forbidden" | "disabled" | "unknown";

/** Each person's chosen look, global (it follows them to every edition). */
export interface AvatarStore {
  /** `null` while the person has not chosen one (their alias gives it). */
  get(uid: string): Promise<Result<AvatarLook | null, { code: string }>>;
  save(uid: string, look: AvatarLook, at: Date): Promise<Result<void, { code: string }>>;
  /** Forgets the chosen look: the alias gives it again. */
  remove(uid: string): Promise<Result<void, { code: string }>>;
}

export interface AvatarDeps {
  store: AvatarStore;
  now: () => Date;
}

/** Only a cadet edits their own avatar, from their verified session. */
const isCadet = (actor: { role: string | null }) => actor.role === "attendee";

/** The look a person chose, or `null` (their alias gives it). A failed read is `null` too: the avatar is decoration. */
export async function getAvatarLook(deps: Pick<AvatarDeps, "store">, uid: string): Promise<AvatarLook | null> {
  const found = await deps.store.get(uid);
  if (!found.ok) {
    logServerError("avatar.get", new Error(found.error.code));
    return null;
  }
  return found.value;
}

/** Saves the cadet's look after checking every choice is one the editor offers. */
export async function saveAvatarLook(deps: AvatarDeps, actor: { uid: string; role: string | null }, input: unknown): Promise<Result<AvatarLook, { code: AvatarErrorCode }>> {
  if (!isCadet(actor)) return err({ code: "forbidden" });
  const look = parseLook(input);
  if (!look) return err({ code: "invalid-look" });
  const saved = await deps.store.save(actor.uid, look, deps.now());
  return saved.ok ? ok(look) : err({ code: "unknown" });
}

/** Goes back to the look the alias gives. */
export async function resetAvatarLook(deps: Pick<AvatarDeps, "store">, actor: { uid: string; role: string | null }): Promise<Result<void, { code: AvatarErrorCode }>> {
  if (!isCadet(actor)) return err({ code: "forbidden" });
  const removed = await deps.store.remove(actor.uid);
  return removed.ok ? ok(undefined) : err({ code: "unknown" });
}
