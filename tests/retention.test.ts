import { describe, expect, it } from "vitest";
import { cutoffIso } from "../src/services/retentionService";

describe("cutoffIso", () => {
  it("returns about 7 days back", () => {
    const now = new Date("2026-04-21T12:00:00.000Z");
    const cutoff = cutoffIso(7, now);
    expect(cutoff.startsWith("2026-04-14")).toBe(true);
  });
});
