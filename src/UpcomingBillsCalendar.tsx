import { FormEvent, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  List,
  Plus,
  Repeat2,
  X,
} from "lucide-react";
import { CategoryFields } from "./components/CategoryFields";
import { ConnectedAccountSelect } from "./components/ConnectedAccountSelect";
import { BankLogo } from "./components/BankLogo";
import { useFirestoreState } from "./hooks/useFirestoreState";
import { useWalletSnapshot } from "./hooks/useWalletSnapshot";
import {
  processBillPayment,
  type BillPaymentRecord,
  type WalletForBillPayment,
} from "./utils/billPaymentProcessor";
import { CategoryIcon } from "./components/CategoryIcon";

type Bill = {
  id: number;
  name: string;
  category: string;
  amount: number;
  dueDate: string;
  recurrenceStartDate?: string;
  frequency: string;
  account: string;
  status: string;
  autopay: boolean;
  autopayAccount?: string;
  reminder: string;
  notes: string;
  statementDate?: string;
  originalStatement?: number;
  minimumDue?: number;
  plannedPayment?: number;
  planType?: "One-time" | "Recurring" | "Installment";
  installmentMonths?: number;
  installmentPaidMonths?: number;
  paymentHistory?: BillPaymentRecord[];
  lastPaymentDate?: string;
  lastPaymentAmount?: number;
  lastPaymentMethod?: string;
  paymentTransactionId?: number;
  sourceKey?: string;
  recordType?: "subscription";
};

type WalletCardLogo = {
  id: number | string;
  name?: string;
  bank?: string;
  bankId?: string | null;
  customLogo?: string;
  active?: boolean;
};
type Props = { onNotice: (text: string) => void };
type BillView = "due7" | "month" | "creditCards" | "expenses" | "recurring" | "subscriptions" | "paid";
const billViewStorageKey = "pennywise.bills.selectedView";

const initialBills: Bill[] = [
  {
    id: 1,
    name: "Electricity",
    category: "Electricity",
    amount: 3500,
    dueDate: "2026-07-21",
    frequency: "Monthly",
    account: "BPI Savings",
    status: "Due soon",
    autopay: false,
    reminder: "2026-07-20",
    notes: "Meter reading varies each month.",
  },
  {
    id: 2,
    name: "Internet",
    category: "Internet",
    amount: 1800,
    dueDate: "2026-07-22",
    frequency: "Monthly",
    account: "BPI Savings",
    status: "Upcoming",
    autopay: true,
    reminder: "2026-07-20",
    notes: "Fiber plan renewal.",
  },
  {
    id: 3,
    name: "BPI Rewards",
    category: "Credit card",
    amount: 10000,
    dueDate: "2026-08-05",
    frequency: "Monthly",
    account: "BPI Savings",
    status: "Upcoming",
    autopay: false,
    reminder: "2026-07-29",
    notes: "Generated automatically from the July 15 statement.",
    statementDate: "2026-07-15",
    originalStatement: 10000,
    minimumDue: 500,
    plannedPayment: 10000,
  },
  {
    id: 4,
    name: "Rent",
    category: "Rent or mortgage",
    amount: 10000,
    dueDate: "2026-07-25",
    frequency: "Monthly",
    account: "BPI Savings",
    status: "Upcoming",
    autopay: false,
    reminder: "2026-07-23",
    notes: "Send payment confirmation to landlord.",
  },
  {
    id: 5,
    name: "Mobile phone",
    category: "Mobile phone",
    amount: 999,
    dueDate: "2026-07-20",
    frequency: "Monthly",
    account: "BPI Savings",
    status: "Due today",
    autopay: true,
    reminder: "2026-07-19",
    notes: "Postpaid plan.",
  },
  {
    id: 6,
    name: "Health insurance",
    category: "Insurance",
    amount: 4200,
    dueDate: "2026-07-18",
    frequency: "Quarterly",
    account: "Metrobank",
    status: "Overdue",
    autopay: false,
    reminder: "2026-07-15",
    notes: "Grace period ends July 25.",
  },
  {
    id: 7,
    name: "Netflix",
    category: "Subscription",
    amount: 549,
    dueDate: "2026-07-12",
    frequency: "Monthly",
    account: "BPI Rewards",
    status: "Paid",
    autopay: true,
    reminder: "2026-07-10",
    notes: "Family plan.",
  },
  {
    id: 8,
    name: "Water",
    category: "Water",
    amount: 620,
    dueDate: "2026-07-16",
    frequency: "Monthly",
    account: "BPI Savings",
    status: "Skipped",
    autopay: false,
    reminder: "2026-07-14",
    notes: "Rescheduled to next billing cycle.",
  },
  {
    id: 9,
    name: "Salary loan payment",
    category: "Debt payment",
    amount: 3500,
    dueDate: "2026-07-28",
    frequency: "Monthly",
    account: "BPI Savings",
    status: "Upcoming",
    autopay: false,
    reminder: "2026-07-25",
    notes: "₱3,000 principal and ₱500 interest.",
  },
  {
    id: 10,
    name: "Laptop installment 1/6",
    category: "Installment",
    amount: 2000,
    dueDate: "2026-07-30",
    frequency: "Monthly",
    account: "BPI Savings",
    status: "Upcoming",
    autopay: false,
    reminder: "2026-07-27",
    notes: "Expense by installment accounting mode.",
  },
  {
    id: 11,
    name: "Jamie collection",
    category: "Receivable collection",
    amount: 3000,
    dueDate: "2026-07-25",
    frequency: "One time",
    account: "BPI Savings",
    status: "Upcoming",
    autopay: false,
    reminder: "2026-07-23",
    notes: "Expected inflow; principal is not income.",
  },
];
const categories = [
  "Credit card",
  "Debt payment",
  "Installment",
  "Receivable collection",
  "Planned expense",
  "Planned income",
  "Savings contribution",
  "Rent or mortgage",
  "Electricity",
  "Water",
  "Internet",
  "Mobile phone",
  "Insurance",
  "Loan",
  "Subscription",
  "Transportation",
  "Groceries",
  "Medical",
  "Education",
  "Other",
];
const frequencies = [
  "Weekly",
  "Every two weeks",
  "Monthly",
  "Every two months",
  "Quarterly",
  "Semiannually",
  "Annually",
  "Custom frequency",
];
const statuses = [
  "Upcoming",
  "Due soon",
  "Due today",
  "Paid",
  "Partially paid",
  "Overdue",
  "Skipped",
];
const peso = (n: number) => `₱${n.toLocaleString()}`;
const statusSlug = (s: string) => s.toLowerCase().replaceAll(" ", "-");
const billDisplayName = (name: string) => name.replace(/\s+statement$/i, "");
const formatDueDate = (value: string) => {
  const date = parseLocalDate(value);
  return date
    ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : value || "—";
};
const dueDateParts = (value: string) => {
  const date = parseLocalDate(value);
  return {
    month: date ? date.toLocaleDateString("en-US", { month: "short" }).toUpperCase() : "—",
    day: date ? String(date.getDate()).padStart(2, "0") : "—",
  };
};
const parseLocalDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
};
const isDueWithinNextSevenDays = (bill: Bill) => {
  if (["Paid", "Skipped", "Cancelled"].includes(bill.status)) return false;
  const dueDate = parseLocalDate(bill.dueDate);
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);
  const daysUntilDue = Math.round((dueDate.getTime() - today.getTime()) / 86_400_000);
  return daysUntilDue >= 0 && daysUntilDue <= 7;
};
const isDueThisMonth = (bill: Bill) => {
  if (["Paid", "Skipped", "Cancelled"].includes(bill.status)) return false;
  const dueDate = parseLocalDate(bill.dueDate);
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return dueDate >= monthStart && dueDate <= monthEnd;
};
const daysLeftLabel = (value: string) => {
  const dueDate = parseLocalDate(value);
  if (!dueDate) return "—";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);
  const days = Math.round((dueDate.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)} overdue`;
  if (days === 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
};
const isCreditCardBill = (bill: Bill) => {
  const searchable = `${bill.category} ${bill.name} ${bill.notes}`.toLowerCase();
  return (
    searchable.includes("credit card") ||
    searchable.includes("statement") ||
    searchable.includes("visa") ||
    searchable.includes("mastercard")
  );
};
const isPaidBill = (bill: Bill) => String(bill.status || "").toLowerCase() === "paid";
const isInactiveBill = (bill: Bill) => ["paid", "skipped", "cancelled"].includes(String(bill.status || "").toLowerCase());
const isRecurringBill = (bill: Bill) => {
  const frequency = String(bill.frequency || "").toLowerCase();
  return bill.planType === "Recurring" || Boolean(frequency && frequency !== "one-time" && frequency !== "one time");
};
const isSubscriptionText = (...values: Array<unknown>) =>
  /subscription|subscriptions|netflix|spotify|icloud|google one|gym|membership|software|renewal/i.test(
    values.map((value) => String(value || "")).join(" "),
  );
const isSubscriptionBill = (bill: Bill) => {
  return bill.recordType === "subscription" || isSubscriptionText(bill.category, bill.name, bill.notes);
};
const sumBills = (items: Bill[]) =>
  items.reduce((total, bill) => total + Number(bill.amount || 0), 0);

function cardForBill(bill: Bill, cards: WalletCardLogo[] = []) {
  const sourceCardId = bill.sourceKey?.match(/^credit-card-statement:([^:]+):/)?.[1];
  if (sourceCardId) {
    const card = cards.find((item) => String(item.id) === sourceCardId);
    if (card) return card;
  }

  const billName = billDisplayName(bill.name).trim().toLowerCase();
  return (
    cards.find((item) => item.active !== false && String(item.name || "").trim().toLowerCase() === billName) ??
    cards.find((item) => item.active !== false && billName.includes(String(item.name || "").trim().toLowerCase()))
  );
}

export default function UpcomingBillsCalendar({ onNotice }: Props) {
  const [bills, setBills] = useFirestoreState<Bill[]>("bills", []);
  const [wallet, saveWallet] = useWalletSnapshot<WalletForBillPayment>({});
  const [selectedId, setSelectedId] = useState(0);
  const [detailBillId, setDetailBillId] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [billPlanType,setBillPlanType]=useState<"One-time"|"Recurring"|"Installment">("One-time");
  const [billAction,setBillAction]=useState<'pay'|'edit'|null>(null);
  const [billView,setBillView]=useState<BillView>(() => {
    const saved = localStorage.getItem(billViewStorageKey) as BillView | null;
    return saved && ["due7", "month", "creditCards", "expenses", "recurring", "subscriptions", "paid"].includes(saved)
      ? saved
      : "due7";
  });
  const selectBillView = (view: BillView) => {
    localStorage.setItem(billViewStorageKey, view);
    setBillView(view);
  };
  const sortedBills = [...bills].sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")) || a.name.localeCompare(b.name));
  const selected = sortedBills.find((b) => b.id === selectedId) ?? sortedBills[0];
  const detailBill = sortedBills.find((b) => b.id === detailBillId);
  const payBill=(bill:Bill,paymentMethod:string,paymentDate:string)=>{
    const result=processBillPayment({bill,wallet,paymentMethod,paymentDate});
    if(result.duplicate){onNotice(result.message);return}
    if(!result.processed){onNotice(result.message);return}
    saveWallet(result.wallet);
    setBills(rows=>rows.map(row=>row.id===bill.id?result.bill as Bill:row));
    onNotice(result.message);
  };
  const activeBills = sortedBills.filter((bill) => !isInactiveBill(bill));
  const dueNextSevenDayBills = sortedBills.filter(isDueWithinNextSevenDays);
  const dueThisMonthBills = sortedBills.filter(isDueThisMonth);
  const visiblePeriodBills = billView === "month" ? dueThisMonthBills : dueNextSevenDayBills;
  const creditCardBills = visiblePeriodBills.filter(isCreditCardBill);
  const expenseBills = visiblePeriodBills.filter((bill) => !isCreditCardBill(bill));
  const viewDefinitions: Array<{key:BillView;label:string;count:number}> = [
    {key:"due7",label:"Due Next 7 Days",count:dueNextSevenDayBills.length},
    {key:"month",label:"Due This Month",count:dueThisMonthBills.length},
    {key:"creditCards",label:"Credit Cards",count:activeBills.filter(isCreditCardBill).length},
    {key:"expenses",label:"Expenses",count:activeBills.filter((bill)=>!isCreditCardBill(bill)).length},
    {key:"recurring",label:"Recurring",count:activeBills.filter(isRecurringBill).length},
    {key:"subscriptions",label:"Subscriptions",count:activeBills.filter(isSubscriptionBill).length},
    {key:"paid",label:"Paid History",count:sortedBills.filter(isPaidBill).length},
  ];
  const focusedBills =
    billView === "creditCards" ? activeBills.filter(isCreditCardBill)
    : billView === "expenses" ? activeBills.filter((bill)=>!isCreditCardBill(bill))
    : billView === "recurring" ? activeBills.filter(isRecurringBill)
    : billView === "subscriptions" ? activeBills.filter(isSubscriptionBill)
    : billView === "paid" ? sortedBills.filter(isPaidBill)
    : [];
  const focusedTitle = viewDefinitions.find((view)=>view.key===billView)?.label ?? "Bills";
  const focusedTotalLabel =
    billView === "paid" ? "Total Paid"
    : billView === "subscriptions" ? "Total Subscriptions"
    : billView === "recurring" ? "Total Recurring"
    : billView === "creditCards" ? "Total Credit Card Bills"
    : "Total Expenses";
  const dueNextSevenDaysTotal = bills
    .filter(isDueWithinNextSevenDays)
    .reduce((sum, bill) => sum + Number(bill.amount || 0), 0);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name"));
    const category = String(form.get("category"));
    const notes = String(form.get("notes"));
    const isSubscription = isSubscriptionText(category, name, notes);
    const bill: Bill = {
      id: Date.now(),
      name,
      category,
      amount: Number(form.get("amount")),
      dueDate: String(form.get("dueDate")),
      recurrenceStartDate: String(form.get("dueDate")),
      frequency: billPlanType==="One-time"?"One-time":billPlanType==="Installment"?`Installment · ${Number(form.get("installmentMonths"))} months`:String(form.get("frequency")),
      account: "",
      status: String(form.get("status")),
      autopay: form.get("autopay") === "on",
      autopayAccount: String(form.get("autopayAccount") || ""),
      reminder: String(form.get("reminder")),
      notes,
      planType:billPlanType,
      installmentMonths:billPlanType==="Installment"?Number(form.get("installmentMonths")):undefined,
      recordType:isSubscription?"subscription":undefined,
    };
    setBills((current) => [...current, bill].sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")) || a.name.localeCompare(b.name)));
    setSelectedId(bill.id);
    if (isSubscription) selectBillView("subscriptions");
    else if (billPlanType === "Recurring") selectBillView("recurring");
    setShowAdd(false);
    onNotice(`${bill.name} added`);
  };
  return (
    <section className="feature-page bills-calendar-page">
      <div className="fp-head">
        <div>
          <h2>Bills & Payments</h2>
          <p>A simple list of upcoming and recurring commitments.</p>
        </div>
        <div className="bills-head-actions">
          <button className="primary" onClick={() => setShowAdd(true)}>
            <Plus />
            Add bill
          </button>
        </div>
      </div>
      <div className="bill-overview">
        <div>
          <span>Due next 7 days</span>
          <b className="negative">{peso(dueNextSevenDaysTotal)}</b>
        </div>
        <div>
          <span>Automatic payments</span>
          <b>{bills.filter((b) => b.autopay).length} bills</b>
        </div>
        <div>
          <span>Overdue</span>
          <b className="negative">
            {bills.filter((b) => b.status === "Overdue").length} bill
          </b>
        </div>
        <div>
          <span>Recurring</span>
          <b>
            {bills.filter((b) => b.frequency !== "Custom frequency").length}{" "}
            bills
          </b>
        </div>
      </div>
      <div className="bill-view-tabs" role="tablist" aria-label="Bills and payments views">
        {viewDefinitions.map((view)=><button key={view.key} role="tab" aria-selected={billView===view.key} className={billView===view.key?"active":""} onClick={()=>selectBillView(view.key)}>{view.label}<span>{view.count}</span></button>)}
      </div>
      <div className="bill-calendar-layout">
        {billView==="due7" || billView==="month" ? <div className="bills-two-column-layout">
          <BillColumn
            title="Credit Card Bills"
            totalLabel="Total Credit Card Bills"
            bills={creditCardBills}
            cards={(wallet.cards ?? []) as WalletCardLogo[]}
            useCardLogos
            total={sumBills(creditCardBills)}
            emptyText="No unpaid credit card bills to show."
            onSelect={(id) => {
              setSelectedId(id);
              setDetailBillId(id);
            }}
          />
          <BillColumn
            title="Expenses"
            totalLabel="Total Expenses"
            bills={expenseBills}
            total={sumBills(expenseBills)}
            emptyText="No unpaid expenses to show."
            onSelect={(id) => {
              setSelectedId(id);
              setDetailBillId(id);
            }}
          />
        </div> : <div className="bills-single-column-layout">
          <BillColumn
            title={focusedTitle}
            totalLabel={focusedTotalLabel}
            bills={focusedBills}
            cards={(wallet.cards ?? []) as WalletCardLogo[]}
            useCardLogos={billView==="creditCards" || billView==="recurring" || billView==="paid"}
            total={sumBills(focusedBills)}
            emptyText={`No ${focusedTitle.toLowerCase()} to show.`}
            onSelect={(id) => {
              setSelectedId(id);
              setDetailBillId(id);
            }}
          />
        </div>}
      </div>
      {detailBill&&<BillDetailModal bill={detailBill} onClose={()=>setDetailBillId(0)} onPay={()=>{setSelectedId(detailBill.id);setDetailBillId(0);setBillAction('pay')}} onEdit={()=>{setSelectedId(detailBill.id);setDetailBillId(0);setBillAction('edit')}} onDelete={()=>{const remaining=bills.filter(bill=>bill.id!==detailBill.id);setBills(remaining);if(selectedId===detailBill.id&&remaining[0])setSelectedId(remaining[0].id);setDetailBillId(0);onNotice(`${detailBill.name} deleted`)}}/>}
      {billAction&&selected&&<BillActionModal mode={billAction} bill={selected} onClose={()=>setBillAction(null)} onSave={(values)=>{if(billAction==='pay'){payBill(selected,String(values.account||""),String(values.lastPaymentDate||selected.dueDate));setBillAction(null);return}const shouldClearPayment=!/^paid$/i.test(String(values.status||selected.status));const cleanedValues=shouldClearPayment?{...values,paymentHistory:[],lastPaymentDate:undefined,lastPaymentAmount:undefined,lastPaymentMethod:undefined,paymentTransactionId:undefined}:values;setBills(rows=>rows.map(b=>{if(b.id!==selected.id)return b;const updated={...b,...cleanedValues};return {...updated,recordType:isSubscriptionText(updated.category,updated.name,updated.notes)?"subscription":undefined}}));setBillAction(null);onNotice(`${selected.name} updated`)}} onDelete={()=>{const remaining=bills.filter(bill=>bill.id!==selected.id);setBills(remaining);if(remaining[0])setSelectedId(remaining[0].id);setBillAction(null);onNotice(`${selected.name} deleted`)}}/>}
      {showAdd && (
        <div className="modal-backdrop" onMouseDown={() => setShowAdd(false)}>
          <section
            className="modal bill-form-modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <h2>Add bill</h2>
                <p>Create a one-time or recurring financial commitment.</p>
              </div>
              <button
                aria-label="Close"
                className="icon-button"
                onClick={() => setShowAdd(false)}
              >
                <X />
              </button>
            </div>
            <div className="bill-plan-type" role="radiogroup" aria-label="Bill type">
              {(["One-time","Recurring","Installment"] as const).map(type=><button type="button" role="radio" aria-checked={billPlanType===type} className={billPlanType===type?"active":""} key={type} onClick={()=>setBillPlanType(type)}>{type}</button>)}
            </div>
            <form onSubmit={submit}>
              <div className="form-grid">
                <label>
                  Bill name
                  <input
                    name="name"
                    required
                    placeholder="e.g. Electricity"
                    autoFocus
                  />
                </label>
              </div>
              <CategoryFields />
              <div className="form-grid">
                <label>
                  Amount
                  <input
                    name="amount"
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="₱ 0.00"
                  />
                </label>
                <label>
                  Due date
                  <input
                    name="dueDate"
                    required
                    type="date"
                    defaultValue="2026-07-28"
                  />
                </label>
              </div>
              <div className="form-grid">
                {billPlanType==="Recurring"&&<label>
                  Frequency
                  <select name="frequency">{frequencies.map((x) => <option key={x}>{x}</option>)}</select>
                </label>}
                {billPlanType==="Installment"&&<label>Total number of months<input name="installmentMonths" type="number" min="2" max="120" defaultValue="6" required/></label>}
                {billPlanType==="One-time"&&<div className="form-note">This bill occurs once and will not create future entries.</div>}
                <div className="form-note">Payment account is selected only when the bill is marked as paid.</div>
              </div>
              <div className="form-grid">
                <label>
                  Payment status
                  <select name="status">
                    {statuses.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Reminder date
                  <input
                    name="reminder"
                    required
                    type="date"
                    defaultValue="2026-07-26"
                  />
                </label>
              </div>
              <label className="autopay-check">
                <input name="autopay" type="checkbox" />
                Automatic payment enabled
              </label>
              <label>
                Automatic payment method
                <ConnectedAccountSelect name="autopayAccount" />
                <small className="field-hint">Required when automatic payment is enabled. You can choose a bank account or credit card.</small>
              </label>
              <label>
                Notes
                <textarea
                  name="notes"
                  rows={3}
                  placeholder="Add payment instructions or other details"
                />
              </label>
              <button className="primary submit" type="submit">
                <Plus />
                Add bill
              </button>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

function CalendarView({
  bills,
  selectedId,
  onSelect,
}: {
  bills: Bill[];
  selectedId: number;
  onSelect: (id: number) => void;
}) {
  return (
    <article className="surface month-calendar bills-month">
      <div className="cal-nav">
        <button aria-label="Previous month">
          <ChevronLeft />
        </button>
        <button>Today</button>
        <h3>July 2026</h3>
        <button aria-label="Next month">
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
          const day = i - 2;
          const dayBills = bills.filter(
            (b) => Number(b.dueDate.slice(-2)) === day,
          );
          return (
            <button
              key={i}
              className={
                dayBills.some((b) => b.id === selectedId)
                  ? "selected"
                  : day < 1 || day > 31
                    ? "muted-day"
                    : ""
              }
              onClick={() => dayBills[0] && onSelect(dayBills[0].id)}
            >
              <span>{day < 1 ? 28 + day : day > 31 ? day - 31 : day}</span>
              {dayBills.map((b) => (
                <em key={b.id} className={`bill-event ${statusSlug(b.status)}`}>
                  {billDisplayName(b.name)}
                  <b>{peso(b.amount)}</b>
                </em>
              ))}
            </button>
          );
        })}
      </div>
    </article>
  );
}

function ListView({
  bills,
  selectedId,
  onSelect,
  filter,
  onFilter,
}: {
  bills: Bill[];
  selectedId: number;
  onSelect: (id: number) => void;
  filter: string;
  onFilter: (v: string) => void;
}) {
  return (
    <article className="surface bills-list-view">
      <div className="list-toolbar">
        <div>
          <b>All commitments</b>
          <span>{bills.length} bills shown</span>
        </div>
        <select
          aria-label="Filter by status"
          value={filter}
          onChange={(e) => onFilter(e.target.value)}
        >
          <option>All statuses</option>
          {statuses.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>
      <div className="bills-list-head">
        <b aria-hidden="true" />
        <b>Due Date</b>
        <b>Bill</b>
        <b>Days Left</b>
        <b>Frequency</b>
        <b>Amount</b>
        <b>Status</b>
        <b aria-hidden="true" />
      </div>
      {[...bills].sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")) || a.name.localeCompare(b.name)).map((b) => {
        const due = dueDateParts(b.dueDate);
        return (
        <button
          className={b.id === selectedId ? "selected" : ""}
          key={b.id}
          onClick={() => onSelect(b.id)}
          title={`Due ${formatDueDate(b.dueDate)}`}
        >
          <CategoryIcon value={b.category} className="bill-row-leading-icon" />
          <span className="due-block bill-row-date">
            <small>{due.month}</small>
            {due.day}
          </span>
          <span className="bill-row-description">
            <b>{billDisplayName(b.name)}</b>
            <small>{b.autopay ? "Auto-pay on" : "Manual payment"}</small>
          </span>
          <span className={`bill-row-days ${daysLeftLabel(b.dueDate).includes("overdue") ? "negative" : ""}`}>{daysLeftLabel(b.dueDate)}</span>
          <span className="bill-row-frequency">{b.frequency}</span>
          <strong className="bill-row-amount">{peso(b.amount)}</strong>
          <em className={`bill-row-status ${statusSlug(b.status)}`}>{b.status}</em>
          <ChevronRight className="bill-row-arrow" />
        </button>
      )})}
    </article>
  );
}

function BillColumn({
  title,
  totalLabel,
  bills,
  total,
  emptyText,
  onSelect,
  cards = [],
  useCardLogos = false,
}: {
  title: string;
  totalLabel: string;
  bills: Bill[];
  total: number;
  emptyText: string;
  onSelect: (id: number) => void;
  cards?: WalletCardLogo[];
  useCardLogos?: boolean;
}) {
  return (
    <article className="surface bill-column">
      <div className="bill-column-head">
        <div>
          <h3>{title}</h3>
          <span>{bills.length} visible</span>
        </div>
        <div className="bill-column-total">
          <span>{totalLabel}</span>
          <strong>{peso(total)}</strong>
        </div>
      </div>
      <div className="bill-column-list">
        <div className="bill-column-list-head">
          <b aria-hidden="true" />
          <b>Due Date</b>
          <b>Bill / Expense</b>
          <b>Days Left</b>
          <b>Amount</b>
          <b>Status</b>
          <b aria-hidden="true" />
        </div>
        {bills.length === 0 ? (
          <p className="empty-card">{emptyText}</p>
        ) : (
          bills.map((bill) => {
            const due = dueDateParts(bill.dueDate);
            const daysLeft = daysLeftLabel(bill.dueDate);
            const card = useCardLogos ? cardForBill(bill, cards) : null;
            return (
              <button
                className="bill-column-row"
                key={bill.id}
                onClick={() => onSelect(bill.id)}
                title={`Open ${billDisplayName(bill.name)}`}
              >
                {card ? (
                  <BankLogo
                    bankId={card.bankId ?? null}
                    bankName={card.bank || card.name || bill.name}
                    customLogo={card.customLogo || ""}
                    size="small"
                    className="bill-column-leading-icon"
                  />
                ) : (
                  <CategoryIcon value={bill.category} className="bill-column-leading-icon" />
                )}
                <span className="due-block bill-column-date">
                  <small>{due.month}</small>
                  {due.day}
                </span>
                <span className="bill-column-description">
                  <b>{billDisplayName(bill.name)}</b>
                  <small>{bill.frequency}</small>
                </span>
                <span className={`bill-column-days ${daysLeft.includes("overdue") ? "negative" : ""}`}>
                  {daysLeft}
                </span>
                <strong className="bill-column-amount">{peso(bill.amount)}</strong>
                <em className={`bill-column-status ${statusSlug(bill.status)}`}>{bill.status}</em>
                <ChevronRight className="bill-column-arrow" />
              </button>
            );
          })
        )}
      </div>
    </article>
  );
}

function BillDetailModal({
  bill,
  onClose,
  onPay,
  onEdit,
  onDelete,
}: {
  bill: Bill;
  onClose: () => void;
  onPay: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal bill-detail-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2>{billDisplayName(bill.name)}</h2>
            <p>{isCreditCardBill(bill) ? "Credit card bill" : "Expense"} · {peso(bill.amount)}</p>
          </div>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="bill-detail-summary">
          <div>
            <span>Amount</span>
            <strong>{peso(bill.amount)}</strong>
          </div>
          <div>
            <span>Due date</span>
            <strong>{formatDueDate(bill.dueDate)}</strong>
          </div>
          <div>
            <span>Status</span>
            <em className={statusSlug(bill.status)}>{bill.status}</em>
          </div>
        </div>
        <dl className="bill-detail-fields">
          <div>
            <dt>Category</dt>
            <dd>{bill.category || "Uncategorized"}</dd>
          </div>
          <div>
            <dt>Frequency</dt>
            <dd>{bill.frequency}</dd>
          </div>
          <div>
            <dt>Payment account</dt>
            <dd>{bill.account || "Select when paid"}</dd>
          </div>
          <div>
            <dt>Automatic payment</dt>
            <dd>{bill.autopay ? `Enabled · ${bill.autopayAccount || "No account selected"}` : "Disabled"}</dd>
          </div>
          <div className="notes-detail">
            <dt>Notes</dt>
            <dd>{bill.notes || "No notes"}</dd>
          </div>
        </dl>
        <div className="bill-detail-actions">
          <button className="primary" type="button" onClick={onPay}>
            <Check />
            Mark as Paid
          </button>
          <button className="outline" type="button" onClick={onEdit}>
            Edit
          </button>
          <button className="danger-outline" type="button" onClick={onDelete}>
            Delete
          </button>
        </div>
      </section>
    </div>
  );
}

function BillInspector({
  bill,
  onPay,onEdit,
}: {
  bill: Bill;
  onPay:()=>void;onEdit:()=>void;
}) {
  return (
    <aside className="surface bill-inspector">
      <div className="inspector-title">
        <div>
          <small>Selected bill</small>
          <h3>{billDisplayName(bill.name)}</h3>
        </div>
        <strong>{peso(bill.amount)}</strong>
      </div>
      <span className={`detail-status ${statusSlug(bill.status)}`}>
        {bill.status}
      </span>
      <dl>
        <div>
          <dt>Category</dt>
          <dd>{bill.category}</dd>
        </div>
        {bill.statementDate && (
          <>
            <div>
              <dt>Statement date</dt>
              <dd>
                {new Date(`${bill.statementDate}T12:00`).toLocaleDateString(
                  "en-US",
                  { month: "long", day: "numeric", year: "numeric" },
                )}
              </dd>
            </div>
            <div>
              <dt>Original statement</dt>
              <dd>{peso(bill.originalStatement || 0)}</dd>
            </div>
            <div>
              <dt>Remaining amount due</dt>
              <dd>{peso(bill.amount)}</dd>
            </div>
            <div>
              <dt>Minimum amount due</dt>
              <dd>{peso(bill.minimumDue || 0)}</dd>
            </div>
            <div>
              <dt>Planned payment</dt>
              <dd>{peso(bill.plannedPayment || 0)}</dd>
            </div>
          </>
        )}
        <div>
          <dt>Due date</dt>
          <dd>
            {new Date(`${bill.dueDate}T12:00`).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </dd>
        </div>
        <div>
          <dt>Frequency</dt>
          <dd>
            <Repeat2 />
            {bill.frequency}
          </dd>
        </div>
        <div>
          <dt>Payment account</dt>
          <dd>{bill.account||"Select when paid"}</dd>
        </div>
        <div>
          <dt>Automatic payment</dt>
          <dd>{bill.autopay ? `Enabled · ${bill.autopayAccount || "Select method"}` : "Disabled"}</dd>
        </div>
        {bill.lastPaymentDate&&(
          <div>
            <dt>Last payment</dt>
            <dd>{peso(bill.lastPaymentAmount||0)} · {bill.lastPaymentMethod} · {new Date(`${bill.lastPaymentDate}T12:00`).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</dd>
          </div>
        )}
        {!!bill.paymentHistory?.length&&(
          <div>
            <dt>Payments recorded</dt>
            <dd>{bill.paymentHistory.length}</dd>
          </div>
        )}
        {bill.planType==="Installment"&&(
          <div>
            <dt>Installment progress</dt>
            <dd>{bill.installmentPaidMonths||0}/{bill.installmentMonths||0}</dd>
          </div>
        )}
        <div>
          <dt>Reminder date</dt>
          <dd>
            <Clock />
            {new Date(`${bill.reminder}T12:00`).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </dd>
        </div>
        <div className="notes-detail">
          <dt>Notes</dt>
          <dd>{bill.notes || "No notes"}</dd>
        </div>
      </dl>
      <button
        className="primary"
        onClick={onPay}
      >
        <Check />
        Mark as paid
      </button>
      <button
        className="outline"
        onClick={onEdit}
      >
        Edit bill
      </button>
    </aside>
  );
}

function BillActionModal({mode,bill,onClose,onSave,onDelete}:{mode:'pay'|'edit';bill:Bill;onClose:()=>void;onSave:(values:Partial<Bill>)=>void;onDelete:()=>void}){
 return <div className="modal-backdrop" onMouseDown={onClose}>
  <section className="modal" role="dialog" aria-modal="true" onMouseDown={e=>e.stopPropagation()}>
    <div className="modal-head">
      <div><h2>{mode==='pay'?'Mark bill as paid':'Edit bill'}</h2><p>{billDisplayName(bill.name)} · {peso(bill.amount)}</p></div>
      <button className="icon-button" aria-label="Close" onClick={onClose}><X/></button>
    </div>
    {mode==='pay'
      ? <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);onSave({account:String(f.get('account')),lastPaymentDate:String(f.get('paymentDate'))})}}>
          <label>Payment account<ConnectedAccountSelect required defaultValue={bill.account||bill.autopayAccount||""}/></label>
          <label>Payment date<input name="paymentDate" type="date" required defaultValue={bill.dueDate}/></label>
          <button className="primary submit"><Check/>Confirm payment</button>
        </form>
      : <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);onSave({name:String(f.get('name')),category:String(f.get('category')),amount:Number(f.get('amount')),dueDate:String(f.get('dueDate')),frequency:String(f.get('frequency')),status:String(f.get('status')),autopay:f.get('autopay')==='on',autopayAccount:String(f.get('autopayAccount')||''),notes:String(f.get('notes'))})}}>
          <div className="form-grid">
            <label>Bill name<input name="name" defaultValue={billDisplayName(bill.name)} required/></label>
            <label>Amount<input name="amount" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={bill.amount} required/></label>
          </div>
          <CategoryFields defaultValue={bill.category}/>
          <div className="form-grid">
            <label>Due date<input name="dueDate" type="date" defaultValue={bill.dueDate} required/></label>
            <label>Frequency<select name="frequency" defaultValue={bill.frequency}><option>One-time</option>{frequencies.map(x=><option key={x}>{x}</option>)}</select></label>
          </div>
          <div className="form-grid">
            <label>Status<select name="status" defaultValue={bill.status}>{statuses.map(x=><option key={x}>{x}</option>)}</select></label>
            <label>Automatic payment method<ConnectedAccountSelect name="autopayAccount" defaultValue={bill.autopayAccount||""}/></label>
          </div>
          <label className="autopay-check"><input name="autopay" type="checkbox" defaultChecked={bill.autopay}/>Automatic payment enabled</label>
          <label>Notes<textarea name="notes" rows={3} defaultValue={bill.notes}/></label>
          <div className="record-edit-actions"><button className="primary" type="submit">Save bill changes</button><button className="danger-outline" type="button" onClick={onDelete}>Delete bill</button></div>
        </form>}
  </section>
 </div>
}
