import { describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import type { AvatarLook } from "@/shared/ui/pixel/avatar-look";
import { getAvatarLook, resetAvatarLook, saveAvatarLook, type AvatarDeps } from "./avatar";

vi.mock("@/shared/lib/log", () => ({ logServerError: vi.fn() }));

const LOOK: AvatarLook = { skin: 1, hairStyle: "curly", hairColor: 6, beard: "mustache", glasses: "none", helmet: 3, suit: 2 };
const AT = new Date("2026-10-24T15:00:00Z");
const CADET = { uid: "u1", role: "attendee" };

function setup() {
  const rows = new Map<string, AvatarLook>();
  const deps = {
    store: {
      get: vi.fn(async (uid: string): Promise<Result<AvatarLook | null, { code: string }>> => ok(rows.get(uid) ?? null)),
      save: vi.fn(async (uid: string, look: AvatarLook): Promise<Result<void, { code: string }>> => {
        rows.set(uid, look);
        return ok(undefined);
      }),
      remove: vi.fn(async (uid: string) => {
        rows.delete(uid);
        return ok(undefined);
      }),
    },
    now: () => AT,
  } satisfies AvatarDeps;
  return { deps, rows };
}

describe("avatar use cases", () => {
  it("save a cadet's look, read it back, and go back to the alias's", async () => {
    const { deps } = setup();

    expect(await getAvatarLook(deps, "u1")).toBeNull();
    expect(await saveAvatarLook(deps, CADET, LOOK)).toEqual(ok(LOOK));
    expect(deps.store.save).toHaveBeenCalledWith("u1", LOOK, AT);
    expect(await getAvatarLook(deps, "u1")).toEqual(LOOK);
    expect(await resetAvatarLook(deps, CADET)).toEqual(ok(undefined));
    expect(await getAvatarLook(deps, "u1")).toBeNull();
  });

  it("refuse a choice the editor does not offer, and anyone but a cadet", async () => {
    const { deps } = setup();

    expect(await saveAvatarLook(deps, CADET, { ...LOOK, hairStyle: "mohawk" })).toEqual(err({ code: "invalid-look" }));
    expect(await saveAvatarLook(deps, { uid: "s1", role: "staff" }, LOOK)).toEqual(err({ code: "forbidden" }));
    expect(await resetAvatarLook(deps, { uid: "x", role: null })).toEqual(err({ code: "forbidden" }));
    expect(deps.store.save).not.toHaveBeenCalled();
  });

  it("treat a failed read as no chosen look (the avatar is decoration), and a failed save as unknown", async () => {
    const { deps } = setup();
    deps.store.get.mockResolvedValueOnce(err({ code: "x" }));
    deps.store.save.mockResolvedValueOnce(err({ code: "x" }));

    expect(await getAvatarLook(deps, "u1")).toBeNull();
    expect(await saveAvatarLook(deps, CADET, LOOK)).toEqual(err({ code: "unknown" }));
  });
});

