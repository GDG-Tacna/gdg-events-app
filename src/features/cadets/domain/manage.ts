import type { TicketSource, TicketType } from "@/features/tickets";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";

/** A cadet as the admin's list shows them: their profile in the edition, nothing from their account. */
export interface CadetSummary {
  uid: string;
  alias: string;
  squad: string | null;
  xp: number;
  credits: number;
  createdAt: Date | null;
  /** When their first entrance was scanned; `null` while they have not come in. */
  attendedAt: Date | null;
  banned: boolean;
  /** Their ticket (General, Pro or Premium); a profile from before tickets existed is general. */
  ticket: TicketType;
}

/** What a cadet has done in the edition, as counts. */
export interface CadetActivity {
  checkIns: number;
  missions: number;
  badges: number;
  contacts: number;
}

/** A cadet's record in the edition: the summary, why they were blocked and what they did. */
export interface CadetRecord extends CadetSummary {
  activity: CadetActivity;
  bannedAt: Date | null;
  banReason: string | null;
  /** Where the ticket came from: the list, the default (not on the list) or a person who set it by hand. */
  ticketSource: TicketSource;
  /** The uid of whoever set it by hand, or `null`. */
  ticketSetBy: string | null;
  ticketSetAt: Date | null;
}

/** Who a cadet is outside the edition: the sign-in account. */
export interface CadetAccount {
  email: string | null;
  displayName: string | null;
  /** The role claim of the account (`attendee`, `staff`, `admin`...), or `null` before they registered. */
  role: string | null;
  /** Whether the account is disabled in the identity provider (it cannot sign in anywhere). */
  disabled: boolean;
}

/** Who a cadet is by name: what their sign-in account says (the list shows it next to the alias). */
export interface CadetIdentity {
  email: string | null;
  displayName: string | null;
}

/** A cadet in the list: the profile plus their account's name and email, `null` when the account could not be read. */
export interface CadetListItem extends CadetSummary {
  identity: CadetIdentity | null;
}

/** A cadet with the key their alias is ordered and paged by (the alias in lowercase). */
export interface IndexedCadet extends CadetSummary {
  aliasKey: string;
}

/** What the store answers: profiles only, no accounts. */
export interface CadetPage {
  cadets: readonly CadetSummary[];
  /** The alias key to ask the next page after, or `null` at the end. */
  next: string | null;
  /** How many cadets the edition has in all (not only this page). */
  total: number;
}

/** What deleting a cadet removed from the edition, for the audit line and the message. */
export interface CadetRemoval {
  alias: string;
  checkIns: number;
  missions: number;
  badges: number;
  contacts: number;
}

/** A page of the list, with each cadet's name and email. */
export interface CadetListPage {
  cadets: readonly CadetListItem[];
  next: string | null;
  total: number;
}

export const CADETS_PAGE_SIZE = 25;
/** Longest search kept: enough for a whole email. */
export const CADETS_SEARCH_MAX = 80;
export const BAN_REASON_MAX = 200;

export type CadetsErrorCode =
  | "invalid-alias"
  | "alias-taken"
  | "unknown-squad"
  | "invalid-reason"
  /** The account has a team role (admin, staff, organizer) or is the one asking: it cannot be blocked from here. */
  | "protected-account"
  | "own-account"
  /** Only an admin of every edition deletes a cadet. */
  | "forbidden-delete"
  | "not-found"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

export interface CadetsError {
  code: CadetsErrorCode;
}

const cadetsError = (code: CadetsErrorCode): CadetsError => ({ code });

export interface CadetStore {
  /** Cadets by alias, after `after` (an alias key). */
  list(query: { after: string | null; limit: number }): Promise<Result<CadetPage, { code: string }>>;
  /** Every cadet of the edition (a few hundred), for a search; `total` counts every profile, as `list` does. */
  listAll(): Promise<Result<{ cadets: readonly IndexedCadet[]; total: number }, { code: string }>>;
  /** `null` when there is no such cadet in the edition. */
  get(uid: string): Promise<Result<CadetRecord | null, { code: string }>>;
  /** Changes the alias and its reservation in one transaction; `taken` when another cadet holds it. */
  rename(uid: string, alias: { display: string; key: string }): Promise<Result<{ before: string } | "taken" | null, { code: string }>>;
  /** `null` when there is no such cadet. */
  setSquad(uid: string, squad: string | null): Promise<Result<{ before: string | null } | null, { code: string }>>;
  /** Marks (or, with `null`, clears) the block on the cadet's profile. `null` result when there is no such cadet. */
  setBan(uid: string, ban: { reason: string; by: string; at: Date } | null): Promise<Result<{ wasBanned: boolean } | null, { code: string }>>;
  /** Removes the cadet and everything that is theirs in the edition; `null` when there is no such cadet. */
  remove(uid: string): Promise<Result<CadetRemoval | null, { code: string }>>;
}

/** The sign-in accounts (the identity provider answers it). */
export interface AccountDirectory {
  /** The name and email of several accounts at once; an account that does not exist is simply absent from the map. */
  lookupMany(uids: readonly string[]): Promise<Result<ReadonlyMap<string, CadetIdentity>, { code: string }>>;
  /** `null` when the account does not exist. */
  lookup(uid: string): Promise<Result<CadetAccount | null, { code: string }>>;
  /** Disables or enables the account. Disabling also signs the person out everywhere, so it applies at once. */
  setDisabled(uid: string, disabled: boolean): Promise<Result<void, { code: string }>>;
}

export interface CadetAuditEntry {
  action: "cadet.renamed" | "cadet.squad" | "cadet.banned" | "cadet.unbanned" | "cadet.deleted" | "cadet.ticket";
  actorUid: string;
  targetUid: string;
  details: Record<string, string | null>;
  at: Date;
}

export interface CadetsDeps {
  store: CadetStore;
  accounts: AccountDirectory;
  /** The alias rules (the attendee feature owns them); the key is what makes an alias unique. */
  aliases: { check(raw: string): Result<{ display: string; key: string }, string> };
  /** Whether a squad exists in the edition (the squads feature answers it), retired ones included. */
  squads: {
    exists(id: string): Promise<Result<boolean, { code: string }>>;
    /** Every squad's name by id, retired ones included, so a search finds their old members too. */
    names(): Promise<Result<ReadonlyMap<string, string>, { code: string }>>;
  };
  audit: { append(entry: CadetAuditEntry): Promise<Result<void, { code: string }>> };
  now: () => Date;
}

/** Who is asking. The server action takes it from the verified session, never from the request. */
export interface CadetsActor {
  uid: string;
  role: "attendee" | "staff" | "admin" | null;
  adminScope?: "global" | "edition";
}

const forbidden = (actor: CadetsActor) => actor.role !== "admin";
const isUid = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{6,128}$/.test(value);

async function audit(deps: Pick<CadetsDeps, "audit" | "now">, entry: Omit<CadetAuditEntry, "at">): Promise<void> {
  const written = await deps.audit.append({ ...entry, at: deps.now() });
  // A change that already happened is not undone by a missing audit line, but it must not go unnoticed.
  if (!written.ok) logServerError("cadets.audit.append", new Error(`audit entry missing for ${entry.targetUid}`));
}

/** Text folded for a search: lowercase, without accents, with single spaces. */
export const foldForSearch = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Whether a folded search appears anywhere in the cadet's alias, sign-in name, email or squad (its name or id). */
export function matchesCadet(
  search: string,
  fields: { alias: string; displayName?: string | null; email?: string | null; squadId?: string | null; squadName?: string | null },
): boolean {
  return [fields.alias, fields.displayName, fields.email, fields.squadId, fields.squadName].some((field) => typeof field === "string" && foldForSearch(field).includes(search));
}

/** The name and email of each cadet, by uid; when the accounts cannot be read the list still shows, without them. */
async function identitiesOf(deps: Pick<CadetsDeps, "accounts">, cadets: readonly CadetSummary[]): Promise<ReadonlyMap<string, CadetIdentity>> {
  const identities = await deps.accounts.lookupMany(cadets.map((cadet) => cadet.uid));
  if (identities.ok) return identities.value;
  logServerError("cadets.list.accounts", new Error(identities.error.code));
  return new Map();
}

/** A search match as a list item, without the alias key it was ordered by. */
const withIdentity = (cadet: IndexedCadet, identities: ReadonlyMap<string, CadetIdentity>): CadetListItem => ({
  uid: cadet.uid,
  alias: cadet.alias,
  squad: cadet.squad,
  xp: cadet.xp,
  credits: cadet.credits,
  createdAt: cadet.createdAt,
  attendedAt: cadet.attendedAt,
  banned: cadet.banned,
  ticket: cadet.ticket,
  identity: identities.get(cadet.uid) ?? null,
});

/**
 * One page of the edition's cadets, by alias, each with the name and email of their account. With a search it keeps
 * those where the text appears in the alias, the account's name or email, or the squad: the edition has a few hundred
 * cadets, so they are read whole and matched here, then paged by alias like the plain list.
 */
export async function listCadets(
  deps: Pick<CadetsDeps, "store" | "accounts" | "squads">,
  actor: CadetsActor,
  query: { search?: string; after?: string | null },
): Promise<Result<CadetListPage, CadetsError>> {
  if (forbidden(actor)) return err(cadetsError("forbidden"));
  const search = foldForSearch((query.search ?? "").slice(0, CADETS_SEARCH_MAX));
  const after = query.after && query.after.length <= 80 ? query.after : null;

  if (!search) {
    const listed = await deps.store.list({ after, limit: CADETS_PAGE_SIZE });
    if (!listed.ok) return err(cadetsError("unknown"));
    const identities = await identitiesOf(deps, listed.value.cadets);
    const cadets = listed.value.cadets.map((cadet) => ({ ...cadet, identity: identities.get(cadet.uid) ?? null }));
    return ok({ cadets, next: listed.value.next, total: listed.value.total });
  }

  const all = await deps.store.listAll();
  if (!all.ok) return err(cadetsError("unknown"));
  // The accounts and the squads' names only widen the search: without them it still finds by alias and squad id.
  const [identities, squadNames] = await Promise.all([identitiesOf(deps, all.value.cadets), deps.squads.names()]);
  const squadName = (id: string | null) => (id && squadNames.ok ? squadNames.value.get(id) : null);

  const matches = all.value.cadets
    .filter((cadet) => matchesCadet(search, { alias: cadet.alias, ...identities.get(cadet.uid), squadId: cadet.squad, squadName: squadName(cadet.squad) }))
    .filter((cadet) => after === null || cadet.aliasKey > after)
    .sort((a, b) => (a.aliasKey < b.aliasKey ? -1 : a.aliasKey > b.aliasKey ? 1 : 0));
  const page = matches.slice(0, CADETS_PAGE_SIZE);
  const last = page.at(-1);
  return ok({
    cadets: page.map((cadet) => withIdentity(cadet, identities)),
    next: matches.length > CADETS_PAGE_SIZE && last ? last.aliasKey : null,
    total: all.value.total,
  });
}

/** A cadet's record with the account behind it (email, whether it is disabled). */
export async function getCadet(
  deps: Pick<CadetsDeps, "store" | "accounts">,
  actor: CadetsActor,
  input: { uid: string },
): Promise<Result<{ cadet: CadetRecord; account: CadetAccount | null }, CadetsError>> {
  if (forbidden(actor)) return err(cadetsError("forbidden"));
  if (!isUid(input.uid)) return err(cadetsError("not-found"));
  const found = await deps.store.get(input.uid);
  if (!found.ok) return err(cadetsError("unknown"));
  if (found.value === null) return err(cadetsError("not-found"));
  // The account only adds detail: without it the record still shows.
  const account = await deps.accounts.lookup(input.uid);
  return ok({ cadet: found.value, account: account.ok ? account.value : null });
}

/** Changes a cadet's alias, with the same rules as when they chose it (and the same uniqueness). */
export async function renameCadet(deps: CadetsDeps, actor: CadetsActor, input: { uid: string; alias: string }): Promise<Result<string, CadetsError>> {
  if (forbidden(actor)) return err(cadetsError("forbidden"));
  if (!isUid(input.uid)) return err(cadetsError("not-found"));
  const checked = deps.aliases.check(input.alias);
  if (!checked.ok) return err(cadetsError("invalid-alias"));

  const renamed = await deps.store.rename(input.uid, checked.value);
  if (!renamed.ok) return err(cadetsError("unknown"));
  if (renamed.value === null) return err(cadetsError("not-found"));
  if (renamed.value === "taken") return err(cadetsError("alias-taken"));
  if (renamed.value.before !== checked.value.display) {
    await audit(deps, { action: "cadet.renamed", actorUid: actor.uid, targetUid: input.uid, details: { from: renamed.value.before, to: checked.value.display } });
  }
  return ok(checked.value.display);
}

/** Moves a cadet to another squad, or takes them out of theirs (`null`). Their XP follows them: squads add up their members' XP. */
export async function changeCadetSquad(deps: CadetsDeps, actor: CadetsActor, input: { uid: string; squad: string | null }): Promise<Result<void, CadetsError>> {
  if (forbidden(actor)) return err(cadetsError("forbidden"));
  if (!isUid(input.uid)) return err(cadetsError("not-found"));
  if (input.squad !== null) {
    const known = await deps.squads.exists(input.squad);
    if (!known.ok) return err(cadetsError("unknown"));
    if (!known.value) return err(cadetsError("unknown-squad"));
  }

  const changed = await deps.store.setSquad(input.uid, input.squad);
  if (!changed.ok) return err(cadetsError("unknown"));
  if (changed.value === null) return err(cadetsError("not-found"));
  if (changed.value.before !== input.squad) {
    await audit(deps, { action: "cadet.squad", actorUid: actor.uid, targetUid: input.uid, details: { from: changed.value.before, to: input.squad } });
  }
  return ok(undefined);
}

/**
 * Blocks a cadet: their account is disabled (it cannot sign in, to any edition) and their sessions end at once, and
 * the block is marked on their profile with the reason. Never someone with a team role, nor the one asking.
 */
export async function banCadet(deps: CadetsDeps, actor: CadetsActor, input: { uid: string; reason: string }): Promise<Result<void, CadetsError>> {
  if (forbidden(actor)) return err(cadetsError("forbidden"));
  if (!isUid(input.uid)) return err(cadetsError("not-found"));
  if (input.uid === actor.uid) return err(cadetsError("own-account"));
  const reason = input.reason.trim().replace(/\s+/g, " ");
  if (reason.length < 3 || reason.length > BAN_REASON_MAX) return err(cadetsError("invalid-reason"));

  const found = await deps.store.get(input.uid);
  if (!found.ok) return err(cadetsError("unknown"));
  if (found.value === null) return err(cadetsError("not-found"));
  const account = await deps.accounts.lookup(input.uid);
  if (!account.ok) return err(cadetsError("unknown"));
  if (account.value?.role === "admin" || account.value?.role === "staff" || account.value?.role === "organizer") return err(cadetsError("protected-account"));

  // The account first: if marking the profile fails afterwards the person is already out, and trying again is safe.
  const disabled = await deps.accounts.setDisabled(input.uid, true);
  if (!disabled.ok) return err(cadetsError("unknown"));
  const marked = await deps.store.setBan(input.uid, { reason, by: actor.uid, at: deps.now() });
  if (!marked.ok) return err(cadetsError("unknown"));
  if (marked.value === null) return err(cadetsError("not-found"));

  await audit(deps, { action: "cadet.banned", actorUid: actor.uid, targetUid: input.uid, details: { alias: found.value.alias, reason } });
  return ok(undefined);
}

/** Lets a blocked cadet in again: their account is enabled and the mark is cleared. */
export async function unbanCadet(deps: CadetsDeps, actor: CadetsActor, input: { uid: string }): Promise<Result<void, CadetsError>> {
  if (forbidden(actor)) return err(cadetsError("forbidden"));
  if (!isUid(input.uid)) return err(cadetsError("not-found"));

  const found = await deps.store.get(input.uid);
  if (!found.ok) return err(cadetsError("unknown"));
  if (found.value === null) return err(cadetsError("not-found"));

  const enabled = await deps.accounts.setDisabled(input.uid, false);
  if (!enabled.ok) return err(cadetsError("unknown"));
  const cleared = await deps.store.setBan(input.uid, null);
  if (!cleared.ok) return err(cadetsError("unknown"));
  if (cleared.value === null) return err(cadetsError("not-found"));

  await audit(deps, { action: "cadet.unbanned", actorUid: actor.uid, targetUid: input.uid, details: { alias: found.value.alias } });
  return ok(undefined);
}

/**
 * Deletes a cadet from the edition, for a registration made by mistake: their profile, alias and everything they did
 * there (check-ins, missions, badges, contacts, votes, and the XP and G-Credits that came with them). Their sign-in
 * account stays, so they can register again. Only an admin of every edition may do it.
 */
export async function deleteCadet(deps: CadetsDeps, actor: CadetsActor, input: { uid: string }): Promise<Result<CadetRemoval, CadetsError>> {
  if (forbidden(actor)) return err(cadetsError("forbidden"));
  if (actor.adminScope !== "global") return err(cadetsError("forbidden-delete"));
  if (!isUid(input.uid)) return err(cadetsError("not-found"));
  if (input.uid === actor.uid) return err(cadetsError("own-account"));

  const removed = await deps.store.remove(input.uid);
  if (!removed.ok) return err(cadetsError("unknown"));
  if (removed.value === null) return err(cadetsError("not-found"));

  await audit(deps, {
    action: "cadet.deleted",
    actorUid: actor.uid,
    targetUid: input.uid,
    details: {
      alias: removed.value.alias,
      checkIns: String(removed.value.checkIns),
      missions: String(removed.value.missions),
      badges: String(removed.value.badges),
      contacts: String(removed.value.contacts),
    },
  });
  return ok(removed.value);
}
