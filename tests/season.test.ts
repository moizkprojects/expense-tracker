import { describe, expect, it } from "vitest";
import { isDateWithinSeason } from "../src/utils/season";

describe("isDateWithinSeason", () => {
  it("matches in-range season", () => {
    const d = new Date("2026-04-15T00:00:00Z");
    expect(isDateWithinSeason(d, "March 1", "May 31")).toBe(true);
    expect(isDateWithinSeason(d, "June 1", "July 31")).toBe(false);
  });

  it("handles wrapped season across year boundary", () => {
    const jan = new Date("2026-01-15T00:00:00Z");
    const aug = new Date("2026-08-15T00:00:00Z");
    expect(isDateWithinSeason(jan, "October 1", "February 28")).toBe(true);
    expect(isDateWithinSeason(aug, "October 1", "February 28")).toBe(false);
  });
});
