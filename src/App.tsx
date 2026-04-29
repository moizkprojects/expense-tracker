import { useEffect, useMemo, useRef, useState } from "react";
import { ExpenseRow } from "./components/ExpenseRow";
import { searchOsmPlaces } from "./services/osmSearch";
import { resolveRate } from "./services/rateResolver";
import { RetentionService, SessionStore } from "./services/storage";
import type {
  ExpenseRow as ExpenseRowType,
  OsmSuggestion,
  RateResolution,
  StoredExpense,
} from "./types";
import { computeBudget } from "./utils/budget";
import { randomId, toAmount, toDateKey, toUsd } from "./utils/normalize";

const todayKey = toDateKey(new Date());

const defaultResolution: RateResolution = {
  mieRate: 0,
  state: "",
  matchType: "unresolved",
  message: "Enter a city to look up the M&IE rate.",
};

const isEmptyRow = (row: ExpenseRowType) => !row.name.trim() && !row.amount.trim();

const toStoredExpenses = (rows: ExpenseRowType[]): StoredExpense[] =>
  rows
    .filter((row) => !isEmptyRow(row))
    .map((row) => ({ name: row.name.trim(), amount: toAmount(row.amount) }));

const hydrateRows = (expenses: StoredExpense[]): ExpenseRowType[] => {
  if (!expenses.length) return [{ id: randomId(), name: "", amount: "" }];
  return expenses.map((item) => ({
    id: randomId(),
    name: item.name,
    amount: item.amount.toString(),
  }));
};

const dateFromInput = (dateKey: string) => new Date(`${dateKey || todayKey}T12:00:00`);

function App() {
  const [initialSession] = useState(() => {
    RetentionService.prune();
    return SessionStore.getByDateKey(todayKey);
  });

  const [dateInput, setDateInput] = useState(initialSession?.dateKey ?? todayKey);
  const [locationInput, setLocationInput] = useState(initialSession?.locationInput ?? "");
  const [stateInput, setStateInput] = useState(initialSession?.stateInput ?? "");
  const [resolution, setResolution] = useState<RateResolution>(initialSession?.resolution ?? defaultResolution);
  const [rows, setRows] = useState<ExpenseRowType[]>(hydrateRows(initialSession?.expenses ?? []));
  const [busy, setBusy] = useState(false);
  const [topTileCollapsed, setTopTileCollapsed] = useState(false);
  const [saveStatus, setSaveStatus] = useState(initialSession ? "Saved for this date" : "");
  const [suggestions, setSuggestions] = useState<OsmSuggestion[]>([]);
  const [suggestionsBusy, setSuggestionsBusy] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const cacheRef = useRef<Map<string, OsmSuggestion[]>>(new Map());

  const expenses = useMemo(() => toStoredExpenses(rows), [rows]);
  const budget = useMemo(() => computeBudget(resolution.mieRate, expenses), [resolution.mieRate, expenses]);
  const remainingGood = budget.remaining >= 0;
  const countyLabel = resolution.county || "standard rate area";
  const cityLabel = resolution.city || locationInput.split(",")[0] || "this city";
  const headerTitle = locationInput.trim() ? cityLabel : "Trip setup";
  const hasRate = resolution.mieRate > 0;
  const isStandardFallback = resolution.matchType === "standard_oconus";

  useEffect(() => {
    const query = locationInput.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setSuggestionsBusy(false);
      return;
    }

    const cacheKey = query.toLowerCase();
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setSuggestions(cached);
      setSuggestionsBusy(false);
      return;
    }

    const controller = new AbortController();
    setSuggestionsBusy(true);

    const timer = window.setTimeout(async () => {
      try {
        const result = await searchOsmPlaces(query, controller.signal);
        cacheRef.current.set(cacheKey, result);
        setSuggestions(result);
      } catch {
        setSuggestions([]);
      } finally {
        setSuggestionsBusy(false);
      }
    }, 700);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [locationInput]);

  const loadSessionForDate = (dateKey: string) => {
    const saved = SessionStore.getByDateKey(dateKey);
    if (!saved) {
      setResolution(defaultResolution);
      setRows([{ id: randomId(), name: "", amount: "" }]);
      setSaveStatus("");
      return;
    }

    setLocationInput(saved.locationInput);
    setStateInput(saved.stateInput ?? "");
    setResolution(saved.resolution);
    setRows(hydrateRows(saved.expenses));
    setSaveStatus("Saved for this date");
  };

  const markUnsaved = () => {
    setSaveStatus("Unsaved changes");
  };

  const onResolve = async () => {
    setBusy(true);
    try {
      const result = await resolveRate(locationInput, stateInput, dateFromInput(dateInput));
      setResolution(result);
      setTopTileCollapsed(false);
      setSaveStatus("Unsaved changes");
    } catch {
      setResolution({
        ...defaultResolution,
        message: "Lookup failed. Try city + state, for example Austin, TX.",
      });
    } finally {
      setBusy(false);
    }
  };

  const onChangeRow = (id: string, next: ExpenseRowType) => {
    const updated = rows.map((row) => (row.id === id ? next : row));
    const firstEmptyIndex = updated.findIndex(isEmptyRow);
    const normalized =
      firstEmptyIndex === -1
        ? updated
        : updated.filter((row, index) => !isEmptyRow(row) || index === firstEmptyIndex);
    setRows(normalized);
    markUnsaved();
  };

  const onRemoveRow = (id: string) => {
    const next = rows.filter((row) => row.id !== id);
    const normalized = next.length ? next : [{ id: randomId(), name: "", amount: "" }];
    setRows(normalized);
    markUnsaved();
  };

  const onAddAnother = () => {
    if (rows.some(isEmptyRow)) return;
    const next = [...rows, { id: randomId(), name: "", amount: "" }];
    setRows(next);
    markUnsaved();
  };

  const onSave = () => {
    SessionStore.save({
      dateKey: dateInput || todayKey,
      locationInput,
      stateInput,
      resolution,
      expenses,
    });
    setSaveStatus("Saved for this date");
  };

  const selectSuggestion = (item: OsmSuggestion) => {
    const nextCity = item.city || item.display.split(",")[0] || "";
    const nextLocation = item.stateCode ? `${nextCity}, ${item.stateCode}` : nextCity;
    setLocationInput(nextLocation);
    if (item.stateCode) setStateInput(item.stateCode);
    setShowSuggestions(false);
    markUnsaved();
  };

  return (
    <main className="app">
      <section className={`tile combined-tile ${topTileCollapsed ? "is-collapsed" : ""}`}>
        <div className="tile-header">
          <div>
            <p className="tile-kicker">Trip setup + travel spend ledger</p>
            <h1 className="title">{headerTitle}</h1>
          </div>
          <button
            className="toggle-button"
            type="button"
            aria-label={topTileCollapsed ? "Show trip tile" : "Hide trip tile"}
            onClick={() => setTopTileCollapsed((value) => !value)}
          >
            {topTileCollapsed ? "Show this tile" : "Press this to hide this tile"}
          </button>
        </div>

        <div className="collapsible-body">
          <div className="stack-section">
            <h2 className="section-title">Trip setup</h2>
            <div className={isStandardFallback ? "fallback-statement" : "rate-statement"}>
              {isStandardFallback ? (
                <>
                  <span>city/county were not found on the gsa site therefore a standard oconus rate is used for this location</span>
                  <strong>per diem of {hasRate ? toUsd(resolution.mieRate) : "$0.00"}</strong>
                </>
              ) : (
                <>
                  <span>*this city is in the county {countyLabel} which has a</span>
                  <strong>per diem of {hasRate ? toUsd(resolution.mieRate) : "$0.00"}</strong>
                </>
              )}
            </div>

            <div className="field-group">
              <label className="label" htmlFor="city">
                City
              </label>
              <input
                id="city"
                className="input"
                placeholder="Chicago or Chicago, IL"
                value={locationInput}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => window.setTimeout(() => setShowSuggestions(false), 150)}
                onChange={(e) => {
                  setLocationInput(e.target.value);
                  setShowSuggestions(true);
                  markUnsaved();
                }}
              />
              {showSuggestions ? (
                <div className="suggestions">
                  {suggestionsBusy ? <div className="suggestion-muted">Searching OpenStreetMap...</div> : null}
                  {!suggestionsBusy && suggestions.length === 0 && locationInput.trim().length >= 3 ? (
                    <div className="suggestion-muted">No OpenStreetMap suggestions yet.</div>
                  ) : null}
                  {suggestions.map((item) => (
                    <button
                      className="suggestion-item"
                      key={item.id}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        selectSuggestion(item);
                      }}
                    >
                      <span className="suggestion-top">
                        {item.city || item.display.split(",")[0]}
                        {item.stateCode ? `, ${item.stateCode}` : ""}
                      </span>
                      <span className="suggestion-bottom">
                        {item.county ? `${item.county} - ` : ""}
                        {item.display}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="field-group">
              <label className="label" htmlFor="state">
                State
              </label>
              <input
                id="state"
                className="input"
                placeholder="IL"
                maxLength={20}
                value={stateInput}
                onChange={(e) => {
                  setStateInput(e.target.value);
                  markUnsaved();
                }}
              />
            </div>

            <div className="field-group">
              <label className="label" htmlFor="date">
                Date
              </label>
              <input
                id="date"
                className="input"
                type="date"
                value={dateInput}
                onChange={(e) => {
                  const nextDate = e.target.value || todayKey;
                  setDateInput(nextDate);
                  loadSessionForDate(nextDate);
                }}
              />
            </div>

            <button className="btn btn-primary" onClick={onResolve} type="button" disabled={busy}>
              {busy ? "Finding rate..." : "Find rate"}
            </button>
            {resolution.message ? <p className="status">{resolution.message}</p> : null}
          </div>

          <div className="stack-section ledger-section">
            <div className="ledger-header">
              <h2 className="section-title">Travel spend ledger</h2>
              <button className="save-button" type="button" onClick={onSave}>
                Save
              </button>
            </div>
            {rows.map((row) => (
              <ExpenseRow
                key={row.id}
                row={row}
                removable={!isEmptyRow(row)}
                onChange={(next) => onChangeRow(row.id, next)}
                onRemove={() => onRemoveRow(row.id)}
              />
            ))}
            <button className="btn btn-secondary" type="button" onClick={onAddAnother}>
              Add more expenses
            </button>
            {saveStatus ? <p className="save-status">{saveStatus}</p> : null}
          </div>
        </div>
      </section>

      <section className="tile calculator-tile">
        <p className="tile-kicker">Live calculator</p>
        <div className="calculator-grid">
          <div>
            <span className="stat-label">Per diem</span>
            <strong className="stat-value">{toUsd(resolution.mieRate || 0)}</strong>
          </div>
          <div>
            <span className="stat-label">Spent</span>
            <strong className="stat-value">{toUsd(budget.spent)}</strong>
          </div>
        </div>
        <div className={`balance ${remainingGood ? "good" : "bad"}`}>
          <span>{remainingGood ? "Amount left" : "Amount over"}</span>
          <strong>{toUsd(Math.abs(budget.remaining))}</strong>
        </div>
      </section>
    </main>
  );
}

export default App;
