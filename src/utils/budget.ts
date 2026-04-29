import type { StoredExpense } from "../types";

export const computeBudget = (mieRate: number, expenses: StoredExpense[]) => {
  const spent = expenses.reduce((sum, item) => sum + item.amount, 0);
  const remaining = mieRate - spent;
  return {
    spent,
    remaining,
    overage: remaining < 0 ? Math.abs(remaining) : 0,
  };
};
