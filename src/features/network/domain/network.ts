import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import {
  CONTACT_CODE_LIFETIME_SECONDS,
  CONTACT_CODE_MAX_FUTURE_SECONDS,
  contactSigningInput,
  formatContactCode,
  parseContactCode,
} from "./contact-code";
import { LINK_KINDS, normalizeLink, type ContactLinks, type LinkKind } from "./links";

/**
 * The cadet network: a cadet shows their contact code, another scans it, and both become contacts, once per
 * pair. Each card shows only the alias, the squad and the links the cadet chose (never an email). A new contact
 * pays both cadets the edition's reward, up to the edition's cap of paid contacts per cadet.
 */

/** One contact between two cadets of the edition. The id is the sorted pair, so a pair is one contact. */
export interface Contact {
  id: string;
  /** The two cadets, sorted. */
  uids: readonly [string, string];
  /** Who scanned whom does not matter for the contact; kept for the record. */
  scannedBy: string;
  createdAt: Date;
}

export const contactId = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`);
const sortedPair = (a: string, b: string): readonly [string, string] => (a < b ? [a, b] : [b, a]);

/** What another cadet sees of a cadet: alias, squad name and the links they chose. */
export interface CadetCard {
  alias: string;
  squad: string | null;
  links: ContactLinks;
}

export interface ContactStore {
  /** Creates the pair's contact unless it exists (a transaction); says whether this call created it. */
  connect(contact: Contact): Promise<Result<{ contact: Contact; created: boolean }, { code: string }>>;
  /** Every contact of a cadet in this edition, in no particular order. */
  listFor(uid: string): Promise<Result<readonly Contact[], { code: string }>>;
  /** How many contacts a cadet has in this edition, without reading them (one aggregation read). */
  countFor(uid: string): Promise<Result<number, { code: string }>>;
  /**
   * Holds one of the cadet's `cap` paid slots for their contact with `other`, in one transaction over the cadet's
   * slots (so parallel scans can never pay past the cap): true when the pair has a slot, now or from an earlier scan,
   * false when every slot is taken by other contacts.
   */
  reserveRewardSlot(uid: string, other: string, cap: number): Promise<Result<boolean, { code: string }>>;
}

export interface CardStore {
  linksOf(uids: readonly string[]): Promise<Result<ReadonlyMap<string, ContactLinks>, { code: string }>>;
  saveLinks(uid: string, links: ContactLinks): Promise<Result<void, { code: string }>>;
}

/** Who the cadets are in this edition (the attendee and squads features answer it); a missing uid is not registered. */
export interface CadetDirectory {
  profiles(uids: readonly string[]): Promise<Result<ReadonlyMap<string, { alias: string; squad: string | null }>, { code: string }>>;
}

export interface ContactReward {
  xp: number;
  credits: number;
  /** How many contacts per cadet pay the reward. */
  cap: number;
}

export interface NetworkDeps {
  contacts: ContactStore;
  cards: CardStore;
  cadets: CadetDirectory;
  signer: { sign(input: string): string; verify(input: string, signature: string): boolean };
  encoder: { encode(text: string): readonly string[] };
  /** The edition's reward per new contact (Economía). */
  reward: () => Promise<ContactReward>;
  ledger: { grant(grant: { uid: string; source: `contact:${string}`; xp: number; credits: number }): Promise<Result<{ granted: boolean }, { code: string }>> };
  /** Milliseconds since the epoch. */
  now: () => number;
}

export interface NetworkActor {
  uid: string;
  role: "attendee" | "staff" | "admin" | null;
}

export type NetworkErrorCode =
  /** Not a contact code, forged, or altered. */
  | "invalid-code"
  /** A genuine code whose time is over: ask for the one on screen now. */
  | "expired-code"
  /** The cadet scanned their own code. */
  | "self"
  /** The code is genuine but its cadet is not registered in this edition. */
  | "unknown-cadet"
  | "invalid-linkedin"
  | "invalid-github"
  | "invalid-web"
  | "not-registered"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

export interface NetworkError {
  code: NetworkErrorCode;
}

const fail = (code: NetworkErrorCode) => err<NetworkError>({ code });

export interface IssuedContactCode {
  /** The picture: rows of "1" and "0" without the quiet zone. The signed text stays on the server. */
  cells: readonly string[];
  /** Server clock, in ms. */
  issuedAt: number;
  expiresAt: number;
}

/** A cadet's own contact code for another cadet to scan: signed, short-lived, nothing stored. The uid comes from the session. */
export function issueContactCode(deps: Pick<NetworkDeps, "signer" | "encoder" | "now">, actor: NetworkActor): Result<IssuedContactCode, NetworkError> {
  if (actor.role !== "attendee") return fail("forbidden");
  try {
    const issuedAt = deps.now();
    const expiresAtSeconds = Math.floor(issuedAt / 1000) + CONTACT_CODE_LIFETIME_SECONDS;
    const payload = formatContactCode(actor.uid, expiresAtSeconds, deps.signer.sign(contactSigningInput(actor.uid, expiresAtSeconds)));
    return ok({ cells: deps.encoder.encode(payload), issuedAt, expiresAt: expiresAtSeconds * 1000 });
  } catch (cause) {
    // Most likely the signing secret is missing or too short: say so in the server log.
    logServerError("network.code.issue", cause);
    return fail("unknown");
  }
}

/** The cadet a scanned code belongs to. The signature is checked before the expiry, so only a real code is ever "expired". */
export function verifyContactCode(deps: Pick<NetworkDeps, "signer" | "now">, payload: string): Result<string, NetworkError> {
  const parsed = parseContactCode(payload);
  if (!parsed) return fail("invalid-code");
  let genuine: boolean;
  try {
    genuine = deps.signer.verify(contactSigningInput(parsed.uid, parsed.expiresAt), parsed.signature);
  } catch (cause) {
    logServerError("network.code.verify", cause);
    return fail("invalid-code");
  }
  if (!genuine) return fail("invalid-code");
  const nowSeconds = Math.floor(deps.now() / 1000);
  if (parsed.expiresAt < nowSeconds) return fail("expired-code");
  if (parsed.expiresAt > nowSeconds + CONTACT_CODE_MAX_FUTURE_SECONDS) return fail("invalid-code");
  return ok(parsed.uid);
}

const byAge = (a: Contact, b: Contact) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);

/**
 * Pays one cadet for one contact if the pair holds one of their `cap` paid slots (taken in a transaction, so scans
 * made at the same moment cannot all pay). Once per pair and cadet: the ledger source is the other cadet. Answers
 * what this call paid; a failure is logged and pays nothing (the slot stays, so the next scan of the pair retries).
 */
async function payContact(deps: NetworkDeps, uid: string, other: string, reward: ContactReward): Promise<{ xp: number; credits: number; capped: boolean }> {
  const none = { xp: 0, credits: 0, capped: false };
  if (reward.xp + reward.credits === 0) return none;
  const slot = await deps.contacts.reserveRewardSlot(uid, other, reward.cap);
  if (!slot.ok) {
    logServerError("network.reward.slot", new Error(slot.error.code));
    return none;
  }
  if (!slot.value) return { ...none, capped: true };

  const granted = await deps.ledger.grant({ uid, source: `contact:${other}`, xp: reward.xp, credits: reward.credits });
  if (!granted.ok) {
    logServerError("network.reward.grant", new Error(granted.error.code));
    return none;
  }
  return granted.value.granted ? { xp: reward.xp, credits: reward.credits, capped: false } : none;
}

export interface ConnectOutcome {
  /** The other cadet's card. */
  card: CadetCard;
  /** False when the two were already contacts. */
  created: boolean;
  /** What this scan paid the scanning cadet (0 when already paid or past the cap). */
  xpEarned: number;
  creditsEarned: number;
  /** The scanning cadet is past the edition's cap of paid contacts: the contact counts, it pays nothing. */
  capReached: boolean;
}

/**
 * Makes two cadets contacts from a scanned contact code. Both must be registered in this edition and different.
 * Both are paid (each once per pair, up to the cap) on every scan of the pair, so a payment that failed is retried.
 */
export async function connectCadets(deps: NetworkDeps, actor: NetworkActor, payload: string): Promise<Result<ConnectOutcome, NetworkError>> {
  if (actor.role !== "attendee") return fail("forbidden");
  const scanned = verifyContactCode(deps, payload);
  if (!scanned.ok) return scanned;
  const other = scanned.value;
  if (other === actor.uid) return fail("self");

  const [profiles, links] = await Promise.all([deps.cadets.profiles([actor.uid, other]), deps.cards.linksOf([other])]);
  if (!profiles.ok || !links.ok) return fail("unknown");
  if (!profiles.value.has(actor.uid)) return fail("not-registered");
  const profile = profiles.value.get(other);
  if (!profile) return fail("unknown-cadet");

  const connected = await deps.contacts.connect({ id: contactId(actor.uid, other), uids: sortedPair(actor.uid, other), scannedBy: actor.uid, createdAt: new Date(deps.now()) });
  if (!connected.ok) return fail("unknown");

  const reward = await deps.reward();
  const [mine] = await Promise.all([
    payContact(deps, actor.uid, other, reward),
    payContact(deps, other, actor.uid, reward),
  ]);
  return ok({
    card: { alias: profile.alias, squad: profile.squad, links: links.value.get(other) ?? { linkedin: null, github: null, web: null } },
    created: connected.value.created,
    xpEarned: mine.xp,
    creditsEarned: mine.credits,
    capReached: mine.capped,
  });
}

export interface NetworkOverview {
  me: CadetCard;
  /** Newest first. */
  contacts: ReadonlyArray<CadetCard & { id: string; connectedAt: Date }>;
  reward: ContactReward;
}

/** A cadet's own card and their contacts' cards, for the Red screen. */
export async function getNetwork(deps: Pick<NetworkDeps, "contacts" | "cards" | "cadets" | "reward">, actor: NetworkActor): Promise<Result<NetworkOverview, NetworkError>> {
  if (actor.role !== "attendee") return fail("forbidden");
  const listed = await deps.contacts.listFor(actor.uid);
  if (!listed.ok) return fail("unknown");
  const contacts = [...listed.value].sort(byAge).reverse();
  const others = contacts.map((contact) => (contact.uids[0] === actor.uid ? contact.uids[1] : contact.uids[0]));
  const everyone = [actor.uid, ...others];

  const [profiles, links, reward] = await Promise.all([deps.cadets.profiles(everyone), deps.cards.linksOf(everyone), deps.reward()]);
  if (!profiles.ok || !links.ok) return fail("unknown");
  const me = profiles.value.get(actor.uid);
  if (!me) return fail("not-registered");

  const card = (uid: string, profile: { alias: string; squad: string | null }): CadetCard => ({
    alias: profile.alias,
    squad: profile.squad,
    links: links.value.get(uid) ?? { linkedin: null, github: null, web: null },
  });
  return ok({
    me: card(actor.uid, me),
    // A contact whose cadet left the edition (no profile) is not shown, but still counts for the cap.
    contacts: contacts.flatMap((contact, index) => {
      const profile = profiles.value.get(others[index]);
      return profile ? [{ ...card(others[index], profile), id: contact.id, connectedAt: contact.createdAt }] : [];
    }),
    reward,
  });
}

/** How many contacts a cadet has made in this edition (for the "contactos hechos" badges). */
export async function countContacts(deps: Pick<NetworkDeps, "contacts">, uid: string): Promise<Result<number, NetworkError>> {
  const counted = await deps.contacts.countFor(uid);
  return counted.ok ? ok(counted.value) : fail("unknown");
}

/** Saves the links a cadet shows on their card; each one optional, each checked for its kind. */
export async function saveContactLinks(
  deps: Pick<NetworkDeps, "cards" | "cadets">,
  actor: NetworkActor,
  input: Partial<Record<LinkKind, string>>,
): Promise<Result<ContactLinks, NetworkError>> {
  if (actor.role !== "attendee") return fail("forbidden");
  const links: Record<LinkKind, string | null> = { linkedin: null, github: null, web: null };
  for (const kind of LINK_KINDS) {
    const normalized = normalizeLink(kind, input[kind] ?? "");
    if (normalized === "invalid") return fail(`invalid-${kind}`);
    links[kind] = normalized;
  }
  const profiles = await deps.cadets.profiles([actor.uid]);
  if (!profiles.ok) return fail("unknown");
  if (!profiles.value.has(actor.uid)) return fail("not-registered");
  const saved = await deps.cards.saveLinks(actor.uid, links);
  return saved.ok ? ok(links) : fail("unknown");
}
