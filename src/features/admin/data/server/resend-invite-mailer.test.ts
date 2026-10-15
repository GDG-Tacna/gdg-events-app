import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { ResendInviteMailer, inviteEmail } = await import("./resend-invite-mailer");

const INPUT = { to: "ana@example.com", role: "organizer" as const, link: "https://arcade.example/invite/abc", expiresAt: new Date("2026-10-27T17:00:00Z") };

describe("inviteEmail", () => {
  it("writes the invitation in Spanish with the role, the link and when it expires", () => {
    const email = inviteEmail(INPUT, "DevFest Space Arcade");

    expect(email.subject).toBe("Te invitaron como organizador en DevFest Space Arcade");
    expect(email.text).toContain("https://arcade.example/invite/abc");
    expect(email.text).toContain("27 de octubre");
    expect(email.html).toContain('href="https://arcade.example/invite/abc"');
  });

  it("escapes what goes into the HTML", () => {
    expect(inviteEmail({ ...INPUT, link: 'https://x/"><script>' }, "<b>Evento</b>").html).not.toMatch(/<script>|<b>Evento/);
  });
});

describe("ResendInviteMailer", () => {
  it("posts the email to Resend with the key, the sender and the recipient", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));

    expect(await new ResendInviteMailer("re_key", "Equipo <equipo@devfest.pe>", "DevFest", fetchImpl).send(INPUT)).toEqual({ ok: true, value: undefined });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_key" });
    expect(JSON.parse(init.body as string)).toMatchObject({ from: "Equipo <equipo@devfest.pe>", to: ["ana@example.com"] });
  });

  it("reports a refused or failed send without the key", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await new ResendInviteMailer("re_key", "x@y.z", "DevFest", vi.fn(async () => new Response("no", { status: 403 }))).send(INPUT)).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await new ResendInviteMailer("re_key", "x@y.z", "DevFest", vi.fn(async () => Promise.reject(new Error("offline")))).send(INPUT)).toEqual({ ok: false, error: { code: "unknown" } });
    expect(JSON.stringify(error.mock.calls)).not.toContain("re_key");
    error.mockRestore();
  });
});
