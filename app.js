const STORAGE_KEY = "per-diem-ledgers-v3-workbook-only";
const DRAFT_STORAGE_KEY = "per-diem-ledger-draft-v1-workbook-only";
const OSM_SEARCH_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const OSM_LOOKUP_TIMEOUT_MS = 9000;

const state = {
  workbookReady: false,
  locations: [],
  locationsByKey: new Map(),
  locationsByLabel: new Map(),
  visibleLocationResults: [],
  activeLocationResultIndex: -1,
  ledgers: [],
  current: null,
  isHydrating: false,
  saveTimer: null,
  hasManualLocationNavigation: false,
  isOsmLookupRunning: false,
  osmLookupAbortController: null
};

const elements = {};
const US_STATE_NAME_TO_CODE = {
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
  "district of columbia": "DC"
};

document.addEventListener("DOMContentLoaded", () => {
  void initializeApp();
});

async function initializeApp() {
  cacheElements();
  bindEvents();
  resetCurrentDay();
  renderEntries();
  renderHistory();

  try {
    setSaveStatus("Restoring saved ledgers...");
    state.ledgers = loadLedgersFromStorage();
    renderHistory();
    maybeRestoreDraft();

    setSaveStatus("Loading FY2026 rates...");
    const parsedWorkbook = await loadWorkbookData();

    state.locations = parsedWorkbook.locations;
    state.locationsByKey = parsedWorkbook.locationsByKey;
    state.locationsByLabel = parsedWorkbook.locationsByLabel;
    state.workbookReady = true;

    hideLocationResults();
    updateEverything();
    setSaveStatus(`FY2026 rates ready (${state.locations.length} locations). Changes save automatically.`);
    elements.locationHelp.textContent = "Start typing to search workbook locations, or use OpenStreetMap for city/county matching.";
  } catch (error) {
    console.error(error);
    setSaveStatus("Rates could not be loaded.");
    elements.locationHelp.textContent = "FY2026 rates could not be loaded on this browser.";
  }
}

function cacheElements() {
  elements.serviceDate = document.getElementById("service-date");
  elements.locationInput = document.getElementById("location-input");
  elements.locationResults = document.getElementById("location-results");
  elements.osmLookup = document.getElementById("osm-lookup");
  elements.travelDay = document.getElementById("travel-day");
  elements.locationHelp = document.getElementById("location-help");
  elements.baseRate = document.getElementById("base-rate");
  elements.effectiveRate = document.getElementById("effective-rate");
  elements.lodgingRate = document.getElementById("lodging-rate");
  elements.rateTitle = document.getElementById("rate-title");
  elements.rateSeason = document.getElementById("rate-season");
  elements.entries = document.getElementById("entries");
  elements.addEntry = document.getElementById("add-entry");
  elements.resetDay = document.getElementById("reset-day");
  elements.saveStatus = document.getElementById("save-status");
  elements.summaryCard = document.getElementById("summary-card");
  elements.summaryTitle = document.getElementById("summary-title");
  elements.summaryCaption = document.getElementById("summary-caption");
  elements.summaryAllowed = document.getElementById("summary-allowed");
  elements.summaryTotal = document.getElementById("summary-total");
  elements.summaryDifference = document.getElementById("summary-difference");
  elements.history = document.getElementById("history");
}

function bindEvents() {
  const flushOnExit = () => {
    flushPendingSaves();
  };

  elements.serviceDate.addEventListener("change", () => {
    switchLedgerIfNeeded();
    updateEverything();
  });

  elements.locationInput.addEventListener("input", () => {
    state.hasManualLocationNavigation = false;
    clearSelectedLocationIfTyping();
    renderLocationResults(elements.locationInput.value, false, true);
    switchLedgerIfNeeded();
    updateEverything();
  });

  elements.locationInput.addEventListener("focus", () => {
    state.hasManualLocationNavigation = false;
    renderLocationResults(elements.locationInput.value, false, true);
  });

  elements.locationInput.addEventListener("blur", () => {
    window.setTimeout(() => {
      if (document.activeElement === elements.locationInput) {
        return;
      }
      hideLocationResults();
    }, 120);
  });

  elements.locationInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" && elements.locationResults.classList.contains("hidden")) {
      event.preventDefault();
      renderLocationResults(elements.locationInput.value, false, true);
      return;
    }

    if (elements.locationResults.classList.contains("hidden")) {
      if (event.key === "Enter") {
        const selectedLocation = getSelectedLocation();
        if (!selectedLocation && elements.locationInput.value.trim()) {
          event.preventDefault();
          void attemptOsmCountyLookup();
        }
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      state.hasManualLocationNavigation = true;
      state.activeLocationResultIndex = Math.min(
        state.activeLocationResultIndex + 1,
        state.visibleLocationResults.length - 1
      );
      renderLocationResults(elements.locationInput.value, true, true);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      state.hasManualLocationNavigation = true;
      state.activeLocationResultIndex = Math.max(state.activeLocationResultIndex - 1, 0);
      renderLocationResults(elements.locationInput.value, true, true);
      return;
    }

    if (event.key === "Enter") {
      const selectedLocation = getSelectedLocation();
      if (selectedLocation) {
        event.preventDefault();
        pickLocation(selectedLocation.label);
        return;
      }

      if (state.hasManualLocationNavigation && state.visibleLocationResults.length) {
        event.preventDefault();
        const resolvedIndex = state.activeLocationResultIndex >= 0 ? state.activeLocationResultIndex : 0;
        const navigated = state.visibleLocationResults[resolvedIndex];
        if (navigated) {
          pickLocation(navigated.label);
        }
        return;
      }

      if (elements.locationInput.value.trim()) {
        event.preventDefault();
        void attemptOsmCountyLookup();
      }
      return;
    }

    if (event.key === "Escape" && !elements.locationResults.classList.contains("hidden")) {
      hideLocationResults();
    }
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest(".location-field")) {
      return;
    }
    hideLocationResults();
  });

  elements.travelDay.addEventListener("change", () => {
    updateEverything();
  });

  if (elements.osmLookup) {
    elements.osmLookup.addEventListener("click", () => {
      void attemptOsmCountyLookup();
    });
  }

  elements.addEntry.addEventListener("click", () => {
    state.current.entries.push(createEntry());
    renderEntries();
    updateEverything();
  });

  elements.resetDay.addEventListener("click", () => {
    resetCurrentDay();
    renderEntries();
    updateEverything();
  });

  elements.entries.addEventListener("input", (event) => {
    const row = event.target.closest("[data-entry-id]");
    if (!row) {
      return;
    }

    const entry = state.current.entries.find((item) => item.id === row.dataset.entryId);
    if (!entry) {
      return;
    }

    if (event.target.matches(".label-input")) {
      entry.label = event.target.value;
    }

    if (event.target.matches(".amount-input")) {
      entry.amount = event.target.value;
    }

    syncEntryValidation();
    updateEverything();
  });

  elements.entries.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-remove-entry]");
    if (!deleteButton) {
      return;
    }

    const row = deleteButton.closest("[data-entry-id]");
    if (!row) {
      return;
    }

    state.current.entries = state.current.entries.filter((item) => item.id !== row.dataset.entryId);
    if (!state.current.entries.length) {
      state.current.entries = [createEntry()];
    }

    renderEntries();
    updateEverything();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushPendingSaves();
    }
  });

  window.addEventListener("pagehide", flushOnExit);
  window.addEventListener("beforeunload", flushOnExit);
}

function resetCurrentDay() {
  const isoDate = getLocalIsoDate(new Date());

  state.current = {
    id: null,
    serviceDate: isoDate,
    locationKey: "",
    locationLabel: "",
    travelDay: false,
    baseMieRate: 0,
    effectiveMieRate: 0,
    totalSpent: 0,
    difference: 0,
    entries: [createEntry()]
  };

  state.isHydrating = true;
  elements.serviceDate.value = isoDate;
  elements.locationInput.value = "";
  elements.travelDay.checked = false;
  state.isHydrating = false;
  hideLocationResults();
}

function createEntry(label = "", amount = "") {
  return {
    id: createId(),
    label,
    amount
  };
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function renderEntries() {
  const rows = state.current.entries.map((entry) => {
    const invalidClass = isInvalidAmount(entry.amount) ? " invalid-amount" : "";

    return `
      <div class="entry-row${invalidClass}" data-entry-id="${escapeHtml(entry.id)}">
        <label>
          <span class="entry-note">Entry Label</span>
          <input class="label-input" type="text" placeholder="Breakfast, lunch, dinner, snack..." value="${escapeHtml(entry.label)}">
        </label>
        <label>
          <span class="entry-note">Amount</span>
          <input class="amount-input" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="${escapeHtml(entry.amount)}">
        </label>
        <button class="delete-button" type="button" data-remove-entry>Delete</button>
      </div>
    `;
  }).join("");

  elements.entries.innerHTML = rows;
}

function syncEntryValidation() {
  Array.from(elements.entries.querySelectorAll("[data-entry-id]")).forEach((row) => {
    const amountInput = row.querySelector(".amount-input");
    row.classList.toggle("invalid-amount", isInvalidAmount(amountInput.value));
  });
}

function updateEverything() {
  if (!state.current) {
    return;
  }

  state.current.serviceDate = elements.serviceDate.value;
  state.current.travelDay = elements.travelDay.checked;

  const selectedLocation = getSelectedLocation();
  if (selectedLocation) {
    state.current.locationKey = selectedLocation.key;
    state.current.locationLabel = selectedLocation.label;
  } else {
    state.current.locationKey = "";
    state.current.locationLabel = elements.locationInput.value.trim();
  }

  const rateRecord = resolveRateRecord(state.current.serviceDate, state.current.locationKey);
  const baseRate = rateRecord ? rateRecord.mieRate : 0;
  const effectiveRate = state.current.travelDay ? roundCurrency(baseRate * 0.75) : baseRate;
  const totalSpent = calculateTotalSpent(state.current.entries);
  const difference = roundCurrency(effectiveRate - totalSpent);

  state.current.id = state.current.serviceDate && state.current.locationKey
    ? buildLedgerId(state.current.serviceDate, state.current.locationKey)
    : null;
  state.current.baseMieRate = baseRate;
  state.current.effectiveMieRate = effectiveRate;
  state.current.totalSpent = totalSpent;
  state.current.difference = difference;

  renderRateCard(rateRecord, selectedLocation);
  renderSummary(selectedLocation, rateRecord, effectiveRate, totalSpent, difference);
  scheduleSave();
  renderHistory();
}

function switchLedgerIfNeeded() {
  if (state.isHydrating) {
    return;
  }

  const selectedLocation = getSelectedLocation();
  const serviceDate = elements.serviceDate.value;

  if (!serviceDate || !selectedLocation) {
    return;
  }

  const nextId = buildLedgerId(serviceDate, selectedLocation.key);
  if (state.current.id === nextId) {
    return;
  }

  const existingLedger = state.ledgers.find((ledger) => ledger.id === nextId);
  if (existingLedger) {
    hydrateFromLedger(existingLedger);
    return;
  }

  state.current = {
    id: nextId,
    serviceDate,
    locationKey: selectedLocation.key,
    locationLabel: selectedLocation.label,
    travelDay: elements.travelDay.checked,
    baseMieRate: 0,
    effectiveMieRate: 0,
    totalSpent: 0,
    difference: 0,
    entries: [createEntry()]
  };

  renderEntries();
}

function hydrateFromLedger(ledger) {
  state.isHydrating = true;
  state.current = {
    ...cloneValue(ledger),
    entries: Array.isArray(ledger.entries) && ledger.entries.length ? cloneValue(ledger.entries) : [createEntry()]
  };

  elements.serviceDate.value = ledger.serviceDate;
  elements.locationInput.value = ledger.locationLabel;
  elements.travelDay.checked = Boolean(ledger.travelDay);
  state.isHydrating = false;
  hideLocationResults();

  renderEntries();
}

function getSelectedLocation() {
  if (!state.workbookReady || !state.current || !state.current.locationKey) {
    return null;
  }

  return state.locationsByKey.get(state.current.locationKey) || null;
}

async function attemptOsmCountyLookup() {
  if (!state.workbookReady || state.isOsmLookupRunning) {
    return;
  }

  const query = elements.locationInput.value.trim();
  if (!query) {
    elements.locationHelp.textContent = "Enter a city first, then click Find By City/County.";
    return;
  }

  const selectedLocation = getSelectedLocation();
  if (selectedLocation) {
    pickLocation(selectedLocation.label);
    return;
  }

  hideLocationResults();
  setOsmLookupBusy(true);
  setSaveStatus("Searching OpenStreetMap...");
  elements.locationHelp.textContent = "Searching OpenStreetMap and matching county to the FY2026 workbook...";

  try {
    const resolution = await resolveWorkbookLocationFromOsm(query);

    if (resolution.location) {
      pickLocation(resolution.location.label);

      if (resolution.matchType === "county") {
        elements.locationHelp.textContent = `Matched by county (${resolution.countyDisplay || "unknown county"}), ${resolution.stateCode}.`;
      } else {
        elements.locationHelp.textContent = `Matched by city/state (${resolution.cityDisplay || query}), ${resolution.stateCode}.`;
      }

      setSaveStatus(`Mapped "${query}" to ${resolution.location.label}.`);
      return;
    }

    if (resolution.standardConus) {
      pickLocation(resolution.standardConus.label);
      elements.locationHelp.textContent = "No specific county match found. Applied Standard CONUS as fallback.";
      setSaveStatus(`No county match for "${query}". Applied Standard CONUS.`);
      return;
    }

    elements.locationHelp.textContent = "No workbook match found from OpenStreetMap. Try another nearby city.";
    setSaveStatus("No workbook match found from OpenStreetMap.");
  } catch (error) {
    console.error(error);
    const message = error && error.name === "AbortError"
      ? "OpenStreetMap lookup timed out. Please try again."
      : "OpenStreetMap lookup failed. Check connection and try again.";
    elements.locationHelp.textContent = message;
    setSaveStatus(message);
  } finally {
    setOsmLookupBusy(false);
  }
}

function setOsmLookupBusy(isBusy) {
  state.isOsmLookupRunning = isBusy;
  if (!elements.osmLookup) {
    return;
  }

  elements.osmLookup.disabled = isBusy;
  elements.osmLookup.textContent = isBusy
    ? "Finding County Match..."
    : "Find By City/County (OpenStreetMap)";
}

async function resolveWorkbookLocationFromOsm(query) {
  const osmResults = await searchOpenStreetMap(query);
  const standardConus = state.locationsByKey.get("standard-conus") || null;

  for (let index = 0; index < osmResults.length; index += 1) {
    const mapped = mapOsmToWorkbookLocation(osmResults[index], query);
    if (mapped && mapped.location) {
      return {
        ...mapped,
        standardConus
      };
    }
  }

  return {
    location: null,
    matchType: "",
    countyDisplay: "",
    cityDisplay: "",
    stateCode: "",
    standardConus
  };
}

async function searchOpenStreetMap(query) {
  if (state.osmLookupAbortController) {
    state.osmLookupAbortController.abort();
  }

  const controller = new AbortController();
  state.osmLookupAbortController = controller;
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, OSM_LOOKUP_TIMEOUT_MS);

  try {
    const url = buildOsmSearchUrl(query);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Accept-Language": "en-US"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`OpenStreetMap search failed with status ${response.status}.`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      return [];
    }

    return payload.filter((item) => item && item.address && typeof item.address === "object");
  } finally {
    window.clearTimeout(timeoutId);
    state.osmLookupAbortController = null;
  }
}

function buildOsmSearchUrl(query) {
  const url = new URL(OSM_SEARCH_ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("limit", "8");
  return url.toString();
}

function mapOsmToWorkbookLocation(result, typedQuery) {
  const address = result && result.address ? result.address : {};
  const stateCode = extractStateCode(address);
  if (!stateCode) {
    return null;
  }

  const stateLocations = state.locations.filter((location) => {
    return !location.isStandardConus && String(location.state || "").toUpperCase() === stateCode;
  });

  if (!stateLocations.length) {
    return null;
  }

  const countyDisplay = firstNonEmpty([
    address.county,
    address.state_district,
    address.region,
    address.municipality
  ]);
  const cityDisplay = firstNonEmpty([
    address.city,
    address.town,
    address.village,
    address.hamlet,
    address.municipality,
    address.suburb,
    address.city_district
  ]);

  const countyNormalized = normalizeGeoName(countyDisplay);
  const cityNormalized = normalizeGeoName(cityDisplay);
  const typedNormalized = normalizeGeoName(typedQuery);

  if (countyNormalized) {
    const countyLocation = findBestCountyLocation(stateLocations, countyNormalized, cityNormalized, typedNormalized);
    if (countyLocation) {
      return {
        location: countyLocation,
        matchType: "county",
        countyDisplay,
        cityDisplay,
        stateCode
      };
    }
  }

  const cityLocation = findBestCityLocation(stateLocations, cityNormalized || typedNormalized, typedNormalized);
  if (cityLocation) {
    return {
      location: cityLocation,
      matchType: "city",
      countyDisplay,
      cityDisplay,
      stateCode
    };
  }

  return null;
}

function findBestCountyLocation(stateLocations, countyNormalized, cityNormalized, typedNormalized) {
  let bestLocation = null;
  let bestScore = 0;

  stateLocations.forEach((location) => {
    const countyTokens = getCountyTokensForLocation(location);
    if (!countyTokens.length) {
      return;
    }

    let score = 0;
    countyTokens.forEach((countyToken) => {
      if (countyToken === countyNormalized) {
        score = Math.max(score, 120);
        return;
      }

      const minLength = Math.min(countyToken.length, countyNormalized.length);
      if (minLength >= 4 && (countyToken.includes(countyNormalized) || countyNormalized.includes(countyToken))) {
        score = Math.max(score, 90);
      }
    });

    if (!score) {
      return;
    }

    const destinationNormalized = normalizeGeoName(location.destination);
    const labelNormalized = normalizeGeoName(location.label);
    if (cityNormalized && destinationNormalized.includes(cityNormalized)) {
      score += 24;
    }
    if (typedNormalized && (destinationNormalized.includes(typedNormalized) || labelNormalized.includes(typedNormalized))) {
      score += 8;
    }

    if (score > bestScore) {
      bestScore = score;
      bestLocation = location;
    }
  });

  return bestLocation;
}

function findBestCityLocation(stateLocations, cityNormalized, typedNormalized) {
  if (!cityNormalized && !typedNormalized) {
    return null;
  }

  let bestLocation = null;
  let bestScore = 0;
  const target = cityNormalized || typedNormalized;

  stateLocations.forEach((location) => {
    const destinationNormalized = normalizeGeoName(location.destination);
    const labelNormalized = normalizeGeoName(location.label);
    let score = 0;

    if (target && (destinationNormalized.includes(target) || target.includes(destinationNormalized))) {
      score += 80;
    }

    if (target && (labelNormalized.includes(target) || target.includes(labelNormalized))) {
      score += 50;
    }

    if (typedNormalized && labelNormalized.includes(typedNormalized)) {
      score += 8;
    }

    if (score > bestScore) {
      bestScore = score;
      bestLocation = location;
    }
  });

  return bestLocation;
}

function getCountyTokensForLocation(location) {
  const source = String(location.countyOrLocationDefined || "").trim();
  if (!source) {
    return [];
  }

  const parts = source.split(/\s*\/\s*|,|;|\band\b/gi);
  const tokens = parts
    .map((part) => normalizeGeoName(part))
    .filter(Boolean);

  if (!tokens.length) {
    const normalized = normalizeGeoName(source);
    return normalized ? [normalized] : [];
  }

  return Array.from(new Set(tokens));
}

function extractStateCode(address) {
  if (!address || typeof address !== "object") {
    return "";
  }

  const stateCodeRaw = String(address.state_code || "").trim();
  if (/^[A-Za-z]{2}$/.test(stateCodeRaw)) {
    return stateCodeRaw.toUpperCase();
  }

  const isoKeys = ["ISO3166-2-lvl4", "ISO3166-2-lvl3", "ISO3166-2-lvl5"];
  for (let index = 0; index < isoKeys.length; index += 1) {
    const value = String(address[isoKeys[index]] || "").trim();
    const match = value.match(/^US-([A-Za-z]{2})$/);
    if (match) {
      return match[1].toUpperCase();
    }
  }

  const stateText = String(address.state || address.region || "").trim().toLowerCase();
  if (!stateText) {
    return "";
  }

  if (US_STATE_NAME_TO_CODE[stateText]) {
    return US_STATE_NAME_TO_CODE[stateText];
  }

  if (/^[A-Za-z]{2}$/.test(stateText)) {
    return stateText.toUpperCase();
  }

  return "";
}

function normalizeGeoName(value) {
  if (!value) {
    return "";
  }

  let text = String(value).toLowerCase();
  if (typeof text.normalize === "function") {
    text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  text = text.replace(/&/g, " and ");
  text = text.replace(/[^a-z0-9\s]/g, " ");
  text = text.replace(/\b(county|parish|borough|census|area|city|town|township|village|municipality|district|limits|limit|of|the)\b/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

function firstNonEmpty(values) {
  for (let index = 0; index < values.length; index += 1) {
    const value = String(values[index] || "").trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function renderRateCard(rateRecord, location) {
  if (!location || !rateRecord) {
    elements.rateTitle.textContent = "Select a workbook location";
    elements.rateSeason.textContent = "Choose an exact workbook location to see the matching seasonal rate.";
    elements.baseRate.textContent = "$0.00";
    elements.effectiveRate.textContent = "$0.00";
    elements.lodgingRate.textContent = "$0.00";

    if (elements.locationInput.value.trim()) {
      elements.locationHelp.textContent = "Select a suggestion, or click Find By City/County to map a non-workbook city via OpenStreetMap.";
    } else {
      elements.locationHelp.textContent = "Start typing, then tap a workbook location from the list or use Find By City/County.";
    }

    return;
  }

  elements.rateTitle.textContent = location.label;
  elements.rateSeason.textContent = rateRecord.seasonLabel;
  elements.baseRate.textContent = formatMoney(rateRecord.mieRate);
  elements.effectiveRate.textContent = formatMoney(state.current.travelDay ? roundCurrency(rateRecord.mieRate * 0.75) : rateRecord.mieRate);
  elements.lodgingRate.textContent = formatMoney(rateRecord.lodgingRate);
  elements.locationHelp.textContent = "Workbook match found. Daily calculations now use FY2026 M&IE.";
}

function renderSummary(location, rateRecord, effectiveRate, totalSpent, difference) {
  elements.summaryAllowed.textContent = formatMoney(effectiveRate);
  elements.summaryTotal.textContent = formatMoney(totalSpent);
  elements.summaryDifference.textContent = formatMoney(Math.abs(difference));

  elements.summaryCard.classList.remove("positive", "negative", "neutral");

  if (!location || !rateRecord) {
    elements.summaryCard.classList.add("neutral");
    elements.summaryTitle.textContent = "Waiting for date and workbook location";
    elements.summaryCaption.textContent = "Select a valid location to calculate allowed M&IE.";
    return;
  }

  if (difference >= 0) {
    elements.summaryCard.classList.add("positive");
    elements.summaryTitle.textContent = `${formatMoney(difference)} left in per diem`;
    elements.summaryCaption.textContent = state.current.travelDay
      ? "Travel day is on, so this summary uses 75% of base M&IE."
      : "This summary uses full daily M&IE from the workbook.";
  } else {
    elements.summaryCard.classList.add("negative");
    elements.summaryTitle.textContent = `${formatMoney(Math.abs(difference))} over per diem`;
    elements.summaryCaption.textContent = "Entered meal and incidental costs are above the allowed M&IE.";
  }
}

function calculateTotalSpent(entries) {
  return roundCurrency(entries.reduce((sum, entry) => {
    const amount = parseAmount(entry.amount);
    return amount === null ? sum : sum + amount;
  }, 0));
}

function parseAmount(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return roundCurrency(amount);
}

function isInvalidAmount(value) {
  return value !== "" && parseAmount(value) === null;
}

function buildLedgerId(serviceDate, locationKey) {
  return `${serviceDate}__${locationKey}`;
}

function scheduleSave() {
  if (state.saveTimer) {
    window.clearTimeout(state.saveTimer);
  }

  state.saveTimer = window.setTimeout(() => {
    state.saveTimer = null;
    persistCurrentLedger();
    persistDraftState();
  }, 180);
}

function persistCurrentLedger() {
  if (!state.current.id || !state.current.locationKey || !state.current.serviceDate) {
    return;
  }

  const payload = {
    id: state.current.id,
    serviceDate: state.current.serviceDate,
    locationKey: state.current.locationKey,
    locationLabel: state.current.locationLabel,
    travelDay: state.current.travelDay,
    baseMieRate: state.current.baseMieRate,
    effectiveMieRate: state.current.effectiveMieRate,
    totalSpent: state.current.totalSpent,
    difference: state.current.difference,
    entries: cloneValue(state.current.entries)
  };

  upsertLedgerInState(payload);
  saveLedgersToStorage();
  renderHistory();
  setSaveStatus(`Saved ${formatDisplayDate(payload.serviceDate)} for ${payload.locationLabel}.`);
}

function persistDraftState() {
  if (!state.current) {
    return;
  }

  const payload = {
    serviceDate: state.current.serviceDate || getLocalIsoDate(new Date()),
    locationKey: state.current.locationKey || "",
    locationLabel: elements.locationInput.value.trim() || state.current.locationLabel || "",
    travelDay: Boolean(state.current.travelDay),
    entries: cloneValue(state.current.entries || []),
    savedAt: new Date().toISOString()
  };

  if (!hasMeaningfulDraft(payload)) {
    clearDraftStorage();
    return;
  }

  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error(error);
  }
}

function flushPendingSaves() {
  if (state.saveTimer) {
    window.clearTimeout(state.saveTimer);
    state.saveTimer = null;
  }

  persistCurrentLedger();
  persistDraftState();
}

function upsertLedgerInState(ledger) {
  const index = state.ledgers.findIndex((item) => item.id === ledger.id);
  if (index === -1) {
    state.ledgers.push(ledger);
  } else {
    state.ledgers[index] = ledger;
  }

  state.ledgers.sort((left, right) => {
    if (left.serviceDate === right.serviceDate) {
      return left.locationLabel.localeCompare(right.locationLabel);
    }

    return right.serviceDate.localeCompare(left.serviceDate);
  });
}

function renderHistory() {
  if (!state.ledgers.length) {
    elements.history.innerHTML = '<div class="empty-state">Saved ledgers appear here after selecting a date and workbook location.</div>';
    return;
  }

  elements.history.innerHTML = state.ledgers.map((ledger) => {
    const balanceClass = ledger.difference >= 0 ? "positive" : "negative";
    const activeClass = state.current && state.current.id === ledger.id ? " active" : "";
    const differenceLabel = ledger.difference >= 0
      ? `${formatMoney(ledger.difference)} left`
      : `${formatMoney(Math.abs(ledger.difference))} over`;

    return `
      <div class="history-item ${balanceClass}${activeClass}">
        <div class="history-head">
          <div>
            <div class="history-date">${formatDisplayDate(ledger.serviceDate)}</div>
            <div class="history-location">${escapeHtml(ledger.locationLabel)}</div>
          </div>
        </div>
        <div class="history-meta">
          <span>Allowed ${formatMoney(ledger.effectiveMieRate)}</span>
          <span>Spent ${formatMoney(ledger.totalSpent)}</span>
          <span class="history-difference">${differenceLabel}</span>
          <span>${ledger.travelDay ? "Travel day" : "Full day"}</span>
        </div>
        <button class="ghost-button" type="button" data-open-ledger="${escapeHtml(ledger.id)}">Open Ledger</button>
        <button class="delete-button" type="button" data-delete-ledger="${escapeHtml(ledger.id)}">Delete</button>
      </div>
    `;
  }).join("");

  Array.from(elements.history.querySelectorAll("[data-open-ledger]")).forEach((button) => {
    button.addEventListener("click", () => {
      const ledger = state.ledgers.find((item) => item.id === button.dataset.openLedger);
      if (!ledger) {
        return;
      }

      hydrateFromLedger(ledger);
      updateEverything();
    });
  });

  Array.from(elements.history.querySelectorAll("[data-delete-ledger]")).forEach((button) => {
    button.addEventListener("click", () => {
      const ledgerId = button.dataset.deleteLedger;
      state.ledgers = state.ledgers.filter((item) => item.id !== ledgerId);
      saveLedgersToStorage();

      if (state.current && state.current.id === ledgerId) {
        resetCurrentDay();
        renderEntries();
      }

      updateEverything();
    });
  });
}

function loadLedgersFromStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const ledgers = parsed
      .map((ledger) => normalizeLedger(ledger))
      .filter(Boolean);

    ledgers.sort((left, right) => {
      if (left.serviceDate === right.serviceDate) {
        return left.locationLabel.localeCompare(right.locationLabel);
      }
      return right.serviceDate.localeCompare(left.serviceDate);
    });

    return ledgers;
  } catch (error) {
    console.error(error);
    return [];
  }
}

function maybeRestoreDraft() {
  const draft = loadDraftFromStorage();
  if (!draft) {
    return;
  }

  state.isHydrating = true;
  state.current = {
    id: draft.id || null,
    serviceDate: draft.serviceDate || getLocalIsoDate(new Date()),
    locationKey: draft.locationKey || "",
    locationLabel: draft.locationLabel || "",
    travelDay: Boolean(draft.travelDay),
    baseMieRate: 0,
    effectiveMieRate: 0,
    totalSpent: 0,
    difference: 0,
    entries: draft.entries.length ? draft.entries : [createEntry()]
  };

  elements.serviceDate.value = state.current.serviceDate;
  elements.locationInput.value = state.current.locationLabel;
  elements.travelDay.checked = state.current.travelDay;
  state.isHydrating = false;
  hideLocationResults();
  renderEntries();

  setSaveStatus("Recovered your in-progress day from this browser.");
}

function loadDraftFromStorage() {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      clearDraftStorage();
      return null;
    }

    const entries = Array.isArray(parsed.entries)
      ? parsed.entries.map((entry) => ({
          id: entry.id || createId(),
          label: String(entry.label || ""),
          amount: String(entry.amount || "")
        }))
      : [];

    const draft = {
      id: parsed.serviceDate && parsed.locationKey ? buildLedgerId(String(parsed.serviceDate), String(parsed.locationKey)) : null,
      serviceDate: String(parsed.serviceDate || ""),
      locationKey: String(parsed.locationKey || ""),
      locationLabel: String(parsed.locationLabel || ""),
      travelDay: Boolean(parsed.travelDay),
      entries
    };

    if (!draft.serviceDate || !hasMeaningfulDraft(draft)) {
      clearDraftStorage();
      return null;
    }

    return draft;
  } catch (error) {
    console.error(error);
    clearDraftStorage();
    return null;
  }
}

function hasMeaningfulDraft(draft) {
  if (!draft) {
    return false;
  }

  if (draft.travelDay) {
    return true;
  }

  if (String(draft.locationLabel || "").trim()) {
    return true;
  }

  return Array.isArray(draft.entries) && draft.entries.some((entry) => {
    const hasLabel = String((entry && entry.label) || "").trim().length > 0;
    const hasAmount = String((entry && entry.amount) || "").trim().length > 0;
    return hasLabel || hasAmount;
  });
}

function clearDraftStorage() {
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch (error) {
    console.error(error);
  }
}

function normalizeLedger(ledger) {
  if (!ledger || typeof ledger !== "object") {
    return null;
  }

  if (!ledger.id || !ledger.serviceDate || !ledger.locationKey || !ledger.locationLabel) {
    return null;
  }

  const entries = Array.isArray(ledger.entries) && ledger.entries.length
    ? ledger.entries.map((entry) => ({
        id: entry.id || createId(),
        label: String(entry.label || ""),
        amount: String(entry.amount || "")
      }))
    : [createEntry()];

  return {
    id: String(ledger.id),
    serviceDate: String(ledger.serviceDate),
    locationKey: String(ledger.locationKey),
    locationLabel: String(ledger.locationLabel),
    travelDay: Boolean(ledger.travelDay),
    baseMieRate: roundCurrency(Number(ledger.baseMieRate) || 0),
    effectiveMieRate: roundCurrency(Number(ledger.effectiveMieRate) || 0),
    totalSpent: roundCurrency(Number(ledger.totalSpent) || 0),
    difference: roundCurrency(Number(ledger.difference) || 0),
    entries
  };
}

function saveLedgersToStorage() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.ledgers));
  } catch (error) {
    console.error(error);
    setSaveStatus("Could not save to local storage.");
  }
}

async function loadWorkbookData() {
  const preParsed = window.__FY2026_LOCATIONS__;
  if (Array.isArray(preParsed) && preParsed.length) {
    return normalizePreParsedLocations(preParsed);
  }

  const workbookBytes = decodeBase64(window.__GSA_WORKBOOK_BASE64__ || "");
  const workbookFiles = await unzipWorkbook(workbookBytes);
  return parseWorkbook(workbookFiles);
}

function normalizePreParsedLocations(locationsRaw) {
  const locationsByKey = new Map();
  const locationsByLabel = new Map();

  const locations = locationsRaw
    .filter((item) => item && item.key && item.label && Array.isArray(item.rates))
    .map((item) => {
      const rates = item.rates.map((rate) => ({
        destination: String(rate.destination || ""),
        state: String(rate.state || ""),
        countyOrLocationDefined: String(rate.countyOrLocationDefined || ""),
        seasonBegin: normalizeSeasonObject(rate.seasonBegin),
        seasonEnd: normalizeSeasonObject(rate.seasonEnd),
        seasonLabel: String(rate.seasonLabel || "Full fiscal year"),
        mieRate: roundCurrency(Number(rate.mieRate) || 0),
        lodgingRate: roundCurrency(Number(rate.lodgingRate) || 0)
      }));

      return {
        key: String(item.key),
        label: String(item.label),
        destination: String(item.destination || ""),
        state: String(item.state || ""),
        countyOrLocationDefined: String(item.countyOrLocationDefined || ""),
        isStandardConus: Boolean(item.isStandardConus),
        rates
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label));

  locations.forEach((location) => {
    locationsByKey.set(location.key, location);
    locationsByLabel.set(location.label.toLowerCase(), location);
  });

  return { locations, locationsByKey, locationsByLabel };
}

function normalizeSeasonObject(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const month = Number.parseInt(value.month, 10);
  const day = Number.parseInt(value.day, 10);
  if (!Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  return { month, day };
}

function renderLocationResults(query, preserveIndex = false, forceShow = false) {
  if (!state.workbookReady) {
    hideLocationResults();
    return;
  }

  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) {
    state.visibleLocationResults = state.locations.slice(0, 10);
  } else {
    state.visibleLocationResults = state.locations
      .filter((location) => location.label.toLowerCase().includes(normalizedQuery))
      .slice(0, 20);
  }

  if (!state.visibleLocationResults.length) {
    state.activeLocationResultIndex = -1;
  } else if (!preserveIndex || state.activeLocationResultIndex < 0 || state.activeLocationResultIndex >= state.visibleLocationResults.length) {
    state.activeLocationResultIndex = 0;
  }

  const shouldShow = forceShow || Boolean(normalizedQuery) || document.activeElement === elements.locationInput;
  if (!shouldShow) {
    hideLocationResults();
    return;
  }

  elements.locationResults.innerHTML = state.visibleLocationResults.map((location, index) => {
    const activeClass = index === state.activeLocationResultIndex ? " active" : "";
    return `
      <button class="location-result${activeClass}" type="button" data-pick-location="${escapeHtml(location.label)}">
        ${escapeHtml(location.label)}
      </button>
    `;
  }).join("");

  if (!state.visibleLocationResults.length) {
    elements.locationResults.innerHTML = '<div class="location-empty">No workbook match. Press Enter or use Find By City/County.</div>';
  }

  Array.from(elements.locationResults.querySelectorAll("[data-pick-location]")).forEach((button) => {
    bindLocationPickEvents(button);
  });

  elements.locationResults.classList.remove("hidden");
}

function bindLocationPickEvents(button) {
  let isHandled = false;
  const handlePick = (event) => {
    if (event.type !== "click") {
      event.preventDefault();
    }

    if (isHandled) {
      return;
    }

    isHandled = true;
    pickLocation(button.dataset.pickLocation || "");
  };

  button.addEventListener("pointerdown", handlePick);
  button.addEventListener("touchstart", handlePick, { passive: false });
  button.addEventListener("click", handlePick);
}

function pickLocation(label) {
  const normalizedLabel = String(label || "").trim().toLowerCase();
  const picked = state.locationsByLabel.get(normalizedLabel) || null;

  if (picked) {
    state.current.locationKey = picked.key;
    state.current.locationLabel = picked.label;
    elements.locationInput.value = picked.label;
  } else {
    state.current.locationKey = "";
    state.current.locationLabel = String(label || "").trim();
    elements.locationInput.value = String(label || "").trim();
  }

  state.hasManualLocationNavigation = false;
  hideLocationResults();
  switchLedgerIfNeeded();
  updateEverything();
}

function hideLocationResults() {
  state.activeLocationResultIndex = -1;
  state.hasManualLocationNavigation = false;
  elements.locationResults.classList.add("hidden");
}

function clearSelectedLocationIfTyping() {
  if (!state.current || state.isHydrating || !state.current.locationKey) {
    return;
  }

  const selected = state.locationsByKey.get(state.current.locationKey);
  if (!selected) {
    state.current.locationKey = "";
    return;
  }

  const typed = elements.locationInput.value.trim().toLowerCase();
  if (typed !== selected.label.toLowerCase()) {
    state.current.locationKey = "";
    state.current.locationLabel = elements.locationInput.value.trim();
  }
}

function resolveRateRecord(serviceDate, locationKey) {
  if (!serviceDate || !locationKey) {
    return null;
  }

  const location = state.locationsByKey.get(locationKey);
  if (!location) {
    return null;
  }

  const target = getMonthDay(serviceDate);
  if (!target) {
    return null;
  }

  const matchingRecord = location.rates.find((record) => isWithinSeason(target, record.seasonBegin, record.seasonEnd));
  return matchingRecord || location.rates[0] || null;
}

function isWithinSeason(target, seasonBegin, seasonEnd) {
  if (!seasonBegin || !seasonEnd) {
    return true;
  }

  const targetValue = toSeasonNumber(target.month, target.day);
  const beginValue = toSeasonNumber(seasonBegin.month, seasonBegin.day);
  const endValue = toSeasonNumber(seasonEnd.month, seasonEnd.day);

  if (beginValue <= endValue) {
    return targetValue >= beginValue && targetValue <= endValue;
  }

  return targetValue >= beginValue || targetValue <= endValue;
}

function toSeasonNumber(month, day) {
  return month * 100 + day;
}

function getMonthDay(isoDate) {
  if (!isoDate) {
    return null;
  }

  const parts = isoDate.split("-").map((value) => Number.parseInt(value, 10));
  if (parts.length !== 3 || parts.some((value) => Number.isNaN(value))) {
    return null;
  }

  return {
    month: parts[1],
    day: parts[2]
  };
}

function parseWorkbook(workbookFiles) {
  const sharedStringsXml = workbookFiles.get("xl/sharedStrings.xml");
  const worksheetXml = workbookFiles.get("xl/worksheets/sheet1.xml");

  if (!sharedStringsXml || !worksheetXml) {
    throw new Error("Missing workbook XML entries.");
  }

  const sharedStrings = parseSharedStrings(sharedStringsXml);
  const sheetRows = parseSheetRows(worksheetXml, sharedStrings);
  return normalizeWorkbookRows(sheetRows);
}

function parseSharedStrings(xmlText) {
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  return Array.from(xml.querySelectorAll("si")).map((node) => {
    const textNodes = Array.from(node.querySelectorAll("t"));
    return textNodes.map((item) => item.textContent || "").join("");
  });
}

function parseSheetRows(xmlText, sharedStrings) {
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  const rowNodes = Array.from(xml.querySelectorAll("sheetData > row"));

  return rowNodes.map((rowNode) => {
    const row = { index: Number.parseInt(rowNode.getAttribute("r"), 10), cells: {} };

    Array.from(rowNode.querySelectorAll("c")).forEach((cellNode) => {
      const reference = cellNode.getAttribute("r") || "";
      const column = reference.replace(/[0-9]/g, "");
      const type = cellNode.getAttribute("t");
      const valueNode = cellNode.querySelector("v");
      let value = "";

      if (type === "s" && valueNode) {
        value = sharedStrings[Number.parseInt(valueNode.textContent, 10)] || "";
      } else if (type === "inlineStr") {
        value = cellNode.querySelector("is t")?.textContent || "";
      } else if (valueNode) {
        value = valueNode.textContent || "";
      }

      row.cells[column] = value;
    });

    return row;
  });
}

function normalizeWorkbookRows(rows) {
  const locationsByKey = new Map();
  const locationsByLabel = new Map();
  let currentState = "";

  rows.filter((row) => row.index >= 3).forEach((row) => {
    const stateCode = (row.cells.B || "").trim();
    if (stateCode) {
      currentState = stateCode;
    }

    const destination = (row.cells.C || "").trim();
    const countyOrLocationDefined = (row.cells.D || "").trim();
    const seasonBeginText = (row.cells.E || "").trim();
    const seasonEndText = (row.cells.F || "").trim();
    const lodgingRate = parseWorkbookNumber(row.cells.G);
    const mieRate = parseWorkbookNumber(row.cells.H);

    if (!destination || mieRate === null) {
      return;
    }

    const isStandardConus = destination.startsWith("Standard CONUS rate applies");
    const key = isStandardConus
      ? "standard-conus"
      : [
          slugify(destination),
          slugify(currentState),
          slugify(countyOrLocationDefined || "general")
        ].join("__");

    const label = isStandardConus
      ? "Standard CONUS"
      : countyOrLocationDefined
        ? `${destination}, ${currentState} (${countyOrLocationDefined})`
        : `${destination}, ${currentState}`;

    const seasonBegin = parseSeasonText(seasonBeginText);
    const seasonEnd = parseSeasonText(seasonEndText);
    const seasonLabel = seasonBeginText && seasonEndText
      ? `${seasonBeginText} - ${seasonEndText}`
      : "Full fiscal year";

    const rateRecord = {
      destination: isStandardConus ? "Standard CONUS" : destination,
      state: currentState,
      countyOrLocationDefined,
      seasonBegin,
      seasonEnd,
      seasonLabel,
      mieRate,
      lodgingRate
    };

    if (!locationsByKey.has(key)) {
      locationsByKey.set(key, {
        key,
        label,
        destination: rateRecord.destination,
        state: currentState,
        countyOrLocationDefined,
        isStandardConus,
        rates: []
      });
    }

    locationsByKey.get(key).rates.push(rateRecord);
  });

  const locations = Array.from(locationsByKey.values()).sort((left, right) => left.label.localeCompare(right.label));
  locations.forEach((location) => {
    locationsByLabel.set(location.label.toLowerCase(), location);
  });

  return {
    locations,
    locationsByKey,
    locationsByLabel
  };
}

function parseWorkbookNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? roundCurrency(number) : null;
}

function parseSeasonText(value) {
  if (!value) {
    return null;
  }

  const [monthName, dayText] = value.split(" ");
  const month = monthNameToNumber(monthName);
  const day = Number.parseInt(dayText, 10);
  if (!month || Number.isNaN(day)) {
    return null;
  }

  return { month, day };
}

function monthNameToNumber(name) {
  const lookup = {
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
    december: 12
  };

  return lookup[(name || "").toLowerCase()] || null;
}

function slugify(value) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "blank";
}

function decodeBase64(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function unzipWorkbook(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);

  let pointer = centralDirectoryOffset;
  const files = new Map();

  for (let index = 0; index < totalEntries; index += 1) {
    if (view.getUint32(pointer, true) !== 0x02014b50) {
      throw new Error("Unexpected central directory signature.");
    }

    const compressionMethod = view.getUint16(pointer + 10, true);
    const compressedSize = view.getUint32(pointer + 20, true);
    const fileNameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const localHeaderOffset = view.getUint32(pointer + 42, true);
    const fileName = readText(bytes.subarray(pointer + 46, pointer + 46 + fileNameLength));

    const fileData = await extractFile(bytes, localHeaderOffset, compressionMethod, compressedSize);
    files.set(fileName, readText(fileData));

    pointer += 46 + fileNameLength + extraLength + commentLength;
  }

  return files;
}

function findEndOfCentralDirectory(view) {
  for (let offset = view.byteLength - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      return offset;
    }
  }

  throw new Error("End of central directory not found.");
}

async function extractFile(bytes, localHeaderOffset, compressionMethod, compressedSize) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
    throw new Error("Unexpected local file header signature.");
  }

  const fileNameLength = view.getUint16(localHeaderOffset + 26, true);
  const extraLength = view.getUint16(localHeaderOffset + 28, true);
  const start = localHeaderOffset + 30 + fileNameLength + extraLength;
  const compressedData = bytes.subarray(start, start + compressedSize);

  if (compressionMethod === 0) {
    return compressedData;
  }

  if (compressionMethod === 8) {
    const stream = new Blob([compressedData]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  throw new Error(`Unsupported ZIP compression method: ${compressionMethod}`);
}

function readText(uint8Array) {
  return new TextDecoder("utf-8").decode(uint8Array);
}

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getLocalIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function cloneValue(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value || 0);
}

function formatDisplayDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map((value) => Number.parseInt(value, 10));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(year, month - 1, day));
}

function setSaveStatus(message) {
  elements.saveStatus.textContent = message;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
