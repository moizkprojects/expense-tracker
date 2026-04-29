import type { OsmSuggestion } from "../types";
import { normalizeText } from "../utils/normalize";

const stateNameToCode: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};

const toStateCode = (value?: string): string | undefined => {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return stateNameToCode[normalizeText(trimmed)] ?? undefined;
};

type NominatimItem = {
  place_id: number;
  display_name: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
  };
};

export const searchOsmPlaces = async (query: string, signal?: AbortSignal): Promise<OsmSuggestion[]> => {
  const q = query.trim();
  if (q.length < 3) return [];

  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=us&limit=5&q=${encodeURIComponent(q)}`;
  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) return [];

  const payload = (await response.json()) as NominatimItem[];
  return payload.map((item) => {
    const city =
      item.address?.city || item.address?.town || item.address?.village || item.address?.municipality || "";
    const stateCode = toStateCode(item.address?.state);
    return {
      id: String(item.place_id),
      city,
      stateCode,
      county: item.address?.county,
      display: item.display_name,
    };
  });
};
