import "server-only";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { InviteMailer } from "../../domain/invites";
import type { ManagedRole } from "../../domain/team";

const ROLE_NAMES: Record<ManagedRole, string> = { staff: "staff", organizer: "organizador", admin: "admin" };

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** The invitation email, in Spanish like the rest of the app. Plain on purpose: the link is what matters. */
export function inviteEmail(input: { role: ManagedRole; link: string; expiresAt: Date }, eventName: string) {
  const role = ROLE_NAMES[input.role];
  const until = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long", timeZone: "America/Lima" }).format(input.expiresAt);
  const subject = `Te invitaron como ${role} en ${eventName}`;
  const text = `Hola:\n\nTe invitaron a sumarte al equipo de ${eventName} como ${role}.\n\nAcepta aquí, entrando con tu cuenta de Google de este correo:\n${input.link}\n\nEl enlace funciona una sola vez y vence el ${until}.`;
  const html = `<p>Hola:</p><p>Te invitaron a sumarte al equipo de <strong>${escapeHtml(eventName)}</strong> como <strong>${role}</strong>.</p><p><a href="${escapeHtml(input.link)}">Aceptar la invitación</a> (entra con tu cuenta de Google de este correo).</p><p>El enlace funciona una sola vez y vence el ${until}.</p>`;
  return { subject, text, html };
}

/**
 * Sends invitations through Resend's HTTP API (no SDK). Built only when RESEND_API_KEY and INVITE_FROM are set: the
 * sender must belong to a domain verified in Resend. The key never leaves the server.
 */
export class ResendInviteMailer implements InviteMailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly eventName: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(input: { to: string; role: ManagedRole; link: string; expiresAt: Date }): Promise<Result<void, { code: string }>> {
    try {
      const { subject, text, html } = inviteEmail(input, this.eventName);
      const response = await this.fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: this.from, to: [input.to], subject, text, html }),
      });
      if (!response.ok) {
        logServerError("admin.invite.resend", new Error(`Resend answered ${response.status}`));
        return err({ code: "unknown" });
      }
      return ok(undefined);
    } catch (cause) {
      logServerError("admin.invite.resend", cause);
      return err({ code: "unknown" });
    }
  }
}
