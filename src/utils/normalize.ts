export const normalizeText = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");

export const normalizeCounty = (value: string): string =>
  normalizeText(value)
    .replace(/\b(county|parish|borough|census area|city and borough)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const toDateKey = (date: Date): string => date.toISOString().slice(0, 10);

export const toUsd = (value: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

export const toAmount = (value: string): number => {
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const randomId = (): string =>
  `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
