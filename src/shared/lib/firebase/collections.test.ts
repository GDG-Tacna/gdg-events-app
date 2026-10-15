import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { eventCollection } from "./collections";

function pathRecorder() {
  const calls: string[] = [];
  const db = {
    collection: (name: string) => {
      calls.push(name);
      return {
        doc: (id: string) => {
          calls.push(id);
          return {
            collection: (child: string) => {
              calls.push(child);
              return { marker: "collection" };
            },
          };
        },
      };
    },
  } as unknown as Firestore;
  return { db, calls };
}

describe("eventCollection", () => {
  it("reaches a collection of one edition: events/{eventId}/{name}", () => {
    const { db, calls } = pathRecorder();

    eventCollection(db, "devfest-2026", "participants");

    expect(calls).toEqual(["events", "devfest-2026", "participants"]);
  });

  it("keeps editions apart: the same collection of two editions has different paths", () => {
    const first = pathRecorder();
    const second = pathRecorder();

    eventCollection(first.db, "devfest-2026", "checkins");
    eventCollection(second.db, "devfest-2027", "checkins");

    expect(first.calls).not.toEqual(second.calls);
  });
});
