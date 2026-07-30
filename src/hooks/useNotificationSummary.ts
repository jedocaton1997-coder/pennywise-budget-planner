import { useMemo } from "react";
import { useFirestoreState } from "./useFirestoreState";
import { useWalletSnapshot } from "./useWalletSnapshot";

export type NotificationTone = "urgent" | "warning" | "info" | "positive";
export type NotificationIconKey =
  | "alert"
  | "bell"
  | "budget"
  | "calendar"
  | "card"
  | "cash"
  | "receipt"
  | "savings"
  | "trend"
  | "wallet";

export type GeneratedNotification = {
  id: string;
  title: string;
  message: string;
  time: string;
  tone: NotificationTone;
  iconKey: NotificationIconKey;
  read: boolean;
};

type Bill = {
  id: number | string;
  name: string;
  amount: number;
  dueDate: string;
  status: string;
  category?: string;
  account?: string;
};

type Card = {
  id: number | string;
  name: string;
  currentBalance?: number;
  statementBalance?: number;
  amountDue?: number;
  paymentDueDate?: string;
  dueDate?: string;
  utilization?: number;
  creditLimit?: number;
  active?: boolean;
};

type Budget = {
  id?: number | string;
  name: string;
  subcategory?: string;
  allocated?: number;
  actual?: number;
  archived?: boolean;
};

type NotificationWallet = {
  cards?: Card[];
};

const money = (value: number) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const parseLocalDate = (value?: string) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
};

const daysUntil = (value?: string) => {
  const date = parseLocalDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86_400_000);
};

const duePhrase = (days: number) => {
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days} days`;
};

const compactDate = (value?: string) => {
  const date = parseLocalDate(value);
  return date
    ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "No date";
};

export function useNotificationSummary() {
  const [bills] = useFirestoreState<Bill[]>("bills", []);
  const [budgets] = useFirestoreState<Budget[]>("budgets", []);
  const [wallet] = useWalletSnapshot<NotificationWallet>({ cards: [] });
  const [readMap, setReadMap] = useFirestoreState<Record<string, boolean>>(
    "notificationReads",
    {},
  );

  const notifications = useMemo<GeneratedNotification[]>(() => {
    const generated: Omit<GeneratedNotification, "read">[] = [];
    const activeBills = [...(bills ?? [])]
      .filter((bill) => !["Paid", "Skipped"].includes(bill.status))
      .sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")));

    const overdueBills = activeBills.filter((bill) => {
      const days = daysUntil(bill.dueDate);
      return days !== null && days < 0;
    });
    const dueSoonBills = activeBills.filter((bill) => {
      const days = daysUntil(bill.dueDate);
      return days !== null && days >= 0 && days <= 7;
    });

    overdueBills.slice(0, 5).forEach((bill) => {
      const days = daysUntil(bill.dueDate) ?? 0;
      generated.push({
        id: `bill-overdue-${bill.id}-${bill.dueDate}`,
        title: `${bill.name} is overdue`,
        message: `${money(bill.amount)} was due ${compactDate(bill.dueDate)}${bill.account ? ` from ${bill.account}` : ""}.`,
        time: duePhrase(days),
        tone: "urgent",
        iconKey: "alert",
      });
    });

    dueSoonBills.slice(0, 8).forEach((bill) => {
      const days = daysUntil(bill.dueDate) ?? 0;
      generated.push({
        id: `bill-due-${bill.id}-${bill.dueDate}`,
        title: `${bill.name} ${duePhrase(days)}`,
        message: `${money(bill.amount)} scheduled for ${compactDate(bill.dueDate)}${bill.category ? ` · ${bill.category}` : ""}.`,
        time: duePhrase(days),
        tone: days <= 1 ? "warning" : "info",
        iconKey: bill.category?.toLowerCase().includes("credit") ? "card" : "receipt",
      });
    });

    (wallet.cards ?? [])
      .filter((card) => card.active !== false)
      .forEach((card) => {
        const dueDate = card.paymentDueDate || card.dueDate;
        const days = daysUntil(dueDate);
        const dueAmount = Number(card.statementBalance ?? card.amountDue ?? card.currentBalance ?? 0);
        if (days !== null && dueAmount > 0 && days <= 7) {
          generated.push({
            id: `card-payment-${card.id}-${dueDate}`,
            title: `${card.name} payment ${duePhrase(days)}`,
            message: `${money(dueAmount)} statement balance is scheduled for ${compactDate(dueDate)}.`,
            time: duePhrase(days),
            tone: days < 0 ? "urgent" : "warning",
            iconKey: "card",
          });
        }

        const limit = Number(card.creditLimit || 0);
        const balance = Number(card.currentBalance || 0);
        const utilization = limit > 0 ? (balance / limit) * 100 : Number(card.utilization || 0);
        if (utilization >= 80) {
          generated.push({
            id: `card-utilization-${card.id}`,
            title: `${card.name} utilization is critical`,
            message: `Current utilization is ${Math.round(utilization)}%. Consider reducing the balance.`,
            time: "Updated now",
            tone: "urgent",
            iconKey: "wallet",
          });
        } else if (utilization >= 50) {
          generated.push({
            id: `card-utilization-${card.id}`,
            title: `${card.name} utilization is high`,
            message: `Current utilization is ${Math.round(utilization)}%.`,
            time: "Updated now",
            tone: "warning",
            iconKey: "wallet",
          });
        }
      });

    (budgets ?? [])
      .filter((budget) => !budget.archived && Number(budget.allocated || 0) > 0)
      .forEach((budget) => {
        const percent = (Number(budget.actual || 0) / Number(budget.allocated || 1)) * 100;
        if (percent >= 90) {
          generated.push({
            id: `budget-critical-${budget.id ?? budget.name}`,
            title: `${budget.subcategory || budget.name} budget is almost used`,
            message: `${money(Number(budget.actual || 0))} of ${money(Number(budget.allocated || 0))} has been used.`,
            time: "This month",
            tone: "urgent",
            iconKey: "budget",
          });
        } else if (percent >= 70) {
          generated.push({
            id: `budget-warning-${budget.id ?? budget.name}`,
            title: `${budget.subcategory || budget.name} budget is nearing its limit`,
            message: `${Math.round(percent)}% of the budget has been used.`,
            time: "This month",
            tone: "warning",
            iconKey: "budget",
          });
        }
      });

    if (dueSoonBills.length > 0) {
      const total = dueSoonBills.reduce((sum, bill) => sum + Number(bill.amount || 0), 0);
      generated.unshift({
        id: "weekly-summary-current",
        title: "Weekly financial summary",
        message: `${dueSoonBills.length} upcoming commitment${dueSoonBills.length === 1 ? "" : "s"} total ${money(total)} within seven days.`,
        time: "Updated now",
        tone: total > 0 ? "info" : "positive",
        iconKey: "calendar",
      });
    }

    return generated
      .slice(0, 30)
      .map((notice) => ({ ...notice, read: Boolean(readMap[notice.id]) }));
  }, [bills, budgets, readMap, wallet.cards]);

  const unread = notifications.filter((notice) => !notice.read).length;

  const markRead = (id: string) =>
    setReadMap((current) => ({ ...current, [id]: true }));

  const markAllRead = () =>
    setReadMap((current) => ({
      ...current,
      ...Object.fromEntries(notifications.map((notice) => [notice.id, true])),
    }));

  return { notifications, unread, markRead, markAllRead };
}
