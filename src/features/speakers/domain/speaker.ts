import type { ImageRef } from "@/features/media/constants";
import { err, ok, type Result } from "@/shared/lib/result";

/**
 * A speaker of the edition: who gives its talks, with what cadets and the organizers want to know about them. Talks
 * point at speakers by id, so a speaker is never deleted: an inactive one stays on the talks that name it but is no
 * longer offered for new ones.
 */
export interface Speaker {
  id: string;
  name: string;
  /** Role or company, one line ("GDE Firebase · ShipxLabs"). Empty when none. */
  headline: string;
  bio: string;
  photo: ImageRef | null;
  links: SpeakerLinks;
  active: boolean;
}

export interface SpeakerLinks {
  linkedin: string | null;
  github: string | null;
  web: string | null;
}

export const SPEAKER_NAME_MIN = 2;
export const SPEAKER_NAME_MAX = 60;
export const SPEAKER_HEADLINE_MAX = 80;
export const SPEAKER_BIO_MAX = 500;
export const SPEAKER_LINK_MAX = 200;

/** What the admin edits; the photo travels apart (its upload is checked by the media feature). */
export interface SpeakerDraft {
  name: string;
  headline: string;
  bio: string;
  links: { linkedin: string; github: string; web: string };
}

export type SpeakerDataErrorCode = "invalid-id" | "invalid-name" | "invalid-headline" | "invalid-bio" | "invalid-link";

const ID = /^[a-z0-9][a-z0-9-]{1,47}$/;
export const isSpeakerId = (value: unknown): value is string => typeof value === "string" && ID.test(value);

const collapse = (value: string) => value.trim().replace(/\s+/g, " ");

/** A public web address (https), or `null` when left blank; anything else is refused. */
function link(value: string): string | null | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.length > SPEAKER_LINK_MAX) return undefined;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Checks and normalizes what the admin typed. */
export function checkSpeaker(id: string, draft: SpeakerDraft): Result<Omit<Speaker, "photo" | "active">, SpeakerDataErrorCode> {
  if (!isSpeakerId(id)) return err("invalid-id");
  const name = collapse(draft.name);
  if (name.length < SPEAKER_NAME_MIN || name.length > SPEAKER_NAME_MAX) return err("invalid-name");
  const headline = collapse(draft.headline);
  if (headline.length > SPEAKER_HEADLINE_MAX) return err("invalid-headline");
  const bio = draft.bio.trim();
  if (bio.length > SPEAKER_BIO_MAX) return err("invalid-bio");
  const linkedin = link(draft.links.linkedin);
  const github = link(draft.links.github);
  const web = link(draft.links.web);
  if (linkedin === undefined || github === undefined || web === undefined) return err("invalid-link");
  return ok({ id, name, headline, bio, links: { linkedin, github, web } });
}

/** A suggestion for the id from the name ("Ana Pérez" becomes "ana-perez"); editable before saving. */
export function suggestSpeakerId(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

/** Alphabetical, the way the admin and the talk form list them. */
export const compareSpeakers = (a: Speaker, b: Speaker) => a.name.localeCompare(b.name, "es");
