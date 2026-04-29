import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ExpenseRow } from "./src/components/ExpenseRow";
import { colors } from "./src/constants/colors";
import { initializeDb, seedRatesIfNeeded } from "./src/db/database";
import { ExpenseStore } from "./src/services/expenseStore";
import { resolveRate } from "./src/services/rateResolver";
import { RetentionService } from "./src/services/retentionService";
import { Expense, ExpenseRowInput, RateResolution } from "./src/types";
import { computeBudget } from "./src/utils/budgetCalculator";

const todayLabel = new Date().toLocaleDateString(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const toNumericAmount = (value: string) => {
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const rowIsEmpty = (row: ExpenseRowInput) => !row.name.trim() && !row.amount.trim();

const ensureAtMostOneEmptyRow = (rows: ExpenseRowInput[]): ExpenseRowInput[] => {
  const next: ExpenseRowInput[] = [];
  let emptySeen = false;
  for (const row of rows) {
    if (rowIsEmpty(row)) {
      if (!emptySeen) {
        next.push(row);
        emptySeen = true;
      }
      continue;
    }
    next.push(row);
  }
  return next;
};

export default function App() {
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [locationInput, setLocationInput] = useState("");
  const [statusMessage, setStatusMessage] = useState("Enter a city to fetch today’s M&IE rate.");
  const [resolution, setResolution] = useState<RateResolution | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [rows, setRows] = useState<ExpenseRowInput[]>([{ key: "first", name: "", amount: "" }]);

  useEffect(() => {
    const boot = async () => {
      await initializeDb();
      await seedRatesIfNeeded();
      await RetentionService.pruneOlderThan(7);
      setBooting(false);
    };
    boot().catch(() => {
      setStatusMessage("Failed to initialize local data. Restart and try again.");
      setBooting(false);
    });
  }, []);

  const persistedExpenses = useMemo<Expense[]>(
    () =>
      rows
        .filter((item) => !rowIsEmpty(item))
        .map((item) => ({
          name: item.name.trim(),
          amount: toNumericAmount(item.amount),
        })),
    [rows]
  );

  const budget = useMemo(
    () => computeBudget(resolution?.mieRate ?? 0, persistedExpenses),
    [resolution?.mieRate, persistedExpenses]
  );

  const syncExpenses = async (nextRows: ExpenseRowInput[]) => {
    if (!sessionId) return;
    const cleaned = nextRows
      .filter((item) => !rowIsEmpty(item))
      .map((item) => ({ name: item.name.trim(), amount: toNumericAmount(item.amount) }));
    await ExpenseStore.replaceForSession(sessionId, cleaned);
    await RetentionService.pruneOlderThan(7);
  };

  const onResolveRate = async () => {
    setBusy(true);
    try {
      const result = await resolveRate(locationInput, new Date());
      setResolution(result);
      setStatusMessage(
        result.matchType === "city_exact"
          ? `Matched city: ${result.city}, ${result.state}.`
          : result.matchType === "county_fallback"
            ? `City not listed. County fallback matched: ${result.county}, ${result.state}.`
            : result.message || "Using Standard CONUS M&IE."
      );

      const id = await ExpenseStore.getOrCreateSession({
        date: new Date(),
        locationInput,
        resolvedCity: result.city,
        resolvedCounty: result.county,
        state: result.state,
        mieRate: result.mieRate,
      });
      setSessionId(id);

      const existing = await ExpenseStore.listBySession(id);
      const seededRows: ExpenseRowInput[] = existing.map((item, idx) => ({
        key: `db_${item.id ?? idx}`,
        name: item.name,
        amount: String(item.amount),
      }));
      setRows([...seededRows, { key: `${Date.now()}_${Math.random()}`, name: "", amount: "" }]);
      await RetentionService.pruneOlderThan(7);
    } catch (error) {
      setStatusMessage("Lookup failed. Check network, then try city + state (example: Dallas, TX).");
    } finally {
      setBusy(false);
    }
  };

  const onChangeRow = (key: string, next: ExpenseRowInput) => {
    setRows((prev) => {
      const updated = prev.map((item) => (item.key === key ? next : item));
      const normalized = ensureAtMostOneEmptyRow(updated);
      syncExpenses(normalized).catch(() => undefined);
      return normalized;
    });
  };

  const onRemoveRow = (key: string) => {
    setRows((prev) => {
      const updated = prev.filter((item) => item.key !== key);
      const normalized = ensureAtMostOneEmptyRow(updated);
      if (normalized.length === 0) {
        normalized.push({ key: `${Date.now()}_${Math.random()}`, name: "", amount: "" });
      }
      syncExpenses(normalized).catch(() => undefined);
      return normalized;
    });
  };

  const onAddAnother = () => {
    setRows((prev) => {
      const hasEmpty = prev.some(rowIsEmpty);
      if (hasEmpty) return prev;
      return [...prev, { key: `${Date.now()}_${Math.random()}`, name: "", amount: "" }];
    });
  };

  if (booting) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Preparing local rate database...</Text>
      </SafeAreaView>
    );
  }

  const remainingIsGood = budget.remaining >= 0;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Per Diem Expense Tracker</Text>
          <Text style={styles.subtitle}>{todayLabel}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Location</Text>
          <TextInput
            value={locationInput}
            onChangeText={setLocationInput}
            placeholder="City, ST (example: Chicago, IL)"
            placeholderTextColor="#8F8F8F"
            style={styles.locationInput}
          />
          <Pressable onPress={onResolveRate} style={styles.primaryBtn} disabled={busy}>
            <Text style={styles.primaryBtnText}>{busy ? "Checking..." : "Find Today's Rate"}</Text>
          </Pressable>
          <Text style={styles.statusText}>{statusMessage}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.statLabel}>Today M&IE</Text>
          <Text style={styles.bigStat}>${resolution?.mieRate ?? 0}</Text>
          <Text style={styles.statLabel}>Spent</Text>
          <Text style={styles.statValue}>${budget.spent.toFixed(2)}</Text>
          <Text style={styles.statLabel}>{remainingIsGood ? "Amount Left" : "Over Per Diem"}</Text>
          <Text style={[styles.bigStat, { color: remainingIsGood ? colors.good : colors.bad }]}>
            ${Math.abs(budget.remaining).toFixed(2)}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Expenses</Text>
          {rows.map((row) => (
            <ExpenseRow
              key={row.key}
              row={row}
              onChange={(next) => onChangeRow(row.key, next)}
              onRemove={() => onRemoveRow(row.key)}
              removable={!rowIsEmpty(row)}
            />
          ))}

          <Pressable style={styles.ghostBtn} onPress={onAddAnother}>
            <Text style={styles.ghostBtnText}>+ another expense</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    color: colors.muted,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  header: {
    paddingTop: 4,
    paddingBottom: 2,
  },
  title: {
    fontSize: 28,
    color: colors.text,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 4,
    color: colors.muted,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    marginBottom: 8,
    fontWeight: "600",
  },
  locationInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: "#FFFFFF",
  },
  primaryBtn: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
  statusText: {
    marginTop: 8,
    color: colors.muted,
    fontSize: 13,
  },
  statLabel: {
    color: colors.muted,
    fontSize: 13,
  },
  statValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
  },
  bigStat: {
    color: colors.text,
    fontSize: 36,
    fontWeight: "800",
    marginBottom: 8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 8,
  },
  ghostBtn: {
    marginTop: 2,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.warm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghostBtnText: {
    color: colors.text,
    fontWeight: "600",
  },
});
