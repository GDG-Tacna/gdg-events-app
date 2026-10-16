import { chooseImage, type ImageRef, type RecordImages } from "@/features/media/constants";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { checkPollDraft, comparePolls, isPollId, optionId, type Poll, type PollDataErrorCode, type PollDraft, type PollTally } from "./poll";

export type PollAdminErrorCode =
  | PollDataErrorCode
  | "invalid-image"
  | "not-found"
  /** Only a draft can be changed, opened or deleted; only an open poll can be closed. */
  | "wrong-status"
  /** Another poll is open: close it first (one live poll at a time). */
  | "another-open"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

export interface PollAdminError {
  code: PollAdminErrorCode;
}
const fail = (code: PollAdminErrorCode) => err<PollAdminError>({ code });

/** The fields a draft's edit replaces. */
export type PollContent = Pick<Poll, "question" | "options" | "changeable" | "reward">;

export interface PollStore {
  /** Every poll of the edition. */
  list(): Promise<Result<readonly Poll[], { code: string }>>;
  create(poll: Poll): Promise<Result<void, { code: string }>>;
  /** Replaces a draft's content (one transaction). `null` when there is no such poll. */
  updateDraft(id: string, content: PollContent): Promise<Result<{ before: Poll; after: Poll } | "wrong-status" | null, { code: string }>>;
  /** Opens a draft unless another poll is open (one transaction). */
  open(id: string, at: Date): Promise<Result<Poll | "wrong-status" | "another-open" | null, { code: string }>>;
  /** Closes an open poll for good. */
  close(id: string, at: Date): Promise<Result<Poll | "wrong-status" | null, { code: string }>>;
  /** Deletes a draft (it has no votes). */
  removeDraft(id: string): Promise<Result<Poll | "wrong-status" | null, { code: string }>>;
  /** How many voted each option. */
  tally(id: string): Promise<Result<PollTally, { code: string }>>;
}

export interface PollAuditEntry {
  action: "poll.created" | "poll.updated" | "poll.opened" | "poll.closed" | "poll.deleted";
  actorUid: string;
  targetUid: string;
  details: Record<string, string | null>;
  at: Date;
}

export interface PollAdminDeps {
  store: PollStore;
  images: RecordImages;
  audit: { append(entry: PollAuditEntry): Promise<Result<void, { code: string }>> };
  /** A new poll id (slug-shaped, unique). */
  newId: () => string;
  now: () => Date;
}

export interface PollAdminActor {
  uid: string;
  role: "attendee" | "staff" | "admin" | null;
}

const forbidden = (actor: PollAdminActor) => actor.role !== "admin";

async function audit(deps: Pick<PollAdminDeps, "audit" | "now">, entry: Omit<PollAuditEntry, "at">): Promise<void> {
  const written = await deps.audit.append({ ...entry, at: deps.now() });
  if (!written.ok) logServerError("polls.audit.append", new Error(`audit entry missing for ${entry.targetUid}`));
}

/** A draft checked and with its options' images resolved (each must be an upload made for a poll option). */
function contentOf(deps: Pick<PollAdminDeps, "images">, draft: PollDraft): Result<PollContent, PollAdminError> {
  const checked = checkPollDraft(draft);
  if (!checked.ok) return fail(checked.error);
  const options = [];
  for (const [index, text] of checked.value.options.entries()) {
    const choice = chooseImage(deps.images, "poll-option", draft.options[index]?.imagePath ?? null);
    if (!choice || choice.keep) return fail("invalid-image");
    options.push({ id: optionId(index), text, image: choice.image });
  }
  return ok({ question: checked.value.question, options, changeable: checked.value.changeable, reward: checked.value.reward });
}

const imagesOf = (poll: Pick<Poll, "options">): ImageRef[] => poll.options.flatMap((option) => (option.image ? [option.image] : []));

/** Deletes the pictures a poll no longer uses. */
async function dropUnused(deps: Pick<PollAdminDeps, "images">, before: Pick<Poll, "options">, after: Pick<Poll, "options"> | null): Promise<void> {
  const kept = new Set(after ? imagesOf(after).map((image) => image.path) : []);
  for (const image of imagesOf(before)) if (!kept.has(image.path)) await deps.images.remove(image.path);
}

/** The edition's polls: the open one first, then drafts, then closed ones. */
export async function listPolls(deps: Pick<PollAdminDeps, "store">, actor: PollAdminActor): Promise<Result<readonly Poll[], PollAdminError>> {
  if (forbidden(actor)) return fail("forbidden");
  const listed = await deps.store.list();
  return listed.ok ? ok([...listed.value].sort(comparePolls)) : fail("unknown");
}

/** A new draft poll. */
export async function createPoll(deps: PollAdminDeps, actor: PollAdminActor, input: { draft: PollDraft }): Promise<Result<Poll, PollAdminError>> {
  if (forbidden(actor)) return fail("forbidden");
  const content = contentOf(deps, input.draft);
  if (!content.ok) return content;
  const poll: Poll = { id: deps.newId(), ...content.value, status: "draft", createdAt: deps.now(), openedAt: null, closedAt: null };
  const saved = await deps.store.create(poll);
  if (!saved.ok) return fail("unknown");
  await audit(deps, { action: "poll.created", actorUid: actor.uid, targetUid: poll.id, details: { question: poll.question } });
  return ok(poll);
}

/** Changes a draft (once open, what cadets voted on never changes). */
export async function updatePoll(deps: PollAdminDeps, actor: PollAdminActor, input: { id: string; draft: PollDraft }): Promise<Result<Poll, PollAdminError>> {
  if (forbidden(actor)) return fail("forbidden");
  if (!isPollId(input.id)) return fail("not-found");
  const content = contentOf(deps, input.draft);
  if (!content.ok) return content;
  const updated = await deps.store.updateDraft(input.id, content.value);
  if (!updated.ok) return fail("unknown");
  if (updated.value === null) return fail("not-found");
  if (updated.value === "wrong-status") return fail("wrong-status");
  await dropUnused(deps, updated.value.before, updated.value.after);
  await audit(deps, { action: "poll.updated", actorUid: actor.uid, targetUid: input.id, details: { question: updated.value.after.question } });
  return ok(updated.value.after);
}

/** Opens a draft for voting; refused while another poll is open. */
export async function openPoll(deps: PollAdminDeps, actor: PollAdminActor, input: { id: string }): Promise<Result<Poll, PollAdminError>> {
  if (forbidden(actor)) return fail("forbidden");
  const opened = await deps.store.open(input.id, deps.now());
  if (!opened.ok) return fail("unknown");
  if (opened.value === null) return fail("not-found");
  if (typeof opened.value === "string") return fail(opened.value);
  await audit(deps, { action: "poll.opened", actorUid: actor.uid, targetUid: input.id, details: { question: opened.value.question } });
  return ok(opened.value);
}

/** Closes the open poll for good: no more votes, the results stay. */
export async function closePoll(deps: PollAdminDeps, actor: PollAdminActor, input: { id: string }): Promise<Result<Poll, PollAdminError>> {
  if (forbidden(actor)) return fail("forbidden");
  const closed = await deps.store.close(input.id, deps.now());
  if (!closed.ok) return fail("unknown");
  if (closed.value === null) return fail("not-found");
  if (closed.value === "wrong-status") return fail("wrong-status");
  await audit(deps, { action: "poll.closed", actorUid: actor.uid, targetUid: input.id, details: { question: closed.value.question } });
  return ok(closed.value);
}

/** Deletes a draft and its pictures (a poll that was ever open keeps its votes, so it is never deleted). */
export async function deletePoll(deps: PollAdminDeps, actor: PollAdminActor, input: { id: string }): Promise<Result<void, PollAdminError>> {
  if (forbidden(actor)) return fail("forbidden");
  const removed = await deps.store.removeDraft(input.id);
  if (!removed.ok) return fail("unknown");
  if (removed.value === null) return fail("not-found");
  if (removed.value === "wrong-status") return fail("wrong-status");
  await dropUnused(deps, removed.value, null);
  await audit(deps, { action: "poll.deleted", actorUid: actor.uid, targetUid: input.id, details: { question: removed.value.question } });
  return ok(undefined);
}

/** A poll with how many voted each option (for the admin's results and the stage). */
export async function pollResults(deps: Pick<PollAdminDeps, "store">, actor: PollAdminActor, input: { id: string }): Promise<Result<{ poll: Poll; tally: PollTally }, PollAdminError>> {
  if (forbidden(actor)) return fail("forbidden");
  const listed = await deps.store.list();
  if (!listed.ok) return fail("unknown");
  const poll = listed.value.find((candidate) => candidate.id === input.id);
  if (!poll) return fail("not-found");
  const tally = await deps.store.tally(poll.id);
  return tally.ok ? ok({ poll, tally: tally.value }) : fail("unknown");
}
