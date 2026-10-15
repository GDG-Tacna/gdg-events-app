import { describe, expect, it } from "vitest";
import { normalizeLink, parseStoredLinks } from "./links";

describe("normalizeLink", () => {
  it("treats an empty field as no link", () => {
    expect(normalizeLink("github", "   ")).toBeNull();
  });

  it.each([
    ["octocat", "https://github.com/octocat"],
    ["github.com/octocat", "https://github.com/octocat"],
    ["https://www.github.com/octocat/", "https://github.com/octocat"],
    ["http://github.com/mona-lisa", "https://github.com/mona-lisa"],
  ])("reduces the GitHub %s to the profile", (input, expected) => {
    expect(normalizeLink("github", input)).toBe(expected);
  });

  it.each([
    ["ana-perez", "https://www.linkedin.com/in/ana-perez"],
    ["linkedin.com/in/ana-perez", "https://www.linkedin.com/in/ana-perez"],
    ["https://pe.linkedin.com/in/ana_perez/?trk=x", "https://www.linkedin.com/in/ana_perez"],
  ])("reduces the LinkedIn %s to the profile", (input, expected) => {
    expect(normalizeLink("linkedin", input)).toBe(expected);
  });

  it.each([
    ["github", "https://evil.com/octocat"],
    ["github", "https://github.com.evil.com/octocat"],
    ["github", "https://github.com/octocat/repo"],
    ["github", "https://github.com/"],
    ["github", "-octocat"],
    ["linkedin", "https://linkedin.com/company/google"],
    ["linkedin", "https://notlinkedin.com/in/ana"],
    ["linkedin", "https://www.linkedin.com/in/"],
  ] as const)("refuses %s pointing at %s", (kind, input) => {
    expect(normalizeLink(kind, input)).toBe("invalid");
  });

  it("keeps a web page as typed, always on https", () => {
    expect(normalizeLink("web", "ana.dev")).toBe("https://ana.dev/");
    expect(normalizeLink("web", "http://ana.dev/blog?x=1")).toBe("https://ana.dev/blog?x=1");
  });

  it.each([
    ["a script", "javascript:alert(1)"],
    ["data", "data:text/html,<b>x</b>"],
    ["an email", "mailto:ana@ana.dev"],
    ["another protocol", "ftp://ana.dev/files"],
    ["a login inside", "https://user:pass@ana.dev"],
    ["no domain", "localhost"],
    ["an address", "https://192.168.0.1"],
    ["a long one", `https://ana.dev/${"x".repeat(200)}`],
    ["not a link", "hola mundo"],
  ])("refuses %s as a web page", (_, input) => {
    expect(normalizeLink("web", input)).toBe("invalid");
  });
});

describe("parseStoredLinks", () => {
  it("shows only links that are already in their stored form", () => {
    expect(parseStoredLinks({ github: "https://github.com/octocat", linkedin: "ana-perez", web: "javascript:alert(1)" })).toEqual({
      github: "https://github.com/octocat",
      linkedin: null,
      web: null,
    });
    expect(parseStoredLinks(null)).toEqual({ github: null, linkedin: null, web: null });
  });
});
