/**
 * `__session` is the only cookie Firebase Hosting forwards to the backend,
 * so using it keeps every deploy target (still TBD) possible.
 * Kept in its own file so `proxy.ts` can import it without server-only modules.
 */
export const SESSION_COOKIE_NAME = "__session";
