import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import type { AccountDirectory, CadetIdentity } from "../../domain/manage";

vi.mock("server-only", () => ({}));

const { CachedAccountDirectory } = await import("./cached-account-directory");

const IDENTITIES: Record<string, CadetIdentity> = {
  "uid-a": { email: "a@example.com", displayName: "Ana" },
  "uid-b": { email: "b@example.com", displayName: "Bruno" },
  "uid-c": { email: "c@example.com", displayName: "Carla" },
};

function fakeDirectory() {
  return {
    lookup: vi.fn(async () => ok(null)),
    lookupMany: vi.fn(async (uids: readonly string[]) => ok(new Map(uids.filter((uid) => uid in IDENTITIES).map((uid) => [uid, IDENTITIES[uid]] as const)))),
    setDisabled: vi.fn(async () => ok(undefined)),
  } satisfies AccountDirectory;
}

describe("CachedAccountDirectory", () => {
  it("does not ask again for accounts it kept in the last minute, and asks again after it", async () => {
    const inner = fakeDirectory();
    let clock = 0;
    const directory = new CachedAccountDirectory(inner, { now: () => clock });

    expect((await directory.lookupMany(["uid-a", "uid-b"])).ok).toBe(true);
    clock = 59_000;
    const again = await directory.lookupMany(["uid-a", "uid-b"]);
    expect(inner.lookupMany).toHaveBeenCalledTimes(1);
    expect(again).toEqual(ok(new Map([["uid-a", IDENTITIES["uid-a"]], ["uid-b", IDENTITIES["uid-b"]]])));

    clock = 61_000;
    await directory.lookupMany(["uid-a", "uid-b"]);
    expect(inner.lookupMany).toHaveBeenCalledTimes(2);
  });

  it("asks only for the accounts it does not have", async () => {
    const inner = fakeDirectory();
    const directory = new CachedAccountDirectory(inner);

    await directory.lookupMany(["uid-a"]);
    const result = await directory.lookupMany(["uid-a", "uid-b", "uid-c"]);

    expect(inner.lookupMany).toHaveBeenLastCalledWith(["uid-b", "uid-c"]);
    expect(result.ok && [...result.value.keys()].sort()).toEqual(["uid-a", "uid-b", "uid-c"]);
  });

  it("never keeps a failed read, so the next search tries again", async () => {
    const inner = fakeDirectory();
    inner.lookupMany.mockResolvedValueOnce(err({ code: "down" }) as never);
    const directory = new CachedAccountDirectory(inner);

    expect(await directory.lookupMany(["uid-a"])).toEqual(err({ code: "down" }));
    expect((await directory.lookupMany(["uid-a"])).ok).toBe(true);
    expect(inner.lookupMany).toHaveBeenCalledTimes(2);
  });

  it("does not keep an account the provider does not have, so it is asked for again", async () => {
    const inner = fakeDirectory();
    const directory = new CachedAccountDirectory(inner);

    await directory.lookupMany(["uid-gone"]);
    await directory.lookupMany(["uid-gone"]);

    expect(inner.lookupMany).toHaveBeenCalledTimes(2);
  });

  it("passes a single lookup straight through, and forgets an account it disables", async () => {
    const inner = fakeDirectory();
    const directory = new CachedAccountDirectory(inner);

    await directory.lookup("uid-a");
    expect(inner.lookup).toHaveBeenCalledWith("uid-a");

    await directory.lookupMany(["uid-a"]);
    await directory.setDisabled("uid-a", true);
    expect(inner.setDisabled).toHaveBeenCalledWith("uid-a", true);
    await directory.lookupMany(["uid-a"]);
    expect(inner.lookupMany).toHaveBeenCalledTimes(2);
  });
});
