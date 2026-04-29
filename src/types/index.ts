export type MatchType = "city_exact" | "county_fallback" | "standard_conus" | "unresolved";

export type RateRow = {
  state: string;
  destination: string;
  county: string;
  seasonBegin: string;
  seasonEnd: string;
  mieRate: number;
};

export type RateResolution = {
  mieRate: number;
  state: string;
  city?: string;
  county?: string;
  matchType: MatchType;
  message?: string;
};

export type Expense = {
  id?: number;
  name: string;
  amount: number;
};

export type ExpenseRowInput = {
  key: string;
  name: string;
  amount: string;
};
