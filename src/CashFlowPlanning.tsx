import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CalendarRange,
  MoreVertical,
  Plus,
  PiggyBank,
  ReceiptText,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { CategoryFields } from "./components/CategoryFields";
import { CategoryIcon } from "./components/CategoryIcon";
import { useFirestoreState } from "./hooks/useFirestoreState";
import { useWalletSnapshot } from "./hooks/useWalletSnapshot";
import type { CategoryBudget } from "./domain/planningEngine";
import { connectBudgetsToTransactions } from "./utils/budgetSpending";
import { billUsesIncludedCard } from "./utils/netBalanceFilters";

type BillRecord = {
  id: number;
  sourceKey?: string;
  name: string;
  category: string;
  amount: number;
  dueDate: string;
  frequency?: string;
  status?: string;
  planType?: string;
};

type IncomeRecord = {
  id: number | string;
  source: string;
  type?: string;
  category?: string;
  amount: number;
  expectedDate: string;
  frequency?: string;
  account?: string;
  status?: string;
  confidence?: "Confirmed" | "Estimated";
  notes?: string;
};

type PlannedRecord = {
  id: number;
  type: "Income" | "Expense" | string;
  name: string;
  category?: string;
  amount: number;
  date?: string;
  expectedDate?: string;
  dueDate?: string;
  frequency?: string;
  status?: string;
  archived?: boolean;
};

type WalletShape = {
  accounts?: Array<{ id: number | string; name: string; balance: number }>;
  cards?: Array<{ id: number | string; name?: string; active?: boolean; includeInNetBalance?: boolean }>;
  accountTransactions?: Array<{ id: number | string; accountId?: number | string; date: string; description?: string; type: string; category?: string; amount: number; status?: string }>;
  transactions?: Array<{ cardId: number | string; transactionDate?: string; postedDate: string; type: string; category?: string; amount: number; status: string }>;
};

type FlowItem = {
  id: string;
  incomeRecordId?: number | string;
  billRecordId?: number;
  plannedRecordId?: number;
  plannedPaymentRecordId?: number;
  title: string;
  category: string;
  date: string;
  amount: number;
  source: "Income" | "Bill" | "Expected expense" | "Savings" | "Subscription";
};

type CashFlowView = "dueDates" | "budgetActual" | "incomeActual";

const money = (value: number) =>
  `${value < 0 ? "-" : ""}₱${Math.abs(value).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const todayIso = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const parseLocal = (value: string) => new Date(`${value}T12:00:00`);

const addDays = (value: string, days: number) => {
  const date = parseLocal(value);
  date.setDate(date.getDate() + days);
  return iso(date);
};

const addMonths = (value: string, months: number) => {
  const date = parseLocal(value);
  const day = date.getDate();
  date.setMonth(date.getMonth() + months, 1);
  date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
  return iso(date);
};

const currentSemiMonthlyWindows = () => {
  const now = new Date();
  const incomeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() <= 15 ? 1 : 16, 12);
  const incomeEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() <= 15 ? 15 : new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
    12,
  );
  const expenseStart = new Date(incomeEnd);
  expenseStart.setDate(expenseStart.getDate() + 1);
  const expenseEnd =
    expenseStart.getDate() === 1
      ? new Date(expenseStart.getFullYear(), expenseStart.getMonth(), 15, 12)
      : new Date(expenseStart.getFullYear(), expenseStart.getMonth() + 1, 0, 12);
  return {
    incomeStart: iso(incomeStart),
    incomeEnd: iso(incomeEnd),
    expenseStart: iso(expenseStart),
    expenseEnd: iso(expenseEnd),
  };
};

const formatDate = (value: string) =>
  parseLocal(value).toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" }).replace(",", "");

const daysLeft = (value: string) => {
  const days = Math.round((parseLocal(value).getTime() - parseLocal(todayIso()).getTime()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)} overdue`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days} days`;
};

const inRange = (date: string, start: string, end: string) => Boolean(date && date >= start && date <= end);

const statusIsInactive = (status = "") => ["paid", "received", "skipped", "cancelled", "canceled", "deleted", "archived"].includes(status.toLowerCase());

const isSubscription = (category = "", name = "") => /subscription|netflix|spotify|membership|renewal/i.test(`${category} ${name}`);
const normalized = (value = "") => value.toLowerCase().replace(/\s+/g, " ").trim();

const frequencyStep = (frequency = ""): { days?: number; months?: number } | null => {
  const value = frequency.toLowerCase().trim();
  if (!value || value === "one-time" || value === "one time") return null;
  if (value === "weekly") return { days: 7 };
  if (value === "every two weeks" || value === "biweekly") return { days: 14 };
  if (value === "monthly") return { months: 1 };
  if (value === "every two months") return { months: 2 };
  if (value === "quarterly") return { months: 3 };
  if (value === "semiannually" || value === "semi-annually") return { months: 6 };
  if (value === "annually" || value === "yearly") return { months: 12 };
  return null;
};

const recurringDates = (baseDate: string, frequency = "", rangeStart: string, rangeEnd: string) => {
  if (!baseDate) return [] as string[];
  const step = frequencyStep(frequency);
  if (!step) return inRange(baseDate, rangeStart, rangeEnd) ? [baseDate] : [];
  const dates: string[] = [];
  let cursor = baseDate;
  let guard = 0;
  while (cursor < rangeStart && guard < 160) {
    cursor = step.days ? addDays(cursor, step.days) : addMonths(cursor, step.months ?? 1);
    guard += 1;
  }
  while (cursor <= rangeEnd && guard < 260) {
    if (cursor >= rangeStart) dates.push(cursor);
    cursor = step.days ? addDays(cursor, step.days) : addMonths(cursor, step.months ?? 1);
    guard += 1;
  }
  return dates;
};

function total(items: FlowItem[]) {
  return items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

const periodDays = (start: string, end: string) =>
  Math.max(0, Math.round((parseLocal(end).getTime() - parseLocal(start).getTime()) / 86_400_000) + 1);

const compactRange = (start: string, end: string) =>
  `${parseLocal(start).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${parseLocal(end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

const dateParts = (value: string) => ({
  month: parseLocal(value).toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
  day: parseLocal(value).toLocaleDateString("en-US", { day: "2-digit" }),
});

const incomeColors = ["#16875d", "#93dfaa", "#49b986", "#c7efd4", "#2eaa7a"];
const expenseColors = ["#f6534b", "#ff7d6f", "#f7b733", "#6487dc", "#5f83e0", "#9a83c5", "#ffc9c3"];

const categoryBase = (value = "") => value.split("/")[0].trim() || value || "Other";

const breakdownBy = (items: FlowItem[], getKey: (item: FlowItem) => string, colors: string[]) =>
  Array.from(
    items.reduce((map, item) => {
      const key = getKey(item) || "Other";
      map.set(key, (map.get(key) || 0) + Number(item.amount || 0));
      return map;
    }, new Map<string, number>()),
  )
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], index) => ({ label, value, color: colors[index % colors.length] }));

export default function CashFlowPlanning() {
  const defaults = currentSemiMonthlyWindows();
  const [periodMode, setPeriodMode] = useState<"Weekly" | "Biweekly" | "Monthly" | "Custom">("Biweekly");
  const [incomeStart, setIncomeStart] = useState(defaults.incomeStart);
  const [incomeEnd, setIncomeEnd] = useState(defaults.incomeEnd);
  const [expenseStart, setExpenseStart] = useState(defaults.expenseStart);
  const [expenseEnd, setExpenseEnd] = useState(defaults.expenseEnd);
  const [addingIncome, setAddingIncome] = useState(false);
  const [addingExpense, setAddingExpense] = useState(false);
  const [editingIncome, setEditingIncome] = useState<IncomeRecord | null>(null);
  const [editingExpense, setEditingExpense] = useState<PlannedRecord | null>(null);

  const [bills, setBills] = useFirestoreState<BillRecord[]>("bills", []);
  const [income, setIncome] = useFirestoreState<IncomeRecord[]>("income", []);
  const [planned, setPlanned] = useFirestoreState<PlannedRecord[]>("planning", []);
  const [plannedPayments, setPlannedPayments] = useFirestoreState<PlannedRecord[]>("plannedPayments", []);
  const [savingsGoals] = useFirestoreState<string[][]>("savingsGoals", []);
  const [budgets] = useFirestoreState<CategoryBudget[]>("budgets", []);
  const [wallet] = useWalletSnapshot<WalletShape>({ accounts: [], cards: [], accountTransactions: [], transactions: [] });

  const flow = useMemo(() => {
    const incomeItems: FlowItem[] = [
      ...income
        .filter((item) => !statusIsInactive(item.status || ""))
        .flatMap((item) =>
          recurringDates(item.expectedDate, item.frequency, incomeStart, incomeEnd).map((date) => ({
            id: `income-${item.id}-${date}`,
            incomeRecordId: item.id,
            title: item.source,
            category: item.category || item.type || "Income",
            date,
            amount: Number(item.amount || 0),
            source: "Income" as const,
          })),
        ),
      ...planned
        .filter((item) => !item.archived && item.type === "Income" && !statusIsInactive(item.status || ""))
        .filter((item) => inRange(item.date || item.expectedDate || item.dueDate || "", incomeStart, incomeEnd))
        .map((item) => ({
          id: `planned-income-${item.id}`,
          title: item.name,
          category: item.category || "Expected income",
          date: item.date || item.expectedDate || item.dueDate || "",
          amount: Number(item.amount || 0),
          source: "Income" as const,
        })),
    ];

    const billItems: FlowItem[] = bills
      .filter((bill) => billUsesIncludedCard(bill, wallet.cards ?? []))
      .filter((bill) => !statusIsInactive(bill.status || ""))
      .flatMap((bill) =>
        recurringDates(bill.dueDate, bill.frequency, expenseStart, expenseEnd).map((date) => ({
            id: `bill-${bill.id}-${date}`,
            billRecordId: bill.id,
            title: bill.name.replace(/\s+statement$/i, ""),
            category: bill.category || "Bill",
            date,
          amount: Number(bill.amount || 0),
          source: isSubscription(bill.category, bill.name) ? ("Subscription" as const) : ("Bill" as const),
        })),
      );

    const plannedExpenseItems: FlowItem[] = [
      ...planned
        .filter((item) => !item.archived && item.type !== "Income" && !statusIsInactive(item.status || ""))
        .filter((item) => !/bills?\s*&?\s*payments?/i.test(`${item.category || ""} ${item.name || ""}`))
        .filter((item) => inRange(item.date || item.expectedDate || item.dueDate || "", expenseStart, expenseEnd))
        .map((item) => ({
          id: `planned-expense-${item.id}`,
          plannedRecordId: item.id,
          title: item.name,
          category: item.category || "Expected expense",
          date: item.date || item.expectedDate || item.dueDate || "",
          amount: Number(item.amount || 0),
          source: "Expected expense" as const,
        })),
      ...plannedPayments
      .filter((item) => !item.archived && item.type !== "Income" && !statusIsInactive(item.status || ""))
      .filter((item) => !/bills?\s*&?\s*payments?/i.test(`${item.category || ""} ${item.name || ""}`))
      .filter((item) => inRange(item.date || item.expectedDate || item.dueDate || "", expenseStart, expenseEnd))
      .map((item) => ({
        id: `planned-payment-${item.id}`,
        plannedPaymentRecordId: item.id,
        title: item.name,
        category: item.category || "Expected expense",
        date: item.date || item.expectedDate || item.dueDate || "",
        amount: Number(item.amount || 0),
        source: "Expected expense" as const,
      })),
    ];

    const savingsItems: FlowItem[] = savingsGoals
      .map((goal, index) => ({
        id: `savings-${index}`,
        title: goal[0] || "Savings goal",
        category: "Savings",
        date: goal[4] || expenseEnd,
        amount: Number(String(goal[5] || "").replace(/[^0-9.-]/g, "")) || 0,
        source: "Savings" as const,
      }))
      .filter((item) => item.amount > 0 && inRange(item.date, expenseStart, expenseEnd));

    const outflowItems = [...billItems, ...plannedExpenseItems, ...savingsItems].sort((a, b) => a.date.localeCompare(b.date));
    const budgetRows = connectBudgetsToTransactions(budgets, wallet)
      .filter((budget) => !budget.archived)
      .filter((budget) => budget.start <= expenseEnd && budget.end >= expenseStart);

    const actualIncomeItems: FlowItem[] = (wallet.accountTransactions ?? [])
      .filter((transaction) => transaction.type === "Income")
      .filter((transaction) => inRange(transaction.date, incomeStart, incomeEnd))
      .map((transaction) => ({
        id: `actual-income-${transaction.id}`,
        title: transaction.description || transaction.category || "Income received",
        category: transaction.category || "Income",
        date: transaction.date,
        amount: Number(transaction.amount || 0),
        source: "Income" as const,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const matchedActualIds = new Set<string>();
    const incomeComparisonRows = incomeItems.map((expected) => {
      const expectedName = normalized(expected.title);
      const expectedCategory = normalized(expected.category);
      const matchingActual = actualIncomeItems.filter((actual) => {
        if (matchedActualIds.has(actual.id)) return false;
        const actualName = normalized(actual.title);
        const actualCategory = normalized(actual.category);
        return (
          actualName.includes(expectedName) ||
          expectedName.includes(actualName) ||
          (expectedCategory && actualCategory && actualCategory === expectedCategory) ||
          (expectedName && actualCategory && actualCategory.includes(expectedName)) ||
          (actualName && expectedCategory && expectedCategory.includes(actualName)) ||
          (expectedCategory && actualCategory && (actualCategory.includes(expectedCategory) || expectedCategory.includes(actualCategory)))
        );
      });
      matchingActual.forEach((actual) => matchedActualIds.add(actual.id));
      const actualAmount = total(matchingActual);
      return {
        id: expected.id,
        incomeRecordId: expected.incomeRecordId,
        title: expected.title,
        category: expected.category,
        date: expected.date,
        expected: expected.amount,
        actual: actualAmount,
        difference: actualAmount - expected.amount,
      };
    });
    actualIncomeItems
      .filter((actual) => !matchedActualIds.has(actual.id))
      .forEach((actual) =>
        incomeComparisonRows.push({
          id: actual.id,
          incomeRecordId: undefined,
          title: actual.title,
          category: actual.category,
          date: actual.date,
          expected: 0,
          actual: actual.amount,
          difference: actual.amount,
        }),
      );

    const expectedIncome = total(incomeItems);
    const billsAndExpenses = total([...billItems, ...plannedExpenseItems]);
    const savings = total(savingsItems);
    const subscriptions = total(outflowItems.filter((item) => item.source === "Subscription"));
    const availableToSpend = expectedIncome - billsAndExpenses - savings - subscriptions;

    return {
      incomeItems: incomeItems.sort((a, b) => a.date.localeCompare(b.date)),
      outflowItems,
      expectedIncome,
      billsAndExpenses,
      savings,
      subscriptions,
      availableToSpend,
      budgetRows,
      actualIncomeItems,
      actualIncome: total(actualIncomeItems),
      incomeComparisonRows: incomeComparisonRows.sort((a, b) => a.date.localeCompare(b.date)),
    };
  }, [bills, budgets, expenseEnd, expenseStart, income, incomeEnd, incomeStart, planned, plannedPayments, savingsGoals, wallet]);

  const expectedExpenses = total(flow.outflowItems);
  const netExpected = flow.expectedIncome - expectedExpenses;
  const incomeBreakdown = breakdownBy(flow.incomeItems, (item) => item.category || item.title, incomeColors);
  const expenseBreakdown = breakdownBy(flow.outflowItems, (item) => categoryBase(item.category), expenseColors);
  const setPairedRange = (start: string, end: string) => {
    setIncomeStart(start);
    setIncomeEnd(end);
    setExpenseStart(start);
    setExpenseEnd(end);
  };
  const movePeriod = (direction: -1 | 1) => {
    const start = parseLocal(incomeStart);
    const days = periodMode === "Weekly" ? 7 : periodMode === "Monthly" ? periodDays(incomeStart, incomeEnd) : periodDays(incomeStart, incomeEnd);
    if (periodMode === "Monthly") {
      start.setMonth(start.getMonth() + direction, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 12);
      setPairedRange(iso(start), iso(end));
      return;
    }
    const nextStart = addDays(incomeStart, direction * days);
    const nextEnd = addDays(incomeEnd, direction * days);
    setPairedRange(nextStart, nextEnd);
  };
  const applyMode = (mode: "Weekly" | "Biweekly" | "Monthly" | "Custom") => {
    setPeriodMode(mode);
    if (mode === "Custom") return;
    const start = parseLocal(incomeStart);
    if (mode === "Weekly") setPairedRange(iso(start), addDays(iso(start), 6));
    if (mode === "Biweekly") setPairedRange(iso(start), addDays(iso(start), 15));
    if (mode === "Monthly") {
      const monthStart = new Date(start.getFullYear(), start.getMonth(), 1, 12);
      const monthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0, 12);
      setPairedRange(iso(monthStart), iso(monthEnd));
    }
  };
  const duplicateIncome = (item: FlowItem) => {
    const source = item.incomeRecordId ? income.find((row) => String(row.id) === String(item.incomeRecordId)) : null;
    if (!source) return;
    setIncome((current) => [{ ...source, id: Date.now(), source: `${source.source} copy` }, ...current]);
  };
  const deleteIncome = (item: FlowItem) => {
    if (!item.incomeRecordId) return;
    setIncome((current) => current.filter((row) => String(row.id) !== String(item.incomeRecordId)));
  };
  const markIncomeReceived = (item: FlowItem) => {
    if (!item.incomeRecordId) return;
    setIncome((current) => current.map((row) => (String(row.id) === String(item.incomeRecordId) ? { ...row, status: "Received" } : row)));
  };
  const findExpenseRecord = (item: FlowItem) => {
    if (item.plannedRecordId) return { collection: "planning" as const, record: planned.find((row) => row.id === item.plannedRecordId) ?? null };
    if (item.plannedPaymentRecordId) return { collection: "plannedPayments" as const, record: plannedPayments.find((row) => row.id === item.plannedPaymentRecordId) ?? null };
    return { collection: null, record: null };
  };
  const duplicateExpense = (item: FlowItem) => {
    const found = findExpenseRecord(item);
    if (found.record && found.collection === "planning") setPlanned((current) => [{ ...found.record!, id: Date.now(), name: `${found.record!.name} copy` }, ...current]);
    if (found.record && found.collection === "plannedPayments") setPlannedPayments((current) => [{ ...found.record!, id: Date.now(), name: `${found.record!.name} copy` }, ...current]);
    if (item.billRecordId) {
      const bill = bills.find((row) => row.id === item.billRecordId);
      if (bill) setBills((current) => [{ ...bill, id: Date.now(), name: `${bill.name} copy` }, ...current]);
    }
  };
  const deleteExpense = (item: FlowItem) => {
    if (item.plannedRecordId) setPlanned((current) => current.filter((row) => row.id !== item.plannedRecordId));
    if (item.plannedPaymentRecordId) setPlannedPayments((current) => current.filter((row) => row.id !== item.plannedPaymentRecordId));
    if (item.billRecordId) setBills((current) => current.filter((row) => row.id !== item.billRecordId));
  };
  const markExpensePaid = (item: FlowItem) => {
    if (item.plannedRecordId) setPlanned((current) => current.map((row) => (row.id === item.plannedRecordId ? { ...row, status: "Paid" } : row)));
    if (item.plannedPaymentRecordId) setPlannedPayments((current) => current.map((row) => (row.id === item.plannedPaymentRecordId ? { ...row, status: "Paid" } : row)));
    if (item.billRecordId) setBills((current) => current.map((row) => (row.id === item.billRecordId ? { ...row, status: "Paid" } : row)));
  };

  return (
    <section className="feature-page cash-flow-planning-page">
      <div className="fp-head cfp-page-head">
        <div>
          <h2>Cash Flow Planning</h2>
          <p>Compare expected income against expected expenses within the selected planning period.</p>
        </div>
        <div className="cfp-period-toolbar" aria-label="Cash flow planning period controls">
          <button className="outline" type="button" onClick={() => movePeriod(-1)}><ArrowLeft />Previous</button>
          <label>
            <CalendarRange />
            <select value={periodMode} onChange={(event) => applyMode(event.target.value as "Weekly" | "Biweekly" | "Monthly" | "Custom")}>
              <option>Weekly</option>
              <option>Biweekly</option>
              <option>Monthly</option>
              <option>Custom</option>
            </select>
          </label>
          <span>{compactRange(incomeStart, incomeEnd)}</span>
          <button className="outline" type="button" onClick={() => movePeriod(1)}>Next<ArrowRight /></button>
        </div>
      </div>

      <div className="cfp-summary-grid">
        <MetricCard icon={<TrendingUp />} label="Total Expected Income" value={money(flow.expectedIncome)} note={`${flow.incomeItems.length} income ${flow.incomeItems.length === 1 ? "source" : "sources"}`} tone="positive" />
        <MetricCard icon={<TrendingDown />} label="Total Expected Expenses" value={money(expectedExpenses)} note={`${flow.outflowItems.length} obligations`} tone="negative" />
        <MetricCard icon={<Wallet />} label="Net Cash Flow (Expected)" value={money(netExpected)} note="Income - Expenses" tone={netExpected < 0 ? "negative" : "positive"} />
        <MetricCard icon={<CalendarDays />} label="Days in Period" value={`${periodDays(incomeStart, incomeEnd)} days`} note={compactRange(incomeStart, incomeEnd)} tone="period" />
      </div>

      <div className="cfp-plan-grid">
        <FlowPlanningPanel
          tone="income"
          title="Expected Income"
          description="Money expected to arrive within this period."
          breakdownTitle="By Source"
          addLabel="Add Expected Income"
          totalLabel="Total Expected Income"
          tip="Tip: Add all expected income you're sure will arrive to get an accurate cash flow forecast."
          items={flow.incomeItems}
          breakdown={incomeBreakdown}
          onAdd={() => setAddingIncome(true)}
          onEdit={(item) => {
            const record = item.incomeRecordId
              ? income.find((row) => String(row.id) === String(item.incomeRecordId))
              : null;

            if (record) {
              setEditingIncome(record);
              return;
            }

            const plannedIncome = planned.find(
              (row) =>
                row.type === "Income" &&
                row.name === item.title &&
                (row.date || row.expectedDate || row.dueDate || "") === item.date,
            );

            if (plannedIncome) {
              setEditingIncome({
                id: plannedIncome.id,
                source: plannedIncome.name,
                type: "Other",
                category: plannedIncome.category || "Income",
                amount: plannedIncome.amount,
                expectedDate:
                  plannedIncome.date ||
                  plannedIncome.expectedDate ||
                  plannedIncome.dueDate ||
                  incomeStart,
                frequency: plannedIncome.frequency || "One-time",
                status: plannedIncome.status || "Expected",
              });
            }
          }}
          onDelete={deleteIncome}
          onDuplicate={duplicateIncome}
          onMarkComplete={markIncomeReceived}
        />
        <FlowPlanningPanel
          tone="expense"
          title="Expected Expenses"
          description="Obligations to cover within this period."
          breakdownTitle="By Category"
          addLabel="Add Expected Expense"
          totalLabel="Total Expected Expenses"
          tip="Tip: Include all bills, loans, credit cards, and recurring payments to avoid surprises."
          items={flow.outflowItems}
          breakdown={expenseBreakdown}
          onAdd={() => setAddingExpense(true)}
          onEdit={(item) => {
            const found = findExpenseRecord(item);
            if (found.record) setEditingExpense(found.record);
          }}
          onDelete={deleteExpense}
          onDuplicate={duplicateExpense}
          onMarkComplete={markExpensePaid}
        />
      </div>
      {addingIncome && (
        <ExpectedIncomeModal
          defaultDate={incomeStart}
          accounts={wallet.accounts ?? []}
          onClose={() => setAddingIncome(false)}
          onSave={(record) => {
            setIncome((current) => [record, ...current]);
            setAddingIncome(false);
          }}
        />
      )}
      {addingExpense && (
        <ExpectedExpenseModal
          defaultDate={expenseStart}
          onClose={() => setAddingExpense(false)}
          onSave={(record) => {
            setPlanned((current) => [record, ...current]);
            setAddingExpense(false);
          }}
        />
      )}
      {editingIncome && (
        <ExpectedIncomeModal
          defaultDate={incomeStart}
          accounts={wallet.accounts ?? []}
          income={editingIncome}
          onClose={() => setEditingIncome(null)}
          onSave={(record) => {
            setIncome((current) => current.map((item) => (String(item.id) === String(record.id) ? record : item)));
            setEditingIncome(null);
          }}
        />
      )}
      {editingExpense && (
        <ExpectedExpenseModal
          defaultDate={expenseStart}
          expense={editingExpense}
          onClose={() => setEditingExpense(null)}
          onSave={(record) => {
            setPlanned((current) => current.map((item) => (item.id === record.id ? record : item)));
            setPlannedPayments((current) => current.map((item) => (item.id === record.id ? record : item)));
            setEditingExpense(null);
          }}
        />
      )}
    </section>
  );
}

function MetricCard({ icon, label, value, note, tone = "" }: { icon: ReactNode; label: string; value: string; note?: string; tone?: string }) {
  return (
    <article className={`surface cfp-metric ${tone}`}>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <b>{value}</b>
        {note && <em>{note}</em>}
      </div>
    </article>
  );
}

function DonutBreakdown({ totalValue, label, rows, tone }: { totalValue: number; label: string; rows: Array<{ label: string; value: number; color: string }>; tone: "income" | "expense" }) {
  const totalAmount = Math.max(1, rows.reduce((sum, row) => sum + row.value, 0));
  let cursor = 0;
  const gradient = rows.length
    ? rows
        .map((row) => {
          const start = cursor;
          const end = cursor + (row.value / totalAmount) * 100;
          cursor = end;
          return `${row.color} ${start}% ${end}%`;
        })
        .join(",")
    : `${tone === "income" ? "#dcefe5" : "#ffe3df"} 0% 100%`;
  return (
    <div className="cfp-donut-area">
      <div className={`cfp-donut ${tone}`} style={{ background: `conic-gradient(${gradient})` }}>
        <span><b>{money(totalValue)}</b><small>Total</small></span>
      </div>
      <div className="cfp-breakdown-list">
        {rows.map((row) => (
          <div key={row.label}>
            <i style={{ background: row.color }} />
            <span>{row.label}</span>
            <b>{money(row.value)}</b>
            <em>{totalValue ? `${((row.value / totalValue) * 100).toFixed(1)}%` : "0%"}</em>
          </div>
        ))}
        {!rows.length && <p>No {label.toLowerCase()} data yet.</p>}
      </div>
    </div>
  );
}

function FlowDateCard({ value }: { value: string }) {
  const parts = dateParts(value);
  return <span className="cfp-mini-date"><small>{parts.month}</small><b>{parts.day}</b></span>;
}

function FlowPlanningPanel({
  tone,
  title,
  description,
  breakdownTitle,
  addLabel,
  totalLabel,
  tip,
  items,
  breakdown,
  onAdd,
  onEdit,
  onDelete,
  onDuplicate,
  onMarkComplete,
}: {
  tone: "income" | "expense";
  title: string;
  description: string;
  breakdownTitle: string;
  addLabel: string;
  totalLabel: string;
  tip: string;
  items: FlowItem[];
  breakdown: Array<{ label: string; value: number; color: string }>;
  onAdd: () => void;
  onEdit?: (item: FlowItem) => void;
  onDelete?: (item: FlowItem) => void;
  onDuplicate?: (item: FlowItem) => void;
  onMarkComplete?: (item: FlowItem) => void;
}) {
  const totalValue = total(items);
  const [openActionItem, setOpenActionItem] = useState<FlowItem | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  const actionLabels =
    tone === "income"
      ? ["Edit", "Delete", "Duplicate", "Mark as received"]
      : ["Edit", "Delete", "Duplicate", "Mark as paid"];

  const closeActionMenu = () => {
    setOpenActionItem(null);
    setMenuPosition(null);
  };

  const runAction = (label: string, item: FlowItem) => {
    closeActionMenu();

    window.setTimeout(() => {
      if (label === "Edit") onEdit?.(item);
      if (label === "Delete") onDelete?.(item);
      if (label === "Duplicate") onDuplicate?.(item);
      if (label === "Mark as received" || label === "Mark as paid") {
        onMarkComplete?.(item);
      }
    }, 0);
  };
  return (
    <article className={`surface cfp-plan-panel ${tone}`}>
      <div className="cfp-panel-head">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <button className={tone === "income" ? "primary" : "danger-primary"} type="button" onClick={onAdd}><Plus />{addLabel}</button>
      </div>
      <div className="cfp-breakdown-title">{breakdownTitle}</div>
      {items.length ? <DonutBreakdown totalValue={totalValue} label={breakdownTitle} rows={breakdown} tone={tone} /> : (
        <div className="cfp-empty-state">
          <b>{tone === "income" ? "No expected income added for this period." : "No expected expenses added for this period."}</b>
          <button type="button" className={tone === "income" ? "primary" : "danger-primary"} onClick={onAdd}><Plus />{addLabel}</button>
        </div>
      )}
      <div className={`cfp-plan-table ${tone}`}>
        <div
          className="cfp-plan-head"
          style={{
            gridTemplateColumns:
              "88px minmax(280px, 1.65fr) minmax(150px, 0.75fr) 120px 44px",
          }}
        >
          <span>Date</span>
          <span>{tone === "income" ? "Source" : "Category"}</span>
          <span>Description</span>
          <span>Amount</span>
          <span>Actions</span>
        </div>
        {items.map((item) => (
          <div
            key={item.id}
            className={`cfp-plan-row ${openActionItem?.id === item.id ? "menu-open" : ""}`}
            style={{
              gridTemplateColumns:
                "88px minmax(280px, 1.65fr) minmax(150px, 0.75fr) 120px 44px",
            }}
            onClick={() => onEdit?.(item)}
          >
            <FlowDateCard value={item.date} />
            <span className="cfp-plan-source"><CategoryIcon value={item.category} /><span><b>{tone === "income" ? item.category : categoryBase(item.category)}</b></span></span>
            <span className="cfp-plan-desc">
              {item.title}
              <small>{item.source}</small>
            </span>
            <strong>{money(item.amount)}</strong>
            <span className="cfp-action-cell">
              <button
                className="cfp-row-menu"
                type="button"
                aria-label={`Open actions for ${item.title}`}
                aria-expanded={openActionItem?.id === item.id}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();

                  const rect = event.currentTarget.getBoundingClientRect();
                  const menuWidth = 220;
                  const padding = 12;

                  const left = Math.min(
                    window.innerWidth - menuWidth - padding,
                    Math.max(padding, rect.right - menuWidth),
                  );

                  setMenuPosition({
                    top: rect.bottom + 8,
                    left,
                  });
                  setOpenActionItem(item);
                }}
              >
                <MoreVertical />
              </button>
            </span>
          </div>
        ))}
      </div>
      {openActionItem &&
        menuPosition &&
        createPortal(
          <>
            <button
              type="button"
              aria-label="Close actions"
              onClick={closeActionMenu}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 2147483645,
                border: 0,
                padding: 0,
                background: "transparent",
                cursor: "default",
              }}
            />

            <div
              role="menu"
              aria-label={`Actions for ${openActionItem.title}`}
              onClick={(event) => event.stopPropagation()}
              style={{
                position: "fixed",
                top: menuPosition.top,
                left: menuPosition.left,
                zIndex: 2147483646,
                width: 220,
                padding: 10,
                border: "1px solid #e2e9e6",
                borderRadius: 20,
                background: "#ffffff",
                boxShadow:
                  "0 18px 40px rgba(16, 44, 34, 0.14), 0 3px 10px rgba(16, 44, 34, 0.08)",
              }}
            >
              {actionLabels.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    runAction(label, openActionItem);
                  }}
                  style={{
                    display: "flex",
                    width: "100%",
                    minHeight: 52,
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "0 16px",
                    border: 0,
                    borderRadius: 14,
                    background: index === 0 ? "#eff8f3" : "transparent",
                    color:
                      label === "Delete"
                        ? "#d6433a"
                        : index === 0 || label.includes("Mark")
                          ? "#16875d"
                          : "#24372f",
                    font: "inherit",
                    fontSize: 16,
                    fontWeight: 500,
                    lineHeight: 1,
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
      <div className="cfp-total-row"><b>{totalLabel}</b><strong>{money(totalValue)}</strong></div>
      <div className="cfp-tip"><AlertTriangle /><span>{tip}</span></div>
    </article>
  );
}

function ExpectedIncomeModal({
  defaultDate,
  accounts,
  income,
  onClose,
  onSave,
}: {
  defaultDate: string;
  accounts: Array<{ id: number | string; name: string }>;
  income?: IncomeRecord;
  onClose: () => void;
  onSave: (record: IncomeRecord) => void;
}) {
  const accountOptions = accounts.length ? accounts.map((account) => account.name) : ["Cash"];
  const isEditing = Boolean(income);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal cfp-income-modal" role="dialog" aria-modal="true" aria-label={isEditing ? "Edit expected income" : "Add expected income"} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{isEditing ? "Edit expected income" : "Add expected income"}</h2>
            <p>{isEditing ? "Update the category, schedule, amount, recurrence, and receiving account." : "Add one-time or recurring income for Cash Flow Planning."}</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            onSave({
              id: income?.id ?? Date.now(),
              source: String(form.get("source") || "").trim(),
              type: String(form.get("type") || "Salary"),
              category: String(form.get("category") || "Income"),
              amount: Number(form.get("amount") || 0),
              expectedDate: String(form.get("expectedDate") || defaultDate),
              frequency: String(form.get("frequency") || "One-time"),
              account: String(form.get("account") || accountOptions[0] || "Cash"),
              status: income?.status || "Expected",
              confidence: String(form.get("confidence") || "Confirmed") as "Confirmed" | "Estimated",
              notes: String(form.get("notes") || ""),
            });
          }}
        >
          <div className="form-grid">
            <label>
              Income source
              <input name="source" required autoFocus defaultValue={income?.source || ""} placeholder="Accenture, payroll, freelance…" />
            </label>
            <label>
              Income type
              <select name="type" defaultValue={income?.type || "Salary"}>
                {["Salary", "Freelance work", "Business income", "Commission", "Allowance", "Bonus", "Refund", "Investment income", "Other"].map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>
          <CategoryFields defaultValue={income?.category || "Income"} />
          <div className="form-grid">
            <label>
              Expected amount
              <input name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" required defaultValue={income?.amount || ""} placeholder="₱0.00" />
            </label>
            <label>
              Expected date
              <input name="expectedDate" type="date" required defaultValue={income?.expectedDate || defaultDate} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Frequency
              <select name="frequency" defaultValue={income?.frequency || "One-time"}>
                {["One-time", "Weekly", "Every two weeks", "Monthly", "Every two months", "Quarterly", "Semiannually", "Annually"].map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
            <label>
              Receiving account
              <select name="account" defaultValue={income?.account || accountOptions[0]}>
                {accountOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Forecast type
            <select name="confidence" defaultValue={income?.confidence || "Confirmed"}>
              <option>Confirmed</option>
              <option>Estimated</option>
            </select>
          </label>
          <label>
            Notes
            <textarea name="notes" rows={3} defaultValue={income?.notes || ""} placeholder="Optional notes" />
          </label>
          <button className="primary submit" type="submit">
            <Plus />
            {isEditing ? "Save changes" : "Save expected income"}
          </button>
        </form>
      </section>
    </div>
  );
}

function ExpectedExpenseModal({
  defaultDate,
  expense,
  onClose,
  onSave,
}: {
  defaultDate: string;
  expense?: PlannedRecord;
  onClose: () => void;
  onSave: (record: PlannedRecord) => void;
}) {
  const isEditing = Boolean(expense);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal cfp-income-modal" role="dialog" aria-modal="true" aria-label={isEditing ? "Edit expected expense" : "Add expected expense"} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{isEditing ? "Edit expected expense" : "Add expected expense"}</h2>
            <p>{isEditing ? "Update the amount, category, date, and recurrence." : "Add a one-time or recurring obligation for Cash Flow Planning."}</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            onSave({
              id: expense?.id ?? Date.now(),
              type: "Expense",
              name: String(form.get("name") || "").trim(),
              category: String(form.get("category") || "Expected expense"),
              amount: Number(form.get("amount") || 0),
              date: String(form.get("date") || defaultDate),
              dueDate: String(form.get("date") || defaultDate),
              frequency: String(form.get("frequency") || "One-time"),
              status: expense?.status || "Expected",
              archived: expense?.archived || false,
            });
          }}
        >
          <div className="form-grid">
            <label>
              Expense name
              <input name="name" required autoFocus defaultValue={expense?.name || ""} placeholder="Rent, grocery, payment…" />
            </label>
            <label>
              Expected amount
              <input name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" required defaultValue={expense?.amount || ""} placeholder="₱0.00" />
            </label>
          </div>
          <CategoryFields defaultValue={expense?.category || "Utilities"} />
          <div className="form-grid">
            <label>
              Due date
              <input name="date" type="date" required defaultValue={expense?.date || expense?.dueDate || defaultDate} />
            </label>
            <label>
              Recurrence
              <select name="frequency" defaultValue={expense?.frequency || "One-time"}>
                {["One-time", "Weekly", "Biweekly", "Monthly", "Custom recurrence"].map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>
          <button className="primary submit danger-primary" type="submit">
            <Plus />
            {isEditing ? "Save changes" : "Save expected expense"}
          </button>
        </form>
      </section>
    </div>
  );
}
