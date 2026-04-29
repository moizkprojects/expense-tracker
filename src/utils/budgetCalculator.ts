import { Expense } from "../types";

export const computeBudget = (mieRate: number, expenses: Expense[]) => {
  const spent = expenses.reduce((sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0), 0);
  const remaining = mieRate - spent;
  return {
    spent,
    remaining,
    overage: remaining < 0 ? Math.abs(remaining) : 0,
  };
};
