import React, { useMemo, useState } from "react";
import "./AccountsCards.css";

type AccountKind = "bank" | "credit";
type TransactionType =
  | "purchase"
  | "payment"
  | "refund"
  | "installment"
  | "fee"
  | "interest"
  | "adjustment";

type TransactionStatus = "posted" | "pending" | "processing" | "reversed" | "failed";

export interface FinanceAccount {
  id: string;
  kind: AccountKind;
  issuer: string;
  name: string;
  maskedNumber: string;
  balance: number;
  status: "active" | "upcoming" | "paid" | "overdue";
  color: string;
  logoText?: string;

  accountType?: string;
  availableBalance?: number;
  interestRate?: number;
  lastTransactionDate?: string;

  creditLimit?: number;
  statementBalance?: number;
  minimumDue?: number;
  statementDate?: string;
  paymentDueDate?: string;
  network?: string;
  processingDate?: string;
  paidDate?: string;
}

export interface FinanceTransaction {
  id: string;
  accountId: string;
  date: string;
  description: string;
  type: TransactionType;
  category: string;
  amount: number;
  status: TransactionStatus;
  note?: string;
  reviewed?: boolean;
  installment?: {
    originalAmount: number;
    monthlyAmount: number;
    current: number;
    total: number;
    remainingBalance: number;
  };
}

interface AccountsCardsProps {
  accounts?: FinanceAccount[];
  transactions?: FinanceTransaction[];
  otherLiabilities?: number;
  onAddAccount?: () => void;
  onTransfer?: () => void;
  onQuickPay?: () => void;
  onAddTransaction?: (account: FinanceAccount) => void;
  onPayCard?: (account: FinanceAccount) => void;
  onViewTransaction?: (transaction: FinanceTransaction) => void;
}

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const DEFAULT_ACCOUNTS: FinanceAccount[] = [
  {
    id: "bpi",
    kind: "credit",
    issuer: "BPI",
    name: "BPI Gold Rewards",
    maskedNumber: "•••• 5555",
    balance: 21584.21,
    status: "upcoming",
    color: "#d72632",
    logoText: "BPI",
    creditLimit: 300000,
    statementBalance: 8455.75,
    minimumDue: 1500,
    statementDate: "2026-07-13",
    paymentDueDate: "2026-08-03",
    processingDate: "2026-07-24",
    network: "VISA",
  },
  {
    id: "bdo",
    kind: "credit",
    issuer: "BDO",
    name: "BDO Platinum",
    maskedNumber: "•••• 0629",
    balance: 2684.55,
    status: "upcoming",
    color: "#315fa8",
    logoText: "BDO",
    creditLimit: 180000,
    statementBalance: 2684.55,
    minimumDue: 500,
    statementDate: "2026-07-12",
    paymentDueDate: "2026-08-02",
    network: "VISA",
  },
  {
    id: "rcbc",
    kind: "bank",
    issuer: "RCBC",
    name: "RCBC Checking",
    maskedNumber: "•••• 2340",
    balance: 11289,
    status: "active",
    color: "#167d6a",
    logoText: "RCBC",
    accountType: "Checking",
    availableBalance: 11289,
    interestRate: 0.1,
    lastTransactionDate: "2026-07-30",
  },
  {
    id: "gotyme",
    kind: "bank",
    issuer: "GoTyme",
    name: "GoTyme Digital Wallet",
    maskedNumber: "•••• 9184",
    balance: 412.54,
    status: "active",
    color: "#1197a6",
    logoText: "GO",
    accountType: "Digital wallet",
    availableBalance: 412.54,
    lastTransactionDate: "2026-07-29",
  },
];

const DEFAULT_TRANSACTIONS: FinanceTransaction[] = [
  {
    id: "t1",
    accountId: "bpi",
    date: "2026-07-30",
    description: "Baliwag Lechon Manok",
    type: "purchase",
    category: "Food / Food Delivery",
    amount: 709,
    status: "posted",
  },
  {
    id: "t2",
    accountId: "bpi",
    date: "2026-07-26",
    description: "Bulalo World Express",
    type: "purchase",
    category: "Food / Groceries",
    amount: 374,
    status: "posted",
  },
  {
    id: "t3",
    accountId: "bpi",
    date: "2026-07-23",
    description: "ANGKAS MANILA PH",
    type: "purchase",
    category: "Transportation",
    amount: 210,
    status: "posted",
  },
  {
    id: "t4",
    accountId: "bpi",
    date: "2026-07-20",
    description: "Monthly installment",
    type: "installment",
    category: "Shopping",
    amount: 2047.05,
    status: "posted",
    installment: {
      originalAmount: 12282.3,
      monthlyAmount: 2047.05,
      current: 2,
      total: 6,
      remainingBalance: 8188.2,
    },
  },
];

const CHART_COLORS = ["#24a36f", "#6e9fdb", "#f3b044", "#ed6d67", "#9a7bd4", "#36b7c9"];

const addDays = (value: string, days: number) => {
  const d = new Date(`${value}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d;
};

const daysBetween = (from: Date, to: Date) =>
  Math.ceil((to.getTime() - from.getTime()) / 86400000);

const safeDate = (value?: string) => (value ? new Date(`${value}T00:00:00`) : null);

const statusLabel = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

export default function AccountsCards({
  accounts = DEFAULT_ACCOUNTS,
  transactions = DEFAULT_TRANSACTIONS,
  otherLiabilities = 0,
  onAddAccount,
  onTransfer,
  onQuickPay,
  onAddTransaction,
  onPayCard,
  onViewTransaction,
}: AccountsCardsProps) {
  const [selectedId, setSelectedId] = useState(accounts[0]?.id ?? "");
  const [accountFilter, setAccountFilter] = useState<"all" | "bank" | "credit">("all");
  const [transactionFilter, setTransactionFilter] = useState<"all" | TransactionType>("all");

  const selected = accounts.find((item) => item.id === selectedId) ?? accounts[0];

  const filteredAccounts = useMemo(
    () => accounts.filter((item) => accountFilter === "all" || item.kind === accountFilter),
    [accounts, accountFilter]
  );

  const selectedTransactions = useMemo(
    () => transactions.filter((item) => item.accountId === selected?.id),
    [transactions, selected?.id]
  );

  const visibleTransactions = useMemo(
    () =>
      selectedTransactions.filter(
        (item) => transactionFilter === "all" || item.type === transactionFilter
      ),
    [selectedTransactions, transactionFilter]
  );

  const bankAssets = accounts
    .filter((item) => item.kind === "bank")
    .reduce((sum, item) => sum + item.balance, 0);

  const creditUsed = accounts
    .filter((item) => item.kind === "credit")
    .reduce((sum, item) => sum + item.balance, 0);

  const availableCredit = accounts
    .filter((item) => item.kind === "credit")
    .reduce((sum, item) => sum + Math.max((item.creditLimit ?? 0) - item.balance, 0), 0);

  const upcomingDue = accounts
    .filter((item) => item.kind === "credit" && item.paymentDueDate && item.status !== "paid")
    .filter((item) => {
      const due = safeDate(item.paymentDueDate);
      return due ? daysBetween(new Date(), due) <= 30 : false;
    })
    .reduce((sum, item) => sum + (item.statementBalance ?? item.balance), 0);

  const netWorth = bankAssets - creditUsed - otherLiabilities;

  const utilization =
    selected?.kind === "credit" && selected.creditLimit
      ? Math.min((selected.balance / selected.creditLimit) * 100, 100)
      : 0;

  const dueDate = safeDate(selected?.paymentDueDate);
  const daysToDue = dueDate ? daysBetween(new Date(), dueDate) : 0;

  const dueStatus =
    selected?.status === "paid"
      ? "Paid"
      : daysToDue < 0
      ? "Overdue"
      : daysToDue <= 7
      ? "Due Soon"
      : "Upcoming";

  const eligibleSpending = selectedTransactions.filter(
    (item) =>
      item.status === "posted" &&
      ["purchase", "installment", "fee", "interest"].includes(item.type)
  );

  const categoryTotals = eligibleSpending.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] ?? 0) + Math.abs(item.amount);
    return acc;
  }, {});

  const totalSpending = Object.values(categoryTotals).reduce((sum, value) => sum + value, 0);

  const categories = Object.entries(categoryTotals)
    .map(([name, amount], index) => ({
      name,
      amount,
      percent: totalSpending ? (amount / totalSpending) * 100 : 0,
      color: CHART_COLORS[index % CHART_COLORS.length],
    }))
    .sort((a, b) => b.amount - a.amount);

  const donut = categories.length
    ? `conic-gradient(${categories
        .reduce(
          (parts, item) => {
            const start = parts.offset;
            const end = start + item.percent;
            parts.values.push(`${item.color} ${start}% ${end}%`);
            parts.offset = end;
            return parts;
          },
          { values: [] as string[], offset: 0 }
        )
        .values.join(", ")})`
    : "conic-gradient(#e8efec 0 100%)";

  const cycleStart = selected?.statementDate ? safeDate(selected.statementDate) : null;
  const cycleEnd = cycleStart ? addDays(selected!.statementDate!, 29) : null;
  const cycleTotal = selectedTransactions
    .filter((item) => item.status === "posted")
    .reduce((sum, item) => sum + Math.abs(item.amount), 0);

  if (!selected) {
    return <div className="ac-empty-state">No accounts are available.</div>;
  }

  return (
    <main className="accounts-page">
      <header className="accounts-header">
        <div>
          <h1>Accounts &amp; Cards</h1>
          <p>Manage your savings, checking accounts, and credit cards in one place.</p>
        </div>

        <div className="header-actions">
          <button type="button" onClick={onAddAccount}>＋ Add</button>
          <button type="button" onClick={onTransfer}>⇄ Transfer</button>
          <button type="button" className="primary" onClick={onQuickPay}>⚡ Quick Pay</button>
          <button type="button" aria-label="Search">⌕</button>
          <button type="button" className="notification" aria-label="Notifications">♧<span>7</span></button>
          <button type="button" aria-label="Profile">◎</button>
        </div>
      </header>

      <section className="summary-panel">
        <SummaryMetric
          label="Net Worth"
          value={peso.format(netWorth)}
          note="Assets minus liabilities"
          tone={netWorth < 0 ? "danger" : "positive"}
          chart
        />
        <SummaryMetric label="Cash (Assets)" value={peso.format(bankAssets)} note="Total in bank accounts" icon="▣" tone="positive" />
        <SummaryMetric label="Credit Used" value={peso.format(creditUsed)} note="Total credit used" icon="▤" tone="danger" />
        <SummaryMetric label="Available Credit" value={peso.format(availableCredit)} note="Total available credit" icon="◔" tone="blue" />
        <SummaryMetric label="Upcoming Due" value={peso.format(upcomingDue)} note="Due in next 30 days" icon="▦" tone="warning" />

        <div className="segmented-control" aria-label="Account filters">
          {(["all", "bank", "credit"] as const).map((filter) => (
            <button
              type="button"
              key={filter}
              className={accountFilter === filter ? "active" : ""}
              onClick={() => setAccountFilter(filter)}
            >
              {filter === "all" ? "All" : filter === "bank" ? "Bank Accounts" : "Credit Cards"}
            </button>
          ))}
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="dashboard-left">
          <section className="panel cards-panel">
            <div className="panel-header">
              <div>
                <small>Wallet</small>
                <h2>My Cards &amp; Accounts</h2>
              </div>
              <button type="button" onClick={onAddAccount}>＋ Add credit card</button>
            </div>

            <div className="carousel-shell">
              <button
                type="button"
                className="carousel-arrow left"
                onClick={() => document.querySelector(".account-carousel")?.scrollBy({ left: -240, behavior: "smooth" })}
                aria-label="Previous accounts"
              >
                ‹
              </button>

              <div className="account-carousel">
                {filteredAccounts.map((account) => (
                  <button
                    type="button"
                    key={account.id}
                    className={`account-tile ${account.id === selected.id ? "selected" : ""}`}
                    style={{ "--card-color": account.color } as React.CSSProperties}
                    onClick={() => setSelectedId(account.id)}
                  >
                    <div className="account-tile-top">
                      <span className="issuer-logo">{account.logoText ?? account.issuer.slice(0, 3)}</span>
                      <span className={`status-badge ${account.status}`}>{statusLabel(account.status)}</span>
                    </div>
                    <strong>{account.name}</strong>
                    <span>{account.maskedNumber}</span>
                    <b>{peso.format(account.balance)}</b>
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="carousel-arrow right"
                onClick={() => document.querySelector(".account-carousel")?.scrollBy({ left: 240, behavior: "smooth" })}
                aria-label="Next accounts"
              >
                ›
              </button>
            </div>

            {selected.kind === "credit" ? (
              <CreditDetails
                account={selected}
                utilization={utilization}
                onPay={() => onPayCard?.(selected)}
                onAddTransaction={() => onAddTransaction?.(selected)}
                onTransfer={onTransfer}
              />
            ) : (
              <BankDetails
                account={selected}
                onAddTransaction={() => onAddTransaction?.(selected)}
                onTransfer={onTransfer}
              />
            )}
          </section>
        </div>

        <aside className="dashboard-right">
          <section className="panel statement-panel">
            <div className="panel-header compact">
              <h2>Statement Overview</h2>
              <span className={`due-badge ${dueStatus.toLowerCase().replace(" ", "-")}`}>{dueStatus}</span>
            </div>

            {selected.kind === "credit" ? (
              <div className="statement-grid">
                <InfoCell label="Current Balance" value={peso.format(selected.balance)} />
                <InfoCell label="Payment Due" value={peso.format(selected.statementBalance ?? selected.balance)} />
                <InfoCell label="Last Statement Balance" value={peso.format(selected.statementBalance ?? 0)} />
                <InfoCell label="Minimum Due" value={peso.format(selected.minimumDue ?? 0)} />
                <div className="days-due">
                  <div className="due-ring" style={{ "--progress": `${Math.max(0, Math.min(100, (daysToDue / 30) * 100))}%` } as React.CSSProperties}>
                    <strong>{Math.max(daysToDue, 0)}</strong>
                  </div>
                  <span>days to due</span>
                  <small>{dueDate ? dateFmt.format(dueDate) : "No due date"}</small>
                </div>
              </div>
            ) : (
              <div className="statement-grid bank-summary">
                <InfoCell label="Current Balance" value={peso.format(selected.balance)} />
                <InfoCell label="Available Balance" value={peso.format(selected.availableBalance ?? selected.balance)} />
                <InfoCell label="Account Type" value={selected.accountType ?? "Bank Account"} />
                <InfoCell label="Last Transaction" value={selected.lastTransactionDate ? dateFmt.format(safeDate(selected.lastTransactionDate)!) : "—"} />
              </div>
            )}
          </section>

          <div className="right-middle-grid">
            <section className="panel spending-panel">
              <div className="panel-header compact">
                <h2>Spending by Category</h2>
                <small>This cycle</small>
              </div>

              <div className="spending-layout">
                <div className="donut-chart" style={{ background: donut }}>
                  <div>
                    <strong>{peso.format(totalSpending)}</strong>
                    <small>Total spent</small>
                  </div>
                </div>

                <div className="category-list">
                  {categories.length ? categories.map((item) => (
                    <div key={item.name} title={`${item.name}: ${peso.format(item.amount)} (${item.percent.toFixed(1)}%)`}>
                      <i style={{ background: item.color }} />
                      <span>{item.name}</span>
                      <strong>{peso.format(item.amount)}</strong>
                      <em>{item.percent.toFixed(1)}%</em>
                    </div>
                  )) : <p className="empty-copy">No posted spending for this account.</p>}
                </div>
              </div>
            </section>

            <section className="panel timeline-panel">
              <div className="panel-header compact">
                <h2>Payment Due Timeline</h2>
                <button type="button">View all</button>
              </div>

              {selected.kind === "credit" ? (
                <>
                  <div className="timeline">
                    <TimelineItem label="Statement Date" date={selected.statementDate} state="done" />
                    <TimelineItem label="Payment Processing" date={selected.processingDate} state="current" />
                    <TimelineItem label="Payment Due Date" date={selected.paymentDueDate} state={daysToDue < 0 ? "overdue" : "upcoming"} />
                    {selected.paidDate && <TimelineItem label="Payment Completed" date={selected.paidDate} state="done" />}
                  </div>
                  <div className="amount-due">▦ <strong>{peso.format(selected.statementBalance ?? selected.balance)}</strong> due</div>
                </>
              ) : (
                <div className="bank-health-copy">
                  <strong>Bank account activity</strong>
                  <p>Use this area for scheduled transfers, savings milestones, and recent cash-flow events.</p>
                </div>
              )}
            </section>
          </div>

          <section className="panel health-panel">
            <div className="panel-header compact">
              <h2>{selected.kind === "credit" ? "Account Health" : "Account Insights"}</h2>
              <button type="button">View details</button>
            </div>

            {selected.kind === "credit" ? (
              <div className="health-grid">
                <HealthItem icon="◔" label="Credit Utilization" value={utilization < 30 ? "Low" : utilization < 60 ? "Moderate" : "High"} note={`${utilization.toFixed(0)}%`} />
                <HealthItem icon="♢" label="Payment History" value="Excellent" note="On-time payments" />
                <HealthItem icon="◴" label="Credit Age" value="Good" note="2 years" />
                <HealthItem icon="▥" label="Credit Mix" value="Good" note="Well balanced" />
              </div>
            ) : (
              <div className="health-grid">
                <HealthItem icon="⌁" label="Balance Trend" value="Stable" note="Current cycle" />
                <HealthItem icon="◎" label="Savings Progress" value="On track" note="Monthly goal" />
                <HealthItem icon="↘" label="Monthly Inflow" value={peso.format(selected.balance)} note="This month" />
                <HealthItem icon="↗" label="Monthly Outflow" value={peso.format(totalSpending)} note="This month" />
              </div>
            )}
          </section>
        </aside>
      </section>

      <section className="panel history-panel">
        <div className="history-header">
          <h2>Transaction History</h2>
          <div className="history-actions">
            <div className="history-filters">
              {(["all", "purchase", "payment", "refund", "installment", "fee", "interest", "adjustment"] as const).map((filter) => (
                <button
                  type="button"
                  key={filter}
                  className={transactionFilter === filter ? "active" : ""}
                  onClick={() => setTransactionFilter(filter)}
                >
                  {filter === "all" ? "All" : statusLabel(filter)}
                </button>
              ))}
            </div>
            <button type="button" className="export-button" aria-label="Export transactions">⇩</button>
          </div>
        </div>

        <div className="cycle-summary">
          <div>
            <strong>Current Billing Cycle</strong>
            <span>{cycleStart && cycleEnd ? `${dateFmt.format(cycleStart)} – ${dateFmt.format(cycleEnd)}` : "Current account cycle"}</span>
            <small>{cycleEnd ? `Cutoff ${dateFmt.format(cycleEnd)}` : "No cutoff date"}</small>
          </div>
          <div><small>Transactions</small><strong>{selectedTransactions.length}</strong></div>
          <div><small>Cycle Total</small><strong>{peso.format(cycleTotal)}</strong></div>
        </div>

        <div className="transaction-scroll">
          <div className="transaction-grid transaction-head">
            <span>Date</span><span>Description</span><span>Type</span><span>Category</span>
            <span>Account or Card</span><span>Amount</span><span>Status</span><span>Actions</span>
          </div>

          {visibleTransactions.map((transaction) => (
            <button
              type="button"
              className="transaction-grid transaction-row"
              key={transaction.id}
              onClick={() => onViewTransaction?.(transaction)}
            >
              <span>{dateFmt.format(safeDate(transaction.date)!)}</span>
              <span className="description-cell">
                <i>{transaction.type === "purchase" ? "🛍" : transaction.type === "payment" ? "↙" : "◆"}</i>
                <span>
                  <strong>{transaction.description}</strong>
                  {transaction.installment && (
                    <small>
                      Installment {transaction.installment.current} of {transaction.installment.total} · Remaining {peso.format(transaction.installment.remainingBalance)}
                    </small>
                  )}
                </span>
              </span>
              <span><em className={`type-badge ${transaction.type}`}>{statusLabel(transaction.type)}</em></span>
              <span>{transaction.category}</span>
              <span>{selected.name} {selected.maskedNumber}</span>
              <span className={["refund", "payment"].includes(transaction.type) ? "positive-amount" : "negative-amount"}>
                {["refund", "payment"].includes(transaction.type) ? "+" : "−"}{peso.format(Math.abs(transaction.amount))}
              </span>
              <span><em className={`status-dot ${transaction.status}`}>● {statusLabel(transaction.status)}</em></span>
              <span className="row-menu">⋮</span>
            </button>
          ))}

          {!visibleTransactions.length && <div className="empty-row">No transactions match this filter.</div>}
        </div>
      </section>
    </main>
  );
}

function SummaryMetric({
  label,
  value,
  note,
  icon,
  tone = "default",
  chart = false,
}: {
  label: string;
  value: string;
  note: string;
  icon?: string;
  tone?: "default" | "positive" | "danger" | "blue" | "warning";
  chart?: boolean;
}) {
  return (
    <div className={`summary-metric ${tone}`}>
      <div className="metric-copy">
        <small>{label}</small>
        <strong>{value}</strong>
        <span>{note}</span>
      </div>
      {chart ? (
        <svg className="sparkline" viewBox="0 0 120 42" aria-hidden="true">
          <polyline points="2,34 18,27 30,31 44,19 58,24 72,14 86,18 102,7 118,11" />
        </svg>
      ) : (
        <i>{icon}</i>
      )}
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return <div className="info-cell"><small>{label}</small><strong>{value}</strong></div>;
}

function CreditDetails({
  account,
  utilization,
  onPay,
  onAddTransaction,
  onTransfer,
}: {
  account: FinanceAccount;
  utilization: number;
  onPay: () => void;
  onAddTransaction: () => void;
  onTransfer?: () => void;
}) {
  return (
    <div className="selected-detail">
      <div className="large-card" style={{ "--card-color": account.color } as React.CSSProperties}>
        <div className="large-card-brand">
          <span className="issuer-logo large">{account.logoText ?? account.issuer}</span>
          <strong>{account.issuer}</strong>
        </div>
        <h3>{account.name}</h3>
        <span>{account.maskedNumber}</span>
        <b>{peso.format(account.balance)}</b>
        <em>{account.network ?? "CREDIT"}</em>
      </div>

      <div className="detail-content">
        <div className="limit-row">
          <InfoCell label="Total Credit Limit" value={peso.format(account.creditLimit ?? 0)} />
          <InfoCell label="Available Credit" value={peso.format(Math.max((account.creditLimit ?? 0) - account.balance, 0))} />
          <div className="utilization">
            <div className="utilization-ring" style={{ "--value": `${utilization}%` } as React.CSSProperties}>
              <strong>{utilization.toFixed(0)}%</strong>
            </div>
            <small>Used</small>
          </div>
        </div>

        <div className="detail-row">
          <InfoCell label="Card Type" value="Credit Card" />
          <InfoCell label="Credit Limit" value={peso.format(account.creditLimit ?? 0)} />
          <InfoCell label="Statement Date" value={account.statementDate ? dateFmt.format(safeDate(account.statementDate)!) : "—"} />
          <InfoCell label="Payment Due Date" value={account.paymentDueDate ? dateFmt.format(safeDate(account.paymentDueDate)!) : "—"} />
        </div>

        <div className="detail-actions">
          <button type="button" className="primary" onClick={onPay}>◎ Pay Card</button>
          <button type="button" onClick={onAddTransaction}>＋ Add Transaction</button>
          <button type="button" onClick={onTransfer}>⇄ Transfer</button>
          <button type="button">••• More</button>
        </div>
      </div>
    </div>
  );
}

function BankDetails({
  account,
  onAddTransaction,
  onTransfer,
}: {
  account: FinanceAccount;
  onAddTransaction: () => void;
  onTransfer?: () => void;
}) {
  return (
    <div className="selected-detail">
      <div className="large-card bank" style={{ "--card-color": account.color } as React.CSSProperties}>
        <div className="large-card-brand">
          <span className="issuer-logo large">{account.logoText ?? account.issuer}</span>
          <strong>{account.issuer}</strong>
        </div>
        <h3>{account.name}</h3>
        <span>{account.maskedNumber}</span>
        <b>{peso.format(account.balance)}</b>
        <em>{account.accountType ?? "BANK"}</em>
      </div>

      <div className="detail-content">
        <div className="limit-row bank">
          <InfoCell label="Available Balance" value={peso.format(account.availableBalance ?? account.balance)} />
          <InfoCell label="Current Balance" value={peso.format(account.balance)} />
          <InfoCell label="Interest Rate" value={account.interestRate != null ? `${account.interestRate}%` : "—"} />
        </div>

        <div className="detail-row">
          <InfoCell label="Account Type" value={account.accountType ?? "Bank Account"} />
          <InfoCell label="Account Number" value={account.maskedNumber} />
          <InfoCell label="Bank Name" value={account.issuer} />
          <InfoCell label="Last Transaction" value={account.lastTransactionDate ? dateFmt.format(safeDate(account.lastTransactionDate)!) : "—"} />
        </div>

        <div className="detail-actions bank-actions">
          <button type="button" className="primary" onClick={onAddTransaction}>＋ Deposit</button>
          <button type="button" onClick={onTransfer}>⇄ Transfer</button>
          <button type="button">••• More</button>
        </div>
      </div>
    </div>
  );
}

function TimelineItem({
  label,
  date,
  state,
}: {
  label: string;
  date?: string;
  state: "done" | "current" | "upcoming" | "overdue";
}) {
  return (
    <div className={`timeline-item ${state}`}>
      <i />
      <span>
        <strong>{date ? dateFmt.format(safeDate(date)!) : "Not scheduled"}</strong>
        <small>{label}</small>
      </span>
      <b>{state === "done" ? "✓" : state === "current" ? "◷" : state === "overdue" ? "!" : "○"}</b>
    </div>
  );
}

function HealthItem({
  icon,
  label,
  value,
  note,
}: {
  icon: string;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="health-item">
      <i>{icon}</i>
      <span><small>{label}</small><strong>{value}</strong><em>{note}</em></span>
    </div>
  );
}
