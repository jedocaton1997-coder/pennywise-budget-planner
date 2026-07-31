import { useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type {
  CardConfig,
  CardPayment,
  CardStatement,
  CardTransaction,
} from "./domain/creditCardEngine";
import { computeCard, peso, statementCutoffDate } from "./domain/creditCardEngine";

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

type ViewFilter = "all" | "bank" | "credit";
type TxFilter = "all" | "purchase" | "payment" | "refund" | "installment" | "fee" | "interest" | "adjustment";

const money = (value: number, hidden = false) =>
  hidden ? "₱••••••••" : peso(Number.isFinite(value) ? value : 0);

const prettyDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const daysUntil = (value?: string) => {
  if (!value) return 0;
  const due = new Date(`${value}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
};

const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const bankColors = ["#168a5b", "#236fa8", "#1697a4", "#415da8", "#6d63b5"];

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
  const [view, setView] = useState<ViewFilter>("all");
  const [txFilter, setTxFilter] = useState<TxFilter>("all");
  const [selectedKind, setSelectedKind] = useState<"bank" | "credit">(
    cards.some((card) => card.id === selectedCardId) ? "credit" : "bank",
  );
  const carouselRef = useRef<HTMLDivElement>(null);

  const activeCards = useMemo(() => cards.filter((card) => card.active !== false), [cards]);
  const selectedBank = accounts.find((account) => account.id === selectedAccountId) ?? accounts[0];
  const selectedCard = activeCards.find((card) => card.id === selectedCardId) ?? activeCards[0];
  const selectedComputed = selectedCard
    ? computeCard(selectedCard, cardTransactions, statements, payments)
    : null;

  const totalAssets = accounts.reduce((sum, account) => sum + (Number(account.balance) || 0), 0);
  const totalCreditUsed = activeCards.reduce(
    (sum, card) => sum + Math.max(computeCard(card, cardTransactions, statements, payments).currentBalance, 0),
    0,
  );
  const totalAvailableCredit = activeCards.reduce(
    (sum, card) => sum + computeCard(card, cardTransactions, statements, payments).availableCredit,
    0,
  );
  const upcomingDue = activeCards.reduce((sum, card) => {
    const computed = computeCard(card, cardTransactions, statements, payments);
    const due = computed.lastStatement?.dueDate ?? computed.nextDueDate;
    const days = daysUntil(due);
    return days >= 0 && days <= 30
      ? sum + (computed.lastStatement?.remainingDue ?? computed.plannedPayment)
      : sum;
  }, 0);
  const netWorth = totalAssets - totalCreditUsed;

  const isCredit = selectedKind === "credit" && Boolean(selectedCard && selectedComputed);
  const currentName = isCredit ? selectedCard!.name : selectedBank?.name ?? "Bank Account";
  const currentMasked = isCredit
    ? selectedCard!.last4
      ? `•••• ${selectedCard!.last4}`
      : "No card number"
    : selectedBank?.last4
      ? `•••• ${selectedBank.last4}`
      : "No account number";
  const currentBalance = isCredit
    ? Math.max(selectedComputed!.currentBalance, 0)
    : Number(selectedBank?.balance ?? 0);

  const bankTx = selectedBank
    ? accountTransactions
        .filter((tx) => tx.accountId === selectedBank.id)
        .map((tx) => ({
          id: `bank-${tx.id}`,
          date: tx.date,
          description: tx.description,
          type: tx.type === "Expense" ? "purchase" : "adjustment",
          category: tx.category || tx.type,
          amount: tx.amount,
          status: tx.status.toLowerCase(),
        }))
    : [];

  const creditTx = selectedCard
    ? cardTransactions
        .filter((tx) => tx.cardId === selectedCard.id)
        .map((tx) => ({
          id: `card-${tx.id}`,
          date: tx.postedDate || tx.transactionDate,
          description: tx.description,
          type: tx.type === "credit" ? "adjustment" : tx.type,
          category: tx.category || "Uncategorized",
          amount: tx.amount,
          status: tx.status,
        }))
    : [];

  const currentTransactions = isCredit ? creditTx : bankTx;
  const visibleTransactions = currentTransactions.filter(
    (tx) => txFilter === "all" || tx.type === txFilter,
  );

  const categoryTotals = currentTransactions
    .filter((tx) => tx.status === "posted" && ["purchase", "installment", "fee", "interest"].includes(tx.type))
    .reduce<Record<string, number>>((result, tx) => {
      result[tx.category] = (result[tx.category] ?? 0) + Math.abs(tx.amount);
      return result;
    }, {});
  const totalSpent = Object.values(categoryTotals).reduce((sum, value) => sum + value, 0);
  const colors = ["#28a46f", "#6d9ed8", "#efad43", "#e96c67", "#9478ce"];
  const categories = Object.entries(categoryTotals).map(([name, amount], index) => ({
    name,
    amount,
    percentage: totalSpent ? (amount / totalSpent) * 100 : 0,
    color: colors[index % colors.length],
  }));
  let offset = 0;
  const donut = categories.length
    ? `conic-gradient(${categories.map((item) => {
        const start = offset;
        offset += item.percentage;
        return `${item.color} ${start}% ${offset}%`;
      }).join(",")})`
    : "conic-gradient(#e6ece9 0 100%)";

  const statement = selectedComputed?.lastStatement;
  const dueDate = statement?.dueDate ?? selectedComputed?.nextDueDate;
  const cycleStart = isCredit ? selectedComputed?.currentCycleStart : currentTransactions[currentTransactions.length - 1]?.date;
  const cycleEnd = isCredit && selectedComputed
    ? statementCutoffDate(selectedComputed.nextStatementDate)
    : currentTransactions[0]?.date;
  const cycleTotal = currentTransactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const chooseBank = (id: number) => {
    setSelectedKind("bank");
    onSelectAccount(id);
  };
  const chooseCard = (id: number) => {
    setSelectedKind("credit");
    onSelectCard(id);
  };

  if (!selectedBank && !selectedCard) {
    return <section className="ac-dashboard ac-empty">Add a bank account or credit card to begin.</section>;
  }

  return (
    <section className="ac-dashboard">
      <div className="ac-summary-strip">
        <Summary title="Net Worth" value={money(netWorth, hideBalances)} note="Assets minus liabilities" tone={netWorth < 0 ? "negative" : "positive"} chart />
        <Summary title="Cash (Assets)" value={money(totalAssets, hideBalances)} note="Total in bank accounts" tone="positive" icon="▣" />
        <Summary title="Credit Used" value={money(totalCreditUsed, hideBalances)} note="Total credit used" tone="negative" icon="▤" />
        <Summary title="Available Credit" value={money(totalAvailableCredit, hideBalances)} note="Total available credit" tone="blue" icon="◔" />
        <Summary title="Upcoming Due" value={money(upcomingDue, hideBalances)} note="Due in next 30 days" tone="warning" icon="▦" />
        <div className="ac-view-filter">
          {(["all", "bank", "credit"] as ViewFilter[]).map((item) => (
            <button type="button" key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>
              {item === "all" ? "All" : item === "bank" ? "Bank Accounts" : "Credit Cards"}
            </button>
          ))}
        </div>
      </div>

      <div className="ac-main-grid">
        <section className="ac-wallet-panel">
          <div className="ac-section-title">
            <div><small>Wallet</small><h3>My Cards &amp; Accounts</h3></div>
            <button type="button" onClick={isCredit ? onAddCreditCard : onAddBankAccount}>＋ Add {isCredit ? "credit card" : "bank account"}</button>
          </div>

          <div className="ac-carousel-wrap">
            <button type="button" className="ac-carousel-arrow previous" onClick={() => carouselRef.current?.scrollBy({ left: -260, behavior: "smooth" })}>‹</button>
            <div className="ac-card-carousel" ref={carouselRef}>
              {(view === "credit" ? [] : accounts).map((account, index) => (
                <button
                  type="button"
                  key={`bank-${account.id}`}
                  className={`ac-mini-card bank ${!isCredit && selectedBank?.id === account.id ? "selected" : ""}`}
                  style={{ "--ac-card-color": bankColors[index % bankColors.length] } as CSSProperties}
                  onClick={() => chooseBank(account.id)}
                >
                  <div><i>{(account.bank || account.name).slice(0, 4).toUpperCase()}</i><em>Active</em></div>
                  <b>{account.name}</b><span>{account.last4 ? `•••• ${account.last4}` : "No account number"}</span><strong>{money(account.balance, hideBalances)}</strong>
                </button>
              ))}
              {(view === "bank" ? [] : activeCards).map((card) => {
                const computed = computeCard(card, cardTransactions, statements, payments);
                return (
                  <button
                    type="button"
                    key={`card-${card.id}`}
                    className={`ac-mini-card credit ${isCredit && selectedCard?.id === card.id ? "selected" : ""}`}
                    style={{ "--ac-card-color": card.color || "#334155" } as CSSProperties}
                    onClick={() => chooseCard(card.id)}
                  >
                    <div><i>{(card.bank || card.name).slice(0, 4).toUpperCase()}</i><em>Upcoming</em></div>
                    <b>{card.name}</b><span>{card.last4 ? `•••• ${card.last4}` : "No card number"}</span><strong>{money(Math.max(computed.currentBalance, 0), hideBalances)}</strong>
                  </button>
                );
              })}
            </div>
            <button type="button" className="ac-carousel-arrow next" onClick={() => carouselRef.current?.scrollBy({ left: 260, behavior: "smooth" })}>›</button>
          </div>

          <div className="ac-selected-detail">
            <div className={isCredit ? "ac-large-credit-card" : "ac-large-bank-card"} style={{ "--ac-card-color": isCredit ? selectedCard?.color || "#334155" : "#168a5b" } as CSSProperties}>
              <div><i>{(isCredit ? selectedCard?.bank : selectedBank?.bank)?.slice(0, 4).toUpperCase()}</i><span><strong>{isCredit ? selectedCard?.bank : selectedBank?.bank}</strong><small>{currentName}</small></span></div>
              <em>{currentMasked}</em><strong>{money(currentBalance, hideBalances)}</strong><b>{isCredit ? "VISA" : selectedBank?.type || "BANK"}</b>
            </div>
            <div className="ac-detail-content">
              <div className="ac-detail-summary">
                {isCredit && selectedComputed && selectedCard ? (
                  <>
                    <Metric title="Credit Limit" value={money(selectedCard.creditLimit, hideBalances)} />
                    <Metric title="Available Credit" value={money(selectedComputed.availableCredit, hideBalances)} />
                    <Metric title="Statement Date" value={prettyDate(statement?.statementDate ?? selectedComputed.nextStatementDate)} />
                    <Metric title="Payment Due Date" value={prettyDate(dueDate)} />
                  </>
                ) : (
                  <>
                    <Metric title="Available Balance" value={money(selectedBank?.balance ?? 0, hideBalances)} />
                    <Metric title="Current Balance" value={money(selectedBank?.balance ?? 0, hideBalances)} />
                    <Metric title="Account Type" value={selectedBank?.type || "Bank Account"} />
                    <Metric title="Bank" value={selectedBank?.bank || selectedBank?.name || "—"} />
                  </>
                )}
              </div>
              <div className="ac-detail-actions">
                <button type="button" className="primary" onClick={isCredit ? onPayCard : onAddAccountTransaction}>{isCredit ? "◎ Pay Card" : "＋ Deposit"}</button>
                <button type="button" onClick={isCredit ? onAddCardTransaction : onAddAccountTransaction}>＋ Add Transaction</button>
                <button type="button" onClick={onTransfer}>⇄ Transfer</button>
                <button type="button" onClick={isCredit ? onEditCard : onEditAccount}>••• More</button>
              </div>
            </div>
          </div>
        </section>

        <aside className="ac-insights-panel">
          <section className="ac-insight-card statement">
            <div className="ac-insight-title"><h3>Statement Overview</h3><button type="button" onClick={isCredit ? onViewCardStatement : onViewAccountStatement}>View Details</button></div>
            <div className="ac-statement-grid">
              <Metric title="Current Balance" value={money(currentBalance, hideBalances)} />
              <Metric title={isCredit ? "Payment Due" : "Available Balance"} value={money(isCredit ? statement?.remainingDue ?? selectedComputed?.plannedPayment ?? 0 : selectedBank?.balance ?? 0, hideBalances)} />
              <Metric title={isCredit ? "Last Statement Balance" : "Account Type"} value={isCredit ? money(statement?.statementBalance ?? 0, hideBalances) : selectedBank?.type || "Bank Account"} />
              <Metric title={isCredit ? "Minimum Due" : "Recent Transactions"} value={isCredit ? money(statement?.minimumDue ?? 0, hideBalances) : String(bankTx.length)} />
              {isCredit && <div className="ac-days-due"><span><b>{Math.max(daysUntil(dueDate), 0)}</b><em>days</em></span><small>to due</small><strong>{prettyDate(dueDate)}</strong></div>}
            </div>
          </section>

          <section className="ac-insight-card spending">
            <div className="ac-insight-title"><h3>Spending by Category</h3><small>This cycle</small></div>
            <div className="ac-spending-body">
              <div className="ac-donut" style={{ background: donut }}><span><strong>{money(totalSpent, hideBalances)}</strong><small>Total spent</small></span></div>
              <div className="ac-spending-list">
                {categories.length ? categories.map((item) => <div key={item.name}><i style={{ background: item.color }} /><span>{item.name}</span><strong>{money(item.amount, hideBalances)}</strong><em>{item.percentage.toFixed(1)}%</em></div>) : <div className="ac-empty">No spending for this cycle.</div>}
              </div>
            </div>
          </section>

          <section className="ac-insight-card timeline">
            <div className="ac-insight-title"><h3>{isCredit ? "Payment Due Timeline" : "Recent Activity"}</h3><button type="button" onClick={isCredit ? onViewCardStatement : onViewAccountStatement}>View All</button></div>
            <div className="ac-timeline">
              {isCredit ? (
                <>
                  <Timeline date={statement?.statementDate ?? selectedComputed?.nextStatementDate} text="Statement Date" state="done" />
                  <Timeline date={dueDate} text="Payment Processing" state="current" />
                  <Timeline date={dueDate} text="Payment Due Date" state={daysUntil(dueDate) < 0 ? "overdue" : "upcoming"} />
                </>
              ) : bankTx.slice(0, 3).map((tx) => <Timeline key={tx.id} date={tx.date} text={tx.description} state="done" />)}
            </div>
          </section>

          <section className="ac-insight-card health">
            <div className="ac-insight-title"><h3>{isCredit ? "Account Health" : "Account Insights"}</h3><button type="button" onClick={isCredit ? onViewCardStatement : onViewAccountStatement}>View Details</button></div>
            <div className="ac-health-grid">
              <Health title={isCredit ? "Credit Utilization" : "Balance Trend"} value={isCredit ? `${(selectedComputed?.utilization ?? 0).toFixed(0)}%` : "Stable"} note={isCredit ? "Current usage" : "Current period"} />
              <Health title={isCredit ? "Payment History" : "Savings Progress"} value={isCredit ? "Excellent" : "On Track"} note={isCredit ? "On-time payments" : "Monthly goal"} />
              <Health title={isCredit ? "Credit Age" : "Monthly Inflow"} value={isCredit ? "Good" : money(bankTx.filter((tx) => tx.type === "adjustment").reduce((sum, tx) => sum + tx.amount, 0), hideBalances)} note="This month" />
              <Health title={isCredit ? "Credit Mix" : "Monthly Outflow"} value={isCredit ? "Good" : money(totalSpent, hideBalances)} note="This month" />
            </div>
          </section>
        </aside>
      </div>

      <section className="ac-history">
        <div className="ac-history-title"><h3>Transaction History</h3><div className="ac-history-filters">{(["all", "purchase", "payment", "refund", "installment", "fee", "interest", "adjustment"] as TxFilter[]).map((item) => <button type="button" key={item} className={txFilter === item ? "active" : ""} onClick={() => setTxFilter(item)}>{item === "all" ? "All" : label(item)}</button>)}</div></div>
        <div className="ac-cycle-summary"><div><strong>Current Billing Cycle</strong><span>{cycleStart && cycleEnd ? `${prettyDate(cycleStart)} – ${prettyDate(cycleEnd)}` : "Selected account activity"}</span><small>{cycleEnd ? `Cutoff ${prettyDate(cycleEnd)}` : "No cutoff"}</small></div><div><small>Transactions</small><strong>{currentTransactions.length}</strong></div><div><small>Cycle Total</small><strong>{money(cycleTotal, hideBalances)}</strong></div></div>
        <div className="ac-history-table-wrap">
          <div className="ac-history-head credit"><span>Date</span><span>Description</span><span>Type</span><span>Category</span><span>Account or Card</span><span>Amount</span><span>Status</span><span>Actions</span></div>
          {visibleTransactions.map((tx) => <div className="ac-history-row credit" key={tx.id}><span>{prettyDate(tx.date)}</span><span><i>{tx.type === "purchase" ? "🛍" : "◆"}</i><strong>{tx.description}</strong></span><em>{label(tx.type)}</em><span>{tx.category}</span><span>{currentName} {currentMasked}</span><strong>{["payment", "refund"].includes(tx.type) ? "+" : "−"}{money(Math.abs(tx.amount), hideBalances)}</strong><span className="positive">● {label(tx.status)}</span><button type="button" className="ac-row-action">⋮</button></div>)}
          {!visibleTransactions.length && <div className="ac-empty">No transactions match this filter.</div>}
        </div>
      </section>
    </section>
  );
}

function Summary({ title, value, note, tone, icon, chart = false }: { title: string; value: string; note: string; tone: "positive" | "negative" | "blue" | "warning"; icon?: string; chart?: boolean }) {
  return <div className={`ac-summary-metric ${tone}`}><span><small>{title}</small><strong>{value}</strong><em>{note}</em></span>{chart ? <svg className="ac-summary-sparkline" viewBox="0 0 120 42"><polyline points="2,34 18,26 31,30 45,18 58,23 72,13 87,17 102,7 118,11" /></svg> : <i>{icon}</i>}</div>;
}

function Metric({ title, value }: { title: string; value: string }) {
  return <div className="ac-metric"><small>{title}</small><strong>{value}</strong></div>;
}

function Timeline({ date, text, state }: { date?: string; text: string; state: "done" | "current" | "upcoming" | "overdue" }) {
  return <div className={state}><i /><span><strong>{prettyDate(date)}</strong><small>{text}</small></span><b>{state === "done" ? "✓" : state === "current" ? "◷" : state === "overdue" ? "!" : "○"}</b></div>;
}

function Health({ title, value, note }: { title: string; value: string; note: string }) {
  return <div className="ac-health-item"><i>◔</i><span><small>{title}</small><b>{value}</b><em>{note}</em></span></div>;
}
