export type MatchType = "city_exact" | "county_fallback" | "standard_oconus" | "unresolved";

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

export type ExpenseRow = {
  id: string;
  name: string;
  amount: string;
};

export type StoredExpense = {
  name: string;
  amount: number;
};

export type DailySession = {
  dateKey: string;
  createdAt: string;
  locationInput: string;
  stateInput?: string;
  resolution: RateResolution;
  expenses: StoredExpense[];
};

export type OsmSuggestion = {
  id: string;
  city: string;
  stateCode?: string;
  county?: string;
  display: string;
};
