import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import {
  TEAM_CODE_LIFETIME_SECONDS,
  TEAM_CODE_MAX_FUTURE_SECONDS,
  formatTeamPayload,
  isTeamCode,
  issueTeamCode,
  parseTeamPayload,
  teamRoleOf,
  teamSigningInput,
  verifyTeamCode,
  type TeamCodeDeps,
  type TeamCodeRole,
  type TeamCodeSigner,
} from "./team-code";

const NOW = Date.UTC(2026, 10, 14, 15, 0, 0, 500);
const NOW_SECONDS = Math.floor(NOW / 1000);
const UID = "uid-staff-123456";

const signer: TeamCodeSigner = {
  sign: (input) => `sig_${input.replace(/[^A-Za-z0-9_-]/g, "-")}_xxxxxxxxxxxx`,
  verify(input, signature) {
    return signature === this.sign(input);
  },
};

function setup(now = NOW) {
  return { signer, encoder: { encode: vi.fn((text: string) => [text]) }, now: () => now } satisfies TeamCodeDeps;
}

const codeFor = (uid: string, role: TeamCodeRole, expiresAt: number) => formatTeamPayload(uid, role, expiresAt, signer.sign(teamSigningInput(uid, role, expiresAt)));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("teamRoleOf", () => {
  it("makes staff the volunteers and admins (organizers resolve to admin) the organizers, and nobody else a team member", () => {
    expect(teamRoleOf("staff")).toBe("volunteer");
    expect(teamRoleOf("admin")).toBe("organizer");
    expect(teamRoleOf("attendee")).toBeNull();
    expect(teamRoleOf(null)).toBeNull();
  });
});

describe("issueTeamCode", () => {
  it("draws a signed volunteer code for two minutes for staff", () => {
    const deps = setup();

    const issued = issueTeamCode(deps, { uid: UID, role: "staff" });

    const expiresAt = NOW_SECONDS + TEAM_CODE_LIFETIME_SECONDS;
    expect(issued).toEqual(ok({ role: "volunteer", cells: [codeFor(UID, "volunteer", expiresAt)], issuedAt: NOW, expiresAt: expiresAt * 1000 }));
  });

  it("draws an organizer code for an admin", () => {
    const issued = issueTeamCode(setup(), { uid: "uid-admin-123456", role: "admin" });

    expect(issued.ok && issued.value.role).toBe("organizer");
    expect(issued.ok && issued.value.cells[0]).toMatch(/^devfest:tm:uid-admin-123456\.organizer\./);
  });

  it.each([["an attendee", "attendee"], ["someone with no role", null]] as const)("refuses %s, drawing nothing", (_, role) => {
    const deps = setup();

    expect(issueTeamCode(deps, { uid: UID, role })).toEqual(err({ code: "forbidden" }));
    expect(deps.encoder.encode).not.toHaveBeenCalled();
  });

  it("reports an unknown failure when the code cannot be signed", () => {
    const deps = { ...setup(), signer: { sign: () => { throw new Error("no secret"); }, verify: () => false } };

    expect(issueTeamCode(deps, { uid: UID, role: "staff" })).toEqual(err({ code: "unknown" }));
  });
});

describe("parseTeamPayload and isTeamCode", () => {
  it("reads the uid, role, expiry and signature of a team code", () => {
    const payload = codeFor(UID, "organizer", 1_800_000_000);

    expect(isTeamCode(payload)).toBe(true);
    expect(parseTeamPayload(payload)).toEqual({ uid: UID, role: "organizer", expiresAt: 1_800_000_000, signature: signer.sign(teamSigningInput(UID, "organizer", 1_800_000_000)) });
  });

  it.each([
    ["another kind of code", "devfest:sp:ana-torres.1800000000.sig_xxxxxxxxxxxxxxxx"],
    ["a contact code", `devfest:ct:${UID}.1800000000.sig_xxxxxxxxxxxxxxxx`],
    ["an unknown role", `devfest:tm:${UID}.admin.1800000000.sig_xxxxxxxxxxxxxxxx`],
    ["a missing role", `devfest:tm:${UID}.1800000000.sig_xxxxxxxxxxxxxxxx`],
    ["a bad uid", "devfest:tm:a b.volunteer.1800000000.sig_xxxxxxxxxxxxxxxx"],
    ["a bad expiry", `devfest:tm:${UID}.volunteer.soon.sig_xxxxxxxxxxxxxxxx`],
    ["a short signature", `devfest:tm:${UID}.volunteer.1800000000.short`],
    ["extra parts", `devfest:tm:${UID}.volunteer.1800000000.sig_xxxxxxxxxxxxxxxx.more`],
  ])("does not read %s", (_, payload) => {
    expect(parseTeamPayload(payload)).toBeNull();
  });

  it("only routes codes with its own prefix", () => {
    expect(isTeamCode("devfest:sp:ana-torres.1.sig")).toBe(false);
    expect(isTeamCode("devfest:ct:uid.1.sig")).toBe(false);
    expect(isTeamCode("stand-ai-1")).toBe(false);
  });
});

describe("verifyTeamCode", () => {
  const fresh = NOW_SECONDS + TEAM_CODE_LIFETIME_SECONDS;

  it("accepts a code we issued and says who and what role it carries", () => {
    expect(verifyTeamCode(setup(), codeFor(UID, "volunteer", fresh))).toEqual({ ok: true, uid: UID, role: "volunteer" });
    expect(verifyTeamCode(setup(), codeFor(UID, "organizer", fresh))).toEqual({ ok: true, uid: UID, role: "organizer" });
  });

  it("round-trips a code issued by issueTeamCode", () => {
    const deps = setup();
    const issued = issueTeamCode(deps, { uid: UID, role: "staff" });

    expect(issued.ok && verifyTeamCode(deps, issued.value.cells[0])).toEqual({ ok: true, uid: UID, role: "volunteer" });
  });

  it("refuses a volunteer's code altered into an organizer's: the role is signed", () => {
    const volunteer = codeFor(UID, "volunteer", fresh);
    const forged = volunteer.replace(".volunteer.", ".organizer.");

    expect(verifyTeamCode(setup(), forged)).toEqual({ ok: false, code: "invalid-code" });
  });

  it("refuses a code with another uid, a bad signature, or no team shape", () => {
    expect(verifyTeamCode(setup(), codeFor(UID, "volunteer", fresh).replace(UID, "uid-someone-else-1"))).toEqual({ ok: false, code: "invalid-code" });
    expect(verifyTeamCode(setup(), formatTeamPayload(UID, "volunteer", fresh, "sig_forged_forged_forged"))).toEqual({ ok: false, code: "invalid-code" });
    expect(verifyTeamCode(setup(), "devfest:tm:nonsense")).toEqual({ ok: false, code: "invalid-code" });
  });

  it("never accepts another kind of signature as a team code (each kind signs its own prefix)", () => {
    const speakerStyle = formatTeamPayload(UID, "organizer", fresh, signer.sign(`speaker:${UID}.organizer.${fresh}`));
    const contactStyle = formatTeamPayload(UID, "organizer", fresh, signer.sign(`contact:${UID}.${fresh}`));

    expect(verifyTeamCode(setup(), speakerStyle)).toEqual({ ok: false, code: "invalid-code" });
    expect(verifyTeamCode(setup(), contactStyle)).toEqual({ ok: false, code: "invalid-code" });
  });

  it("tells a genuine code whose time is over it expired, but never a forged one", () => {
    const old = codeFor(UID, "volunteer", NOW_SECONDS - 1);

    expect(verifyTeamCode(setup(), old)).toEqual({ ok: false, code: "expired-code" });
    expect(verifyTeamCode(setup(), formatTeamPayload(UID, "volunteer", NOW_SECONDS - 1, "sig_forged_forged_forged"))).toEqual({ ok: false, code: "invalid-code" });
  });

  it("refuses a code that claims to last longer than a fresh one, plus the clock slack", () => {
    const longLived = NOW_SECONDS + TEAM_CODE_MAX_FUTURE_SECONDS + 1;

    expect(verifyTeamCode(setup(), codeFor(UID, "volunteer", longLived))).toEqual({ ok: false, code: "invalid-code" });
    expect(verifyTeamCode(setup(), codeFor(UID, "volunteer", NOW_SECONDS + TEAM_CODE_MAX_FUTURE_SECONDS)).ok).toBe(true);
  });

  it("treats a signer that throws as an invalid code", () => {
    const deps = { signer: { sign: signer.sign, verify: () => { throw new Error("no secret"); } }, now: () => NOW };

    expect(verifyTeamCode(deps, codeFor(UID, "volunteer", fresh))).toEqual({ ok: false, code: "invalid-code" });
  });
});
