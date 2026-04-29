import { describe, expect, it } from "vitest";
import { computeBudget } from "../src/utils/budgetCalculator";

describe("computeBudget", () => {
  it("calculates remaining when under budget", () => {
    const result = computeBudget(80, [
      { name: "Lunch", amount: 20 },
      { name: "Taxi", amount: 15 },
    ]);
    expect(result.spent).toBe(35);
    expect(result.remaining).toBe(45);
    expect(result.overage).toBe(0);
  });

  it("calculates overage when above budget", () => {
    const result = computeBudget(68, [
      { name: "Dinner", amount: 50 },
      { name: "Snacks", amount: 30 },
    ]);
    expect(result.spent).toBe(80);
    expect(result.remaining).toBe(-12);
    expect(result.overage).toBe(12);
  });
});
