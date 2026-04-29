import { describe, expect, it } from "vitest";
import { __testables } from "../src/services/rateResolver";

describe("pickSeasonalRate", () => {
  const rows = [
    {
      state: "AL",
      destination_city: "Gulf Shores",
      county: "Baldwin",
      season_start: "October 1",
      season_end: "February 28",
      mie_rate: 74,
    },
    {
      state: "AL",
      destination_city: "Gulf Shores",
      county: "Baldwin",
      season_start: "June 1",
      season_end: "July 31",
      mie_rate: 74,
    },
    {
      state: "AL",
      destination_city: "Gulf Shores",
      county: "Baldwin",
      season_start: "March 1",
      season_end: "May 31",
      mie_rate: 74,
    },
  ];

  it("picks row matching date", () => {
    const r = __testables.pickSeasonalRate(rows, new Date("2026-04-01T00:00:00Z"));
    expect(r?.season_start).toBe("March 1");
  });
});
