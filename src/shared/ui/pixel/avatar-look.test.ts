import { describe, expect, it } from "vitest";
import { BEARDS, GLASSES, HAIR_STYLES, lookFromSeed, parseLook, randomLook, sameLook, type AvatarLook } from "./avatar-look";
import { avatarSprite, avatarTraits } from "./PixelAvatar";

const LOOK: AvatarLook = { skin: 5, hairStyle: "curly", hairColor: 7, beard: "beard", glasses: "round", helmet: 2, suit: 3 };

describe("avatar looks", () => {
  it("derive from the alias as always: only the original palettes, no beard, no glasses, the white suit", () => {
    const looks = Array.from({ length: 300 }, (_, i) => lookFromSeed(`cadet-${i}`));

    expect(new Set(looks.map((look) => look.hairStyle))).toEqual(new Set(["short-left", "short-right", "long-left", "long-right"]));
    expect(Math.max(...looks.map((look) => look.hairColor))).toBe(4);
    expect(Math.max(...looks.map((look) => look.skin))).toBe(4);
    expect(looks.every((look) => look.beard === "none" && look.glasses === "none" && look.suit === 0)).toBe(true);
    expect(lookFromSeed("  NOVA_7 ")).toEqual(lookFromSeed("nova_7"));
  });

  it("keep the traits the old avatar read from the alias", () => {
    const look = lookFromSeed("Nova_7");
    const traits = avatarTraits("Nova_7");

    expect(`${traits.style}-${traits.fringe}`).toBe(look.hairStyle);
  });

  it("read only choices the editor offers", () => {
    expect(parseLook(LOOK)).toEqual(LOOK);
    expect(parseLook({ ...LOOK, extra: "x" })).toEqual(LOOK);
    expect(parseLook({ ...LOOK, skin: 6 })).toBeNull();
    expect(parseLook({ ...LOOK, hairColor: 1.5 })).toBeNull();
    expect(parseLook({ ...LOOK, hairStyle: "mohawk" })).toBeNull();
    expect(parseLook({ ...LOOK, beard: "goatee" })).toBeNull();
    expect(parseLook({ ...LOOK, suit: -1 })).toBeNull();
    expect(parseLook(null)).toBeNull();
  });

  it("make random looks within the sets, and compare looks", () => {
    expect(parseLook(randomLook(() => 0))).not.toBeNull();
    expect(parseLook(randomLook(() => 0.9999))).toEqual({ skin: 5, hairStyle: "buzz", hairColor: 7, beard: "mustache", glasses: "shades", helmet: 5, suit: 5 });
    expect(sameLook(LOOK, { ...LOOK })).toBe(true);
    expect(sameLook(LOOK, { ...LOOK, suit: 0 })).toBe(false);
  });
});

describe("avatar sprites from a look", () => {
  const base: AvatarLook = { ...lookFromSeed("Nova_7"), hairStyle: "short-left" };
  const rowsOf = (look: AvatarLook) => avatarSprite(look).rows.join("\n");

  it("draw a different face for every hairstyle, beard and pair of glasses", () => {
    expect(new Set(HAIR_STYLES.map((hairStyle) => rowsOf({ ...base, hairStyle }))).size).toBe(HAIR_STYLES.length);
    expect(new Set(BEARDS.map((beard) => rowsOf({ ...base, beard }))).size).toBe(BEARDS.length);
    expect(new Set(GLASSES.map((glasses) => rowsOf({ ...base, glasses }))).size).toBe(GLASSES.length);
  });

  it("keep the 32x32 grid and only known palette keys", () => {
    const sprite = avatarSprite(LOOK);

    expect(sprite.rows).toHaveLength(32);
    expect(sprite.rows.every((row) => row.length === 32)).toBe(true);
    const used = new Set(sprite.rows.join("").replaceAll(".", ""));
    expect([...used].every((key) => key in sprite.palette)).toBe(true);
    expect(sprite.rows.join("")).toContain("G");
  });

  it("color the suit and the hair from the chosen palettes", () => {
    const sprite = avatarSprite(LOOK);

    expect(sprite.palette.U).toBe("#ffb36b");
    expect(sprite.palette.K).toBe("#e05fae");
    expect(avatarSprite("Nova_7").palette.U).toBe("#f6f8ff");
  });
});
