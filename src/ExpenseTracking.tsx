import { FormEvent, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Paperclip,
  Plus,
  Receipt,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {categoryLabel,useCategories} from "./data/categories";
import { useFirestoreState } from "./hooks/useFirestoreState";

type ExpenseKind = "Fixed" | "Variable" | "Unexpected";
type Expense = {
  id: number;
  name: string;
  category: string;
  kind: ExpenseKind;
  planned: number;
  actual: number;
  transactionDate: string;
  dueDate: string;
  account: string;
  recurring: string;
  essential: boolean;
  notes: string;
  receipt: string;
};
type Props = { onNotice: (text: string) => void };
const seed: Expense[] = [
  {
    id: 1,
    name: "Apartment rent",
    category: "Rent",
    kind: "Fixed",
    planned: 10000,
    actual: 10000,
    transactionDate: "2026-07-01",
    dueDate: "2026-07-01",
    account: "BPI Savings",
    recurring: "Monthly",
    essential: true,
    notes: "Monthly lease payment",
    receipt: "rent-july.pdf",
  },
  {
    id: 2,
    name: "Weekly groceries",
    category: "Groceries",
    kind: "Variable",
    planned: 5000,
    actual: 4350,
    transactionDate: "2026-07-18",
    dueDate: "2026-07-20",
    account: "BPI Rewards",
    recurring: "Weekly",
    essential: true,
    notes: "Household groceries",
    receipt: "marketplace-receipt.jpg",
  },
  {
    id: 3,
    name: "Electricity bill",
    category: "Electricity",
    kind: "Variable",
    planned: 3000,
    actual: 3500,
    transactionDate: "2026-07-20",
    dueDate: "2026-07-21",
    account: "BPI Savings",
    recurring: "Monthly",
    essential: true,
    notes: "Higher air-conditioning use",
    receipt: "",
  },
  {
    id: 4,
    name: "Phone screen repair",
    category: "Repairs",
    kind: "Unexpected",
    planned: 0,
    actual: 4200,
    transactionDate: "2026-07-16",
    dueDate: "2026-07-16",
    account: "Cash",
    recurring: "No",
    essential: true,
    notes: "Unplanned replacement screen",
    receipt: "repair-invoice.pdf",
  },
  {
    id: 5,
    name: "Streaming services",
    category: "Subscriptions",
    kind: "Fixed",
    planned: 1200,
    actual: 1200,
    transactionDate: "2026-07-10",
    dueDate: "2026-07-10",
    account: "BPI Rewards",
    recurring: "Monthly",
    essential: false,
    notes: "Three active subscriptions",
    receipt: "",
  },
];
const money = (n: number) =>
  `${n < 0 ? "−" : ""}₱${Math.abs(n).toLocaleString()}`;
const variance = (e: Expense) => e.actual - e.planned;
const budgetStatus = (e: Expense) =>
  variance(e) < 0
    ? "Under budget"
    : variance(e) > 0
      ? "Over budget"
      : "On budget";
const d = (v: string) =>
  new Date(`${v}T12:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export default function ExpenseTracking({ onNotice }: Props) {
  const [items, setItems] = useFirestoreState<Expense[]>("expenses", []),
    [kind, setKind] = useState("All"),
    [selected, setSelected] = useState<Expense | null>(null),
    [adding, setAdding] = useState(false);
  const visible = kind === "All" ? items : items.filter((e) => e.kind === kind);
  const totals = items.reduce(
      (a, e) => ({
        planned: a.planned + e.planned,
        actual: a.actual + e.actual,
      }),
      { planned: 0, actual: 0 },
    ),
    totalVariance = totals.actual - totals.planned;
  const add = (expense: Expense) => {
    setItems((current) => [expense, ...current]);
    setSelected(expense);
    setAdding(false);
    onNotice(`${expense.name} added · ${budgetStatus(expense)}`);
  };
  return (
    <section className="feature-page expense-tracking">
      <div className="fp-head">
        <div>
          <h2>Expense Tracking</h2>
          <p>
            Compare planned spending with actual costs and catch overruns early.
          </p>
        </div>
        <button className="primary" onClick={() => setAdding(true)}>
          <Plus />
          Add expense
        </button>
      </div>
      <div className="expense-summary">
        <div>
          <span>Planned expenses</span>
          <b>{money(totals.planned)}</b>
          <small>Original budget</small>
        </div>
        <div>
          <span>Actual expenses</span>
          <b>{money(totals.actual)}</b>
          <small>Recorded spending</small>
        </div>
        <div>
          <span>Total variance</span>
          <b className={totalVariance > 0 ? "negative" : "positive"}>
            {totalVariance > 0 ? "+" : ""}
            {money(totalVariance)}
          </b>
          <small>Actual − planned</small>
        </div>
        <div>
          <span>Budget position</span>
          <b className={totalVariance > 0 ? "negative" : "positive"}>
            {totalVariance > 0
              ? "Over budget"
              : totalVariance < 0
                ? "Under budget"
                : "On budget"}
          </b>
          <small>Across tracked expenses</small>
        </div>
      </div>
      <div className="expense-tabs" role="tablist">
        {["All", "Fixed", "Variable", "Unexpected"].map((v) => (
          <button
            role="tab"
            aria-selected={kind === v}
            className={kind === v ? "active" : ""}
            onClick={() => setKind(v)}
            key={v}
          >
            {v}
            <small>
              {v === "All"
                ? items.length
                : items.filter((e) => e.kind === v).length}
            </small>
          </button>
        ))}
      </div>
      <div className="expense-layout">
        <article className="surface expense-list">
          <div className="expense-list-head">
            <b>Expense comparison</b>
            <span>
              <SlidersHorizontal />
              Variance = actual − planned
            </span>
          </div>
          <div className="expense-columns">
            <span>Expense</span>
            <span>Planned</span>
            <span>Actual</span>
            <span>Variance</span>
            <span>Status</span>
          </div>
          {visible.map((e) => {
            const v = variance(e),
              status = budgetStatus(e);
            return (
              <button
                className={selected?.id === e.id ? "selected" : ""}
                key={e.id}
                onClick={() => setSelected(e)}
              >
                <span className="expense-icon">
                  <Receipt />
                </span>
                <span className="expense-name">
                  <b>{e.name}</b>
                  <small>
                    {e.category} · {e.kind}
                  </small>
                </span>
                <span data-label="Planned">{money(e.planned)}</span>
                <strong data-label="Actual">{money(e.actual)}</strong>
                <span
                  data-label="Variance"
                  className={v > 0 ? "negative" : v < 0 ? "positive" : ""}
                >
                  {v > 0 ? "+" : ""}
                  {money(v)}
                </span>
                <em
                  className={`variance-status ${status.toLowerCase().replaceAll(" ", "-")}`}
                >
                  {status}
                </em>
                <ChevronRight />
              </button>
            );
          })}
        </article>
        {selected ? <aside className="surface expense-detail">
          <div className="expense-detail-title">
            <span>
              <Receipt />
            </span>
            <div>
              <small>{selected.kind} expense</small>
              <h3>{selected.name}</h3>
            </div>
          </div>
          <div className="variance-hero">
            <div>
              <span>Planned</span>
              <b>{money(selected.planned)}</b>
            </div>
            <i>→</i>
            <div>
              <span>Actual</span>
              <b>{money(selected.actual)}</b>
            </div>
            <em
              className={`variance-status ${budgetStatus(selected).toLowerCase().replaceAll(" ", "-")}`}
            >
              {budgetStatus(selected)}
            </em>
          </div>
          <div className="variance-callout">
            <span className={variance(selected) > 0 ? "negative" : "positive"}>
              {variance(selected) > 0 ? "+" : ""}
              {money(variance(selected))}
            </span>
            <small>Actual expense − planned expense</small>
          </div>
          <div className="expense-fields">
            {[
              ["Category", selected.category],
              ["Transaction date", d(selected.transactionDate)],
              ["Due date", d(selected.dueDate)],
              ["Payment account", selected.account],
              ["Recurring", selected.recurring],
              ["Priority", selected.essential ? "Essential" : "Non-essential"],
            ].map(([l, v]) => (
              <div key={l}>
                <span>{l}</span>
                <b>{v}</b>
              </div>
            ))}
          </div>
          <div className="expense-notes">
            <span>Notes</span>
            <p>{selected.notes || "No notes added."}</p>
          </div>
          <button
            className="receipt-button"
            onClick={() =>
              onNotice(
                selected.receipt
                  ? `${selected.receipt} selected`
                  : "No receipt attached",
              )
            }
          >
            <Paperclip />
            <span>
              <b>{selected.receipt || "No receipt attached"}</b>
              <small>
                {selected.receipt
                  ? "View attachment"
                  : "Add a receipt from Edit expense"}
              </small>
            </span>
          </button>
        </aside> : <aside className="surface expense-detail"><p className="empty-card">No expenses recorded. Add an expense to begin.</p></aside>}
      </div>
      {adding && <ExpenseModal onClose={() => setAdding(false)} onAdd={add} />}
    </section>
  );
}

function ExpenseModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (e: Expense) => void;
}) {
  const sharedCategories=useCategories();
  const [kind, setKind] = useState<ExpenseKind>("Variable"),
    [receipt, setReceipt] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    onAdd({
      id: Date.now(),
      name: String(f.get("name")),
      category: String(f.get("category")),
      kind,
      planned: Number(f.get("planned")),
      actual: Number(f.get("actual")),
      transactionDate: String(f.get("transactionDate")),
      dueDate: String(f.get("dueDate")),
      account: String(f.get("account")),
      recurring: String(f.get("recurring")),
      essential: f.get("essential") === "Essential",
      notes: String(f.get("notes") || ""),
      receipt,
    });
  };
  const categories = sharedCategories;
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal expense-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2>Add expense</h2>
            <p>Record the plan and the amount actually spent.</p>
          </div>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="expense-kind-switch">
            {(["Fixed", "Variable", "Unexpected"] as ExpenseKind[]).map((v) => (
              <button
                type="button"
                className={kind === v ? "selected" : ""}
                onClick={() => setKind(v)}
                key={v}
              >
                {v}
              </button>
            ))}
          </div>
          <label>
            Expense name
            <input
              name="name"
              required
              autoFocus
              placeholder="e.g. Weekly groceries"
            />
          </label>
          <div className="form-grid">
            <label>
              Category
              <select name="category">
                {categories.map((v) => (
                  <option key={v.name} value={v.name}>{categoryLabel(v)}</option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select name="essential">
                <option>Essential</option>
                <option>Non-essential</option>
              </select>
            </label>
          </div>
          <div className="form-grid">
            <label>
              Planned amount
              <input name="planned" type="number" min="0" required />
            </label>
            <label>
              Actual amount
              <input name="actual" type="number" min="0" required />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Transaction date
              <input
                name="transactionDate"
                type="date"
                required
                defaultValue="2026-07-20"
              />
            </label>
            <label>
              Due date
              <input
                name="dueDate"
                type="date"
                required
                defaultValue="2026-07-20"
              />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Payment account
              <select name="account">
                <option>BPI Savings</option>
                <option>BPI Rewards</option>
                <option>Metrobank Savings</option>
                <option>Cash</option>
              </select>
            </label>
            <label>
              Recurring status
              <select name="recurring">
                <option>No</option>
                <option>Weekly</option>
                <option>Monthly</option>
                <option>Quarterly</option>
                <option>Annually</option>
              </select>
            </label>
          </div>
          <label>
            Notes
            <textarea
              name="notes"
              rows={2}
              placeholder="Optional expense details"
            />
          </label>
          <label className="receipt-upload">
            <Paperclip />
            <span>
              <b>{receipt || "Attach receipt"}</b>
              <small>PDF, PNG, or JPG</small>
            </span>
            <input
              name="receipt"
              type="file"
              accept="image/png,image/jpeg,application/pdf"
              onChange={(e) => setReceipt(e.target.files?.[0]?.name || "")}
            />
          </label>
          <button className="primary submit" type="submit">
            <Plus />
            Add expense
          </button>
        </form>
      </section>
    </div>
  );
}
