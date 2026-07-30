import { useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Gauge,
  PiggyBank,
  Receipt,
  RefreshCw,
  Settings2,
  TrendingDown,
  WalletCards,
} from "lucide-react";
import {
  useNotificationSummary,
  type NotificationIconKey,
} from "./hooks/useNotificationSummary";

type Props = { onNotice: (text: string) => void };

const preferences = [
  "Weekly financial summary",
  "Bills due within seven days",
  "Bills due tomorrow",
  "Overdue bills",
  "Salary expected today",
  "Statement generated",
  "Statement date approaching",
  "Credit card payment due",
  "Partial payment outstanding",
  "Credit utilization warning",
  "Low available credit",
  "Budget reaches 70%",
  "Budget reaches 90%",
  "Forecasted budget overrun",
  "Budget cycle ending soon",
  "Debt payment due",
  "Debt payment overdue",
  "Collection expected soon",
  "Collection overdue",
  "Planned payment approaching",
  "Planned payment overdue",
  "Installment due soon",
  "Installment overdue",
  "Final installment approaching",
  "Installment completed",
  "Annual fee approaching",
  "Credit balance available",
  "Savings contribution reminder",
  "Forecasted cash shortfall",
  "Subscription renewal reminder",
];

const iconMap: Record<NotificationIconKey, typeof Receipt> = {
  alert: AlertTriangle,
  bell: BellRing,
  budget: Gauge,
  calendar: CalendarClock,
  card: CreditCard,
  cash: CircleDollarSign,
  receipt: Receipt,
  savings: PiggyBank,
  trend: TrendingDown,
  wallet: WalletCards,
};

const moneyFromMessage = (message: string) => message.match(/₱[\d,.]+/)?.[0] ?? "₱0.00";

export default function NotificationCenter({ onNotice }: Props) {
  const [filter, setFilter] = useState<"All" | "Unread">("All");
  const [settings, setSettings] = useState(false);
  const [enabled, setEnabled] = useState(() => new Set(preferences));
  const { notifications, unread, markRead, markAllRead } = useNotificationSummary();
  const visible =
    filter === "All" ? notifications : notifications.filter((notice) => !notice.read);
  const upcomingTotal = notifications
    .filter((notice) => notice.id.startsWith("bill-due-") || notice.id.startsWith("card-payment-"))
    .reduce((sum, notice) => {
      const amount = Number(moneyFromMessage(notice.message).replace(/[₱,]/g, ""));
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);

  const open = (id: string) => {
    const item = notifications.find((notice) => notice.id === id);
    markRead(id);
    if (item) onNotice(item.title);
  };
  const toggle = (name: string) =>
    setEnabled((current) => {
      const next = new Set(current);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  return (
    <section className="feature-page notification-center">
      <div className="fp-head">
        <div>
          <h2>Notifications & Reminders</h2>
          <p>Important changes, upcoming commitments, and weekly financial guidance.</p>
        </div>
        <button
          className="outline notification-settings-button"
          onClick={() => setSettings((value) => !value)}
        >
          <Settings2 />
          {settings ? "Hide preferences" : "Reminder preferences"}
        </button>
      </div>

      <article className="weekly-summary-card">
        <div className="summary-copy">
          <span>
            <CalendarClock />
          </span>
          <div>
            <small>Weekly summary</small>
            <h3>
              {notifications.length
                ? `${unread} unread financial reminder${unread === 1 ? "" : "s"}.`
                : "No financial reminders right now."}
            </h3>
            <p>
              {notifications.length
                ? "Generated from your bills, credit cards, and budget limits."
                : "Add bills, credit cards, budgets, and transactions to generate reminders."}
            </p>
          </div>
        </div>
        <div className="weekly-summary-metrics">
          <div>
            <span>Upcoming notices</span>
            <b>{notifications.length}</b>
          </div>
          <i>·</i>
          <div>
            <span>Due soon total</span>
            <b>
              ₱
              {upcomingTotal.toLocaleString("en-PH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </b>
          </div>
          <i>·</i>
          <div>
            <span>Unread</span>
            <b>{unread}</b>
          </div>
        </div>
      </article>

      {settings && (
        <article className="surface reminder-preferences">
          <div>
            <b>Reminder preferences</b>
            <p>Choose which financial events should notify you.</p>
          </div>
          <div className="preference-grid">
            {preferences.map((name) => (
              <label key={name}>
                <span>{name}</span>
                <input
                  type="checkbox"
                  checked={enabled.has(name)}
                  onChange={() => toggle(name)}
                />
                <i />
              </label>
            ))}
          </div>
        </article>
      )}

      <div className="notification-layout">
        <article className="surface notification-feed">
          <div className="notification-toolbar">
            <div className="notification-tabs">
              <button
                className={filter === "All" ? "active" : ""}
                onClick={() => setFilter("All")}
              >
                All <small>{notifications.length}</small>
              </button>
              <button
                className={filter === "Unread" ? "active" : ""}
                onClick={() => setFilter("Unread")}
              >
                Unread <small>{unread}</small>
              </button>
            </div>
            <button disabled={!unread} onClick={markAllRead}>
              <Check />
              Mark all as read
            </button>
          </div>
          {visible.length ? (
            visible.map((notice) => {
              const Icon = iconMap[notice.iconKey] ?? Receipt;
              return (
                <button
                  className={`notification-row ${notice.read ? "read" : "unread"}`}
                  key={notice.id}
                  onClick={() => open(notice.id)}
                >
                  <i className="unread-dot" />
                  <span className={`notification-icon ${notice.tone}`}>
                    <Icon />
                  </span>
                  <span className="notification-copy">
                    <b>{notice.title}</b>
                    <p>{notice.message}</p>
                    <small>{notice.time}</small>
                  </span>
                  <ChevronRight />
                </button>
              );
            })
          ) : (
            <div className="notifications-empty">
              <Check />
              <b>You’re all caught up</b>
              <p>No financial reminders match this filter.</p>
            </div>
          )}
        </article>
        <aside className="surface notification-status">
          <div className="notification-status-head">
            <span>
              <BellRing />
            </span>
            <div>
              <small>Notification status</small>
              <h3>{unread} unread reminders</h3>
            </div>
          </div>
          <div className="status-priority">
            <div>
              <i className="urgent" />
              <span>
                <b>
                  {notifications.filter((notice) => !notice.read && notice.tone === "urgent").length} urgent
                </b>
                <small>Needs action now</small>
              </span>
            </div>
            <div>
              <i className="warning" />
              <span>
                <b>
                  {notifications.filter((notice) => !notice.read && notice.tone === "warning").length} upcoming
                </b>
                <small>Due or nearing a limit</small>
              </span>
            </div>
            <div>
              <i className="info" />
              <span>
                <b>
                  {
                    notifications.filter(
                      (notice) =>
                        !notice.read && ["info", "positive"].includes(notice.tone),
                    ).length
                  } informational
                </b>
                <small>Planning updates</small>
              </span>
            </div>
          </div>
          <button className="outline" onClick={() => setSettings(true)}>
            <Settings2 />
            Manage reminders
          </button>
        </aside>
      </div>
    </section>
  );
}
