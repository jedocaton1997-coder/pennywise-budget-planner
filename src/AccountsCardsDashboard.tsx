import { useMemo, useState } from "react";
import type React from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Gauge,
  History,
  Landmark,
  Plus,
  ReceiptText,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { BankLogo } from "./BankLogo";
import { CategoryIcon } from "./CategoryIcon";
import {
  computeCard,
  type CardConfig,
  type CardPayment,
  type CardStatement,
  type CardTransaction,
} from "../domain/creditCardEngine";

export type AccountRecord = {
  id: number | string;
  name: string;
  bank?: string;
  type?: string;
  balance: number;
  last4?: string;
  customLogo?: string;
};

export type AccountTransaction = {
  id: number | string;
  accountId: number | string;
  date: string;
  description: string;
  type: "Income" | "Expense" | "Transfer" | string;
  category?: string;
  amount: number;
  status?: string;
  notes?: string;
};

type ViewMode = "all" | "bank" | "credit";
type TransactionFilter =
  | "All"
  | "Purchases"
  | "Payments"
  | "Refunds"
  | "Installments"
  | "Fees"
  | "Interest"
  | "Adjustments";

type Props = {
  accounts: AccountRecord[];
  cards: CardConfig[];
  accountTransactions: AccountTransaction[];
  cardTransactions: CardTransaction[];
  statements: CardStatement[];
  payments: CardPayment[];

  selectedAccountId: number | string;
  selectedCardId: number | string;
  onSelectAccount: (id: number | string) => void;
  onSelectCard: (id: number | string) => void;

  hideBalances?: boolean;

  onAddBankAccount: () => void;
  onAddCreditCard: () => void;
  onEditAccount: () => void;
  onEditCard: () => void;
  onAddAccountTransaction: () => void;
  onAddCardTransaction: () => void;
  onTransfer: () => void;
  onPayCard: () => void;
  onViewAccountStatement: () => void;
  onViewCardStatement: () => void;
};

const peso = (value: number) =>
  `${value < 0 ? "-" : ""}₱${Math.abs(Number(value || 0)).toLocaleString(
    "en-PH",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  )}`;

const dateValue = (value?: string) => {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.valueOf()) ? null : date;
};

const prettyDate = (value?: string) => {
  const date = dateValue(value);
  if (!date) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const daysUntil = (value?: string) => {
  const due = dateValue(value);
  if (!due) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
};

const cardColor = (card: CardConfig) => card.color || "#365f9e";

const cardInk = (hex: string) => {
  const value = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return "#ffffff";
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 165
    ? "#10242c"
    : "#ffffff";
};

export default function AccountsCardsDashboard({
  accounts,
  cards,
  accountTransactions,
  cardTransactions,
  statements,
  payments,
  selectedAccountId,
  selectedCardId,
  onSelectAccount,
  onSelectCard,
  hideBalances = false,
  onAddBankAccount,
  onAddCreditCard,
  onEditAccount,
  onEditCard,
  onAddAccountTransaction,
  onAddCardTransaction,
  onTransfer,
  onPayCard,
  onViewAccountStatement,
  onViewCardStatement,
}: Props) {
  const [view, setView] = useState<ViewMode>("all");
  const [transactionFilter, setTransactionFilter] =
    useState<TransactionFilter>("All");

  const activeCards = cards.filter((card) => card.active !== false);
  const selectedAccount =
    accounts.find((account) => String(account.id) === String(selectedAccountId)) ??
    accounts[0];
  const selectedCard =
    activeCards.find((card) => String(card.id) === String(selectedCardId)) ??
    activeCards[0];

  const computedCards = useMemo(
    () =>
      activeCards.map((card) => ({
        card,
        computed: computeCard(card, cardTransactions, statements, payments),
      })),
    [activeCards, cardTransactions, statements, payments],
  );

  const selectedComputed = selectedCard
    ? computedCards.find(
        ({ card }) => String(card.id) === String(selectedCard.id),
      )?.computed
    : null;

  const totalAssets = accounts.reduce(
    (sum, account) => sum + Math.max(0, Number(account.balance || 0)),
    0,
  );

  const totalCreditUsed = computedCards.reduce(
    (sum, item) => sum + Math.max(0, item.computed.currentBalance),
    0,
  );

  const totalAvailableCredit = computedCards.reduce(
    (sum, item) => sum + Math.max(0, item.computed.availableCredit),
    0,
  );

  const totalLiabilities = totalCreditUsed;
  const netWorth = totalAssets - totalLiabilities;

  const upcomingDue = computedCards
    .map(({ computed }) => ({
      amount:
        computed.lastStatement?.remainingDue ??
        Math.max(0, computed.currentBalance),
      date: computed.lastStatement?.dueDate,
    }))
    .filter((row) => {
      const days = daysUntil(row.date);
      return days !== null && days >= 0 && days <= 30;
    })
    .reduce((sum, row) => sum + row.amount, 0);

  const money = (value: number) => (hideBalances ? "₱••••••" : peso(value));

  const selectedAccountRows = selectedAccount
    ? accountTransactions
        .filter(
          (transaction) =>
            String(transaction.accountId) === String(selectedAccount.id),
        )
        .sort((a, b) => b.date.localeCompare(a.date))
    : [];

  const currentMonth = new Date().toISOString().slice(0, 7);

  const bankMonthRows = selectedAccountRows.filter((transaction) =>
    transaction.date.startsWith(currentMonth),
  );

  const bankIncome = bankMonthRows
    .filter((row) => row.type === "Income")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const bankExpenses = bankMonthRows
    .filter((row) => row.type === "Expense")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const selectedCardRows = selectedCard
    ? cardTransactions
        .filter(
          (transaction) =>
            String(transaction.cardId) === String(selectedCard.id),
        )
        .sort((a, b) =>
          String(b.postedDate || b.transactionDate).localeCompare(
            String(a.postedDate || a.transactionDate),
          ),
        )
    : [];

  const filteredCardRows = selectedCardRows.filter((row) => {
    if (transactionFilter === "All") return true;
    const target = transactionFilter.toLowerCase().replace(/s$/, "");
    return row.type === target;
  });

  const cardSpendingByCategory = useMemo(() => {
    const map = new Map<string, number>();
    selectedCardRows
      .filter((row) =>
        ["purchase", "installment", "fee", "interest"].includes(row.type),
      )
      .forEach((row) => {
        const category = row.category || "Other";
        map.set(category, (map.get(category) ?? 0) + Number(row.amount || 0));
      });

    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [selectedCardRows]);

  const cardSpent = cardSpendingByCategory.reduce(
    (sum, row) => sum + row.value,
    0,
  );

  const cardUtilization =
    selectedCard && selectedCard.creditLimit > 0 && selectedComputed
      ? Math.min(
          100,
          (Math.max(0, selectedComputed.currentBalance) /
            selectedCard.creditLimit) *
            100,
        )
      : 0;

  const dueDate = selectedComputed?.lastStatement?.dueDate;
  const dueDays = daysUntil(dueDate);

  const visibleItems =
    view === "bank"
      ? accounts.map((account) => ({ type: "bank" as const, account }))
      : view === "credit"
        ? activeCards.map((card) => ({ type: "credit" as const, card }))
        : [
            ...accounts.map((account) => ({
              type: "bank" as const,
              account,
            })),
            ...activeCards.map((card) => ({
              type: "credit" as const,
              card,
            })),
          ];

  const currentView =
    view === "credit" || (view === "all" && selectedCard && !selectedAccount)
      ? "credit"
      : view === "bank"
        ? "bank"
        : selectedCard
          ? "credit"
          : "bank";

  return (
    <section className="ac-dashboard">
      <div className="ac-summary-strip">
        <article className="ac-summary-main">
          <div>
            <small>Net worth</small>
            <strong className={netWorth < 0 ? "negative" : "positive"}>
              {money(netWorth)}
            </strong>
            <span>Assets minus liabilities</span>
          </div>
          <svg viewBox="0 0 130 55" aria-hidden="true">
            <path
              d="M2 45 L15 40 L25 43 L38 31 L49 35 L61 27 L74 30 L87 19 L100 22 L115 10 L128 13"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        </article>

        <SummaryMetric
          icon={<Wallet />}
          label="Cash (Assets)"
          value={money(totalAssets)}
          note="Total in bank accounts"
          tone="positive"
        />
        <SummaryMetric
          icon={<CreditCard />}
          label="Credit Used"
          value={money(totalCreditUsed)}
          note="Total credit used"
          tone="negative"
        />
        <SummaryMetric
          icon={<Gauge />}
          label="Available Credit"
          value={money(totalAvailableCredit)}
          note="Total available credit"
          tone="blue"
        />
        <SummaryMetric
          icon={<CalendarDays />}
          label="Upcoming Due"
          value={money(upcomingDue)}
          note="Due in next 30 days"
          tone="warning"
        />

        <div className="ac-view-filter" role="tablist">
          {(["all", "bank", "credit"] as ViewMode[]).map((option) => (
            <button
              type="button"
              key={option}
              className={view === option ? "active" : ""}
              onClick={() => setView(option)}
            >
              {option === "all"
                ? "All"
                : option === "bank"
                  ? "Bank Accounts"
                  : "Credit Cards"}
            </button>
          ))}
        </div>
      </div>

      <div className="ac-main-grid">
        <section className="ac-wallet-panel">
          <div className="ac-section-title">
            <div>
              <small>Wallet</small>
              <h3>My Cards & Accounts</h3>
            </div>
            <button
              type="button"
              className="outline"
              onClick={
                currentView === "bank" ? onAddBankAccount : onAddCreditCard
              }
            >
              <Plus />
              {currentView === "bank" ? "Add bank account" : "Add credit card"}
            </button>
          </div>

          <div className="ac-carousel-wrap">
            <button className="ac-carousel-arrow previous" type="button">
              <ChevronLeft />
            </button>

            <div className="ac-card-carousel">
              {visibleItems.map((item) => {
                if (item.type === "bank") {
                  const selected =
                    selectedAccount &&
                    String(selectedAccount.id) === String(item.account.id);

                  return (
                    <button
                      type="button"
                      key={`account-${item.account.id}`}
                      className={`ac-mini-card bank ${selected ? "selected" : ""}`}
                      onClick={() => {
                        onSelectAccount(item.account.id);
                        setView("bank");
                      }}
                    >
                      <div>
                        <BankLogo
                          bankName={item.account.bank}
                          customLogo={item.account.customLogo}
                          size="small"
                        />
                        <small>{item.account.type || "Account"}</small>
                      </div>
                      <b>{item.account.name}</b>
                      <span>
                        {item.account.last4
                          ? `•••• ${item.account.last4}`
                          : item.account.bank || "Manual account"}
                      </span>
                      <strong>{money(item.account.balance)}</strong>
                      <em>Account</em>
                    </button>
                  );
                }

                const computed = computedCards.find(
                  ({ card }) => String(card.id) === String(item.card.id),
                )?.computed;
                const color = cardColor(item.card);

                return (
                  <button
                    type="button"
                    key={`card-${item.card.id}`}
                    className={`ac-mini-card credit ${
                      selectedCard &&
                      String(selectedCard.id) === String(item.card.id)
                        ? "selected"
                        : ""
                    }`}
                    onClick={() => {
                      onSelectCard(item.card.id);
                      setView("credit");
                    }}
                    style={
                      {
                        "--ac-card-color": color,
                        "--ac-card-ink": cardInk(color),
                      } as React.CSSProperties
                    }
                  >
                    <div>
                      <BankLogo
                        bankId={item.card.bankId}
                        bankName={item.card.bank}
                        customLogo={item.card.customLogo}
                        size="small"
                      />
                      <small>•••• {item.card.last4}</small>
                    </div>
                    <b>{item.card.name}</b>
                    <span>{item.card.bank}</span>
                    <strong>{money(computed?.currentBalance ?? 0)}</strong>
                    <em>{computed?.paymentStatus ?? "Active"}</em>
                  </button>
                );
              })}
            </div>

            <button className="ac-carousel-arrow next" type="button">
              <ChevronRight />
            </button>
          </div>

          {currentView === "bank" && selectedAccount ? (
            <BankAccountDetail
              account={selectedAccount}
              transactions={selectedAccountRows}
              income={bankIncome}
              expenses={bankExpenses}
              money={money}
              onEdit={onEditAccount}
              onAddTransaction={onAddAccountTransaction}
              onTransfer={onTransfer}
              onViewStatement={onViewAccountStatement}
            />
          ) : selectedCard && selectedComputed ? (
            <CreditCardDetail
              card={selectedCard}
              computed={selectedComputed}
              utilization={cardUtilization}
              money={money}
              onEdit={onEditCard}
              onPay={onPayCard}
              onAddTransaction={onAddCardTransaction}
              onTransfer={onTransfer}
              onViewStatement={onViewCardStatement}
            />
          ) : (
            <div className="ac-empty">
              Add an account or credit card to begin.
            </div>
          )}
        </section>

        <aside className="ac-insights-panel">
          {currentView === "credit" && selectedCard && selectedComputed ? (
            <>
              <StatementOverview
                balance={selectedComputed.currentBalance}
                statementBalance={
                  selectedComputed.lastStatement?.statementBalance ?? 0
                }
                minimumDue={selectedComputed.lastStatement?.minimumDue ?? 0}
                dueDate={dueDate}
                dueDays={dueDays}
                money={money}
              />

              <SpendingBreakdown
                rows={cardSpendingByCategory}
                total={cardSpent}
                money={money}
              />

              <PaymentTimeline
                statementDate={selectedComputed.lastStatement?.statementDate}
                dueDate={dueDate}
                amount={
                  selectedComputed.lastStatement?.remainingDue ??
                  selectedComputed.currentBalance
                }
                money={money}
              />

              <AccountHealth utilization={cardUtilization} />
            </>
          ) : selectedAccount ? (
            <>
              <BankOverview
                account={selectedAccount}
                income={bankIncome}
                expenses={bankExpenses}
                transactions={selectedAccountRows}
                money={money}
              />
              <BankRecentActivity
                transactions={selectedAccountRows}
                money={money}
              />
            </>
          ) : null}
        </aside>
      </div>

      <TransactionHistory
        mode={currentView}
        bankRows={selectedAccountRows}
        cardRows={filteredCardRows}
        filter={transactionFilter}
        onFilter={setTransactionFilter}
        money={money}
        selectedCardName={selectedCard?.name}
      />
    </section>
  );
}

function SummaryMetric({
  icon,
  label,
  value,
  note,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  tone: string;
}) {
  return (
    <article className={`ac-summary-metric ${tone}`}>
      <i>{icon}</i>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{note}</em>
      </span>
    </article>
  );
}

function BankAccountDetail({
  account,
  transactions,
  income,
  expenses,
  money,
  onEdit,
  onAddTransaction,
  onTransfer,
  onViewStatement,
}: {
  account: AccountRecord;
  transactions: AccountTransaction[];
  income: number;
  expenses: number;
  money: (value: number) => string;
  onEdit: () => void;
  onAddTransaction: () => void;
  onTransfer: () => void;
  onViewStatement: () => void;
}) {
  return (
    <div className="ac-selected-detail bank">
      <button type="button" className="ac-large-bank-card" onClick={onEdit}>
        <div>
          <BankLogo
            bankName={account.bank}
            customLogo={account.customLogo}
            size="large"
          />
          <span>
            <small>{account.bank || "Manual account"}</small>
            <b>{account.name}</b>
            <em>
              {account.last4
                ? `•••• ${account.last4}`
                : account.type || "Account"}
            </em>
          </span>
        </div>
        <strong>{money(account.balance)}</strong>
      </button>

      <div className="ac-detail-content">
        <div className="ac-detail-summary">
          <Metric label="Available balance" value={money(account.balance)} />
          <Metric label="Income this month" value={money(income)} />
          <Metric label="Expenses this month" value={money(expenses)} />
          <Metric label="Transactions" value={String(transactions.length)} />
        </div>

        <div className="ac-detail-actions">
          <button type="button" className="primary" onClick={onAddTransaction}>
            <Plus />
            Add Transaction
          </button>
          <button type="button" className="outline" onClick={onTransfer}>
            <ArrowLeftRight />
            Transfer
          </button>
          <button type="button" className="outline" onClick={onViewStatement}>
            <History />
            View Statement
          </button>
        </div>
      </div>
    </div>
  );
}

function CreditCardDetail({
  card,
  computed,
  utilization,
  money,
  onEdit,
  onPay,
  onAddTransaction,
  onTransfer,
  onViewStatement,
}: {
  card: CardConfig;
  computed: ReturnType<typeof computeCard>;
  utilization: number;
  money: (value: number) => string;
  onEdit: () => void;
  onPay: () => void;
  onAddTransaction: () => void;
  onTransfer: () => void;
  onViewStatement: () => void;
}) {
  const color = cardColor(card);

  return (
    <div className="ac-selected-detail credit">
      <button
        type="button"
        className="ac-large-credit-card"
        onClick={onEdit}
        style={
          {
            "--ac-card-color": color,
            "--ac-card-ink": cardInk(color),
          } as React.CSSProperties
        }
      >
        <div>
          <BankLogo
            bankId={card.bankId}
            bankName={card.bank}
            customLogo={card.customLogo}
            size="large"
          />
          <span>
            <small>{card.bank}</small>
            <b>{card.name}</b>
            <em>•••• {card.last4}</em>
          </span>
        </div>
        <strong>{money(computed.currentBalance)}</strong>
      </button>

      <div className="ac-detail-content">
        <div className="ac-credit-limit-strip">
          <Metric label="Total Credit Limit" value={money(card.creditLimit)} />
          <Metric
            label="Available Credit"
            value={money(computed.availableCredit)}
          />
          <div className="ac-gauge">
            <span style={{ "--value": utilization } as React.CSSProperties}>
              <b>{utilization.toFixed(0)}%</b>
            </span>
            <small>Used</small>
          </div>
        </div>

        <div className="ac-detail-summary compact">
          <Metric label="Card Type" value="Credit Card" />
          <Metric label="Credit Limit" value={money(card.creditLimit)} />
          <Metric
            label="Statement Date"
            value={prettyDate(computed.lastStatement?.statementDate)}
          />
          <Metric
            label="Payment Due Date"
            value={prettyDate(computed.lastStatement?.dueDate)}
          />
        </div>

        <div className="ac-detail-actions">
          <button type="button" className="primary" onClick={onPay}>
            <CircleDollarSign />
            Pay Card
          </button>
          <button type="button" className="outline" onClick={onAddTransaction}>
            <Plus />
            Add Transaction
          </button>
          <button type="button" className="outline" onClick={onTransfer}>
            <ArrowLeftRight />
            Transfer
          </button>
          <button type="button" className="outline" onClick={onViewStatement}>
            <History />
            View Statement
          </button>
        </div>
      </div>
    </div>
  );
}

function StatementOverview({
  balance,
  statementBalance,
  minimumDue,
  dueDate,
  dueDays,
  money,
}: {
  balance: number;
  statementBalance: number;
  minimumDue: number;
  dueDate?: string;
  dueDays: number | null;
  money: (value: number) => string;
}) {
  return (
    <article className="ac-insight-card statement">
      <div className="ac-insight-title">
        <h3>Statement Overview</h3>
        <span>Due soon</span>
      </div>
      <div className="ac-statement-grid">
        <Metric label="Current Balance" value={money(balance)} />
        <Metric label="Payment Due" value={money(statementBalance)} />
        <Metric label="Last Statement Balance" value={money(statementBalance)} />
        <Metric label="Minimum Due" value={money(minimumDue)} />
        <div className="ac-days-due">
          <span>
            <b>{dueDays === null ? "—" : Math.max(0, dueDays)}</b>
            <small>days</small>
          </span>
          <em>{prettyDate(dueDate)}</em>
        </div>
      </div>
    </article>
  );
}

function SpendingBreakdown({
  rows,
  total,
  money,
}: {
  rows: Array<{ label: string; value: number }>;
  total: number;
  money: (value: number) => string;
}) {
  let cursor = 0;
  const colors = ["#24a76f", "#76a6df", "#f3b14b", "#ef6b66", "#9e83ca"];
  const gradient = rows.length
    ? rows
        .map((row, index) => {
          const start = cursor;
          const end = cursor + (row.value / Math.max(total, 1)) * 100;
          cursor = end;
          return `${colors[index % colors.length]} ${start}% ${end}%`;
        })
        .join(",")
    : "#e7efec 0% 100%";

  return (
    <article className="ac-insight-card spending">
      <div className="ac-insight-title">
        <h3>Spending by Category</h3>
        <small>This Month</small>
      </div>
      <div className="ac-spending-body">
        <div
          className="ac-donut"
          style={{ background: `conic-gradient(${gradient})` }}
        >
          <span>
            <b>{money(total)}</b>
            <small>Total Spent</small>
          </span>
        </div>
        <div className="ac-spending-list">
          {rows.map((row, index) => (
            <div key={row.label}>
              <i style={{ background: colors[index % colors.length] }} />
              <span>{row.label}</span>
              <b>{money(row.value)}</b>
              <em>
                {total ? `${((row.value / total) * 100).toFixed(1)}%` : "0%"}
              </em>
            </div>
          ))}
          {!rows.length && <p>No spending recorded yet.</p>}
        </div>
      </div>
    </article>
  );
}

function PaymentTimeline({
  statementDate,
  dueDate,
  amount,
  money,
}: {
  statementDate?: string;
  dueDate?: string;
  amount: number;
  money: (value: number) => string;
}) {
  return (
    <article className="ac-insight-card timeline">
      <div className="ac-insight-title">
        <h3>Payment Due Timeline</h3>
        <button type="button">View all</button>
      </div>
      <div className="ac-timeline">
        <div className="done">
          <Check />
          <span>
            <b>{prettyDate(statementDate)}</b>
            <small>Statement Date</small>
          </span>
        </div>
        <div>
          <History />
          <span>
            <b>Processing</b>
            <small>Payment Processing</small>
          </span>
        </div>
        <div>
          <CalendarDays />
          <span>
            <b>{prettyDate(dueDate)}</b>
            <small>Payment Due Date</small>
          </span>
        </div>
      </div>
      <div className="ac-due-alert">
        <CalendarDays />
        <strong>{money(amount)} due</strong>
      </div>
    </article>
  );
}

function AccountHealth({ utilization }: { utilization: number }) {
  return (
    <article className="ac-insight-card health">
      <div className="ac-insight-title">
        <h3>Account Health</h3>
        <button type="button">View details</button>
      </div>
      <div className="ac-health-grid">
        <HealthItem
          icon={<Gauge />}
          value={`${utilization.toFixed(0)}%`}
          title="Credit Utilization"
          status={utilization <= 30 ? "Low" : "High"}
        />
        <HealthItem
          icon={<ShieldCheck />}
          value="100%"
          title="Payment History"
          status="Excellent"
        />
        <HealthItem
          icon={<History />}
          value="2y"
          title="Credit Age"
          status="Good"
        />
        <HealthItem
          icon={<Landmark />}
          value="✓"
          title="Credit Mix"
          status="Good"
        />
      </div>
    </article>
  );
}

function HealthItem({
  icon,
  value,
  title,
  status,
}: {
  icon: React.ReactNode;
  value: string;
  title: string;
  status: string;
}) {
  return (
    <div className="ac-health-item">
      <i>{icon}</i>
      <span>
        <small>{title}</small>
        <b>{status}</b>
        <em>{value}</em>
      </span>
    </div>
  );
}

function BankOverview({
  account,
  income,
  expenses,
  transactions,
  money,
}: {
  account: AccountRecord;
  income: number;
  expenses: number;
  transactions: AccountTransaction[];
  money: (value: number) => string;
}) {
  return (
    <article className="ac-insight-card bank-overview">
      <div className="ac-insight-title">
        <h3>Account Overview</h3>
        <small>This Month</small>
      </div>
      <div className="ac-bank-kpis">
        <SummaryMetric
          icon={<TrendingUp />}
          label="Income"
          value={money(income)}
          note="Money received"
          tone="positive"
        />
        <SummaryMetric
          icon={<TrendingDown />}
          label="Expenses"
          value={money(expenses)}
          note="Money spent"
          tone="negative"
        />
        <SummaryMetric
          icon={<Wallet />}
          label="Balance"
          value={money(account.balance)}
          note="Available now"
          tone="blue"
        />
        <SummaryMetric
          icon={<History />}
          label="Activity"
          value={String(transactions.length)}
          note="Transactions"
          tone="warning"
        />
      </div>
    </article>
  );
}

function BankRecentActivity({
  transactions,
  money,
}: {
  transactions: AccountTransaction[];
  money: (value: number) => string;
}) {
  return (
    <article className="ac-insight-card recent">
      <div className="ac-insight-title">
        <h3>Recent Activity</h3>
        <button type="button">View all</button>
      </div>
      <div className="ac-recent-list">
        {transactions.slice(0, 6).map((row) => {
          const income = row.type === "Income";
          return (
            <div key={row.id}>
              <i className={income ? "income" : "expense"}>
                {income ? <ArrowDownLeft /> : <ArrowUpRight />}
              </i>
              <span>
                <b>{row.description}</b>
                <small>
                  {prettyDate(row.date)} · {row.category || row.type}
                </small>
              </span>
              <strong className={income ? "positive" : "negative"}>
                {income ? "+" : "−"}
                {money(row.amount)}
              </strong>
            </div>
          );
        })}
        {!transactions.length && <p>No transactions recorded yet.</p>}
      </div>
    </article>
  );
}

function TransactionHistory({
  mode,
  bankRows,
  cardRows,
  filter,
  onFilter,
  money,
  selectedCardName,
}: {
  mode: "bank" | "credit";
  bankRows: AccountTransaction[];
  cardRows: CardTransaction[];
  filter: TransactionFilter;
  onFilter: (filter: TransactionFilter) => void;
  money: (value: number) => string;
  selectedCardName?: string;
}) {
  const filters: TransactionFilter[] = [
    "All",
    "Purchases",
    "Payments",
    "Refunds",
    "Installments",
    "Fees",
    "Interest",
    "Adjustments",
  ];

  return (
    <article className="ac-history">
      <div className="ac-history-title">
        <h3>Transaction History</h3>
        {mode === "credit" && (
          <div className="ac-history-filters">
            {filters.map((item) => (
              <button
                type="button"
                key={item}
                className={filter === item ? "active" : ""}
                onClick={() => onFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        className={`ac-history-head ${mode === "bank" ? "bank" : "credit"}`}
      >
        <span>Date</span>
        <span>Description</span>
        <span>Type</span>
        <span>Category</span>
        {mode === "credit" && <span>Card</span>}
        <span>Amount</span>
        <span>Status</span>
      </div>

      <div className="ac-history-body">
        {mode === "bank"
          ? bankRows.map((row) => (
              <div className="ac-history-row bank" key={row.id}>
                <span>{prettyDate(row.date)}</span>
                <span>
                  <CategoryIcon value={row.category || row.type} />
                  <b>{row.description}</b>
                </span>
                <span>{row.type}</span>
                <span>{row.category || "Other"}</span>
                <strong
                  className={row.type === "Income" ? "positive" : "negative"}
                >
                  {row.type === "Income" ? "+" : row.type === "Expense" ? "−" : ""}
                  {money(row.amount)}
                </strong>
                <em>{row.status || "Posted"}</em>
              </div>
            ))
          : cardRows.map((row) => (
              <div className="ac-history-row credit" key={row.id}>
                <span>{prettyDate(row.postedDate || row.transactionDate)}</span>
                <span>
                  <CategoryIcon value={row.category || row.type} />
                  <b>{row.description}</b>
                </span>
                <span>{row.type}</span>
                <span>{row.category || "Other"}</span>
                <span>{selectedCardName || "Credit card"}</span>
                <strong
                  className={
                    ["refund", "credit", "payment"].includes(row.type)
                      ? "positive"
                      : ""
                  }
                >
                  {["refund", "credit", "payment"].includes(row.type) ? "−" : ""}
                  {money(row.amount)}
                </strong>
                <em>{row.status || "Posted"}</em>
              </div>
            ))}

        {mode === "bank" && !bankRows.length && (
          <p className="ac-empty">No bank transactions found.</p>
        )}
        {mode === "credit" && !cardRows.length && (
          <p className="ac-empty">No credit-card transactions found.</p>
        )}
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="ac-metric">
      <small>{label}</small>
      <b>{value}</b>
    </div>
  );
}
