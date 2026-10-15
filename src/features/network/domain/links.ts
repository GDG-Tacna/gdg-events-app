/** The links a cadet may show on their contact card, each optional. Never an email or a phone: only these. */
export const LINK_KINDS = ["linkedin", "github", "web"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export type ContactLinks = Readonly<Record<LinkKind, string | null>>;

export const NO_LINKS: ContactLinks = { linkedin: null, github: null, web: null };

export const LINK_MAX = 200;

const LINKEDIN_HANDLE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,99}$/;
const GITHUB_HANDLE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** An http(s) URL the cadet typed, with or without "https://", or `null` when it is not one (or carries a login). */
function webUrl(input: string): URL | null {
  const text = HAS_SCHEME.test(input) ? input : `https://${input}`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  // Only plain web pages: no javascript:, data:, mailto:, and no user:password@ inside the link.
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)) return null;
  url.protocol = "https:";
  return url;
}

const isHost = (url: URL, domain: string) => url.hostname === domain || url.hostname.endsWith(`.${domain}`);
const pathParts = (url: URL) => url.pathname.split("/").filter(Boolean);

/**
 * A link as stored and shown: always https, LinkedIn and GitHub reduced to the profile (a bare handle works too),
 * a web page as typed. Empty means none. `"invalid"` when it is not that kind of link, so a cadet cannot point
 * their "GitHub" anywhere else.
 */
export function normalizeLink(kind: LinkKind, raw: string): string | null | "invalid" {
  const input = raw.trim();
  if (input === "") return null;
  if (input.length > LINK_MAX) return "invalid";

  switch (kind) {
    case "linkedin": {
      if (LINKEDIN_HANDLE.test(input)) return `https://www.linkedin.com/in/${input}`;
      const url = webUrl(input);
      if (!url || !isHost(url, "linkedin.com")) return "invalid";
      const [section, handle, ...rest] = pathParts(url);
      if (section !== "in" || !handle || rest.length > 0 || !LINKEDIN_HANDLE.test(handle)) return "invalid";
      return `https://www.linkedin.com/in/${handle}`;
    }
    case "github": {
      if (GITHUB_HANDLE.test(input)) return `https://github.com/${input}`;
      const url = webUrl(input);
      if (!url || !isHost(url, "github.com")) return "invalid";
      const [handle, ...rest] = pathParts(url);
      if (!handle || rest.length > 0 || !GITHUB_HANDLE.test(handle)) return "invalid";
      return `https://github.com/${handle}`;
    }
    case "web": {
      const url = webUrl(input);
      if (!url) return "invalid";
      const href = url.href;
      return href.length > LINK_MAX ? "invalid" : href;
    }
  }
}

/** Links from stored data: anything that does not normalize to itself is dropped (never shown as typed). */
export function parseStoredLinks(input: unknown): ContactLinks {
  if (typeof input !== "object" || input === null) return NO_LINKS;
  const data = input as Record<string, unknown>;
  const read = (kind: LinkKind) => {
    const value = data[kind];
    return typeof value === "string" && normalizeLink(kind, value) === value ? value : null;
  };
  return { linkedin: read("linkedin"), github: read("github"), web: read("web") };
}
