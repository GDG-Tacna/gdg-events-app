// Logic of `npm run admin:first`, separated from the command line so it can be tested without Firebase.
// It mirrors what the admin area does (role claim, team record, audit entry) for the one case the admin
// area cannot cover: the very first admin, when nobody can open it yet.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class FirstAdminError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * @param {{
 *   email: string,
 *   auth: { getUserByEmail(email: string): Promise<{uid: string, email?: string, displayName?: string, customClaims?: Record<string, unknown>}>,
 *           setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void>,
 *           revokeRefreshTokens(uid: string): Promise<void> },
 *   db: { hasAdmin(): Promise<boolean>, saveMember(uid: string, data: Record<string, unknown>): Promise<void>, appendAudit(entry: Record<string, unknown>): Promise<void> },
 *   now?: () => Date,
 * }} input
 */
export async function grantFirstAdmin({ email, auth, db, now = () => new Date() }) {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) throw new FirstAdminError("invalid-email", "El correo no es valido.");

  // This script exists only to bootstrap. Once there is an admin, roles are managed from the admin area.
  if (await db.hasAdmin()) {
    throw new FirstAdminError("admin-exists", "Ya existe un admin. Asigna nuevos roles desde el panel de admin (Equipo).");
  }

  let user;
  try {
    user = await auth.getUserByEmail(normalized);
  } catch (cause) {
    if (cause && cause.code === "auth/user-not-found") {
      throw new FirstAdminError("user-not-found", "Nadie ha iniciado sesion con ese correo. Entra a la app con esa cuenta de Google y vuelve a intentarlo.");
    }
    throw cause;
  }

  await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), role: "admin" });
  await auth.revokeRefreshTokens(user.uid);

  const at = now();
  await db.saveMember(user.uid, {
    email: (user.email ?? normalized).toLowerCase(),
    displayName: user.displayName ?? null,
    role: "admin",
    updatedAt: at,
  });
  await db.appendAudit({
    action: "role.granted",
    actorUid: "script:first-admin",
    targetUid: user.uid,
    details: { role: "admin", previous: null },
    at,
  });

  return { uid: user.uid, email: (user.email ?? normalized).toLowerCase() };
}
