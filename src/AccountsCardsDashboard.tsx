import { useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type {
  CardConfig,
  CardPayment,
  CardStatement,
  CardTransaction,
} from "./domain/creditCardEngine";
import {
  computeCard,
  peso,
  statementCutoffDate,
} from "./domain/creditCardEngine";

type BankAccount = {
  id: number;
  name: string;
  bank: string;
  type: string;
  balance: number;
  last4: string;
  customLogo?: string;
};

type AccountTransaction = {
  id: number;
  accountId: number;
  date: string;
  description: string;
  type: "Income" | "Expense" | "Transfer";
  category: string;
  amount: number;
  status: "Posted";
  notes?: string;
};

type DashboardFilter = "all" | "bank" | "credit";
type TransactionFilter =
  | "all"
  | "purchase"
  | "payment"
  | "refund"
  | "installment"
  | "fee"
  | "interest"
  | "adjustment";

type DashboardItem =
  | {
      key: string;
      kind: "bank";
      id: number;
      name: string;
      issuer: string;
      maskedNumber: string;
      balance: number;
      color: string;
      account: BankAccount;
    }
  | {
      key: string;
      kind: "credit";
      id: number;
      name: string;
      issuer: string;
      maskedNumber: string;
      balance: number;
      color: string;
      card: CardConfig;
    };

type Props = {
  accounts: BankAccount[];
  cards: CardConfig[];
  accountTransactions: AccountTransaction[];
  cardTransactions: CardTransaction[];
  statements: CardStatement[];
  payments: CardPayment[];
  selectedAccountId: number;
  selectedCardId: number;
  onSelectAccount: (id: number) => void;
  onSelectCard: (id: number) => void;
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

const money = (value: number, hidden = false) =>
  hidden ? "₱••••••••" : peso(Number.isFinite(value) ? value : 0);

const formatDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
};

const daysUntil = (value?: string) => {
  if (!value) return 0;
  const due = new Date(`${value}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
};

const accountColor = (index: number) =>
  ["#168a5b", "#236fa8", "#1697a4", "#415da8", "#6d63b5"][index % 5];

const transactionTypeLabel = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

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
  const [filter, setFilter] = useState<DashboardFilter>("all");
  const [transactionFilter, setTransactionFilter] =
    useState<TransactionFilter>("all");
  const carouselRef = useRef<HTMLDivElement>(null);

  const activeCards = useMemo(
    () => cards.filter((card) => card.active !== false),
    [cards],
  );

  const items = useMemo<DashboardItem[]>(
    () => [
      ...accounts.map((account, index) => ({
        key: `bank-${account.id}`,
        kind: "bank" as const,
        id: account.id,
        name: account.name,
        issuer: account.bank || account.name,
        maskedNumber: account.last4 ? `•••• ${account.last4}` : "No account number",
        balance: Number(account.balance) || 0,
        color: accountColor(index),
        account,
      })),
      ...activeCards.map((card) => {
        const computed = computeCard(card, cardTransactions, statements, payments);
        return {
          key: `credit-${card.id}`,
          kind: "credit" as const,
          id: card.id,
          name: card.name,
          issuer: card.bank || card.name,
          maskedNumber: card.last4 ? `•••• ${card.last4}` : "No card number",
          balance: Math.max(computed.currentBalance, 0),
          color: card.color || "#334155",
          card,
        };
      }),
    ],
    [accounts, activeCards, cardTransactions, statements, payments],
  );

  const visibleItems = items.filter(
    (item) => filter === "all" || item.kind === filter,
  );

  const selectedItem =
    items.find(
      (item) =>
        (item.kind === "bank" && item.id === selectedAccountId) ||
        (item.kind === "credit" && item.id === selectedCardId),
    ) ?? items[0];

  const totalAssets = accounts.reduce(
    (sum, account) => sum + (Number(account.balance) || 0),
    0,
  );

  const totalCreditUsed = activeCards.reduce((sum, card) => {
    const computed = computeCard(card, cardTransactions, statements, payments);
    return sum + Math.max(computed.currentBalance, 0);
  }, 0);

  const totalAvailableCredit = activeCards.reduce((sum, card) => {
    const computed = computeCard(card, cardTransactions, statements, payments);
    return sum + Math.max(computed.availableCredit, 0);
  }, 0);

  const upcomingDue = activeCards.reduce((sum, card) => {
    const computed = computeCard(card, cardTransactions, statements, payments);
    const due = computed.lastStatement?.dueDate ?? computed.nextDueDate;
    const days = daysUntil(due);
    if (days < 0 || days > 30) return sum;
    return sum + (computed.lastStatement?.remainingDue ?? computed.plannedPayment ?? 0);
  }, 0);

  const netWorth = totalAssets - totalCreditUsed;

  if (!selectedItem) {
    return (
      <section className="ac-dashboard ac-empty">
        Add a bank account or credit card to begin.
      </section>
    );
  }

  const selectedCardComputed =
    selectedItem.kind === "credit"
      ? computeCard(
          selectedItem.card,
          cardTransactions,
          statements,
          payments,
        )
      : null;

  const selectedCardStatement = selectedCardComputed?.lastStatement;
  const selectedDueDate =
    selectedCardStatement?.dueDate ?? selectedCardComputed?.nextDueDate;
  const selectedDaysToDue = daysUntil(selectedDueDate);
  const selectedUtilization = selectedCardComputed?.utilization ?? 0;

  const selectedTransactions =
    selectedItem.kind === "bank"
      ? accountTransactions
          .filter((transaction) => transaction.accountId === selectedItem.id)
          .map((transaction) => ({
            id: `bank-${transaction.id}`,
            date: transaction.date,
            description: transaction.description,
            type:
              transaction.type === "Expense"
                ? "purchase"
                : transaction.type === "Income"
                  ? "adjustment"
                  : "adjustment",
            category: transaction.category || transaction.type,
            amount: transaction.amount,
            status: transaction.status.toLowerCase(),
            raw: transaction,
          }))
      : cardTransactions
          .filter((transaction) => transaction.cardId === selectedItem.id)
          .map((transaction) => ({
            id: `card-${transaction.id}`,
            date: transaction.postedDate || transaction.transactionDate,
            description: transaction.description,
            type:
              transaction.type === "credit"
                ? "adjustment"
                : transaction.type,
            category: transaction.category || "Uncategorized",
            amount: transaction.amount,
            status: transaction.status,
            raw: transaction,
          }));

  const filteredTransactions = selectedTransactions.filter(
    (transaction) =>
      transactionFilter === "all" || transaction.type === transactionFilter,
  );

  const eligibleSpending = selectedTransactions.filter(
    (transaction) =>
      transaction.status === "posted" &&
      ["purchase", "installment", "fee", "interest"].includes(transaction.type),
  );

  const categoryMap = eligibleSpending.reduce<Record<string, number>>(
    (result, transaction) => {
      result[transaction.category] =
        (result[transaction.category] ?? 0) + Math.abs(transaction.amount);
      return result;
    },
    {},
  );

  const categoryTotal = Object.values(categoryMap).reduce(
    (sum, value) => sum + value,
    0,
  );

  const chartColors = [
    "#28a46f",
    "#6d9ed8",
    "#efad43",
    "#e96c67",
    "#9478ce",
    "#35b6c6",
  ];

  const categories = Object.entries(categoryMap)
    .sort(([, a], [, b]) => b - a)
    .map(([name, amount], index) => ({
      name,
      amount,
      percentage: categoryTotal ? (amount / categoryTotal) * 100 : 0,
      color: chartColors[index % chartColors.length],
    }));

  let runningPercentage = 0;
  const donutBackground = categories.length
    ? `conic-gradient(${categories
        .map((category) => {
          const start = runningPercentage;
          runningPercentage += category.percentage;
          return `${category.color} ${start}% ${runningPercentage}%`;
        })
        .join(", ")})`
    : "conic-gradient(#e6ece9 0 100%)";

  const cycleStart =
    selectedItem.kind === "credit" && selectedCardComputed
      ? selectedCardComputed.currentCycleStart
      : selectedTransactions.at(-1)?.date;
  const cycleEnd =
    selectedItem.kind === "credit" && selectedCardComputed
      ? statementCutoffDate(selectedCardComputed.nextStatementDate)
      : selectedTransactions[0]?.date;
  const cycleTotal = selectedTransactions.reduce(
    (sum, transaction) => sum + Math.abs(transaction.amount),
    0,
  );

  const selectItem = (item: DashboardItem) => {
    if (item.kind === "bank") onSelectAccount(item.id);
    else onSelectCard(item.id);
  };

  const scrollCarousel = (direction: -1 | 1) =>
    carouselRef.current?.scrollBy({
      left: direction * 260,
      behavior: "smooth",
    });

  return (
    <section className="ac-dashboard">
      <div className="ac-summary-strip">
        <SummaryBlock
          title="Net Worth"
          value={money(netWorth, hideBalances)}
          note="Assets minus liabilities"
          tone={netWorth < 0 ? "negative" : "positive"}
          chart
        />
        <SummaryBlock
          title="Cash (Assets)"
          value={money(totalAssets, hideBalances)}
          note="Total in bank accounts"
          tone="positive"
          icon="▣"
        />
        <SummaryBlock
          title="Credit Used"
          value={money(totalCreditUsed, hideBalances)}
          note="Total credit used"
          tone="negative"
          icon="▤"
        />
        <SummaryBlock
          title="Available Credit"
          value={money(totalAvailableCredit, hideBalances)}
          note="Total available credit"
          tone="blue"
          icon="◔"
        />
        <SummaryBlock
          title="Upcoming Due"
          value={money(upcomingDue, hideBalances)}
          note="Due in next 30 days"
          tone="warning"
          icon="▦"
        />

        <div className="ac-view-filter">
          {(["all", "bank", "credit"] as DashboardFilter[]).map((value) => (
            <button
              key={value}
              type="button"
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
            >
              {value === "all"
                ? "All"
                : value === "bank"
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
              <h3>My Cards &amp; Accounts</h3>
            </div>

            <button
              type="button"
              onClick={
                selectedItem.kind === "bank"
                  ? onAddBankAccount
                  : onAddCreditCard
              }
            >
              ＋ Add {selectedItem.kind === "bank" ? "bank account" : "credit card"}
            </button>
          </div>

          <div className="ac-carousel-wrap">
            <button
              className="ac-carousel-arrow previous"
              type="button"
              onClick={() => scrollCarousel(-1)}
              aria-label="Previous"
            >
              ‹
            </button>

            <div className="ac-card-carousel" ref={carouselRef}>
              {visibleItems.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  className={`ac-mini-card ${item.kind} ${
                    item.key === selectedItem.key ? "selected" : ""
                  }`}
                  style={{ "--ac-card-color": item.color } as CSSProperties}
                  onClick={() => selectItem(item)}
                >
                  <div>
                    <i>{item.issuer.slice(0, 4).toUpperCase()}</i>
                    <em>{item.kind === "bank" ? "Active" : "Upcoming"}</em>
                  </div>
                  <b>{item.name}</b>
                  <span>{item.maskedNumber}</span>
                  <strong>{money(item.balance, hideBalances)}</strong>
                </button>
              ))}
            </div>

            <button
              className="ac-carousel-arrow next"
              type="button"
              onClick={() => scrollCarousel(1)}
              aria-label="Next"
            >
              ›
            </button>
          </div>

          {selectedItem.kind === "credit" && selectedCardComputed ? (
            <div className="ac-selected-detail">
              <div
                className="ac-large-credit-card"
                style={
                  {
                    "--ac-card-color": selectedItem.color,
                  } as CSSProperties
                }
              >
                <div>
                  <i>{selectedItem.issuer.slice(0, 4).toUpperCase()}</i>
                  <span>
                    <strong>{selectedItem.issuer}</strong>
                    <small>{selectedItem.name}</small>
                  </span>
                </div>
                <em>{selectedItem.maskedNumber}</em>
                <strong>{money(selectedItem.balance, hideBalances)}</strong>
                <b>
                  {/mastercard/i.test(selectedItem.name)
                    ? "MASTERCARD"
                    : /amex|american express/i.test(selectedItem.name)
                      ? "AMEX"
                      : "VISA"}
                </b>
              </div>

              <div className="ac-detail-content">
                <div className="ac-credit-limit-strip">
                  <Metric
                    title="Total Credit Limit"
                    value={money(selectedItem.card.creditLimit, hideBalances)}
                  />
                  <Metric
                    title="Available Credit"
                    value={money(
                      selectedCardComputed.availableCredit,
                      hideBalances,
                    )}
                  />
                  <div className="ac-gauge">
                    <span
                      style={
                        {
                          "--value": Math.min(
                            Math.max(selectedUtilization, 0),
                            100,
                          ),
                        } as CSSProperties
                      }
                    >
                      <strong>{selectedUtilization.toFixed(0)}%</strong>
                    </span>
                    <small>Used</small>
                  </div>
                </div>

                <div className="ac-detail-summary compact">
                  <Metric title="Card Type" value="Credit Card" />
                  <Metric
                    title="Statement Date"
                    value={formatDate(
                      selectedCardStatement?.statementDate ??
                        selectedCardComputed.nextStatementDate,
                    )}
                  />
                  <Metric
                    title="Payment Due Date"
                    value={formatDate(selectedDueDate)}
                  />
                  <Metric
                    title="Minimum Due"
                    value={money(
                      selectedCardStatement?.minimumDue ?? 0,
                      hideBalances,
                    )}
                  />
                </div>

                <div className="ac-detail-actions">
                  <button className="primary" type="button" onClick={onPayCard}>
                    ◎ Pay Card
                  </button>
                  <button type="button" onClick={onAddCardTransaction}>
                    ＋ Add Transaction
                  </button>
                  <button type="button" onClick={onTransfer}>
                    ⇄ Transfer
                  </button>
                  <button type="button" onClick={onEditCard}>
                    ••• More
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="ac-selected-detail">
              <div
                className="ac-large-bank-card"
                style={
                  {
                    "--ac-card-color": selectedItem.color,
                  } as CSSProperties
                }
              >
                <div>
                  <i>{selectedItem.issuer.slice(0, 4).toUpperCase()}</i>
                  <span>
                    <strong>{selectedItem.issuer}</strong>
                    <small>{selectedItem.name}</small>
                  </span>
                </div>
                <em>{selectedItem.maskedNumber}</em>
                <strong>{money(selectedItem.balance, hideBalances)}</strong>
                <b>{selectedItem.account.type || "BANK"}</b>
              </div>

              <div className="ac-detail-content">
                <div className="ac-detail-summary">
                  <Metric
                    title="Available Balance"
                    value={money(selectedItem.balance, hideBalances)}
                  />
                  <Metric
                    title="Current Balance"
                    value={money(selectedItem.balance, hideBalances)}
                  />
                  <Metric
                    title="Account Type"
                    value={selectedItem.account.type || "Bank Account"}
                  />
                  <Metric
                    title="Bank"
                    value={selectedItem.account.bank || selectedItem.name}
                  />
                </div>

                <div className="ac-detail-summary compact">
                  <Metric
                    title="Account Number"
                    value={selectedItem.maskedNumber}
                  />
                  <Metric
                    title="Last Transaction"
                    value={formatDate(selectedTransactions[0]?.date)}
                  />
                  <Metric title="Interest Rate" value="—" />
                  <Metric title="Status" value="Active" />
                </div>

                <div className="ac-detail-actions">
                  <button
                    className="primary"
                    type="button"
                    onClick={onAddAccountTransaction}
                  >
                    ＋ Deposit
                  </button>
                  <button type="button" onClick={onTransfer}>
                    ⇄ Transfer
                  </button>
                  <button type="button" onClick={onViewAccountStatement}>
                    ▤ Statement
                  </button>
                  <button type="button" onClick={onEditAccount}>
                    ••• More
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="ac-insights-panel">
          <section className="ac-insight-card statement">
            <div className="ac-insight-title">
              <h3>Statement Overview</h3>
              {selectedItem.kind === "credit" && (
                <button type="button" onClick={onViewCardStatement}>
                  View Statement
                </button>
              )}
            </div>

            {selectedItem.kind === "credit" && selectedCardComputed ? (
              <div className="ac-statement-grid">
                <Metric
                  title="Current Balance"
                  value={money(
                    selectedCardComputed.currentBalance,
                    hideBalances,
                  )}
                />
                <Metric
                  title="Payment Due"
                  value={money(
                    selectedCardStatement?.remainingDue ??
                      selectedCardComputed.plannedPayment,
                    hideBalances,
                  )}
                />
                <Metric
                  title="Last Statement Balance"
                  value={money(
                    selectedCardStatement?.statementBalance ?? 0,
                    hideBalances,
                  )}
                />
                <Metric
                  title="Minimum Due"
                  value={money(
                    selectedCardStatement?.minimumDue ?? 0,
                    hideBalances,
                  )}
                />
                <div className="ac-days-due">
                  <span>
                    <b>{Math.max(selectedDaysToDue, 0)}</b>
                    <em>days</em>
                  </span>
                  <small>to due</small>
                  <strong>{formatDate(selectedDueDate)}</strong>
                </div>
              </div>
            ) : (
              <div className="ac-bank-kpis">
                <SummaryBlock
                  title="Current Balance"
                  value={money(selectedItem.balance, hideBalances)}
                  note="Available today"
                  tone="positive"
                  icon="▣"
                />
                <SummaryBlock
                  title="Recent Activity"
                  value={`${selectedTransactions.length} transactions`}
                  note="Selected account"
                  tone="blue"
                  icon="◴"
                />
              </div>
            )}
          </section>

          <section className="ac-insight-card spending">
            <div className="ac-insight-title">
              <h3>Spending by Category</h3>
              <small>This cycle</small>
            </div>
            <div className="ac-spending-body">
              <div className="ac-donut" style={{ background: donutBackground }}>
                <span>
                  <strong>{money(categoryTotal, hideBalances)}</strong>
                  <small>Total spent</small>
                </span>
              </div>

              <div className="ac-spending-list">
                {categories.length ? (
                  categories.map((category) => (
                    <div key={category.name}>
                      <i style={{ background: category.color }} />
                      <span>{category.name}</span>
                      <strong>{money(category.amount, hideBalances)}</strong>
                      <em>{category.percentage.toFixed(1)}%</em>
                    </div>
                  ))
                ) : (
                  <div className="ac-empty">No spending for this cycle.</div>
                )}
              </div>
            </div>
          </section>

          <section className="ac-insight-card timeline">
            <div className="ac-insight-title">
              <h3>Payment Due Timeline</h3>
              <button
                type="button"
                onClick={
                  selectedItem.kind === "credit"
                    ? onViewCardStatement
                    : onViewAccountStatement
                }
              >
                View All
              </button>
            </div>

            {selectedItem.kind === "credit" && selectedCardComputed ? (
              <>
                <div className="ac-timeline">
                  <TimelineRow
                    date={
                      selectedCardStatement?.statementDate ??
                      selectedCardComputed.nextStatementDate
                    }
                    label="Statement Date"
                    state="done"
                  />
                  <TimelineRow
                    date={selectedDueDate}
                    label="Payment Processing"
                    state="current"
                  />
                  <TimelineRow
                    date={selectedDueDate}
                    label="Payment Due Date"
                    state={selectedDaysToDue < 0 ? "overdue" : "upcoming"}
                  />
                </div>
                <div className="ac-due-alert">
                  ▦
                  <strong>
                    {money(
                      selectedCardStatement?.remainingDue ??
                        selectedCardComputed.plannedPayment,
                      hideBalances,
                    )}
                  </strong>
                  <span>amount due</span>
                </div>
              </>
            ) : (
              <div className="ac-timeline">
                {selectedTransactions.slice(0, 3).map((transaction) => (
                  <TimelineRow
                    key={transaction.id}
                    date={transaction.date}
                    label={transaction.description}
                    state="done"
                  />
                ))}
              </div>
            )}
          </section>

          <section className="ac-insight-card health">
            <div className="ac-insight-title">
              <h3>
                {selectedItem.kind === "credit"
                  ? "Account Health"
                  : "Account Insights"}
              </h3>
              <button
                type="button"
                onClick={
                  selectedItem.kind === "credit"
                    ? onViewCardStatement
                    : onViewAccountStatement
                }
              >
                View Details
              </button>
            </div>

            <div className="ac-health-grid">
              {selectedItem.kind === "credit" ? (
                <>
                  <Health
                    icon="◔"
                    title="Credit Utilization"
                    value={
                      selectedUtilization < 30
                        ? "Low"
                        : selectedUtilization < 60
                          ? "Moderate"
                          : "High"
                    }
                    note={`${selectedUtilization.toFixed(0)}%`}
                  />
                  <Health
                    icon="♢"
                    title="Payment History"
                    value="Excellent"
                    note="On-time payments"
                  />
                  <Health
                    icon="◴"
                    title="Credit Age"
                    value="Good"
                    note="Account age"
                  />
                  <Health
                    icon="▥"
                    title="Credit Mix"
                    value="Good"
                    note="Well balanced"
                  />
                </>
              ) : (
                <>
                  <Health
                    icon="⌁"
                    title="Balance Trend"
                    value="Stable"
                    note="Current period"
                  />
                  <Health
                    icon="◎"
                    title="Savings Progress"
                    value="On Track"
                    note="Monthly goal"
                  />
                  <Health
                    icon="↘"
                    title="Monthly Inflow"
                    value={money(
                      selectedTransactions
                        .filter((item) => item.raw.type === "Income")
                        .reduce((sum, item) => sum + item.amount, 0),
                      hideBalances,
                    )}
                    note="This month"
                  />
                  <Health
                    icon="↗"
                    title="Monthly Outflow"
                    value={money(categoryTotal, hideBalances)}
                    note="This month"
                  />
                </>
              )}
            </div>
          </section>
        </aside>
      </div>

      <section className="ac-history">
        <div className="ac-history-title">
          <h3>Transaction History</h3>
          <div className="ac-history-filters">
            {(
              [
                "all",
                "purchase",
                "payment",
                "refund",
                "installment",
                "fee",
                "interest",
                "adjustment",
              ] as TransactionFilter[]
            ).map((value) => (
              <button
                key={value}
                type="button"
                className={transactionFilter === value ? "active" : ""}
                onClick={() => setTransactionFilter(value)}
              >
                {value === "all" ? "All" : transactionTypeLabel(value)}
              </button>
            ))}
          </div>
        </div>

        <div className="ac-cycle-summary">
          <div>
            <strong>Current Billing Cycle</strong>
            <span>
              {cycleStart && cycleEnd
                ? `${formatDate(cycleStart)} – ${formatDate(cycleEnd)}`
                : "Selected account activity"}
            </span>
            <small>{cycleEnd ? `Cutoff ${formatDate(cycleEnd)}` : "No cutoff"}</small>
          </div>
          <div>
            <small>Transactions</small>
            <strong>{selectedTransactions.length}</strong>
          </div>
          <div>
            <small>Cycle Total</small>
            <strong>{money(cycleTotal, hideBalances)}</strong>
          </div>
        </div>

        <div className="ac-history-table-wrap">
          <div className="ac-history-head credit">
            <span>Date</span>
            <span>Description</span>
            <span>Type</span>
            <span>Category</span>
            <span>Account or Card</span>
            <span>Amount</span>
            <span>Status</span>
            <span>Actions</span>
          </div>

          {filteredTransactions.map((transaction) => (
            <div className="ac-history-row credit" key={transaction.id}>
              <span>{formatDate(transaction.date)}</span>
              <span>
                <i>{transaction.type === "purchase" ? "🛍" : "◆"}</i>
                <strong>{transaction.description}</strong>
              </span>
              <em>{transactionTypeLabel(transaction.type)}</em>
              <span>{transaction.category}</span>
              <span>
                {selectedItem.name} {selectedItem.maskedNumber}
              </span>
              <strong
                className={
                  ["payment", "refund"].includes(transaction.type)
                    ? "positive"
                    : ""
                }
              >
                {["payment", "refund"].includes(transaction.type) ? "+" : "−"}
                {money(Math.abs(transaction.amount), hideBalances)}
              </strong>
              <span className="positive">
                ● {transactionTypeLabel(transaction.status)}
              </span>
              <button
                type="button"
                className="ac-row-action"
                aria-label="Transaction actions"
              >
                ⋮
              </button>
            </div>
          ))}

          {!filteredTransactions.length && (
            <div className="ac-empty">No transactions match this filter.</div>
          )}
        </div>
      </section>
    </section>
  );
}

function SummaryBlock({
  title,
  value,
  note,
  tone,
  icon,
  chart = false,
}: {
  title: string;
  value: string;
  note: string;
  tone: "positive" | "negative" | "blue" | "warning";
  icon?: string;
  chart?: boolean;
}) {
  return (
    <div className={`ac-summary-metric ${tone}`}>
      <span>
        <small>{title}</small>
        <strong>{value}</strong>
        <em>{note}</em>
      </span>
      {chart ? (
        <svg className="ac-summary-sparkline" viewBox="0 0 120 42">
          <polyline points="2,34 18,26 31,30 45,18 58,23 72,13 87,17 102,7 118,11" />
        </svg>
      ) : (
        <i>{icon}</i>
      )}
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="ac-metric">
      <small>{title}</small>
      <strong>{value}</strong>
    </div>
  );
}

function TimelineRow({
  date,
  label,
  state,
}: {
  date?: string;
  label: string;
  state: "done" | "current" | "upcoming" | "overdue";
}) {
  return (
    <div className={state}>
      <i />
      <span>
        <strong>{formatDate(date)}</strong>
        <small>{label}</small>
      </span>
      <b>
        {state === "done"
          ? "✓"
          : state === "current"
            ? "◷"
            : state === "overdue"
              ? "!"
              : "○"}
      </b>
    </div>
  );
}

function Health({
  icon,
  title,
  value,
  note,
}: {
  icon: string;
  title: string;
  value: string;
  note: string;
}) {
  return (
    <div className="ac-health-item">
      <i>{icon}</i>
      <span>
        <small>{title}</small>
        <b>{value}</b>
        <em>{note}</em>
      </span>
    </div>
  );
}
