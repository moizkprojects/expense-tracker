const monthMap: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const parseMonthDay = (value: string): { month: number; day: number } | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const [monthToken, dayToken] = trimmed.split(/\s+/);
  const month = monthMap[monthToken.toLowerCase()];
  const day = Number((dayToken || "").replace(",", ""));
  if (!month || Number.isNaN(day)) return null;
  return { month, day };
};

const dayOfYear = (month: number, day: number): number => {
  const d = new Date(Date.UTC(2025, month - 1, day));
  const start = new Date(Date.UTC(2025, 0, 1));
  return Math.floor((d.getTime() - start.getTime()) / 86400000) + 1;
};

export const isDateWithinSeason = (date: Date, seasonBegin: string, seasonEnd: string): boolean => {
  if (!seasonBegin.trim() && !seasonEnd.trim()) return true;
  const begin = parseMonthDay(seasonBegin);
  const end = parseMonthDay(seasonEnd);
  if (!begin || !end) return true;

  const target = dayOfYear(date.getUTCMonth() + 1, date.getUTCDate());
  const start = dayOfYear(begin.month, begin.day);
  const finish = dayOfYear(end.month, end.day);

  if (start <= finish) {
    return target >= start && target <= finish;
  }
  return target >= start || target <= finish;
};
