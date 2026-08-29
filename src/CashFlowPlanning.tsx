import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CalendarRange,
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
import { ConnectedAccountSelect } from "./components/ConnectedAccountSelect";
import { useFirestoreState } from "./hooks/useFirestoreState";
import { useWalletSnapshot } from "./hooks/useWalletSnapshot";
import type { CategoryBudget } from "./domain/planningEngine";
import {
  computeCard,
  type CardConfig,
  type CardPayment,
  type CardStatement,
  type CardTransaction,
} from "./domain/creditCardEngine";
import { connectBudgetsToTransactions } from "./utils/budgetSpending";
import { processBillPayment, type BillForPayment, type WalletForBillPayment } from "./utils/billPaymentProcessor";
import { billUsesActiveCard } from "./utils/netBalanceFilters";

type BillRecord = {
  id: number | string;
  sourceKey?: string;
  name: string;
  category: string;
  amount: number;
  actualAmount?: number;
  paidAmount?: number;
  receivedAmount?: number;
  actualDate?: string;
  paymentDate?: string;
  receivedDate?: string;
  paidOccurrenceDate?: string;
  receivedOccurrenceDate?: string;
  account?: string;
  autopayAccount?: string;
  accountId?: number | string;
  accountKind?: "account" | "card" | "cash";
  accountName?: string;
  linkedTransactionId?: number | string;
  dueDate: string;
  recurrenceStartDate?: string;
  frequency?: string;
  status?: string;
  planType?: string;
  originalStatement?: number;
  paymentHistory?: BillForPayment["paymentHistory"];
  lastPaymentDate?: string;
  lastPaymentAmount?: number;
  lastPaymentMethod?: string;
  paymentTransactionId?: number;
  hiddenFromCashFlow?: boolean;
};

type IncomeRecord = {
  id: number | string;
  source: string;
  type?: string;
  category?: string;
  amount: number;
  actualAmount?: number;
  receivedAmount?: number;
  actualDate?: string;
  receivedDate?: string;
  receivedOccurrenceDate?: string;
  accountId?: number | string;
  accountKind?: "account" | "card" | "cash";
  accountName?: string;
  linkedTransactionId?: number | string;
  expectedDate: string;
  frequency?: string;
  account?: string;
  status?: string;
  confidence?: "Confirmed" | "Estimated";
  notes?: string;
};

type PlannedRecord = {
  id: number | string;
  type: "Income" | "Expense" | string;
  name: string;
  category?: string;
  amount: number;
  actualAmount?: number;
  paidAmount?: number;
  receivedAmount?: number;
  actualDate?: string;
  paymentDate?: string;
  receivedDate?: string;
  paidOccurrenceDate?: string;
  receivedOccurrenceDate?: string;
  account?: string;
  accountId?: number | string;
  accountKind?: "account" | "card" | "cash";
  accountName?: string;
  linkedTransactionId?: number | string;
  date?: string;
  expectedDate?: string;
  dueDate?: string;
  frequency?: string;
  status?: string;
  archived?: boolean;
};

type WalletShape = {
  accounts?: Array<{ id: number | string; name: string; balance: number }>;
  cards?: Array<{
    id: number | string;
    name?: string;
    active?: boolean;
    includeInNetBalance?: boolean;
    excludeFromCashFlow?: boolean | string | number;
  }>;
  statements?: Array<{ cardId?: number | string; statementDate?: string; statementBalance?: number; remainingDue?: number; status?: string }>;
  payments?: Array<{ id?: number | string; cardId: number | string; account?: string; date: string; amount: number; option?: string; status: "Scheduled" | "Posted"; notes?: string; allocations?: Array<{ statementId?: number | string; cycle: "statement" | "current-cycle" | "credit"; amount: number; date: string }> }>;
  accountTransactions?: Array<{ id: number | string; accountId?: number | string; date: string; description?: string; type: string; category?: string; amount: number; status?: string; notes?: string }>;
  transactions?: Array<{ id?: number | string; cardId: number | string; transactionDate?: string; postedDate: string; description?: string; type: string; category?: string; amount: number; status: string; notes?: string; expenseCounted?: boolean }>;
};

type FlowItem = {
  id: string;
  incomeRecordId?: number | string;
  billRecordId?: number | string;
  plannedRecordId?: number | string;
  plannedPaymentRecordId?: number | string;
  title: string;
  category: string;
  date: string;
  amount: number;
  actualAmount?: number;
  actualDate?: string;
  status?: string;
  accountId?: number | string;
  accountKind?: "account" | "card" | "cash";
  accountName?: string;
  linkedTransactionId?: number | string;
  forecastStatus?: string;
  source: "Income" | "Bill" | "Expected expense" | "Savings" | "Subscription";
};

const cashFlowItemKey = (item: FlowItem) => {
  const sourceId =
    item.incomeRecordId !== undefined
      ? `income:${String(item.incomeRecordId)}`
      : item.billRecordId !== undefined
        ? `bill:${String(item.billRecordId)}`
        : item.plannedPaymentRecordId !== undefined
          ? `planned-payment:${String(item.plannedPaymentRecordId)}`
          : item.plannedRecordId !== undefined
            ? `planned:${String(item.plannedRecordId)}`
            : item.id;
  return `${sourceId}:${item.date}`;
};

const mapOnlyWhenChanged = <T,>(items: T[], update: (item: T) => T) => {
  let changed = false;
  const next = items.map((item) => {
    const updated = update(item);
    if (updated !== item && JSON.stringify(updated) !== JSON.stringify(item)) changed = true;
    return updated;
  });
  return changed ? next : items;
};

type CashFlowView = "dueDates" | "budgetActual" | "incomeActual";

type ActualEntry = {
  amount: number;
  date: string;
  accountName: string;
};

type ComparisonRow = {
  label: string;
  expected: number;
  actual: number;
};

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

const semiMonthlySecondHalfEnd = (year: number, month: number) =>
  new Date(year, month, Math.min(30, new Date(year, month + 1, 0).getDate()), 12);

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
      : semiMonthlySecondHalfEnd(expenseStart.getFullYear(), expenseStart.getMonth());
  return {
    incomeStart: iso(incomeStart),
    incomeEnd: iso(incomeEnd),
    expenseStart: iso(expenseStart),
    expenseEnd: iso(expenseEnd),
  };
};

const followingPaymentWindow = (incomeStartValue: string, incomeEndValue: string, mode: "Weekly" | "Biweekly" | "Monthly" | "Custom") => {
  const nextStart = addDays(incomeEndValue, 1);
  if (mode === "Weekly") {
    return { expenseStart: nextStart, expenseEnd: addDays(nextStart, 6) };
  }
  if (mode === "Monthly") {
    const start = parseLocal(nextStart);
    const monthStart = new Date(start.getFullYear(), start.getMonth(), 1, 12);
    const monthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0, 12);
    return { expenseStart: iso(monthStart), expenseEnd: iso(monthEnd) };
  }
  if (mode === "Custom") {
    return { expenseStart: nextStart, expenseEnd: addDays(nextStart, Math.max(0, periodDays(incomeStartValue, incomeEndValue) - 1)) };
  }
  const incomeStart = parseLocal(incomeStartValue);
  if (incomeStart.getDate() <= 15) {
    const expenseStart = new Date(incomeStart.getFullYear(), incomeStart.getMonth(), 16, 12);
    const expenseEnd = semiMonthlySecondHalfEnd(incomeStart.getFullYear(), incomeStart.getMonth());
    return { expenseStart: iso(expenseStart), expenseEnd: iso(expenseEnd) };
  }
  const expenseStart = new Date(incomeStart.getFullYear(), incomeStart.getMonth() + 1, 1, 12);
  const expenseEnd = new Date(incomeStart.getFullYear(), incomeStart.getMonth() + 1, 15, 12);
  return { expenseStart: iso(expenseStart), expenseEnd: iso(expenseEnd) };
};

const adjacentSemiMonthlyIncomeWindow = (startValue: string, direction: -1 | 1) => {
  const start = parseLocal(startValue);
  if (direction > 0) {
    if (start.getDate() <= 15) {
      const nextStart = new Date(start.getFullYear(), start.getMonth(), 16, 12);
      const nextEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0, 12);
      return { start: iso(nextStart), end: iso(nextEnd) };
    }
    const nextStart = new Date(start.getFullYear(), start.getMonth() + 1, 1, 12);
    const nextEnd = new Date(start.getFullYear(), start.getMonth() + 1, 15, 12);
    return { start: iso(nextStart), end: iso(nextEnd) };
  }

  if (start.getDate() <= 15) {
    const previousStart = new Date(start.getFullYear(), start.getMonth() - 1, 16, 12);
    const previousEnd = new Date(start.getFullYear(), start.getMonth(), 0, 12);
    return { start: iso(previousStart), end: iso(previousEnd) };
  }

  const previousStart = new Date(start.getFullYear(), start.getMonth(), 1, 12);
  const previousEnd = new Date(start.getFullYear(), start.getMonth(), 15, 12);
  return { start: iso(previousStart), end: iso(previousEnd) };
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
const statusIsRemoved = (status = "") => ["skipped", "cancelled", "canceled", "deleted", "archived"].includes(status.toLowerCase());
const cents = (value?: number) => Math.round(Number(value || 0) * 100);
const cashFlowKey = (item: FlowItem) => `cashflow:${item.id}`;
const isCashFlowGeneratedTransaction = (transaction: { notes?: string }) =>
  Boolean(transaction.notes?.includes("cashflow:"));
const transactionExplicitlyLinksItem = (
  transaction: { transactionId: number | string; notes?: string },
  item: FlowItem,
) => {
  // Recurring source records reuse their linkedTransactionId for later
  // occurrences. A Cash Flow marker contains the exact occurrence id, so it
  // must take precedence over that shared record-level id.
  if (isCashFlowGeneratedTransaction(transaction)) {
    return Boolean(transaction.notes?.includes(cashFlowKey(item)));
  }
  return item.linkedTransactionId !== undefined &&
    String(item.linkedTransactionId) === String(transaction.transactionId);
};
const hasActualAmount = (item: { actualAmount?: number }) => item.actualAmount !== undefined && item.actualAmount !== null;
const itemIsPaid = (item: { actualAmount?: number; status?: string }) =>
  hasActualAmount(item) || ["paid", "received"].includes((item.status || "").toLowerCase());

const actualAmountForOccurrence = ({
  status,
  expectedStatus,
  occurrenceDate,
  actualAmount,
  fallbackAmount,
  actualDate,
  occurrenceDateMarker,
  requireOccurrenceMarker = false,
}: {
  status?: string;
  expectedStatus: "paid" | "received";
  occurrenceDate: string;
  actualAmount?: number;
  fallbackAmount?: number;
  actualDate?: string;
  occurrenceDateMarker?: string;
  requireOccurrenceMarker?: boolean;
}) => {
  if ((status || "").toLowerCase() !== expectedStatus) return undefined;
  // A recurring record represents more than one expected occurrence. Without
  // an explicit occurrence marker, its stored paid amount cannot safely be
  // assigned to any generated date (and must never prefill future periods).
  if (requireOccurrenceMarker && !occurrenceDateMarker) return undefined;
  // actualDate is the day money moved and may legitimately differ from the
  // expected due date. Only the explicit occurrence marker identifies which
  // recurring occurrence was completed.
  if (occurrenceDateMarker && occurrenceDateMarker !== occurrenceDate) return undefined;
  return Number(actualAmount ?? fallbackAmount ?? 0);
};

const statusForOccurrence = (status: string | undefined, frequency: string | undefined, actualAmount: number | undefined) => {
  if (actualAmount !== undefined) return status;
  return frequencyStep(frequency) ? "Upcoming" : status;
};

const resolveAccountLink = (
  accountName: string,
  wallet: WalletShape,
): { accountName: string; accountId?: number | string; accountKind: "account" | "card" | "cash" } => {
  const cleanName = accountName.trim();
  const account = (wallet.accounts ?? []).find((item) => item.name === cleanName);
  if (account) return { accountName: account.name, accountId: account.id, accountKind: "account" };
  const card = (wallet.cards ?? []).find((item) => item.active !== false && item.name === cleanName);
  if (card) return { accountName: card.name || cleanName, accountId: card.id, accountKind: "card" };
  return { accountName: cleanName || "Cash", accountKind: "cash" };
};

const recordAccountName = (record: { accountName?: string; account?: string }, fallback = "") =>
  record.accountName || record.account || fallback;

// A plan without an explicitly selected account should still match a valid
// transaction from any connected bank account or credit card. Using the first
// account as an implicit fallback made otherwise valid transactions disappear
// from Cash Flow when they were recorded on a different account.
const optionalAccountLink = (
  record: { accountName?: string; account?: string },
  wallet: WalletShape,
) => {
  const explicitName = recordAccountName(record);
  return explicitName ? resolveAccountLink(explicitName, wallet) : {};
};

const accountMatches = (
  expected: { accountKind?: string; accountId?: number | string; accountName?: string },
  actual: { accountKind?: string; accountId?: number | string; accountName?: string },
) => {
  if (!expected.accountKind && !expected.accountId && !expected.accountName) return true;
  if (expected.accountKind && actual.accountKind && expected.accountKind !== actual.accountKind) return false;
  if (expected.accountId !== undefined && actual.accountId !== undefined) return String(expected.accountId) === String(actual.accountId);
  if (expected.accountName && actual.accountName) return normalized(expected.accountName) === normalized(actual.accountName);
  return true;
};

const transactionMatchesPlan = (
  transaction: { transactionId: number | string; description?: string; category?: string; amount?: number; date: string; accountKind?: "account" | "card"; accountId?: number | string; accountName?: string; notes?: string },
  item: FlowItem,
  { requireExactDate = false }: { requireExactDate?: boolean } = {},
) => {
  // A Cash Flow-created transaction belongs only to the exact occurrence that
  // created it. Never let the broad category/date matcher attach that payment
  // to a nearby recurring expense.
  if (transactionExplicitlyLinksItem(transaction, item)) {
    // Cash Flow markers identify the exact recurring occurrence. A broad
    // record-level link must still satisfy the expense occurrence date.
    return isCashFlowGeneratedTransaction(transaction) || !requireExactDate || transaction.date === item.date;
  }
  if (isCashFlowGeneratedTransaction(transaction)) return false;
  if (!accountMatches(item, transaction)) return false;

  const ignoredLabels = new Set(["income", "expense", "bill", "credit card", "expected income", "expected expense"]);
  const identityLabels = (values: string[]) =>
    values
      .flatMap((value) => [value, ...value.split("/")])
      .map(normalized)
      .filter((value) => value.length > 2 && !ignoredLabels.has(value));
  const plannedLabels = identityLabels([item.title, item.category]);
  const transactionLabels = identityLabels([transaction.description || "", transaction.category || ""]);
  const sameIdentity = plannedLabels.some((plannedLabel) =>
    transactionLabels.some(
      (transactionLabel) =>
        plannedLabel === transactionLabel ||
        plannedLabel.includes(transactionLabel) ||
        transactionLabel.includes(plannedLabel),
    ),
  );
  const exactAmount = cents(transaction.amount) === cents(item.amount);
  const dayDistance = Math.abs(
    Math.round((parseLocal(transaction.date).getTime() - parseLocal(item.date).getTime()) / 86_400_000),
  );

  // Expected Expenses use occurrence-level reconciliation: an Aug 1 plan can
  // only receive Actual from an Aug 1 transaction with the same expense or
  // category identity. This prevents prior/future recurring transactions from
  // pre-populating another cycle.
  if (requireExactDate) return transaction.date === item.date && sameIdentity;

  // Actual income/expense is allowed to differ from its plan. A strong source
  // or sub-category identity links it within the same semi-monthly window;
  // exact amount + date remains the safe fallback for generic categories.
  return dayDistance <= 16 && (sameIdentity || (exactAmount && transaction.date === item.date));
};

const isSubscription = (category = "", name = "") => /subscription|netflix|spotify|membership|renewal/i.test(`${category} ${name}`);
const normalized = (value = "") => value.toLowerCase().replace(/\s+/g, " ").trim();
const isCreditCardStatementBill = (bill: BillRecord) => /^credit-card-statement:[^:]+:[\d-]+$/.test(String(bill.sourceKey ?? ""));
const enabledFlag = (value: unknown) => value === true || value === "true" || value === 1 || value === "1" || value === "yes" || value === "on";
const cardIsExcludedFromCashFlow = (card: NonNullable<WalletShape["cards"]>[number]) => enabledFlag(card.excludeFromCashFlow);
const billUsesCashFlowExcludedCard = (bill: BillRecord, cards: WalletShape["cards"] = []) => {
  const cardId = String(bill.sourceKey ?? "").match(/^credit-card-statement:([^:]+):/)?.[1];
  if (!cardId) return false;
  return cards.some((card) => String(card.id) === cardId && cardIsExcludedFromCashFlow(card));
};
const isPaidOrInactive = (status = "") => ["paid", "received", "skipped", "cancelled", "canceled", "deleted", "archived"].includes(status.toLowerCase());
const expectedBillAmount = (bill: BillRecord, wallet: WalletShape) => {
  if (!isCreditCardStatementBill(bill)) return Number(bill.amount || 0);
  if (isPaidOrInactive(bill.status || "")) return 0;

  const [, cardId, statementDate] = String(bill.sourceKey).match(/^credit-card-statement:([^:]+):([\d-]+)$/) ?? [];
  const statement = (wallet.statements ?? []).find(
    (item) => String(item.cardId) === String(cardId) && item.statementDate === statementDate,
  );
  if (statement) {
    if (isPaidOrInactive(statement.status || "")) return 0;
    const remainingDue = Number(statement.remainingDue ?? statement.statementBalance ?? 0);
    return Number.isFinite(remainingDue) ? Math.max(0, remainingDue) : 0;
  }

  return Number(bill.amount || 0);
};

const frequencyStep = (frequency = ""): { days?: number; months?: number } | null => {
  const value = frequency.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!value || value === "one-time" || value === "one time") return null;
  if (["weekly", "week", "every week", "once a week"].includes(value)) return { days: 7 };
  if (["every two weeks", "every 2 weeks", "biweekly", "bi weekly", "fortnightly"].includes(value)) return { days: 14 };
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

const recurringBillAnchor = (bill: BillRecord) => {
  const historicalDueDates = (bill.paymentHistory ?? [])
    .map((record) => record.relatedBillDetails?.dueDate)
    .filter((date): date is string => Boolean(date));
  return [bill.recurrenceStartDate, bill.dueDate, ...historicalDueDates]
    .filter((date): date is string => Boolean(date))
    .sort()[0] || bill.dueDate;
};

const recurringBillIsRemoved = (bill: BillRecord) => {
  const status = (bill.status || "").toLowerCase();
  if (frequencyStep(bill.frequency)) {
    // Skipping a single weekly/monthly occurrence must not suppress the
    // complete recurring series. Explicit cancellation/deletion still does.
    return ["cancelled", "canceled", "deleted", "archived"].includes(status);
  }
  return statusIsRemoved(status);
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
const subCategoryLabel = (value = "", fallback = "Other") => {
  const parts = value.split("/").map((part) => part.trim()).filter(Boolean);
  return parts.at(-1) || fallback;
};

const uniqueFlowItems = (items: FlowItem[], getLabel: (item: FlowItem) => string) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${normalized(getLabel(item))}|${item.date}|${Number(item.amount || 0).toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const comparisonByLabel = (expectedItems: FlowItem[], actualItems: FlowItem[], getLabel: (item: FlowItem) => string): ComparisonRow[] => {
  const map = new Map<string, ComparisonRow>();
  const ensure = (label: string) => {
    const cleanLabel = label || "Other";
    if (!map.has(cleanLabel)) map.set(cleanLabel, { label: cleanLabel, expected: 0, actual: 0 });
    return map.get(cleanLabel)!;
  };
  expectedItems.forEach((item) => {
    ensure(getLabel(item)).expected += Number(item.amount || 0);
  });
  actualItems.forEach((item) => {
    ensure(getLabel(item)).actual += Number(item.amount || 0);
  });
  return Array.from(map.values())
    .filter((row) => row.expected > 0 || row.actual > 0)
    .sort((a, b) => Math.max(b.expected, b.actual) - Math.max(a.expected, a.actual));
};

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
  const [editingPlannedIncome, setEditingPlannedIncome] = useState<PlannedRecord | null>(null);
  const [editingActualOnlyIncome, setEditingActualOnlyIncome] = useState<FlowItem | null>(null);
  const [editingExpense, setEditingExpense] = useState<PlannedRecord | null>(null);
  const [editingBill, setEditingBill] = useState<BillRecord | null>(null);
  const [editingFlowItem, setEditingFlowItem] = useState<FlowItem | null>(null);

  const [bills, setBills] = useFirestoreState<BillRecord[]>("bills", []);
  const [income, setIncome] = useFirestoreState<IncomeRecord[]>("income", []);
  const [planned, setPlanned] = useFirestoreState<PlannedRecord[]>("planning", []);
  const [plannedPayments, setPlannedPayments] = useFirestoreState<PlannedRecord[]>("plannedPayments", []);
  const [deletedItems, setDeletedItems] = useFirestoreState<string[]>("cashFlowDeletedItems", []);
  const [savingsGoals] = useFirestoreState<string[][]>("savingsGoals", []);
  const [budgets] = useFirestoreState<CategoryBudget[]>("budgets", []);
  const [wallet, saveWallet] = useWalletSnapshot<WalletShape>({ accounts: [], cards: [], accountTransactions: [], transactions: [] });
  const autoSyncSignature = useRef("");
  const recentlyAppliedAutoSyncs = useRef<Map<string, number>>(new Map());
  const incomeLedgerRepairsInFlight = useRef<Set<string>>(new Set());

  const flow = useMemo(() => {
    const expenseLookupStart = addMonths(incomeStart < expenseStart ? incomeStart : expenseStart, -12);
    const expenseLookupEnd = incomeEnd > expenseEnd ? incomeEnd : expenseEnd;
    const placeExpenseInPlanningCycle = (item: FlowItem): FlowItem | null => {
      // Expected expenses permanently belong to the payment period assigned
      // to their income cycle. An unpaid item remains visible in that original
      // cycle until it is paid; it must never be copied or moved forward.
      return inRange(item.date, expenseStart, expenseEnd) ? item : null;
    };
    const keepFlowItem = (item: FlowItem | null): item is FlowItem => Boolean(item);
    const walletTransactionIds = new Set([
      ...(wallet.accountTransactions ?? []).map((transaction) => String(transaction.id)),
      ...(wallet.transactions ?? []).map((transaction) =>
        String(transaction.id ?? `${transaction.cardId}-${transaction.postedDate}-${transaction.amount}`),
      ),
    ]);
    const linkedCashFlowTransactionIds = new Set(
      [...income, ...planned, ...plannedPayments, ...bills]
        .map((record) => record.linkedTransactionId)
        .filter((id): id is number | string => id !== undefined && id !== null)
        .map(String),
    );
    const walletIncomeTransactionsForActuals = (wallet.accountTransactions ?? [])
      .filter((transaction) => transaction.type === "Income")
      // Actual income belongs to the cycle in which the transaction occurred.
      // Do not let a nearby transaction from a completed cycle attach to the
      // next recurring expected-income occurrence.
      .filter((transaction) => inRange(transaction.date, incomeStart, incomeEnd))
      .map((transaction) => {
        const account = (wallet.accounts ?? []).find((item) => String(item.id) === String(transaction.accountId));
        return {
          transactionId: transaction.id,
          date: transaction.date,
          description: transaction.description,
          category: transaction.category || "Income",
          amount: transaction.amount,
          accountKind: "account" as const,
          accountId: transaction.accountId,
          accountName: account?.name,
          notes: transaction.notes,
        };
      });
    const walletExpenseTransactionsForActuals = [
      ...(wallet.accountTransactions ?? [])
        .filter((transaction) => transaction.type === "Expense")
        .map((transaction) => {
          const account = (wallet.accounts ?? []).find((item) => String(item.id) === String(transaction.accountId));
          return {
            transactionId: transaction.id,
            date: transaction.date,
            description: transaction.description,
            category: transaction.category || "Expense",
            amount: transaction.amount,
            accountKind: "account" as const,
            accountId: transaction.accountId,
            accountName: account?.name,
            notes: transaction.notes,
          };
        }),
      ...(wallet.transactions ?? [])
        .filter((transaction) => transaction.status?.toLowerCase() === "posted")
        .filter((transaction) => ["purchase", "installment", "fee", "interest"].includes(transaction.type?.toLowerCase()))
        .map((transaction) => {
          const card = (wallet.cards ?? []).find((item) => String(item.id) === String(transaction.cardId));
          return {
            transactionId: transaction.id ?? `${transaction.cardId}-${transaction.postedDate}-${transaction.amount}`,
            date: transaction.transactionDate || transaction.postedDate,
            description: transaction.description,
            category: transaction.category || "Credit Card",
            amount: transaction.amount,
            accountKind: "card" as const,
            accountId: transaction.cardId,
            accountName: card?.name,
            notes: transaction.notes,
          };
        }),
    ];
    const attachTransactionActuals = <
      T extends { transactionId: number | string; date: string; amount?: number; description?: string; category?: string; accountKind?: "account" | "card"; accountId?: number | string; accountName?: string; notes?: string },
    >(
      items: FlowItem[],
      transactions: T[],
      { requireExactDate = false }: { requireExactDate?: boolean } = {},
    ) => {
      const totalsByItem = new Map<string, number>();
      transactions.forEach((transaction) => {
        const explicitlyLinkedItem = items.find((item) =>
          item.source !== "Savings" &&
          transactionExplicitlyLinksItem(transaction, item) &&
          (isCashFlowGeneratedTransaction(transaction) || !requireExactDate || transaction.date === item.date),
        );
        const transactionIsClaimed = linkedCashFlowTransactionIds.has(String(transaction.transactionId));

        // If a payment was created by Cash Flow (or is already linked to a
        // Cash Flow record outside the visible cycle), it must never be
        // reassigned to another expected item by fuzzy matching.
        if (!explicitlyLinkedItem && (transactionIsClaimed || isCashFlowGeneratedTransaction(transaction))) return;

        const bestMatch = explicitlyLinkedItem ?? items
          .filter((item) =>
            item.source !== "Savings" &&
            !hasActualAmount(item) &&
            transactionMatchesPlan(transaction, item, { requireExactDate }),
          )
          .sort((left, right) => {
            const leftDistance = Math.abs(parseLocal(transaction.date).getTime() - parseLocal(left.date).getTime());
            const rightDistance = Math.abs(parseLocal(transaction.date).getTime() - parseLocal(right.date).getTime());
            return leftDistance - rightDistance;
          })[0];
        if (!bestMatch) return;
        const key = cashFlowItemKey(bestMatch);
        totalsByItem.set(key, (totalsByItem.get(key) || 0) + Number(transaction.amount || 0));
      });

      return items.map((item) => {
        // A payment explicitly recorded on the expected item is the source of
        // truth. Do not replace it with a nearby wallet transaction total.
        if (hasActualAmount(item)) return item;
        const transactionActual = totalsByItem.get(cashFlowItemKey(item));
        if (transactionActual !== undefined) return { ...item, actualAmount: transactionActual };
        if (item.linkedTransactionId !== undefined && !walletTransactionIds.has(String(item.linkedTransactionId))) {
          return { ...item, actualAmount: undefined, status: statusForOccurrence(item.status, undefined, undefined) };
        }
        return item;
      });
    };

    const incomeItemsRaw: FlowItem[] = [
      ...income
        .filter((item) => !statusIsRemoved(item.status || ""))
        .flatMap((item) =>
          recurringDates(item.expectedDate, item.frequency, incomeStart, incomeEnd).map((date) => {
            const account = optionalAccountLink(item, wallet);
            return {
              id: `income-${item.id}-${date}`,
              incomeRecordId: item.id,
              title: item.source,
              category: item.category || item.type || "Income",
              date,
              amount: Number(item.amount || 0),
              status: item.status,
              linkedTransactionId: item.linkedTransactionId,
              actualDate: item.actualDate || item.receivedDate,
              actualAmount: actualAmountForOccurrence({
                status: item.status,
                expectedStatus: "received",
                occurrenceDate: date,
                actualAmount: item.actualAmount,
                fallbackAmount: item.receivedAmount,
                actualDate: item.actualDate || item.receivedDate,
                occurrenceDateMarker: item.receivedOccurrenceDate,
                requireOccurrenceMarker: Boolean(frequencyStep(item.frequency)),
              }),
              ...account,
              source: "Income" as const,
            };
          }),
        ),
      ...planned
        .filter((item) => !item.archived && item.type === "Income" && !statusIsRemoved(item.status || ""))
        .filter((item) => inRange(item.date || item.expectedDate || item.dueDate || "", incomeStart, incomeEnd))
        .map((item) => {
          const date = item.date || item.expectedDate || item.dueDate || "";
          const account = optionalAccountLink(item, wallet);
          return {
            id: `planned-income-${item.id}`,
            plannedRecordId: item.id,
            title: item.name,
            category: item.category || "Expected income",
            date,
            amount: Number(item.amount || 0),
            status: item.status,
            linkedTransactionId: item.linkedTransactionId,
            actualDate: item.actualDate || item.receivedDate,
            actualAmount: actualAmountForOccurrence({
              status: item.status,
              expectedStatus: "received",
              occurrenceDate: date,
              actualAmount: item.actualAmount,
              fallbackAmount: item.receivedAmount,
              actualDate: item.actualDate || item.receivedDate,
              occurrenceDateMarker: item.receivedOccurrenceDate,
              requireOccurrenceMarker: Boolean(frequencyStep(item.frequency)),
            }),
            ...account,
            source: "Income" as const,
          };
        }),
    ];

    const billItems: FlowItem[] = bills
      // Net-worth exclusion must not hide payment obligations. Active cards
      // still need to appear in Bills and Cash Flow even when excluded from
      // combined balance calculations.
      .filter((bill) => billUsesActiveCard(bill, wallet.cards ?? []))
      .filter((bill) => !bill.hiddenFromCashFlow)
      // Card-level Cash Flow exclusion applies only to unpaid forecasts.
      // Historical paid rows remain available in their original planning cycle.
      .filter((bill) =>
        !billUsesCashFlowExcludedCard(bill, wallet.cards) ||
        itemIsPaid(bill) ||
        (bill.paymentHistory?.length ?? 0) > 0
      )
      .filter((bill) => !recurringBillIsRemoved(bill))
      .filter((bill) => expectedBillAmount(bill, wallet) > 0 || itemIsPaid(bill))
      .flatMap((bill) => {
        const paymentHistory = bill.paymentHistory ?? [];
        const historyByDueDate = new Map(
          paymentHistory.map((record) => [record.relatedBillDetails?.dueDate || bill.dueDate, record]),
        );
        const occurrenceDates = new Set([
          ...recurringDates(recurringBillAnchor(bill), bill.frequency, expenseLookupStart, expenseLookupEnd),
          ...historyByDueDate.keys(),
        ]);

        return [...occurrenceDates].map((date) => {
          const historicalPayment = historyByDueDate.get(date);
          const explicitPaymentAccount = historicalPayment?.paymentMethod || recordAccountName(bill, bill.autopayAccount);
          const account = explicitPaymentAccount ? resolveAccountLink(explicitPaymentAccount, wallet) : {};
          const actualAmount = historicalPayment
            ? Number(historicalPayment.amount || 0)
            : actualAmountForOccurrence({
                status: bill.status,
                expectedStatus: "paid",
                occurrenceDate: date,
                actualAmount: bill.actualAmount,
                fallbackAmount: bill.paidAmount,
                actualDate: bill.actualDate || bill.paymentDate,
                occurrenceDateMarker: bill.paidOccurrenceDate,
                requireOccurrenceMarker: Boolean(frequencyStep(bill.frequency)),
              });
          return {
            id: `bill-${bill.id}-${date}`,
            billRecordId: bill.id,
            title: bill.name.replace(/\s+statement$/i, ""),
            category: bill.category || "Bill",
            date,
            // Paid statements remain visible in their original cycle. The
            // expected amount is the closed statement amount; Actual is the
            // payment that settled it.
            amount:
              expectedBillAmount(bill, wallet) ||
              Number(bill.originalStatement ?? bill.amount ?? bill.actualAmount ?? bill.paidAmount ?? 0),
            status: historicalPayment ? "Paid" : statusForOccurrence(bill.status, bill.frequency, actualAmount),
            linkedTransactionId: historicalPayment?.id || bill.linkedTransactionId || bill.paymentTransactionId,
            actualAmount,
            actualDate: historicalPayment?.paymentDate || bill.actualDate || bill.paymentDate,
            ...account,
            source: isSubscription(bill.category, bill.name) ? ("Subscription" as const) : ("Bill" as const),
          };
        });
      })
      .map(placeExpenseInPlanningCycle)
      .filter(keepFlowItem);

    // A statement bill exists only after the card reaches its statement date.
    // Before then, expose the active cycle's posted balance as one read-only
    // forecast for the *next* due date. This is intentionally derived data: it
    // never writes a Bill and is replaced by the generated statement bill after
    // the cutoff, so it cannot create a second obligation.
    const runningCardBalanceForecasts: FlowItem[] = (wallet.cards ?? [])
      .filter((card) => card.active !== false)
      .filter((card) => !cardIsExcludedFromCashFlow(card))
      .flatMap((card) => {
        const computed = computeCard(
          card as unknown as CardConfig,
          (wallet.transactions ?? []) as CardTransaction[],
          (wallet.statements ?? []) as CardStatement[],
          (wallet.payments ?? []) as CardPayment[],
          todayIso(),
        );
        const dueDate = computed.nextDueDate;
        const runningBalance = Math.max(0, Number(computed.unbilledBalance || 0));

        // On the statement date (and after it), the billing sync owns this
        // obligation as the finalized statement. Do not leave a forecast next
        // to the official bill.
        if (!dueDate || todayIso() >= computed.nextStatementDate || runningBalance <= 0.004) return [];

        // A manually entered or automatically generated card bill for the
        // same card/due date takes precedence over the temporary forecast.
        const hasExistingDue = bills.some((bill) => {
          if (statusIsRemoved(bill.status || "")) return false;
          const sourceCardId = String(bill.sourceKey ?? "").match(/^credit-card-statement:([^:]+):/)?.[1];
          const sameCard = sourceCardId
            ? String(sourceCardId) === String(card.id)
            : normalized(bill.name).includes(normalized(card.name || ""));
          return sameCard && bill.dueDate === dueDate;
        });
        if (hasExistingDue) return [];

        const forecast: FlowItem = {
          id: `credit-card-running-forecast-${card.id}-${dueDate}`,
          title: card.name || "Credit card",
          category: "Credit Card",
          date: dueDate,
          amount: runningBalance,
          status: "Upcoming",
          forecastStatus: "Statement Not Yet Finalized",
          accountId: card.id,
          accountKind: "card",
          accountName: card.name,
          source: "Bill",
        };
        const placed = placeExpenseInPlanningCycle(forecast);
        return placed ? [placed] : [];
      });

    const plannedExpenseItems: FlowItem[] = [
      ...planned
        .filter((item) => !item.archived && item.type !== "Income" && !statusIsRemoved(item.status || ""))
        .filter((item) => !/bills?\s*&?\s*payments?/i.test(`${item.category || ""} ${item.name || ""}`))
        .flatMap((item) => {
          const baseDate = item.date || item.expectedDate || item.dueDate || "";
          return recurringDates(baseDate, item.frequency, expenseLookupStart, expenseLookupEnd).map((date) => {
          const account = optionalAccountLink(item, wallet);
          const actualAmount = actualAmountForOccurrence({
            status: item.status,
            expectedStatus: "paid",
            occurrenceDate: date,
            actualAmount: item.actualAmount,
            fallbackAmount: item.paidAmount,
            actualDate: item.actualDate || item.paymentDate,
            occurrenceDateMarker: item.paidOccurrenceDate,
            requireOccurrenceMarker: Boolean(frequencyStep(item.frequency)),
          });
          return {
            id: `planned-expense-${item.id}-${date}`,
            plannedRecordId: item.id,
            title: item.name,
            category: item.category || "Expected expense",
            date,
            amount: Number(item.amount || 0),
            status: statusForOccurrence(item.status, item.frequency, actualAmount),
            linkedTransactionId: item.linkedTransactionId,
            actualAmount,
            actualDate: item.actualDate || item.paymentDate,
            ...account,
            source: "Expected expense" as const,
          };
          });
        })
        .map(placeExpenseInPlanningCycle)
        .filter(keepFlowItem),
      ...plannedPayments
      .filter((item) => !item.archived && item.type !== "Income" && !statusIsRemoved(item.status || ""))
      .filter((item) => !/bills?\s*&?\s*payments?/i.test(`${item.category || ""} ${item.name || ""}`))
      .flatMap((item) => {
        const baseDate = item.date || item.expectedDate || item.dueDate || "";
        return recurringDates(baseDate, item.frequency, expenseLookupStart, expenseLookupEnd).map((date) => {
        const account = optionalAccountLink(item, wallet);
        const actualAmount = actualAmountForOccurrence({
          status: item.status,
          expectedStatus: "paid",
          occurrenceDate: date,
          actualAmount: item.actualAmount,
          fallbackAmount: item.paidAmount,
          actualDate: item.actualDate || item.paymentDate,
          occurrenceDateMarker: item.paidOccurrenceDate,
          requireOccurrenceMarker: Boolean(frequencyStep(item.frequency)),
        });
        return {
          id: `planned-payment-${item.id}-${date}`,
          plannedPaymentRecordId: item.id,
          title: item.name,
          category: item.category || "Expected expense",
          date,
          amount: Number(item.amount || 0),
          status: statusForOccurrence(item.status, item.frequency, actualAmount),
          linkedTransactionId: item.linkedTransactionId,
          actualAmount,
          actualDate: item.actualDate || item.paymentDate,
          ...account,
          source: "Expected expense" as const,
        };
        });
      })
      .map(placeExpenseInPlanningCycle)
      .filter(keepFlowItem),
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
      .map(placeExpenseInPlanningCycle)
      .filter(keepFlowItem)
      .filter((item) => item.amount > 0);

    const deletedItemKeys = new Set(deletedItems);
    const incomeItemsForCycle = incomeItemsRaw.filter((item) => !deletedItemKeys.has(cashFlowItemKey(item)));
    const visibleIncomeItemsWithPlans = attachTransactionActuals(
      incomeItemsForCycle,
      walletIncomeTransactionsForActuals,
      { requireExactDate: true },
    );
    // Expected Income contains only planned/recurring income rows. Unmatched
    // wallet receipts still contribute to Actual totals and transaction-based
    // comparisons below, but must not be manufactured into zero-expected rows.
    const visibleIncomeItems = visibleIncomeItemsWithPlans
      .sort((a, b) => a.date.localeCompare(b.date));

    const outflowItemsForCycle = [...billItems, ...runningCardBalanceForecasts, ...plannedExpenseItems, ...savingsItems]
      .filter((item) => !deletedItemKeys.has(cashFlowItemKey(item)));
    const outflowItemsWithPlans = attachTransactionActuals(
      outflowItemsForCycle,
      walletExpenseTransactionsForActuals,
      { requireExactDate: true },
    );
    const unmatchedActualExpenseItems: FlowItem[] = walletExpenseTransactionsForActuals
      .filter((transaction) => !linkedCashFlowTransactionIds.has(String(transaction.transactionId)))
      .filter((transaction) => !outflowItemsForCycle.some((item) =>
        transactionMatchesPlan(transaction, item, { requireExactDate: true }),
      ))
      .map((transaction) => placeExpenseInPlanningCycle({
        id: `wallet-expense-${String(transaction.transactionId)}`,
        title: transaction.description || transaction.category || "Expense",
        category: transaction.category || "Expense",
        date: transaction.date,
        amount: 0,
        actualAmount: Number(transaction.amount || 0),
        actualDate: transaction.date,
        status: "Paid",
        linkedTransactionId: transaction.transactionId,
        accountId: transaction.accountId,
        accountKind: transaction.accountKind,
        accountName: transaction.accountName,
        source: "Expected expense" as const,
      }))
      .filter(keepFlowItem);
    // Unmatched wallet/card expenses are actual activity only. They must
    // contribute to Actual totals and charts without creating zero-budget
    // rows in Expected Expenses. Expected rows come exclusively from bills,
    // recurring/planned expenses, savings, and credit-card obligations.
    const outflowItems = outflowItemsWithPlans.sort((a, b) => a.date.localeCompare(b.date));
    const expectedIncomeComparisonItemsRaw: FlowItem[] = [
      ...income
        .filter((item) => !statusIsRemoved(item.status || ""))
        .flatMap((item) =>
          recurringDates(item.expectedDate, item.frequency, incomeStart, incomeEnd).map((date) => ({
            id: `expected-income-compare-${item.id}-${date}`,
            incomeRecordId: item.id,
            title: item.source,
            category: item.category || item.type || "Income",
            date,
            amount: Number(item.amount || 0),
            source: "Income" as const,
          })),
        ),
      ...planned
        .filter((item) => !item.archived && item.type === "Income" && !statusIsRemoved(item.status || ""))
        .filter((item) => inRange(item.date || item.expectedDate || item.dueDate || "", incomeStart, incomeEnd))
        .map((item) => ({
          id: `expected-planned-income-compare-${item.id}`,
          plannedRecordId: item.id,
          title: item.name,
          category: item.category || "Expected income",
          date: item.date || item.expectedDate || item.dueDate || "",
          amount: Number(item.amount || 0),
          source: "Income" as const,
        })),
    ];
    const expectedIncomeComparisonItems = uniqueFlowItems(
      expectedIncomeComparisonItemsRaw,
      (item) => subCategoryLabel(item.category, item.title),
    ).filter((item) => !deletedItemKeys.has(cashFlowItemKey(item)));

    const expectedExpenseComparisonItems = uniqueFlowItems(
      outflowItems,
      (item) => subCategoryLabel(item.category, item.title),
    ).sort((a, b) => a.date.localeCompare(b.date));
    const budgetRows = connectBudgetsToTransactions(budgets, wallet)
      .filter((budget) => !budget.archived)
      .filter((budget) => budget.start <= expenseEnd && budget.end >= expenseStart);

    const actualKey = (item: FlowItem) =>
      `${normalized(subCategoryLabel(item.category, item.title))}|${item.date}|${Number(item.amount || 0).toFixed(2)}`;
    const plannedActualIncomeItems: FlowItem[] = visibleIncomeItems
      .filter((item) => item.actualAmount !== undefined && item.actualAmount !== null)
      .map((item) => ({
        ...item,
        id: `actual-from-plan-${item.id}`,
        amount: Number(item.actualAmount || 0),
      }));
    const plannedActualIncomeKeys = new Set(plannedActualIncomeItems.map(actualKey));

    const walletActualIncomeItems: FlowItem[] = (wallet.accountTransactions ?? [])
      .filter((transaction) => transaction.type === "Income")
      .filter((transaction) => !linkedCashFlowTransactionIds.has(String(transaction.id)))
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

    const explicitActualIncomeItems: FlowItem[] = [
      ...income
        .filter((item) => (item.status || "").toLowerCase() === "received")
        .map((item) => ({
          id: `received-income-${item.id}`,
          title: item.source,
          category: item.category || item.type || "Income",
          date: item.receivedOccurrenceDate || item.expectedDate || item.actualDate || item.receivedDate || "",
          amount: Number(item.actualAmount ?? item.receivedAmount ?? item.amount ?? 0),
          linkedTransactionId: item.linkedTransactionId,
          source: "Income" as const,
        })),
      ...planned
        .filter((item) => !item.archived && item.type === "Income" && (item.status || "").toLowerCase() === "received")
        .map((item) => ({
          id: `received-planned-income-${item.id}`,
          title: item.name,
          category: item.category || "Income",
          date: item.receivedOccurrenceDate || item.date || item.expectedDate || item.dueDate || item.actualDate || item.receivedDate || "",
          amount: Number(item.actualAmount ?? item.receivedAmount ?? item.amount ?? 0),
          linkedTransactionId: item.linkedTransactionId,
          source: "Income" as const,
        })),
    ]
      .filter((item) => item.date && inRange(item.date, incomeStart, incomeEnd))
      .sort((a, b) => a.date.localeCompare(b.date));

    const explicitActualIncomeLabels = new Set(explicitActualIncomeItems.map((item) => normalized(subCategoryLabel(item.category, item.title))));
    const actualIncomeItems = uniqueFlowItems(
      [
        ...plannedActualIncomeItems,
        ...explicitActualIncomeItems,
        ...walletActualIncomeItems.filter((item) =>
          !explicitActualIncomeLabels.has(normalized(subCategoryLabel(item.category, item.title))) &&
          !plannedActualIncomeKeys.has(actualKey(item)),
        ),
      ],
      (item) => subCategoryLabel(item.category, item.title),
    ).sort((a, b) => a.date.localeCompare(b.date));

    const plannedActualExpenseItems: FlowItem[] = outflowItems
      .filter((item) => item.actualAmount !== undefined && item.actualAmount !== null)
      .map((item) => ({
        ...item,
        id: `actual-from-plan-${item.id}`,
        amount: Number(item.actualAmount || 0),
      }));
    const explicitActualExpenseItems: FlowItem[] = [
      ...bills
        .filter((bill) => (bill.status || "").toLowerCase() === "paid")
        .map((bill) => ({
          id: `paid-bill-${bill.id}`,
          billRecordId: bill.id,
          title: bill.name.replace(/\s+statement$/i, ""),
          category: bill.category || "Bill",
          date: bill.actualDate || bill.paymentDate || bill.dueDate,
          amount: Number(bill.actualAmount ?? bill.paidAmount ?? bill.amount ?? 0),
          linkedTransactionId: bill.linkedTransactionId || bill.paymentTransactionId,
          source: isSubscription(bill.category, bill.name) ? ("Subscription" as const) : ("Bill" as const),
        })),
      ...planned
        .filter((item) => !item.archived && item.type !== "Income" && (item.status || "").toLowerCase() === "paid")
        .map((item) => ({
          id: `paid-planned-expense-${item.id}`,
          plannedRecordId: item.id,
          title: item.name,
          category: item.category || "Expected expense",
          date: item.actualDate || item.paymentDate || item.date || item.expectedDate || item.dueDate || "",
          amount: Number(item.actualAmount ?? item.paidAmount ?? item.amount ?? 0),
          linkedTransactionId: item.linkedTransactionId,
          source: "Expected expense" as const,
        })),
      ...plannedPayments
        .filter((item) => !item.archived && item.type !== "Income" && (item.status || "").toLowerCase() === "paid")
        .map((item) => ({
          id: `paid-planned-payment-${item.id}`,
          plannedPaymentRecordId: item.id,
          title: item.name,
          category: item.category || "Expected expense",
          date: item.actualDate || item.paymentDate || item.date || item.expectedDate || item.dueDate || "",
          amount: Number(item.actualAmount ?? item.paidAmount ?? item.amount ?? 0),
          linkedTransactionId: item.linkedTransactionId,
          source: "Expected expense" as const,
        })),
    ]
      .filter((item) => item.date && inRange(item.date, expenseStart, expenseEnd))
      .sort((a, b) => a.date.localeCompare(b.date));
    const plannedActualExpenseKeys = new Set(plannedActualExpenseItems.map(actualKey));
    const actualRecordKey = (item: FlowItem) => {
      if (item.billRecordId !== undefined) return `bill:${item.billRecordId}`;
      if (item.plannedRecordId !== undefined) return `planned:${item.plannedRecordId}`;
      if (item.plannedPaymentRecordId !== undefined) return `planned-payment:${item.plannedPaymentRecordId}`;
      return "";
    };
    const plannedActualExpenseRecordKeys = new Set(plannedActualExpenseItems.map(actualRecordKey).filter(Boolean));
    const plannedActualExpenseTransactionIds = new Set(
      plannedActualExpenseItems
        .map((item) => item.linkedTransactionId)
        .filter((id): id is number | string => id !== undefined && id !== null)
        .map(String),
    );
    const actualExpenseItems = uniqueFlowItems(
      [
        ...plannedActualExpenseItems,
        ...unmatchedActualExpenseItems.map((item) => ({
          ...item,
          id: `actual-${item.id}`,
          amount: Number(item.actualAmount || 0),
        })),
        ...explicitActualExpenseItems.filter((item) => {
          // A Cash Flow payment normally creates a wallet transaction and also
          // marks its plan/bill record as paid. The transaction-backed planned
          // row already contains that Actual amount, so adding the paid record
          // again would double-count the same money movement when payment and
          // due dates differ.
          const recordKey = actualRecordKey(item);
          if (recordKey && plannedActualExpenseRecordKeys.has(recordKey)) return false;
          if (
            item.linkedTransactionId !== undefined &&
            plannedActualExpenseTransactionIds.has(String(item.linkedTransactionId))
          ) return false;
          return !plannedActualExpenseKeys.has(actualKey(item));
        }),
      ],
      (item) => subCategoryLabel(item.category, item.title),
    ).sort((a, b) => a.date.localeCompare(b.date));

    const matchedActualIds = new Set<string>();
    const incomeComparisonRows = visibleIncomeItems.map((expected) => {
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

    const expectedIncome = total(expectedIncomeComparisonItems);
    const billsAndExpenses = total(expectedExpenseComparisonItems);
    const savings = total(savingsItems);
    const subscriptions = total(outflowItems.filter((item) => item.source === "Subscription"));
    const availableToSpend = expectedIncome - billsAndExpenses;

    return {
      incomeItems: visibleIncomeItems.sort((a, b) => a.date.localeCompare(b.date)),
      outflowItems,
      expectedIncomeComparisonItems: expectedIncomeComparisonItems.sort((a, b) => a.date.localeCompare(b.date)),
      expectedExpenseComparisonItems,
      expectedIncome,
      billsAndExpenses,
      savings,
      subscriptions,
      availableToSpend,
      budgetRows,
      actualIncomeItems,
      actualIncome: total(actualIncomeItems),
      actualExpenseItems,
      actualExpenses: total(actualExpenseItems),
      incomeComparisonRows: incomeComparisonRows.sort((a, b) => a.date.localeCompare(b.date)),
    };
  }, [bills, budgets, deletedItems, expenseEnd, expenseStart, income, incomeEnd, incomeStart, planned, plannedPayments, savingsGoals, wallet]);

  useEffect(() => {
    const claimedTransactionIds = new Set(
      [...income, ...planned, ...plannedPayments, ...bills]
        .map((record) => record.linkedTransactionId)
        .filter((id): id is number | string => id !== undefined && id !== null)
        .map(String),
    );
    const walletIncomeTransactions = (wallet.accountTransactions ?? [])
      .filter((transaction) => transaction.type === "Income")
      // Auto-sync only transactions from the selected income cycle. Without
      // this guard, the date-tolerance matcher can reuse a prior-cycle receipt
      // for a new recurring occurrence (for example July income in August).
      .filter((transaction) => inRange(transaction.date, incomeStart, incomeEnd))
      .filter((transaction) => !claimedTransactionIds.has(String(transaction.id)))
      .map((transaction) => {
        const account = (wallet.accounts ?? []).find((item) => String(item.id) === String(transaction.accountId));
        return {
          transactionId: transaction.id,
          date: transaction.date,
          description: transaction.description,
          category: transaction.category || "Income",
          amount: transaction.amount,
          accountKind: "account" as const,
          accountId: transaction.accountId,
          accountName: account?.name,
          notes: transaction.notes,
        };
      });

    const walletExpenseTransactions = [
      ...(wallet.accountTransactions ?? [])
        .filter((transaction) => transaction.type === "Expense")
        .filter((transaction) => !claimedTransactionIds.has(String(transaction.id)))
        .map((transaction) => {
          const account = (wallet.accounts ?? []).find((item) => String(item.id) === String(transaction.accountId));
          return {
            transactionId: transaction.id,
            date: transaction.date,
            description: transaction.description,
            category: transaction.category || "Expense",
            amount: transaction.amount,
            accountKind: "account" as const,
            accountId: transaction.accountId,
            accountName: account?.name,
          };
        }),
      ...(wallet.transactions ?? [])
        .filter((transaction) => transaction.status?.toLowerCase() === "posted")
        .filter((transaction) => ["purchase", "installment", "fee", "interest"].includes(transaction.type?.toLowerCase()))
        .filter((transaction) => !claimedTransactionIds.has(String(transaction.id ?? `${transaction.cardId}-${transaction.postedDate}-${transaction.amount}`)))
        .map((transaction) => {
          const card = (wallet.cards ?? []).find((item) => String(item.id) === String(transaction.cardId));
          return {
            transactionId: transaction.id ?? `${transaction.cardId}-${transaction.postedDate}-${transaction.amount}`,
            date: transaction.transactionDate || transaction.postedDate,
            description: transaction.description,
            category: transaction.category || "Credit Card",
            amount: transaction.amount,
            accountKind: "card" as const,
            accountId: transaction.cardId,
            accountName: card?.name,
            notes: transaction.notes,
          };
        }),
    ];

    const matchOnce = <T extends { transactionId: number | string; date: string }>(
      items: FlowItem[],
      transactions: T[],
      { requireExactDate = false }: { requireExactDate?: boolean } = {},
    ) => {
      const used = new Set<string>();
      return items.flatMap((item) => {
        const transaction = transactions
          .filter((candidate) =>
            !used.has(String(candidate.transactionId)) &&
            transactionMatchesPlan(candidate, item, { requireExactDate }),
          )
          .sort((left, right) =>
            Math.abs(parseLocal(left.date).getTime() - parseLocal(item.date).getTime()) -
            Math.abs(parseLocal(right.date).getTime() - parseLocal(item.date).getTime()),
          )[0];
        if (!transaction) return [];
        used.add(String(transaction.transactionId));
        return [{ item, transaction }];
      });
    };

    const nowMs = Date.now();
    const syncCooldownMs = 30_000;
    const syncMatchKey = (match: {
      item: FlowItem;
      transaction: { transactionId: number | string; date: string; amount?: number };
    }) =>
      [
        cashFlowItemKey(match.item),
        String(match.transaction.transactionId),
        match.transaction.date,
        Number(match.transaction.amount || 0).toFixed(2),
      ].join("|");
    const onlyFreshMatches = <
      T extends {
        item: FlowItem;
        transaction: { transactionId: number | string; date: string; amount?: number };
      },
    >(
      matches: T[],
    ) =>
      matches.filter((match) => {
        const appliedAt = recentlyAppliedAutoSyncs.current.get(syncMatchKey(match));
        return !appliedAt || nowMs - appliedAt > syncCooldownMs;
      });

    const incomeMatches = onlyFreshMatches(matchOnce(
      flow.incomeItems.filter((item) => item.actualAmount === undefined),
      walletIncomeTransactions,
      { requireExactDate: true },
    ));

    const expenseMatches = onlyFreshMatches(matchOnce(
      flow.outflowItems.filter((item) => item.source !== "Savings" && item.actualAmount === undefined),
      walletExpenseTransactions,
      { requireExactDate: true },
    ));

    if (!incomeMatches.length && !expenseMatches.length) {
      for (const [key, appliedAt] of recentlyAppliedAutoSyncs.current.entries()) {
        if (nowMs - appliedAt > syncCooldownMs * 10) recentlyAppliedAutoSyncs.current.delete(key);
      }
      return;
    }

    const syncSignature = JSON.stringify({
      income: incomeMatches.map(({ item, transaction }) => [
        cashFlowItemKey(item),
        String(transaction.transactionId),
        transaction.date,
        Number(transaction.amount || 0),
      ]),
      expense: expenseMatches.map(({ item, transaction }) => [
        cashFlowItemKey(item),
        String(transaction.transactionId),
        transaction.date,
        Number(transaction.amount || 0),
      ]),
    });
    if (autoSyncSignature.current === syncSignature) return;
    autoSyncSignature.current = syncSignature;
    [...incomeMatches, ...expenseMatches].forEach((match) => {
      recentlyAppliedAutoSyncs.current.set(syncMatchKey(match), nowMs);
    });

    if (incomeMatches.length) {
      setIncome((current) =>
        mapOnlyWhenChanged(current, (row) => {
          const match = incomeMatches.find(({ item }) => String(item.incomeRecordId) === String(row.id));
          // A recurring plan row produces many dated occurrences, while these
          // legacy fields can describe only one of them. Persisting an
          // auto-match here overwrites the previously received occurrence and
          // makes that receipt disappear after reload. Recurring actuals are
          // instead read from their occurrence-specific wallet transactions.
          if (match && frequencyStep(row.frequency)) return row;
          return match
            ? {
                ...row,
                status: "Received",
                actualAmount: Number(match.transaction.amount || 0),
                receivedAmount: Number(match.transaction.amount || 0),
                actualDate: match.transaction.date,
                receivedDate: match.transaction.date,
                receivedOccurrenceDate: match.item.date,
                linkedTransactionId: match.transaction.transactionId,
              }
            : row;
        }),
      );
      setPlanned((current) =>
        mapOnlyWhenChanged(current, (row) => {
          const match = incomeMatches.find(({ item }) =>
            item.plannedRecordId !== undefined && String(item.plannedRecordId) === String(row.id),
          );
          if (match && frequencyStep(row.frequency)) return row;
          return match
            ? {
                ...row,
                status: "Received",
                actualAmount: Number(match.transaction.amount || 0),
                receivedAmount: Number(match.transaction.amount || 0),
                actualDate: match.transaction.date,
                receivedDate: match.transaction.date,
                receivedOccurrenceDate: match.item.date,
                linkedTransactionId: match.transaction.transactionId,
              }
            : row;
        }),
      );
    }

    if (expenseMatches.length) {
      const applyPaid = (
        row: PlannedRecord,
        match?: { item: FlowItem; transaction: { transactionId: number | string; date: string; amount?: number } },
      ) =>
        match
          ? {
              ...row,
              status: "Paid",
              actualAmount: Number(match.transaction.amount || 0),
              paidAmount: Number(match.transaction.amount || 0),
              actualDate: match.transaction.date,
              paymentDate: match.transaction.date,
              paidOccurrenceDate: match.item.date,
              linkedTransactionId: match.transaction.transactionId,
            }
          : row;

      setPlanned((current) =>
        mapOnlyWhenChanged(current, (row) => applyPaid(row, expenseMatches.find(({ item }) =>
          item.plannedRecordId !== undefined && String(item.plannedRecordId) === String(row.id),
        ))),
      );
      setPlannedPayments((current) =>
        mapOnlyWhenChanged(current, (row) => applyPaid(row, expenseMatches.find(({ item }) =>
          item.plannedPaymentRecordId !== undefined && String(item.plannedPaymentRecordId) === String(row.id),
        ))),
      );
      setBills((current) =>
        mapOnlyWhenChanged(current, (row) => {
          const match = expenseMatches.find(({ item }) =>
            item.billRecordId !== undefined && String(item.billRecordId) === String(row.id),
          );
          return match
            ? {
                ...row,
                status: "Paid",
                actualAmount: Number(match.transaction.amount || 0),
                paidAmount: Number(match.transaction.amount || 0),
                actualDate: match.transaction.date,
                paymentDate: match.transaction.date,
                paidOccurrenceDate: match.item.date,
                linkedTransactionId: match.transaction.transactionId,
              }
            : row;
        }),
      );
    }
  }, [bills, flow.incomeItems, flow.outflowItems, income, planned, plannedPayments, setBills, setIncome, setPlanned, setPlannedPayments, wallet.accountTransactions, wallet.accounts, wallet.cards, wallet.transactions]);

  useEffect(() => {
    const existingTransactions = wallet.accountTransactions ?? [];
    const repairs = flow.incomeItems.flatMap((item) => {
      if (item.actualAmount === undefined || item.actualAmount === null) return [];

      const accountLink = item.accountName ? resolveAccountLink(item.accountName, wallet) : null;
      if (!accountLink || accountLink.accountKind !== "account" || accountLink.accountId === undefined) return [];

      const transactionDate = item.actualDate || item.date;
      const marker = cashFlowKey(item);
      const repairKey = `${marker}|${String(accountLink.accountId)}|${transactionDate}|${Number(item.actualAmount).toFixed(2)}`;
      const alreadyRecorded = existingTransactions.some((transaction) => {
        if (transaction.notes?.includes(marker)) return true;
        if (item.linkedTransactionId !== undefined && String(transaction.id) === String(item.linkedTransactionId)) return true;
        return (
          String(transaction.accountId) === String(accountLink.accountId) &&
          transaction.type === "Income" &&
          transaction.date === transactionDate &&
          cents(transaction.amount) === cents(item.actualAmount) &&
          normalized(transaction.description) === normalized(item.title)
        );
      });

      if (alreadyRecorded || incomeLedgerRepairsInFlight.current.has(repairKey)) return [];
      incomeLedgerRepairsInFlight.current.add(repairKey);
      return [{ item, accountLink, transactionDate, marker, repairKey }];
    });

    if (!repairs.length) return;

    const balanceCredits = new Map<string, number>();
    repairs.forEach(({ item, accountLink }) => {
      const accountId = String(accountLink.accountId);
      balanceCredits.set(accountId, (balanceCredits.get(accountId) || 0) + Number(item.actualAmount || 0));
    });

    saveWallet({
      ...wallet,
      accountTransactions: [
        ...existingTransactions,
        ...repairs.map(({ item, accountLink, transactionDate, marker }) => ({
          id: `cashflow-income-${item.incomeRecordId ?? item.plannedRecordId ?? item.id}-${item.date}`,
          accountId: accountLink.accountId,
          date: transactionDate,
          description: item.title,
          type: "Income",
          category: item.category,
          amount: Number(item.actualAmount || 0),
          status: "Posted",
          notes: `${marker} · Repaired from recorded Cash Flow actual`,
        })),
      ],
      accounts: (wallet.accounts ?? []).map((account) => {
        const credit = balanceCredits.get(String(account.id)) || 0;
        return credit ? { ...account, balance: Number(account.balance || 0) + credit } : account;
      }),
    });
  }, [flow.incomeItems, wallet]);

  const expectedExpenses = total(flow.expectedExpenseComparisonItems);
  const netExpected = flow.expectedIncome - expectedExpenses;
  const netActual = flow.actualIncome - flow.actualExpenses;
  const incomeBreakdown = breakdownBy(flow.incomeItems, (item) => item.category || item.title, incomeColors);
  const expenseBreakdown = breakdownBy(flow.outflowItems, (item) => categoryBase(item.category), expenseColors);
  const incomeComparison = comparisonByLabel(
    flow.expectedIncomeComparisonItems,
    flow.actualIncomeItems,
    (item) => subCategoryLabel(item.category, item.title),
  );
  const expenseComparison = comparisonByLabel(
    flow.expectedExpenseComparisonItems,
    flow.actualExpenseItems,
    (item) => subCategoryLabel(item.category, item.title),
  );
  const setIncomeRange = (start: string, end: string, mode = periodMode) => {
    const nextExpenseWindow = followingPaymentWindow(start, end, mode);
    setIncomeStart(start);
    setIncomeEnd(end);
    setExpenseStart(nextExpenseWindow.expenseStart);
    setExpenseEnd(nextExpenseWindow.expenseEnd);
  };
  const movePeriod = (direction: -1 | 1) => {
    const start = parseLocal(incomeStart);
    if (periodMode === "Monthly") {
      start.setMonth(start.getMonth() + direction, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 12);
      setIncomeRange(iso(start), iso(end), periodMode);
      return;
    }
    if (periodMode === "Biweekly") {
      const nextWindow = adjacentSemiMonthlyIncomeWindow(incomeStart, direction);
      setIncomeRange(nextWindow.start, nextWindow.end, periodMode);
      return;
    }
    const days = periodMode === "Weekly" ? 7 : periodDays(incomeStart, incomeEnd);
    const nextStart = addDays(incomeStart, direction * days);
    const nextEnd = addDays(incomeEnd, direction * days);
    setIncomeRange(nextStart, nextEnd, periodMode);
  };
  const applyMode = (mode: "Weekly" | "Biweekly" | "Monthly" | "Custom") => {
    setPeriodMode(mode);
    if (mode === "Custom") return;
    const start = parseLocal(incomeStart);
    if (mode === "Weekly") setIncomeRange(iso(start), addDays(iso(start), 6), mode);
    if (mode === "Biweekly") {
      const semiStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() <= 15 ? 1 : 16, 12);
      const semiEnd =
        semiStart.getDate() === 1
          ? new Date(semiStart.getFullYear(), semiStart.getMonth(), 15, 12)
          : new Date(semiStart.getFullYear(), semiStart.getMonth() + 1, 0, 12);
      setIncomeRange(iso(semiStart), iso(semiEnd), mode);
    }
    if (mode === "Monthly") {
      const monthStart = new Date(start.getFullYear(), start.getMonth(), 1, 12);
      const monthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0, 12);
      setIncomeRange(iso(monthStart), iso(monthEnd), mode);
    }
  };
  const deleteIncome = (item: FlowItem) => {
    const deletionKeys = new Set([cashFlowItemKey(item)]);

    // Removing an expected row must not delete the user's real bank
    // transaction. Tombstone the exact matched transaction occurrence as
    // well, otherwise it is immediately rebuilt below as an unmatched income
    // row and makes the delete appear to have failed.
    (wallet.accountTransactions ?? [])
      .filter((transaction) => transaction.type === "Income")
      .map((transaction) => {
        const account = (wallet.accounts ?? []).find((entry) => String(entry.id) === String(transaction.accountId));
        return {
          transactionId: transaction.id,
          date: transaction.date,
          description: transaction.description,
          category: transaction.category || "Income",
          amount: transaction.amount,
          accountKind: "account" as const,
          accountId: transaction.accountId,
          accountName: account?.name,
          notes: transaction.notes,
        };
      })
      .filter((transaction) => transactionMatchesPlan(transaction, item, { requireExactDate: true }))
      .forEach((transaction) => {
        deletionKeys.add(`wallet-income-${String(transaction.transactionId)}:${transaction.date}`);
      });

    if (item.linkedTransactionId !== undefined) {
      deletionKeys.add(`wallet-income-${String(item.linkedTransactionId)}:${item.date}`);
    }

    setDeletedItems((current) => {
      const next = [...current];
      deletionKeys.forEach((key) => {
        if (!next.includes(key)) next.push(key);
      });
      return next.length === current.length ? current : next;
    });
    if (item.incomeRecordId !== undefined) setIncome((current) => current.filter((row) => String(row.id) !== String(item.incomeRecordId)));
    if (item.plannedRecordId !== undefined) setPlanned((current) => current.filter((row) => String(row.id) !== String(item.plannedRecordId)));
  };
  const postActualTransaction = (item: FlowItem, actual: ActualEntry, transactionType: "Income" | "Expense") => {
    const key = cashFlowKey(item);
    const accountLink: { accountName: string; accountId?: number | string; accountKind: "account" | "card" | "cash" } = actual.accountName
      ? resolveAccountLink(actual.accountName, wallet)
      : item.accountName
      ? resolveAccountLink(item.accountName, wallet)
      : {
          accountName: item.accountName || "Cash",
          accountId: item.accountId,
          accountKind: item.accountKind || "cash",
        };
    const existingAccountTransaction = (wallet.accountTransactions ?? []).find((transaction) => transaction.notes?.includes(key));
    const existingCardTransaction = (wallet.transactions ?? []).find((transaction) => transaction.notes?.includes(key));
    if (existingAccountTransaction?.id !== undefined && accountLink.accountKind === "account") {
      const oldEffect = existingAccountTransaction.type === "Income"
        ? Number(existingAccountTransaction.amount || 0)
        : existingAccountTransaction.type === "Expense"
          ? -Number(existingAccountTransaction.amount || 0)
          : 0;
      const newEffect = transactionType === "Income" ? actual.amount : -actual.amount;
      saveWallet({
        ...wallet,
        accountTransactions: (wallet.accountTransactions ?? []).map((transaction) =>
          transaction.id === existingAccountTransaction.id
            ? {
                ...transaction,
                accountId: accountLink.accountId,
                date: actual.date,
                description: item.title,
                type: transactionType,
                category: item.category,
                amount: actual.amount,
                status: "Posted",
                notes: `${key} · Synced from Cash Flow Plan`,
              }
            : transaction,
        ),
        accounts: (wallet.accounts ?? []).map((account) => {
          let balance = Number(account.balance || 0);
          if (String(account.id) === String(existingAccountTransaction.accountId)) balance -= oldEffect;
          if (String(account.id) === String(accountLink.accountId)) balance += newEffect;
          return balance === Number(account.balance || 0) ? account : { ...account, balance };
        }),
      });
      return existingAccountTransaction.id;
    }
    if (existingCardTransaction) {
      return existingCardTransaction.id ?? `${existingCardTransaction.cardId}-${existingCardTransaction.postedDate}-${existingCardTransaction.amount}`;
    }

    const id = Date.now();
    const note = `${key} · Synced from Cash Flow Plan`;
    if (accountLink.accountKind === "card") {
      saveWallet({
        ...wallet,
        transactions: [
          ...(wallet.transactions ?? []),
          {
            id,
            cardId: accountLink.accountId ?? item.accountId ?? 0,
            type: transactionType === "Expense" ? "purchase" : "credit",
            description: item.title,
            category: item.category,
            amount: actual.amount,
            transactionDate: actual.date,
            postedDate: actual.date,
            status: "posted",
            notes: note,
            expenseCounted: transactionType === "Expense",
          },
        ],
      });
      return id;
    }

    saveWallet({
      ...wallet,
      accountTransactions: [
        ...(wallet.accountTransactions ?? []),
        {
          id,
          accountId: accountLink.accountId,
          date: actual.date,
          description: item.title,
          type: transactionType,
          category: item.category,
          amount: actual.amount,
          status: "Posted",
          notes: note,
        },
      ],
      accounts: (wallet.accounts ?? []).map((account) =>
        String(account.id) === String(accountLink.accountId)
          ? {
              ...account,
              balance: Number(account.balance || 0) + (transactionType === "Income" ? actual.amount : -actual.amount),
            }
          : account,
      ),
    });
    return id;
  };
  const markIncomeReceived = (item: FlowItem, actual: ActualEntry) => {
    const linkedTransactionId = postActualTransaction(item, actual, "Income");
    if (item.incomeRecordId !== undefined) {
      setIncome((current) =>
        current.map((row) =>
          String(row.id) === String(item.incomeRecordId)
            ? {
                ...row,
                status: "Received",
                actualAmount: actual.amount,
                receivedAmount: actual.amount,
                actualDate: actual.date,
                receivedDate: actual.date,
                receivedOccurrenceDate: item.date,
                linkedTransactionId,
                account: actual.accountName,
                accountName: actual.accountName,
              }
            : row,
        ),
      );
    }
    if (item.plannedRecordId !== undefined) {
      setPlanned((current) =>
        current.map((row) =>
          String(row.id) === String(item.plannedRecordId)
            ? {
                ...row,
                status: "Received",
                actualAmount: actual.amount,
                receivedAmount: actual.amount,
                actualDate: actual.date,
                receivedDate: actual.date,
                receivedOccurrenceDate: item.date,
                linkedTransactionId,
                account: actual.accountName,
                accountName: actual.accountName,
              }
            : row,
        ),
      );
    }
  };
  const findExpenseRecord = (item: FlowItem) => {
    if (item.plannedRecordId !== undefined) return { collection: "planning" as const, record: planned.find((row) => String(row.id) === String(item.plannedRecordId)) ?? null };
    if (item.plannedPaymentRecordId !== undefined) return { collection: "plannedPayments" as const, record: plannedPayments.find((row) => String(row.id) === String(item.plannedPaymentRecordId)) ?? null };
    return { collection: null, record: null };
  };
  const deleteExpense = (item: FlowItem) => {
    const deletionKey = cashFlowItemKey(item);
    setDeletedItems((current) => current.includes(deletionKey) ? current : [...current, deletionKey]);
    if (item.plannedRecordId !== undefined) setPlanned((current) => current.filter((row) => String(row.id) !== String(item.plannedRecordId)));
    if (item.plannedPaymentRecordId !== undefined) setPlannedPayments((current) => current.filter((row) => String(row.id) !== String(item.plannedPaymentRecordId)));
    if (item.billRecordId !== undefined) {
      setBills((current) => current.flatMap((row) => {
        if (String(row.id) !== String(item.billRecordId)) return [row];
        // Automatically generated statement bills are owned by card billing.
        // Deleting them from Cash Flow should hide the planning row without
        // deleting the statement or allowing the sync hook to recreate it.
        if (isCreditCardStatementBill(row)) return [{ ...row, hiddenFromCashFlow: true }];
        return [];
      }));
    }
  };
  const markExpensePaid = (item: FlowItem, actual: ActualEntry) => {
    if (item.billRecordId !== undefined) {
      const bill = bills.find((row) => String(row.id) === String(item.billRecordId));
      if (!bill) return;

      // Bills must go through the shared payment processor. This is what links
      // one payment to the bank ledger, the card statement, card payment
      // history, and card balance without posting duplicate transactions.
      const result = processBillPayment({
        bill: {
          ...bill,
          frequency: bill.frequency || "One-time",
          status: bill.status || "Upcoming",
          planType: (bill.planType as BillForPayment["planType"]) || "One-time",
        },
        wallet: wallet as WalletForBillPayment,
        paymentMethod: actual.accountName,
        paymentDate: actual.date,
        paymentAmount: actual.amount,
      });

      if (result.processed) saveWallet(result.wallet as WalletShape);
      setBills((current) =>
        current.map((row) =>
          String(row.id) === String(item.billRecordId)
            ? {
                ...row,
                ...(result.bill as BillRecord),
                status: result.bill.status || "Paid",
                actualAmount: actual.amount,
                paidAmount: actual.amount,
                actualDate: actual.date,
                paymentDate: actual.date,
                paidOccurrenceDate: item.date,
                linkedTransactionId: result.bill.paymentTransactionId || row.linkedTransactionId,
                account: actual.accountName,
                accountName: actual.accountName,
              }
            : row,
        ),
      );
      return;
    }

    const linkedTransactionId = postActualTransaction(item, actual, "Expense");
    if (item.plannedRecordId !== undefined) {
      setPlanned((current) =>
        current.map((row) =>
          String(row.id) === String(item.plannedRecordId)
            ? {
                ...row,
                status: "Paid",
                actualAmount: actual.amount,
                paidAmount: actual.amount,
                actualDate: actual.date,
                paymentDate: actual.date,
                paidOccurrenceDate: item.date,
                linkedTransactionId,
                account: actual.accountName,
                accountName: actual.accountName,
              }
            : row,
        ),
      );
    }
    if (item.plannedPaymentRecordId !== undefined) {
      setPlannedPayments((current) =>
        current.map((row) =>
          String(row.id) === String(item.plannedPaymentRecordId)
            ? {
                ...row,
                status: "Paid",
                actualAmount: actual.amount,
                paidAmount: actual.amount,
                actualDate: actual.date,
                paymentDate: actual.date,
                paidOccurrenceDate: item.date,
                linkedTransactionId,
                account: actual.accountName,
                accountName: actual.accountName,
              }
            : row,
        ),
      );
    }
  };

  return (
    <section className="feature-page cash-flow-planning-page">
      <div className="fp-head cfp-page-head">
        <div>
          <h2>Cash Flow Planning</h2>
          <p>Use income from one period to plan the expenses due in the next payment period.</p>
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
          <span>
            <small>Income</small>
            {compactRange(incomeStart, incomeEnd)}
          </span>
          <button className="outline" type="button" onClick={() => movePeriod(1)}>Next<ArrowRight /></button>
        </div>
      </div>

      <article className="surface cfp-linked-period-card">
        <div>
          <small>Income period</small>
          <b>{compactRange(incomeStart, incomeEnd)}</b>
          <span>{money(flow.expectedIncome)} expected income</span>
        </div>
        <ArrowRight />
        <div>
          <small>Payment period</small>
          <b>{compactRange(expenseStart, expenseEnd)}</b>
          <span>{money(expectedExpenses)} expenses to cover next</span>
        </div>
        <div className={flow.availableToSpend < 0 ? "shortage" : "remaining"}>
          <small>{flow.availableToSpend < 0 ? "Shortage" : "Remaining after expenses"}</small>
          <b>{money(flow.availableToSpend)}</b>
          <span>{flow.availableToSpend < 0 ? "Income is not enough for upcoming expenses" : "Available after expected obligations"}</span>
        </div>
      </article>

      <div className="cfp-summary-grid">
        <MetricCard icon={<TrendingUp />} label="Total Expected Income" value={money(flow.expectedIncome)} note={`${flow.incomeItems.length} income ${flow.incomeItems.length === 1 ? "source" : "sources"}`} tone="positive" />
        <MetricCard icon={<TrendingUp />} label="Total Actual Income" value={money(flow.actualIncome)} note={`${flow.actualIncomeItems.length} received ${flow.actualIncomeItems.length === 1 ? "record" : "records"}`} tone="positive" />
        <MetricCard icon={<TrendingDown />} label="Total Expected Expenses" value={money(expectedExpenses)} note={`${flow.outflowItems.length} obligations`} tone="negative" />
        <MetricCard icon={<TrendingDown />} label="Total Actual Expenses" value={money(flow.actualExpenses)} note={`${flow.actualExpenseItems.length} paid ${flow.actualExpenseItems.length === 1 ? "record" : "records"}`} tone="negative" />
        <MetricCard icon={<Wallet />} label="Remaining Planned Cash" value={money(netExpected)} note="Income period minus payment period" tone={netExpected < 0 ? "negative" : "positive"} />
        <MetricCard icon={<Wallet />} label="Net Actual" value={money(netActual)} note="Actual income - expenses" tone={netActual < 0 ? "negative" : "positive"} />
        <MetricCard icon={<CalendarDays />} label="Payment Period" value={`${periodDays(expenseStart, expenseEnd)} days`} note={compactRange(expenseStart, expenseEnd)} tone="period" />
      </div>

      <ActualVsExpectedChart
        incomeRows={incomeComparison}
        expenseRows={expenseComparison}
      />

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
            const record = item.incomeRecordId !== undefined
              ? income.find((row) => String(row.id) === String(item.incomeRecordId))
              : null;
            if (record) {
              setEditingFlowItem(item);
              setEditingIncome(record);
              return;
            }

            const plannedIncome = item.plannedRecordId !== undefined
              ? planned.find((row) => String(row.id) === String(item.plannedRecordId) && row.type === "Income")
              : null;
            if (plannedIncome) {
              setEditingFlowItem(item);
              setEditingPlannedIncome(plannedIncome);
              return;
            }

            // Wallet income without an Expected Income plan is rendered with
            // Expected = ₱0. It still needs an actionable detail/delete flow
            // even though there is no income/planning record to edit.
            if (item.amount === 0 && hasActualAmount(item)) {
              setEditingFlowItem(item);
              setEditingActualOnlyIncome(item);
            }
          }}
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
            if (found.record) {
              setEditingFlowItem(item);
              setEditingExpense(found.record);
              return;
            }

            const bill = item.billRecordId !== undefined
              ? bills.find((row) => String(row.id) === String(item.billRecordId))
              : null;
            if (bill) {
              setEditingFlowItem(item);
              setEditingBill(bill);
            }
          }}
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
          occurrence={editingFlowItem ?? undefined}
          onClose={() => {setEditingIncome(null);setEditingFlowItem(null);}}
          onSave={(record) => {
            setIncome((current) => current.map((item) => (String(item.id) === String(record.id) ? record : item)));
            setEditingIncome(null);
            setEditingFlowItem(null);
          }}
          onDelete={() => {
            if (editingFlowItem) deleteIncome(editingFlowItem);
            setEditingIncome(null);
            setEditingFlowItem(null);
          }}
          onMarkReceived={(actual) => {
            if (editingFlowItem) markIncomeReceived(editingFlowItem, actual);
            setEditingIncome(null);
            setEditingFlowItem(null);
          }}
        />
      )}
      {editingPlannedIncome && (
        <ExpectedPlannedIncomeModal
          defaultDate={incomeStart}
          income={editingPlannedIncome}
          occurrence={editingFlowItem ?? undefined}
          onClose={() => {setEditingPlannedIncome(null);setEditingFlowItem(null);}}
          onSave={(record) => {
            setPlanned((current) => current.map((item) => (item.id === record.id ? record : item)));
            setEditingPlannedIncome(null);
            setEditingFlowItem(null);
          }}
          onDelete={() => {
            if (editingFlowItem) deleteIncome(editingFlowItem);
            setEditingPlannedIncome(null);
            setEditingFlowItem(null);
          }}
          onMarkReceived={(actual) => {
            if (editingFlowItem) markIncomeReceived(editingFlowItem, actual);
            setEditingPlannedIncome(null);
            setEditingFlowItem(null);
          }}
        />
      )}
      {editingActualOnlyIncome && (
        <ActualOnlyIncomeModal
          item={editingActualOnlyIncome}
          onClose={() => {
            setEditingActualOnlyIncome(null);
            setEditingFlowItem(null);
          }}
          onDelete={() => {
            deleteIncome(editingActualOnlyIncome);
            setEditingActualOnlyIncome(null);
            setEditingFlowItem(null);
          }}
        />
      )}
      {editingExpense && (
        <ExpectedExpenseModal
          defaultDate={expenseStart}
          expense={editingExpense}
          onClose={() => {setEditingExpense(null);setEditingFlowItem(null);}}
          onSave={(record) => {
            setPlanned((current) => current.map((item) => (item.id === record.id ? record : item)));
            setPlannedPayments((current) => current.map((item) => (item.id === record.id ? record : item)));
            setEditingExpense(null);
            setEditingFlowItem(null);
          }}
          onDelete={() => {
            if (editingFlowItem) deleteExpense(editingFlowItem);
            setEditingExpense(null);
            setEditingFlowItem(null);
          }}
          onMarkPaid={(actual) => {
            if (editingFlowItem) markExpensePaid(editingFlowItem, actual);
            setEditingExpense(null);
            setEditingFlowItem(null);
          }}
        />
      )}
      {editingBill && (
        <ExpectedBillModal
          defaultDate={expenseStart}
          bill={editingBill}
          onClose={() => {setEditingBill(null);setEditingFlowItem(null);}}
          onSave={(record) => {
            setBills((current) => current.map((item) => (item.id === record.id ? record : item)));
            setEditingBill(null);
            setEditingFlowItem(null);
          }}
          onDelete={() => {
            if (editingFlowItem) deleteExpense(editingFlowItem);
            setEditingBill(null);
            setEditingFlowItem(null);
          }}
          onMarkPaid={(actual) => {
            if (editingFlowItem) markExpensePaid(editingFlowItem, actual);
            setEditingBill(null);
            setEditingFlowItem(null);
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

function ActualVsExpectedChart({ incomeRows, expenseRows }: { incomeRows: ComparisonRow[]; expenseRows: ComparisonRow[] }) {
  return (
    <div className="cfp-comparison-grid">
      <ComparisonBarChart
        title="Income: Actual vs Expected"
        description="Expected and received amounts by income sub-category."
        rows={incomeRows}
        tone="income"
      />
      <ComparisonBarChart
        title="Expenses: Actual vs Expected"
        description="Expected and paid amounts by expense sub-category."
        rows={expenseRows}
        tone="expense"
      />
    </div>
  );
}

function ComparisonBarChart({
  title,
  description,
  rows,
  tone,
}: {
  title: string;
  description: string;
  rows: ComparisonRow[];
  tone: "income" | "expense";
}) {
  const visibleRows = rows.slice(0, 8);
  const width = Math.max(620, 110 + visibleRows.length * 92);
  const height = 220;
  const padding = { top: 18, right: 28, bottom: 48, left: 66 };
  const maxValue = Math.max(1, ...visibleRows.flatMap((row) => [row.expected, row.actual]));
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const groupWidth = plotWidth / Math.max(1, visibleRows.length);
  const barWidth = Math.min(22, Math.max(14, groupWidth * 0.22));
  const yFor = (value: number) => padding.top + ((maxValue - value) / maxValue) * plotHeight;
  const barFor = (value: number, index: number, offset: number) => ({
    x: padding.left + groupWidth * index + groupWidth / 2 + offset,
    y: yFor(value),
    height: Math.max(2, height - padding.bottom - yFor(value)),
  });
  const gridValues = [maxValue, maxValue * 0.5, 0];

  return (
    <article className={`surface cfp-comparison-chart ${tone}`}>
      <div className="cfp-chart-head">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <div className="cfp-chart-legend" aria-label={`${title} legend`}>
          <span><i className="expected" />Expected</span>
          <span><i className="actual" />Actual</span>
        </div>
      </div>
      <div className="cfp-chart-scroll">
        {visibleRows.length ? (
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
            {gridValues.map((value) => (
              <g key={value}>
                <line x1={padding.left} x2={width - padding.right} y1={yFor(value)} y2={yFor(value)} />
                <text x={padding.left - 12} y={yFor(value) + 4} textAnchor="end">{money(value).replace(".00", "")}</text>
              </g>
            ))}
            {visibleRows.map((row, index) => {
              const expectedBar = barFor(row.expected, index, -(barWidth + 4));
              const actualBar = barFor(row.actual, index, 4);
              return (
                <g key={row.label}>
                  <rect className="expected-bar" x={expectedBar.x} y={expectedBar.y} width={barWidth} height={expectedBar.height} rx="6">
                    <title>{`${row.label} expected: ${money(row.expected)}`}</title>
                  </rect>
                  <rect className="actual-bar" x={actualBar.x} y={actualBar.y} width={barWidth} height={actualBar.height} rx="6">
                    <title>{`${row.label} actual: ${money(row.actual)}`}</title>
                  </rect>
                  <text className="x-label" x={padding.left + groupWidth * index + groupWidth / 2} y={height - 22} textAnchor="middle">
                    {row.label.length > 12 ? `${row.label.slice(0, 11)}…` : row.label}
                  </text>
                </g>
              );
            })}
          </svg>
        ) : (
          <div className="cfp-chart-empty">No expected or actual records for this period yet.</div>
        )}
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
}) {
  const totalValue = total(items);
  const differenceFor = (item: FlowItem) => {
    if (item.actualAmount == null) return null;
    return tone === "income" ? Number(item.actualAmount) - Number(item.amount) : Number(item.amount) - Number(item.actualAmount);
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
        <div className="cfp-plan-head">
          <span>Date</span>
          <span>{tone === "income" ? "Source" : "Category"}</span>
          <span>Description</span>
          <span>Expected</span>
          <span>Actual</span>
          <span>Difference</span>
        </div>
        {items.map((item) => {
          const diff = differenceFor(item);
          return (
            <div key={item.id} className="cfp-plan-row" onClick={() => onEdit?.(item)} role="button" tabIndex={0} onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onEdit?.(item)}}}>
              <FlowDateCard value={item.date} />
              <span className="cfp-plan-source"><CategoryIcon value={item.category} /><span><b>{tone === "income" ? item.category : categoryBase(item.category)}</b></span></span>
              <span className="cfp-plan-desc">
                {item.title}
                <small>{item.forecastStatus || item.source}{item.accountName ? ` · ${item.accountName}` : ""}</small>
              </span>
              <span className="cfp-plan-amounts">
                <span className="cfp-plan-expected"><b>{money(item.amount)}</b></span>
                <span className={`cfp-plan-actual ${item.actualAmount != null ? "has-actual" : ""}`}><b>{item.actualAmount != null ? money(item.actualAmount) : "—"}</b></span>
                <span className={`cfp-plan-diff ${diff == null ? "" : diff < 0 ? "negative-diff" : "positive-diff"}`}><b>{diff == null ? "—" : money(diff)}</b></span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="cfp-total-row"><b>{totalLabel}</b><strong>{money(totalValue)}</strong></div>
      <div className="cfp-tip"><AlertTriangle /><span>{tip}</span></div>
    </article>
  );
}

function ActualOnlyIncomeModal({
  item,
  onClose,
  onDelete,
}: {
  item: FlowItem;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal cfp-income-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Income transaction details"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2>{item.title}</h2>
            <p>This received income has no Expected Income amount.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="form-grid">
          <label>
            Transaction date
            <input type="date" value={item.date} readOnly />
          </label>
          <label>
            Actual amount
            <input type="text" value={money(Number(item.actualAmount || 0))} readOnly />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Source / category
            <input type="text" value={item.category || "Income"} readOnly />
          </label>
          <label>
            Receiving account
            <input type="text" value={item.accountName || "Not specified"} readOnly />
          </label>
        </div>
        <p className="cfp-modal-note">
          Deleting removes this zero-Expected row from Cash Flow Plan only. The original account transaction remains in Transactions.
        </p>
        <div className="cfp-edit-actions">
          <button className="outline" type="button" onClick={onClose}>Cancel</button>
          <button className="danger-outline" type="button" onClick={onDelete}>Delete</button>
        </div>
      </section>
    </div>
  );
}

function ExpectedIncomeModal({
  defaultDate,
  accounts: _accounts,
  income,
  occurrence,
  onClose,
  onSave,
  onDelete,
  onMarkReceived,
}: {
  defaultDate: string;
  accounts: Array<{ id: number | string; name: string }>;
  income?: IncomeRecord;
  occurrence?: FlowItem;
  onClose: () => void;
  onSave: (record: IncomeRecord) => void;
  onDelete?: () => void;
  onMarkReceived?: (actual: ActualEntry) => void;
}) {
  const isEditing = Boolean(income);
  const markReceived = (form: HTMLFormElement) => {
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    onMarkReceived?.({
      amount: Number(data.get("actualAmount") || data.get("amount") || occurrence?.amount || income?.amount || 0),
      date: String(data.get("actualDate") || occurrence?.date || data.get("expectedDate") || income?.expectedDate || defaultDate),
      accountName: String(data.get("actualAccount") || data.get("account") || income?.accountName || income?.account || "").trim(),
    });
  };
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
            const accountName = String(form.get("account") || "").trim();
            onSave({
              ...income,
              id: income?.id ?? Date.now(),
              source: String(form.get("source") || "").trim(),
              type: String(form.get("type") || "Salary"),
              category: String(form.get("category") || "Income"),
              amount: Number(form.get("amount") || 0),
              expectedDate: String(form.get("expectedDate") || defaultDate),
              frequency: String(form.get("frequency") || "One-time"),
              account: accountName,
              accountName,
              status: income?.status || "Expected",
              confidence: String(form.get("confidence") || "Confirmed") as "Confirmed" | "Estimated",
              notes: String(form.get("notes") || ""),
            });
            const actualAmount = String(form.get("actualAmount") || "").trim();
            if (isEditing && actualAmount) markReceived(event.currentTarget);
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
              <ConnectedAccountSelect required showCards={false} showOther={false} defaultValue={income?.accountName || income?.account || ""} />
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
          {isEditing && (
            <div className="cfp-edit-actual-box">
              <b>Record actual income</b>
              <div className="form-grid">
                <label>Actual amount<input name="actualAmount" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={occurrence?.actualAmount ?? ""} /></label>
                <label>Received date<input name="actualDate" type="date" defaultValue={(occurrence?.actualAmount !== undefined ? occurrence.actualDate : occurrence?.date) || income?.expectedDate || defaultDate} /></label>
              </div>
              <label>Receiving account<ConnectedAccountSelect name="actualAccount" required showCards={false} showOther={false} defaultValue={income?.accountName || income?.account || ""} /></label>
            </div>
          )}
          {isEditing ? (
            <div className="cfp-edit-actions">
              <button className="primary" type="submit">Save changes</button>
              <button className="primary" type="button" onClick={(event)=>markReceived(event.currentTarget.form!)}>Mark as received</button>
              <button className="danger-outline" type="button" onClick={onDelete}>Delete</button>
            </div>
          ) : (
            <button className="primary submit" type="submit"><Plus />Save expected income</button>
          )}
        </form>
      </section>
    </div>
  );
}

function ExpectedPlannedIncomeModal({
  defaultDate,
  income,
  occurrence,
  onClose,
  onSave,
  onDelete,
  onMarkReceived,
}: {
  defaultDate: string;
  income: PlannedRecord;
  occurrence?: FlowItem;
  onClose: () => void;
  onSave: (record: PlannedRecord) => void;
  onDelete?: () => void;
  onMarkReceived?: (actual: ActualEntry) => void;
}) {
  const markReceived = (form: HTMLFormElement) => {
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    onMarkReceived?.({
      amount: Number(data.get("actualAmount") || data.get("amount") || occurrence?.amount || income.amount || 0),
      date: String(data.get("actualDate") || occurrence?.date || data.get("date") || income.expectedDate || defaultDate),
      accountName: String(data.get("actualAccount") || data.get("account") || income.accountName || income.account || "").trim(),
    });
  };
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal cfp-income-modal" role="dialog" aria-modal="true" aria-label="Edit expected income" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Edit expected income</h2>
            <p>Update the expected source, category, schedule, amount, and recurrence.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const date = String(form.get("date") || defaultDate);
            const accountName = String(form.get("account") || "").trim();
            onSave({
              ...income,
              type: "Income",
              name: String(form.get("name") || "").trim(),
              category: String(form.get("category") || "Income"),
              amount: Number(form.get("amount") || 0),
              date,
              expectedDate: date,
              dueDate: date,
              frequency: String(form.get("frequency") || "One-time"),
              account: accountName,
              accountName,
              status: income.status || "Expected",
              archived: income.archived || false,
            });
            if (String(form.get("actualAmount") || "").trim()) markReceived(event.currentTarget);
          }}
        >
          <div className="form-grid">
            <label>
              Income source
              <input name="name" required autoFocus defaultValue={income.name || ""} placeholder="Accenture, payroll, freelance…" />
            </label>
            <label>
              Expected amount
              <input name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" required defaultValue={income.amount || ""} placeholder="₱0.00" />
            </label>
          </div>
          <CategoryFields defaultValue={income.category || "Income"} />
          <div className="form-grid">
            <label>
              Expected date
              <input name="date" type="date" required defaultValue={income.date || income.expectedDate || income.dueDate || defaultDate} />
            </label>
            <label>
              Frequency
              <select name="frequency" defaultValue={income.frequency || "One-time"}>
                {["One-time", "Weekly", "Every two weeks", "Monthly", "Every two months", "Quarterly", "Semiannually", "Annually"].map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Receiving account
            <ConnectedAccountSelect required showCards={false} showOther={false} defaultValue={income.accountName || income.account || ""} />
          </label>
          <div className="cfp-edit-actual-box">
            <b>Record actual income</b>
            <div className="form-grid">
              <label>Actual amount<input name="actualAmount" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={occurrence?.actualAmount ?? ""} /></label>
              <label>Received date<input name="actualDate" type="date" defaultValue={(occurrence?.actualAmount !== undefined ? occurrence.actualDate : occurrence?.date) || income.expectedDate || defaultDate} /></label>
            </div>
            <label>Receiving account<ConnectedAccountSelect name="actualAccount" required showCards={false} showOther={false} defaultValue={income.accountName || income.account || ""} /></label>
          </div>
          <div className="cfp-edit-actions">
            <button className="primary" type="submit">Save changes</button>
            <button className="primary" type="button" onClick={(event)=>markReceived(event.currentTarget.form!)}>Mark as received</button>
            <button className="danger-outline" type="button" onClick={onDelete}>Delete</button>
          </div>
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
  onDelete,
  onMarkPaid,
}: {
  defaultDate: string;
  expense?: PlannedRecord;
  onClose: () => void;
  onSave: (record: PlannedRecord) => void;
  onDelete?: () => void;
  onMarkPaid?: (actual: ActualEntry) => void;
}) {
  const isEditing = Boolean(expense);
  const markPaid = (form: HTMLFormElement) => {
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    onMarkPaid?.({
      amount: Number(data.get("actualAmount") || data.get("amount") || expense?.amount || 0),
      date: String(data.get("actualDate") || data.get("date") || expense?.dueDate || defaultDate),
      accountName: String(data.get("actualAccount") || data.get("account") || expense?.accountName || expense?.account || "").trim(),
    });
  };
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
            const date = String(form.get("date") || defaultDate);
            const accountName = String(form.get("account") || "").trim();
            onSave({
              ...expense,
              id: expense?.id ?? Date.now(),
              type: "Expense",
              name: String(form.get("name") || "").trim(),
              category: String(form.get("category") || "Expected expense"),
              amount: Number(form.get("amount") || 0),
              date,
              dueDate: date,
              frequency: String(form.get("frequency") || "One-time"),
              account: accountName,
              accountName,
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
          <label>
            Bank/Card account
            <ConnectedAccountSelect required defaultValue={expense?.accountName || expense?.account || ""} />
          </label>
          {isEditing && (
            <div className="cfp-edit-actual-box">
              <b>Record actual expense</b>
              <div className="form-grid">
                <label>Actual amount<input name="actualAmount" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={expense?.actualAmount ?? expense?.paidAmount ?? expense?.amount ?? ""} /></label>
                <label>Payment date<input name="actualDate" type="date" defaultValue={expense?.actualDate || expense?.paymentDate || expense?.dueDate || expense?.date || defaultDate} /></label>
              </div>
              <label>Payment account<ConnectedAccountSelect name="actualAccount" required showCards defaultValue={expense?.accountName || expense?.account || ""} /></label>
            </div>
          )}
          {isEditing ? (
            <div className="cfp-edit-actions">
              <button className="primary" type="submit">Save changes</button>
              <button className="primary danger-primary" type="button" onClick={(event)=>markPaid(event.currentTarget.form!)}>Mark as paid</button>
              <button className="danger-outline" type="button" onClick={onDelete}>Delete</button>
            </div>
          ) : (
            <button className="primary submit danger-primary" type="submit"><Plus />Save expected expense</button>
          )}
        </form>
      </section>
    </div>
  );
}

function ExpectedBillModal({
  defaultDate,
  bill,
  onClose,
  onSave,
  onDelete,
  onMarkPaid,
}: {
  defaultDate: string;
  bill: BillRecord;
  onClose: () => void;
  onSave: (record: BillRecord) => void;
  onDelete?: () => void;
  onMarkPaid?: (actual: ActualEntry) => void;
}) {
  const markPaid = (form: HTMLFormElement) => {
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    onMarkPaid?.({
      amount: Number(data.get("actualAmount") || data.get("amount") || bill.amount || 0),
      date: String(data.get("actualDate") || data.get("dueDate") || bill.dueDate || defaultDate),
      accountName: String(data.get("actualAccount") || data.get("account") || bill.accountName || bill.account || bill.autopayAccount || "").trim(),
    });
  };
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal cfp-income-modal" role="dialog" aria-modal="true" aria-label="Edit bill or expense" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Edit bill or expense</h2>
            <p>Update the expected payment details used by Cash Flow Planning.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const accountName = String(form.get("account") || "").trim();
            onSave({
              ...bill,
              name: String(form.get("name") || "").trim(),
              category: String(form.get("category") || "Bill"),
              amount: Number(form.get("amount") || 0),
              dueDate: String(form.get("dueDate") || defaultDate),
              frequency: String(form.get("frequency") || "One-time"),
              account: accountName,
              accountName,
              status: String(form.get("status") || bill.status || "Upcoming"),
            });
          }}
        >
          <div className="form-grid">
            <label>
              Bill or expense name
              <input name="name" required autoFocus defaultValue={bill.name || ""} placeholder="Credit card, rent, utility…" />
            </label>
            <label>
              Expected amount
              <input name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" required defaultValue={bill.amount || ""} placeholder="₱0.00" />
            </label>
          </div>
          <CategoryFields defaultValue={bill.category || "Bill"} />
          <div className="form-grid">
            <label>
              Due date
              <input name="dueDate" type="date" required defaultValue={bill.dueDate || defaultDate} />
            </label>
            <label>
              Recurrence
              <select name="frequency" defaultValue={bill.frequency || "One-time"}>
                {["One-time", "Weekly", "Biweekly", "Monthly", "Custom recurrence"].map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Payment account
            <ConnectedAccountSelect required defaultValue={bill.accountName || bill.account || bill.autopayAccount || ""} />
          </label>
          <label>
            Status
            <select name="status" defaultValue={bill.status || "Upcoming"}>
              {["Upcoming", "Expected", "Paid", "Overdue"].map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <div className="cfp-edit-actual-box">
            <b>Record actual payment</b>
            <div className="form-grid">
              <label>Actual amount<input name="actualAmount" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={bill.actualAmount ?? bill.paidAmount ?? bill.amount ?? ""} /></label>
              <label>Payment date<input name="actualDate" type="date" defaultValue={bill.actualDate || bill.paymentDate || bill.dueDate || defaultDate} /></label>
            </div>
            <label>Payment account<ConnectedAccountSelect name="actualAccount" required showCards defaultValue={bill.accountName || bill.account || bill.autopayAccount || ""} /></label>
          </div>
          <div className="cfp-edit-actions">
            <button className="primary" type="submit">Save changes</button>
            <button className="primary danger-primary" type="button" onClick={(event)=>markPaid(event.currentTarget.form!)}>Mark as paid</button>
            <button className="danger-outline" type="button" onClick={onDelete}>Delete</button>
          </div>
        </form>
      </section>
    </div>
  );
}
