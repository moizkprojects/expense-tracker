import type { RateResolution, RateRow } from "../types";
import { normalizeCounty, normalizeText } from "../utils/normalize";
import { isDateWithinSeason } from "../utils/season";

const STANDARD_RATE_MIE = 68;

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

let cachedRates: RateRow[] | null = null;

const getRates = async (): Promise<RateRow[]> => {
  if (cachedRates) return cachedRates;
  const url = `${import.meta.env.BASE_URL}fy2026_master.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Could not load local GSA rates data.");
  }
  cachedRates = (await response.json()) as RateRow[];
  return cachedRates;
};

const normalizeStateInput = (state?: string): string | undefined => {
  if (!state?.trim()) return undefined;
  const trimmed = state.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return stateNameToCode[normalizeText(trimmed)] ?? trimmed.toUpperCase();
};

const pickSeasonalRate = (rows: RateRow[], date: Date): RateRow | null => {
  if (!rows.length) return null;
  return rows.find((row) => isDateWithinSeason(date, row.seasonBegin, row.seasonEnd)) ?? rows[0];
};

const splitLocation = (locationInput: string): { city: string; state?: string } => {
  const pieces = locationInput
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!pieces.length) return { city: "" };
  if (pieces.length === 1) return { city: pieces[0] };
  return { city: pieces[0], state: pieces[1] };
};

const resolveByCity = (rates: RateRow[], city: string, state: string | undefined, date: Date): RateResolution | null => {
  const cityNorm = normalizeText(city);
  const stateNorm = normalizeStateInput(state);

  const candidates = rates.filter((row) => {
    const cityMatch = normalizeText(row.destination) === cityNorm;
    if (!cityMatch) return false;
    if (!stateNorm) return true;
    return row.state === stateNorm;
  });

  const best = pickSeasonalRate(candidates, date);
  if (!best) return null;

  return {
    mieRate: best.mieRate,
    state: best.state,
    city: best.destination,
    county: best.county,
    matchType: "city_exact",
  };
};

type GeoResult = {
  lat: number;
  lon: number;
  county?: string;
  stateCode?: string;
};

const geocodeWithNominatim = async (city: string, state?: string): Promise<GeoResult | null> => {
  const q = state ? `${city}, ${state}, USA` : `${city}, USA`;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(q)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as Array<{
    lat: string;
    lon: string;
    address?: { county?: string; state?: string };
  }>;
  if (!payload.length) return null;

  const first = payload[0];
  return {
    lat: Number(first.lat),
    lon: Number(first.lon),
    county: first.address?.county,
    stateCode: normalizeStateInput(first.address?.state),
  };
};

const getCountyFromCensus = async (lat: number, lon: number): Promise<{ county?: string; stateCode?: string } | null> => {
  const url = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${lon}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    result?: {
      geographies?: {
        Counties?: Array<{ BASENAME?: string; NAME?: string; STUSAB?: string }>;
      };
    };
  };
  const county = payload?.result?.geographies?.Counties?.[0];
  if (!county) return null;
  return {
    county: county.BASENAME || county.NAME,
    stateCode: county.STUSAB,
  };
};

const resolveByCounty = (rates: RateRow[], county: string, state: string, date: Date): RateResolution | null => {
  const countyNorm = normalizeCounty(county);
  const stateNorm = normalizeStateInput(state);
  if (!countyNorm || !stateNorm) return null;

  const candidates = rates.filter(
    (row) => normalizeCounty(row.county) === countyNorm && normalizeStateInput(row.state) === stateNorm
  );

  const best = pickSeasonalRate(candidates, date);
  if (!best) return null;

  return {
    mieRate: best.mieRate,
    state: best.state,
    city: best.destination,
    county: best.county,
    matchType: "county_fallback",
  };
};

export const resolveRate = async (
  locationInput: string,
  explicitStateInput: string,
  date = new Date()
): Promise<RateResolution> => {
  const rates = await getRates();
  const parsed = splitLocation(locationInput);
  const stateInput = normalizeStateInput(explicitStateInput || parsed.state);
  const standardResolution = (message: string, state?: string, county?: string): RateResolution => ({
    mieRate: STANDARD_RATE_MIE,
    state: state ?? stateInput ?? "",
    city: parsed.city,
    county,
    matchType: "standard_oconus",
    message,
  });

  if (!parsed.city.trim()) {
    return {
      mieRate: STANDARD_RATE_MIE,
      state: stateInput ?? "",
      matchType: "unresolved",
      message: "Enter a city name to find the daily M&IE rate.",
    };
  }

  try {
    const geo = await geocodeWithNominatim(parsed.city, stateInput);
    if (!geo) {
      const cityExact = resolveByCity(rates, parsed.city, stateInput, date);
      if (cityExact) return cityExact;
      return standardResolution(
        "city/county were not found on the gsa site therefore a standard oconus rate is used for this location"
      );
    }

    const census = await getCountyFromCensus(geo.lat, geo.lon);
    const county = census?.county || geo.county;
    const state = census?.stateCode || geo.stateCode || stateInput;

    if (county && state) {
      const countyMatch = resolveByCounty(rates, county, state, date);
      if (countyMatch) {
        return {
          ...countyMatch,
          city: parsed.city,
          county: countyMatch.county || county,
          message: `this city is in the county ${countyMatch.county || county} which has a per diem of ${countyMatch.mieRate}`,
        };
      }

      return standardResolution(
        "city/county were not found on the gsa site therefore a standard oconus rate is used for this location",
        state,
        county
      );
    }

    return standardResolution(
      "city/county were not found on the gsa site therefore a standard oconus rate is used for this location",
      state
    );
  } catch {
    const cityExact = resolveByCity(rates, parsed.city, stateInput, date);
    if (cityExact) return cityExact;
    return {
      mieRate: STANDARD_RATE_MIE,
      state: stateInput ?? "",
      city: parsed.city,
      matchType: "standard_oconus",
      message: "city/county were not found on the gsa site therefore a standard oconus rate is used for this location",
    };
  }
};
