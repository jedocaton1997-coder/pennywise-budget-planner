import { useState } from "react";
import { CategoryFields } from "./components/CategoryFields";
import { CategoryIcon } from "./components/CategoryIcon";
import UpcomingBillsCalendar from "./UpcomingBillsCalendar";
import CreditCardManagement from "./CreditCardManagement";
import ExpenseTracking from "./ExpenseTracking";
import CashFlowForecast from "./CashFlowForecast";
import CashFlowPlanning from "./CashFlowPlanning";
import FinancialCalendar from "./FinancialCalendar";
import NotificationCenter from "./NotificationCenter";
import ReportsAnalytics from "./ReportsAnalytics";
import StatisticsPage from "./StatisticsPage";
import TimesheetInvoices from "./TimesheetInvoices";
import SmartInsights from "./SmartInsights";
import AdvancedPlanning from "./AdvancedPlanning";
import { useFirestoreState } from "./hooks/useFirestoreState";
import { useWalletSnapshot } from "./hooks/useWalletSnapshot";
import { includedCardIds } from "./utils/netBalanceFilters";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Download,
  Gauge,
  Landmark,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  Target,
  TrendingUp,
  Trash2,
  WalletCards,
  X,
  Zap,
} from "lucide-react";

type Props = {
  page: string;
  onAdd: () => void;
  onNotice: (text: string) => void;
};
const money = (value: string, tone = "") => (
  <strong className={tone}>{value}</strong>
);

const transactions = [
  ["Jul 26", "Salary", "Income", "BPI Savings", "+₱25,000", "Expected"],
  ["Jul 19", "Marketplace", "Groceries", "BPI Savings", "−₱1,250", "Completed"],
  ["Jul 18", "Salary", "Income", "BPI Savings", "+₱25,000", "Completed"],
  ["Jul 17", "Grab", "Transport", "BPI Rewards", "−₱480", "Completed"],
  ["Jul 15", "Emergency fund", "Savings", "BPI Savings", "−₱2,000", "Completed"],
];

function PageHead({
  title,
  description,
  action,
  onAdd,
}: {
  title: string;
  description: string;
  action: string;
  onAdd: () => void;
}) {
  return (
    <div className="fp-head">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <button className="primary" onClick={onAdd}>
        <Plus />
        {action}
      </button>
    </div>
  );
}

function Weekly({ onAdd, onNotice }: Omit<Props, "page">) {
  const [week, setWeek] = useState(0);
  const weeks = ["Jul 13–19, 2026", "Jul 20–26, 2026", "Jul 27–Aug 2, 2026"];
  return (
    <section className="feature-page">
      <div className="fp-title-row">
        <h2>Weekly Plan</h2>
        <div className="date-nav">
          <button onClick={() => setWeek(Math.max(0, week - 1))}>
            <ChevronLeft />
          </button>
          <b>{weeks[week]}</b>
          <button onClick={() => setWeek(Math.min(2, week + 1))}>
            <ChevronRight />
          </button>
        </div>
        <span className="status-ok">
          <Check />
          On track
        </span>
      </div>
      <div className="metric-strip">
        <div>
          <span>Opening balance</span>
          {money("₱30,000")}
        </div>
        <div>
          <span>Incoming</span>
          {money("₱20,000", "positive")}
        </div>
        <div>
          <span>Committed</span>
          {money("₱29,800", "negative")}
        </div>
        <div>
          <span>Projected ending</span>
          {money("₱20,200")}
        </div>
      </div>
      <div className="weekly-layout">
        <article className="surface forecast-surface">
          <div className="surface-title">
            <b>Daily projected balance</b>
            <span>Safe to spend {money("₱5,400", "positive")}</span>
          </div>
          <svg className="wide-chart" viewBox="0 0 820 210">
            <path
              d="M40 52 L160 40 L280 47 L400 67 L520 88 L640 103 L780 112"
              fill="none"
              stroke="#237451"
              strokeWidth="3"
            />
            <path
              d="M40 52 L160 40 L280 47 L400 67 L520 88 L640 103 L780 112 L780 155 L40 155Z"
              fill="#dceadf"
              opacity=".7"
            />
            {[40, 160, 280, 400, 520, 640, 780].map((x, i) => (
              <g key={x}>
                <line
                  x1={x}
                  y1="25"
                  x2={x}
                  y2="155"
                  stroke="#dedbd2"
                  strokeDasharray="3 4"
                />
                <circle
                  cx={x}
                  cy={[52, 40, 47, 67, 88, 103, 112][i]}
                  r="5"
                  fill="#fff"
                  stroke="#237451"
                  strokeWidth="2"
                />
                <text x={x} y="180" textAnchor="middle">
                  {
                    [
                      "Mon 20",
                      "Tue 21",
                      "Wed 22",
                      "Thu 23",
                      "Fri 24",
                      "Sat 25",
                      "Sun 26",
                    ][i]
                  }
                </text>
              </g>
            ))}
          </svg>
          <div className="day-events">
            {[
              "Salary +₱20,000",
              "Bills ₱3,500",
              "Card ₱8,000",
              "Groceries ₱2,500",
              "Utilities ₱2,900",
              "Dining ₱1,800",
              "Transport ₱1,400",
            ].map((x, i) => (
              <button key={x} onClick={() => onNotice(x)}>
                <i className={i === 0 ? "income-dot" : "expense-dot"} />
                {x}
              </button>
            ))}
          </div>
        </article>
        <aside className="surface commitment">
          <div className="surface-title">
            <b>Week commitments</b>
          </div>
          {[
            ["Bills", "₱3,500"],
            ["Credit cards", "₱8,000"],
            ["Utilities", "₱2,900"],
            ["Groceries", "₱2,500"],
            ["Transport", "₱1,400"],
            ["Dining out", "₱1,800"],
          ].map((x) => (
            <button key={x[0]} onClick={() => onNotice(`${x[0]} selected`)}>
              <span>{x[0]}</span>
              {money(x[1], "negative")}
            </button>
          ))}
          <div className="commit-total">
            <span>Total committed</span>
            {money("₱20,100", "negative")}
          </div>
          <button className="outline" onClick={onAdd}>
            <Plus />
            Add commitment
          </button>
        </aside>
      </div>
    </section>
  );
}

const calEvents: Record<number, [string, string][]> = {
  1: [["Groceries", "₱2,500"]],
  3: [["Salary", "₱20,000"]],
  6: [["Electricity", "₱3,500"]],
  8: [["BPI Rewards", "₱8,000"]],
  13: [["Internet", "₱1,800"]],
  15: [["Freelance", "₱5,000"]],
  20: [["Salary", "₱20,000"]],
  21: [["Credit card", "₱8,000"]],
  23: [["Groceries", "₱2,500"]],
  24: [["BPI Rewards", "₱8,000"]],
};
function CalendarPage({ onAdd, onNotice }: Omit<Props, "page">) {
  const [day, setDay] = useState(24);
  return (
    <section className="feature-page">
      <PageHead
        title="Calendar"
        description="Income, bills, payments, and savings in one monthly view."
        action="Add event"
        onAdd={onAdd}
      />
      <div className="calendar-layout">
        <article className="surface month-calendar">
          <div className="cal-nav">
            <button onClick={() => onNotice("Previous month")}>
              <ChevronLeft />
            </button>
            <button onClick={() => setDay(20)}>Today</button>
            <h3>July 2026</h3>
            <button onClick={() => onNotice("Next month")}>
              <ChevronRight />
            </button>
          </div>
          <div className="weekdays">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((x) => (
              <b key={x}>{x}</b>
            ))}
          </div>
          <div className="days">
            {Array.from({ length: 35 }, (_, i) => {
              const d = i - 2;
              return (
                <button
                  key={i}
                  className={`${d === day ? "selected" : ""} ${d < 1 || d > 31 ? "muted-day" : ""}`}
                  onClick={() => d > 0 && d < 32 && setDay(d)}
                >
                  <span>{d < 1 ? 28 + d : d > 31 ? d - 31 : d}</span>
                  {calEvents[d]?.map((e) => (
                    <em
                      key={e[0]}
                      className={
                        e[0].includes("Salary") || e[0].includes("Freelance")
                          ? "income-event"
                          : "expense-event"
                      }
                    >
                      {e[0]} <b>{e[1]}</b>
                    </em>
                  ))}
                </button>
              );
            })}
          </div>
        </article>
        <aside className="surface event-inspector">
          <div className="surface-title">
            <b>Fri, Jul {day}, 2026</b>
          </div>
          <div className="event-card">
            <CreditCard />
            <div>
              <b>{calEvents[day]?.[0]?.[0] || "No scheduled events"}</b>
              <span>
                {calEvents[day]?.[0]?.[1] || "Select Add event to plan one"}
              </span>
            </div>
          </div>
          {["View details", "Edit event", "Reschedule", "Mark as paid"].map(
            (x) => (
              <button key={x} onClick={() => onNotice(x)}>
                {x}
                <ChevronRight />
              </button>
            ),
          )}
        </aside>
      </div>
    </section>
  );
}

function Transactions({ onAdd, onNotice }: Omit<Props, "page">) {
  const [filter, setFilter] = useState("All");
  type Wallet={accounts:{id:number;name:string;balance:number}[];cards:{id:number;name:string;active?:boolean;includeInNetBalance?:boolean}[];accountTransactions:{id:number;accountId:number;date:string;description:string;type:string;category:string;amount:number;status:string;notes?:string}[];transactions:{id:number;cardId:number;transactionDate:string;postedDate:string;description:string;type:string;category:string;amount:number;status:string;notes?:string}[];[key:string]:unknown};
  type LedgerEntry={id:number;source:"account"|"card";date:string;description:string;type:string;category:string;account:string;amount:number;status:string;notes:string};
  const [wallet,saveWallet]=useWalletSnapshot<Wallet>({accounts:[],cards:[],accountTransactions:[],transactions:[]}),[editing,setEditing]=useState<LedgerEntry|null>(null);
  const entries:LedgerEntry[]=[...wallet.accountTransactions.map(transaction=>({...transaction,source:"account" as const,account:wallet.accounts.find(account=>account.id===transaction.accountId)?.name??"Deleted account",notes:transaction.notes??""})),...wallet.transactions.filter(transaction=>transaction.type!=="payment").map(transaction=>({...transaction,source:"card" as const,date:transaction.transactionDate||transaction.postedDate,account:wallet.cards.find(card=>card.id===transaction.cardId)?.name??"Deleted card",type:["refund","credit"].includes(transaction.type)?"Refund":"Expense",notes:transaction.notes??""}))].sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id);
  const formatActivityDate=(date:string)=>{const parsed=new Date(`${date}T12:00:00`);return Number.isNaN(parsed.getTime())?date:parsed.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})},activityPeriod=entries.length?`${formatActivityDate(entries[entries.length-1].date)} – ${formatActivityDate(entries[0].date)}`:"No activity";
  const visibleTotalCardIds=includedCardIds(wallet.cards),summaryEntries=entries.filter(entry=>entry.source==="account"||visibleTotalCardIds.has(String(wallet.transactions.find(transaction=>transaction.id===entry.id)?.cardId)))
  const inflow=summaryEntries.filter(entry=>entry.type==="Income"||entry.type==="Refund").reduce((sum,entry)=>sum+entry.amount,0),outflow=summaryEntries.filter(entry=>entry.type==="Expense").reduce((sum,entry)=>sum+entry.amount,0);
  return (
    <section className="feature-page">
      <PageHead
        title="Transactions"
        description="A complete ledger of money moving in and out."
        action="Add transaction"
        onAdd={onAdd}
      />
      <div className="ledger-tools">
        <label>
          <Search />
          <input placeholder="Search merchant, category, or account" />
        </label>
        <div className="tabs">
          {["All", "Income", "Expenses", "Transfers"].map((x) => (
            <button
              className={filter === x ? "active" : ""}
              onClick={() => setFilter(x)}
              key={x}
            >
              {x}
            </button>
          ))}
        </div>
      </div>
      <div className="metric-strip three">
        <div>
          <span>Total inflow</span>
          {money(`₱${inflow.toLocaleString(undefined,{maximumFractionDigits:2})}`, "positive")}
        </div>
        <div>
          <span>Total outflow</span>
          {money(`₱${outflow.toLocaleString(undefined,{maximumFractionDigits:2})}`, "negative")}
        </div>
        <div>
          <span>Net</span>
          {money(`₱${(inflow-outflow).toLocaleString(undefined,{maximumFractionDigits:2})}`)}
        </div>
      </div>
      <article className="surface ledger">
        <div className="ledger-header">
          <b>Recent activity</b>
          <span>{activityPeriod}</span>
        </div>
        {entries
          .filter(
            (entry) =>
              filter === "All" ||
              (filter === "Income" && ["Income","Refund"].includes(entry.type)) ||
              (filter === "Expenses" && entry.type === "Expense") ||
              (filter === "Transfers" && entry.type === "Transfer"),
          )
          .map((entry) => (
            <button
              className="completed"
              key={`${entry.source}-${entry.id}`}
              onClick={() => setEditing(entry)}
            >
              <CategoryIcon value={entry.category} className={["Income","Refund"].includes(entry.type) ? "txn-icon in" : "txn-icon out"}/>
              <span>
                <b>{entry.description}</b>
                <small>{entry.category} · <em className="transaction-state completed">{entry.source==="card"?"Credit card":"Bank account"}</em></small>
              </span>
              <span>{entry.account}</span>
              <span>{formatActivityDate(entry.date)}</span>
              {money(`${["Income","Refund"].includes(entry.type)?'+':'−'}₱${entry.amount.toLocaleString()}`,["Income","Refund"].includes(entry.type)?"positive":"negative")}
              <ChevronRight />
            </button>
          ))}
        {!entries.length&&<p className="empty-card">No transactions yet. Add one from Accounts &amp; Cards.</p>}
      </article>
      {editing&&<div className="modal-backdrop" onMouseDown={()=>setEditing(null)}><section className="modal" role="dialog" aria-modal="true" onMouseDown={event=>event.stopPropagation()}><div className="modal-head"><div><h2>Edit transaction</h2><p>Changes are reflected in Accounts &amp; Cards.</p></div><button className="icon-button" aria-label="Close" onClick={()=>setEditing(null)}><X/></button></div><form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget),description=String(form.get("description")),category=String(form.get("category")),newAmount=Number(form.get("amount")),date=String(form.get("date")),notes=String(form.get("notes")||"");if(editing.source==="card")saveWallet({...wallet,transactions:wallet.transactions.map(transaction=>transaction.id===editing.id?{...transaction,description,category,amount:newAmount,transactionDate:date,postedDate:date,notes}:transaction)});else{const original=wallet.accountTransactions.find(transaction=>transaction.id===editing.id),effect=(type:string,value:number)=>type==="Income"?value:type==="Expense"?-value:0,accountId=original?.accountId;saveWallet({...wallet,accounts:wallet.accounts.map(account=>account.id===accountId?{...account,balance:account.balance-effect(original?.type??"",original?.amount??0)+effect(original?.type??"",newAmount)}:account),accountTransactions:wallet.accountTransactions.map(transaction=>transaction.id===editing.id?{...transaction,description,category,amount:newAmount,date,notes}:transaction)})}onNotice(`${description} updated`);setEditing(null)}}><label>Description<input name="description" required defaultValue={editing.description}/></label><CategoryFields defaultValue={editing.category}/><div className="form-grid"><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required defaultValue={editing.amount}/></label><label>Date<input name="date" type="date" required defaultValue={editing.date}/></label></div><label>Account<input value={editing.account} disabled/></label><label>Notes (optional)<textarea name="notes" defaultValue={editing.notes}/></label><div className="record-edit-actions"><button className="primary" type="submit">Save changes</button><button className="danger-outline" type="button" onClick={()=>{if(editing.source==="card")saveWallet({...wallet,transactions:wallet.transactions.filter(transaction=>transaction.id!==editing.id)});else{const original=wallet.accountTransactions.find(transaction=>transaction.id===editing.id),effect=original?.type==="Income"?(original.amount):original?.type==="Expense"?-original.amount:0;saveWallet({...wallet,accounts:wallet.accounts.map(account=>account.id===original?.accountId?{...account,balance:account.balance-effect}:account),accountTransactions:wallet.accountTransactions.filter(transaction=>transaction.id!==editing.id)})}onNotice(`${editing.description} deleted`);setEditing(null)}}><Trash2/>Delete transaction</button></div></form></section></div>}
    </section>
  );
}

function CreditCardsPage({ onAdd, onNotice }: Omit<Props, "page">) {
  return (
    <section className="feature-page">
      <PageHead
        title="Credit Cards"
        description="Balances, utilization, and payments without surprises."
        action="Add card"
        onAdd={onAdd}
      />
      <div className="metric-strip">
        <div>
          <span>Total balance</span>
          {money("₱49,000")}
        </div>
        <div>
          <span>Combined limit</span>
          {money("₱200,000")}
        </div>
        <div>
          <span>Utilization</span>
          {money("24.5%", "positive")}
        </div>
        <div>
          <span>Due this month</span>
          {money("₱9,850", "negative")}
        </div>
      </div>
      <div className="cards-layout">
        <div className="card-stack">
          {[
            [
              "BPI Rewards",
              "4821",
              "₱31,000",
              "₱100,000",
              "31%",
              "Jul 24",
              "₱1,500",
            ],
            [
              "Metrobank Titanium",
              "0934",
              "₱18,000",
              "₱100,000",
              "18%",
              "Aug 3",
              "₱850",
            ],
          ].map((c, i) => (
            <article className="surface credit-module" key={c[0]}>
              <div className="credit-head">
                <span className={`card-logo c${i}`}>
                  <CreditCard />
                </span>
                <div>
                  <h3>{c[0]}</h3>
                  <small>•••• •••• •••• {c[1]}</small>
                </div>
                <button
                  className="primary"
                  onClick={() => onNotice(`Payment started for ${c[0]}`)}
                >
                  Pay card
                </button>
              </div>
              <div className="credit-stats">
                <div>
                  <span>Current balance</span>
                  <b>{c[2]}</b>
                </div>
                <div>
                  <span>Credit limit</span>
                  <b>{c[3]}</b>
                </div>
                <div>
                  <span>Due date</span>
                  <b>{c[5]}</b>
                </div>
                <div>
                  <span>Minimum</span>
                  <b>{c[6]}</b>
                </div>
              </div>
              <div className="util-line">
                <span>Utilization</span>
                <div>
                  <i style={{ width: c[4] }} />
                </div>
                <b>{c[4]}</b>
              </div>
            </article>
          ))}
        </div>
        <aside className="surface card-guide">
          <Gauge />
          <h3>Healthy utilization</h3>
          <b>24.5% combined</b>
          <p>You’re below the recommended 30% threshold.</p>
          <button
            className="outline"
            onClick={() => onNotice("Utilization guide opened")}
          >
            View guide
          </button>
        </aside>
      </div>
    </section>
  );
}

function BillsPage({ onAdd, onNotice }: Omit<Props, "page">) {
  const groups = [
    [
      "Due soon",
      [
        ["21", "Electricity", "Utilities", "₱3,500", "Due tomorrow"],
        ["22", "Internet", "Utilities", "₱1,800", "Auto-pay"],
      ],
    ],
    [
      "Later this month",
      [
        ["24", "BPI Rewards", "Credit card", "₱8,000", "Scheduled"],
        ["25", "Rent", "Housing", "₱10,000", "Upcoming"],
      ],
    ],
    ["Paid", [["05", "Mobile phone", "Phone", "₱999", "Paid"]]],
  ] as const;
  return (
    <section className="feature-page">
      <PageHead
        title="Bills"
        description="Every commitment organized by urgency and payment status."
        action="Add bill"
        onAdd={onAdd}
      />
      <div className="metric-strip three">
        <div>
          <span>Due next 7 days</span>
          {money("₱23,300", "negative")}
        </div>
        <div>
          <span>Auto-pay</span>
          {money("2 bills")}
        </div>
        <div>
          <span>Overdue</span>
          {money("₱0", "positive")}
        </div>
      </div>
      <div className="bill-groups">
        {groups.map((g) => (
          <article className="surface" key={g[0]}>
            <div className="ledger-header">
              <b>{g[0]}</b>
              <span>
                {g[1].length} {g[1].length === 1 ? "bill" : "bills"}
              </span>
            </div>
            {g[1].map((r) => (
              <button
                className="bill-detail-row"
                key={r[1]}
                onClick={() => onNotice(`${r[1]} selected`)}
              >
                <span className="due-block">
                  <small>JUL</small>
                  {r[0]}
                </span>
                <span className="txn-icon out">
                  <ReceiptText />
                </span>
                <span>
                  <b>{r[1]}</b>
                  <small>{r[2]}</small>
                </span>
                {money(r[3])}
                <em className={r[4] === "Paid" ? "paid" : ""}>{r[4]}</em>
                <ChevronRight />
              </button>
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}

const cats = [
  ["Groceries", "₱12,000", "₱8,200", "₱3,800", 68],
  ["Transport", "₱7,000", "₱5,400", "₱1,600", 77],
  ["Dining", "₱5,000", "₱4,150", "₱850", 83],
  ["Utilities", "₱8,500", "₱5,300", "₱3,200", 62],
] as const;
function BudgetPage({ onAdd, onNotice }: Omit<Props, "page">) {
  return (
    <section className="feature-page">
      <PageHead
        title="Budget"
        description="July 2026 category plan and spending health."
        action="Add budget"
        onAdd={onAdd}
      />
      <article className="surface budget-overall">
        <div>
          <span>Spent</span>
          {money("₱31,420", "negative")}
          <small>of ₱45,000</small>
        </div>
        <b className="positive">₱13,580 remaining</b>
        <div className="overall-track">
          <i />
        </div>
      </article>
      <div className="budget-layout">
        <article className="surface category-table">
          <div className="category-head">
            <b>Category</b>
            <b>Planned</b>
            <b>Spent</b>
            <b>Remaining</b>
            <b>Progress</b>
          </div>
          {cats.map((c) => (
            <button
              key={c[0]}
              onClick={() => onNotice(`${c[0]} budget selected`)}
            >
              <CategoryIcon value={String(c[0])} className="txn-icon in"/>
              <b>{c[0]}</b>
              <span>{c[1]}</span>
              <span>{c[2]}</span>
              <span className="positive">{c[3]}</span>
              <div className="cat-progress">
                <i style={{ width: `${c[4]}%` }} />
              </div>
              <em className={c[4] > 80 ? "warn" : "paid"}>{c[4]}%</em>
              <ChevronRight />
            </button>
          ))}
        </article>
        <aside className="surface budget-health">
          <ShieldCheck />
          <h3>Budget health</h3>
          <b className="positive">On track</b>
          <p>69.8% of your total monthly plan has been used.</p>
          <div className="donut" />
          <button
            className="outline"
            onClick={() => onNotice("Category breakdown opened")}
          >
            View breakdown
          </button>
        </aside>
      </div>
    </section>
  );
}

function SavingsPage({ onAdd, onNotice }: Omit<Props, "page">) {
  const [goals,setGoals]=useFirestoreState<string[][]>("savingsGoals",[]);
  const [editingGoal,setEditingGoal]=useState<{goal:string[];index:number}|null>(null);
  return (
    <section className="feature-page">
      <PageHead
        title="Savings"
        description="Goal progress, contribution plans, and completion forecasts."
        action="Add savings goal"
        onAdd={onAdd}
      />
      <div className="metric-strip three">
        <div>
          <span>Total savings</span>
          {money("₱0.00")}
        </div>
        <div>
          <span>This month</span>
          {money("₱0.00", "positive")}
        </div>
        <div>
          <span>Active goals</span>
          {money("0")}
        </div>
      </div>
      <div className="savings-layout">
        <div className="goal-stack">
          {goals.map((g, i) => (
            <article className="surface goal-module" key={g[0]}>
              <div className="goal-head">
                <button className="goal-info-card clickable-row" type="button" onClick={()=>setEditingGoal({goal:g,index:i})} aria-label={`Open ${g[0]} goal`}>
                  <span className={`goal-icon g${i}`}>
                    <Target />
                  </span>
                  <span>
                    <h3>{g[0]}</h3>
                    <b className={i ? "orange" : "positive"}>{g[1]}%</b>
                  </span>
                </button>
                <button
                  className="outline"
                  onClick={() => onNotice(`Contribution started for ${g[0]}`)}
                >
                  Contribute
                </button>
              </div>
              <div className="goal-track">
                <i style={{ width: `${g[1]}%` }} />
              </div>
              <div className="goal-stats">
                <div>
                  <span>Current</span>
                  <b>{g[2]}</b>
                </div>
                <div>
                  <span>Target</span>
                  <b>{g[3]}</b>
                </div>
                <div>
                  <span>Target date</span>
                  <b>{g[4]}</b>
                </div>
                <div>
                  <span>Next contribution</span>
                  <b>{g[5]}</b>
                </div>
                <div>
                  <span>Forecast completion</span>
                  <b>{g[6]}</b>
                </div>
              </div>
            </article>
          ))}
        </div>
        <aside className="surface history">
          <div className="surface-title">
            <b>Contribution history</b>
          </div>
          {([] as string[][]).map((x) => (
            <button
              key={x[0] + x[1]}
              onClick={() => onNotice(`${x[0]} contribution selected`)}
            >
              <span>
                <b>{x[0]}</b>
                <small>{x[1]}</small>
              </span>
              <strong>{x[2]}</strong>
            </button>
          ))}<p className="empty-card">No contributions recorded.</p>
        </aside>
      </div>
      {editingGoal&&<div className="modal-backdrop" onMouseDown={()=>setEditingGoal(null)}><section className="modal" role="dialog" aria-modal="true" onMouseDown={event=>event.stopPropagation()}><div className="modal-head"><div><h2>Edit savings goal</h2><p>Update the goal or remove it from your savings plan.</p></div><button className="icon-button" aria-label="Close" onClick={()=>setEditingGoal(null)}><X/></button></div><form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);const current=Number(form.get('current')),target=Number(form.get('target')),updated=[String(form.get('name')),String(Math.min(100,Math.round(current/Math.max(target,1)*100))),`₱${current.toLocaleString()}`,`₱${target.toLocaleString()}`,String(form.get('date')),`₱${Number(form.get('contribution')).toLocaleString()}`,editingGoal.goal[6]];setGoals(items=>items.map((goal,index)=>index===editingGoal.index?updated:goal));onNotice(`${updated[0]} updated`);setEditingGoal(null)}}><label>Goal name<input name="name" required defaultValue={editingGoal.goal[0]}/></label><div className="form-grid"><label>Current amount<input name="current" type="number" min="0" required defaultValue={Number(editingGoal.goal[2].replace(/[^0-9.]/g,''))}/></label><label>Target amount<input name="target" type="number" min="1" required defaultValue={Number(editingGoal.goal[3].replace(/[^0-9.]/g,''))}/></label></div><div className="form-grid"><label>Target date<input name="date" required defaultValue={editingGoal.goal[4]}/></label><label>Planned contribution<input name="contribution" type="number" min="0" defaultValue={Number(editingGoal.goal[5].replace(/[^0-9.]/g,''))}/></label></div><div className="record-edit-actions"><button className="primary" type="submit">Save changes</button><button className="danger-outline" type="button" onClick={()=>{setGoals(items=>items.filter((_,index)=>index!==editingGoal.index));onNotice(`${editingGoal.goal[0]} deleted`);setEditingGoal(null)}}><Trash2/>Delete goal</button></div></form></section></div>}
    </section>
  );
}

function ReportsPage({ onNotice }: Omit<Props, "page" | "onAdd">) {
  return (
    <section className="feature-page">
      <div className="fp-head">
        <div>
          <h2>Reports</h2>
          <p>July 2026 performance, trends, and practical insights.</p>
        </div>
        <button
          className="outline export"
          onClick={() => onNotice("Report export prepared")}
        >
          <Download />
          Export
        </button>
      </div>
      <div className="metric-strip">
        <div>
          <span>Income</span>
          {money("₱58,000", "positive")}
        </div>
        <div>
          <span>Expenses</span>
          {money("₱31,420", "negative")}
        </div>
        <div>
          <span>Savings rate</span>
          {money("18%")}
        </div>
        <div>
          <span>Net cash flow</span>
          {money("₱20,580", "positive")}
        </div>
      </div>
      <div className="reports-grid">
        <article className="surface report-chart">
          <div className="surface-title">
            <b>Income vs. expenses</b>
            <span>Jan–Jul 2026</span>
          </div>
          <svg viewBox="0 0 600 230">
            <path
              d="M30 100 L115 78 L200 79 L285 58 L370 78 L455 105 L555 52"
              fill="none"
              stroke="#237451"
              strokeWidth="3"
            />
            <path
              d="M30 157 L115 150 L200 145 L285 136 L370 153 L455 157 L555 118"
              fill="none"
              stroke="#e66a52"
              strokeWidth="3"
            />
            {[50, 100, 150, 200].map((y) => (
              <line key={y} x1="30" x2="565" y1={y} y2={y} stroke="#dedbd2" />
            ))}
          </svg>
          <div className="legend">
            <span>
              <i className="dot green" />
              Income
            </span>
            <span>
              <i className="dot coral" />
              Expenses
            </span>
          </div>
        </article>
        <article className="surface spending">
          <div className="surface-title">
            <b>Spending by category</b>
          </div>
          <div className="donut report-donut">
            <span>
              ₱31,420<small>Total expenses</small>
            </span>
          </div>
          {[
            ["Housing", "39%"],
            ["Food & Dining", "20%"],
            ["Transport", "15%"],
            ["Utilities", "10%"],
          ].map((x) => (
            <button
              key={x[0]}
              onClick={() => onNotice(`${x[0]} report selected`)}
            >
              <span>{x[0]}</span>
              <b>{x[1]}</b>
            </button>
          ))}
        </article>
        <article className="surface comparison">
          <div className="surface-title">
            <b>Month-over-month</b>
          </div>
          {[
            ["Income", "₱54,000", "₱58,000", "+7.4%"],
            ["Expenses", "₱29,800", "₱31,420", "+5.4%"],
            ["Net cash flow", "₱24,200", "₱20,580", "−15.0%"],
            ["Savings rate", "20%", "18%", "−2 pts"],
          ].map((x) => (
            <div key={x[0]}>
              <b>{x[0]}</b>
              <span>{x[1]}</span>
              <span>{x[2]}</span>
              <em className={x[3].startsWith("+") ? "positive" : "negative"}>
                {x[3]}
              </em>
            </div>
          ))}
        </article>
        <article className="surface insights">
          <div className="surface-title">
            <b>Insights</b>
          </div>
          <p>
            <TrendingUp />
            Income increased ₱4,000 compared with last month.
          </p>
          <p>
            <Zap />
            Dining is the category most likely to exceed its limit.
          </p>
          <p>
            <WalletCards />
            Your 18% savings rate is slightly below the 20% target.
          </p>
        </article>
      </div>
    </section>
  );
}

export default function FeaturePages(props: Props) {
  switch (props.page) {
    case "Calendar":
      return <FinancialCalendar onNotice={props.onNotice} />;
    case "Transactions":
      return <Transactions {...props} />;
    case "Cash Flow Plan":
      return <CashFlowPlanning />;
    case "Expenses":
      return <ExpenseTracking onNotice={props.onNotice} />;
    case "Forecast":
      return <CashFlowForecast />;
    case "Notifications":
      return <NotificationCenter onNotice={props.onNotice} />;
    case "Insights":
      return <SmartInsights onNotice={props.onNotice} />;
    case "Credit cards":
      return <CreditCardManagement onNotice={props.onNotice} />;
    case "Bills":
      return <UpcomingBillsCalendar onNotice={props.onNotice} />;
    case "Budget":
      return <AdvancedPlanning page="Budgets" onNotice={props.onNotice} />;
    case "Savings":
      return <SavingsPage {...props} />;
    case "Reports":
      return <ReportsAnalytics onNotice={props.onNotice} />;
    case "Statistics":
      return <StatisticsPage />;
    case "Timesheets":
      return <TimesheetInvoices onNotice={props.onNotice} />;
    case "Budgets":
    case "Debts":
    case "Money owed to me":
    case "Planned payments":
    case "Installments":
      return <AdvancedPlanning page={props.page} onNotice={props.onNotice} />;
    default:
      return null;
  }
}
