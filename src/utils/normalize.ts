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

export const parseLocationInput = (input: string): { city: string; state?: string } => {
  const pieces = input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (pieces.length === 0) {
    return { city: "" };
  }

  if (pieces.length === 1) {
    return { city: pieces[0] };
  }

  return { city: pieces[0], state: pieces[1].toUpperCase() };
};
