import { getDb } from "../db/database";
import { RateResolution } from "../types";
import { parseLocationInput, normalizeCounty, normalizeText } from "../utils/normalize";
import { isDateWithinSeason } from "../utils/season";

const STANDARD_CONUS_MIE = 68;

type DbRate = {
  state: string;
  destination_city: string;
  county: string;
  season_start: string;
  season_end: string;
  mie_rate: number;
};

const pickSeasonalRate = (rows: DbRate[], date: Date): DbRate | null => {
  if (rows.length === 0) return null;
  const inSeason = rows.find((row) => isDateWithinSeason(date, row.season_start, row.season_end));
  return inSeason ?? rows[0];
};

const geocodeWithNominatim = async (city: string, state?: string) => {
  const q = state ? `${city}, ${state}, USA` : `${city}, USA`;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "per-diem-tracker-mobile/1.0",
    },
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as Array<{
    lat: string;
    lon: string;
    address?: { state?: string; county?: string };
  }>;
  if (!payload.length) return null;
  const item = payload[0];
  return {
    lat: Number(item.lat),
    lon: Number(item.lon),
    stateFromGeo: item.address?.state,
    countyFromGeo: item.address?.county,
  };
};

const countyFromCensus = async (lat: number, lon: number) => {
  const url = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${lon}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    result?: {
      geographies?: {
        Counties?: Array<{ NAME?: string; BASENAME?: string; STATE?: string; STUSAB?: string }>;
      };
    };
  };
  const county = payload?.result?.geographies?.Counties?.[0];
  if (!county) return null;
  return {
    county: county.BASENAME || county.NAME || "",
    stateCode: county.STUSAB || "",
  };
};

const resolveByCity = async (city: string, state?: string, date?: Date): Promise<RateResolution | null> => {
  const sqlite = await getDb();
  const cityNorm = normalizeText(city);

  const rows = state
    ? await sqlite.getAllAsync<DbRate>(
        "SELECT state, destination_city, county, season_start, season_end, mie_rate FROM rates WHERE city_norm = ? AND state_norm = ?",
        [cityNorm, normalizeText(state)]
      )
    : await sqlite.getAllAsync<DbRate>(
        "SELECT state, destination_city, county, season_start, season_end, mie_rate FROM rates WHERE city_norm = ?",
        [cityNorm]
      );

  const best = pickSeasonalRate(rows, date ?? new Date());
  if (!best) return null;

  return {
    mieRate: best.mie_rate,
    state: best.state,
    city: best.destination_city,
    county: best.county,
    matchType: "city_exact",
  };
};

const resolveByCounty = async (county: string, stateCode: string, date?: Date): Promise<RateResolution | null> => {
  const sqlite = await getDb();
  const rows = await sqlite.getAllAsync<DbRate>(
    "SELECT state, destination_city, county, season_start, season_end, mie_rate FROM rates WHERE county_norm = ? AND state_norm = ?",
    [normalizeCounty(county), normalizeText(stateCode)]
  );
  const best = pickSeasonalRate(rows, date ?? new Date());
  if (!best) return null;
  return {
    mieRate: best.mie_rate,
    state: best.state,
    city: best.destination_city,
    county: best.county,
    matchType: "county_fallback",
  };
};

export const resolveRate = async (locationInput: string, date = new Date()): Promise<RateResolution> => {
  const parsed = parseLocationInput(locationInput);
  if (!parsed.city) {
    return {
      mieRate: STANDARD_CONUS_MIE,
      state: parsed.state ?? "",
      matchType: "unresolved",
      message: "Enter a city (and optional state) to look up a rate.",
    };
  }

  const exact = await resolveByCity(parsed.city, parsed.state, date);
  if (exact) return exact;

  try {
    const nominatim = await geocodeWithNominatim(parsed.city, parsed.state);
    if (!nominatim) {
      return {
        mieRate: STANDARD_CONUS_MIE,
        state: parsed.state ?? "",
        matchType: "standard_conus",
        message: "City not found in GSA locations. Showing Standard CONUS M&IE.",
      };
    }

    const census = await countyFromCensus(nominatim.lat, nominatim.lon);
    const countyCandidate = census?.county || nominatim.countyFromGeo || "";
    const stateCandidate = census?.stateCode || parsed.state || "";

    if (countyCandidate && stateCandidate) {
      const countyMatch = await resolveByCounty(countyCandidate, stateCandidate, date);
      if (countyMatch) return countyMatch;
    }
  } catch (error) {
    return {
      mieRate: STANDARD_CONUS_MIE,
      state: parsed.state ?? "",
      matchType: "standard_conus",
      message: "Geolocation service failed. Showing Standard CONUS M&IE.",
    };
  }

  return {
    mieRate: STANDARD_CONUS_MIE,
    state: parsed.state ?? "",
    matchType: "standard_conus",
    message: "No city/county GSA match found. Showing Standard CONUS M&IE.",
  };
};

export const __testables = {
  pickSeasonalRate,
};
