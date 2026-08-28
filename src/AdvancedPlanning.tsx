import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Filter,
  HandCoins,
  Info,
  MoreVertical,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  Target,
  TrendingUp,
  Trash2,
  WalletCards,
  Wallet,
  X,
} from "lucide-react";
import {
  budgetMetrics,
  CategoryBudget,
  collect,
  completePlanned,
  createInstallment,
  Debt,
  Installment,
  installmentSchedule,
  payDebt,
  payInstallment,
  PlannedPayment,
  projectedBalance,
  recurrenceDates,
  Receivable,
  receivableOutstanding,
} from "./domain/planningEngine";
import { CategoryFields } from "./components/CategoryFields";
import { CategoryIcon } from "./components/CategoryIcon";
import { useCategories } from "./data/categories";
import { ConnectedAccountSelect } from "./components/ConnectedAccountSelect";
import { useFirestoreState } from "./hooks/useFirestoreState";
import { useWalletSnapshot } from "./hooks/useWalletSnapshot";
import { connectBudgetsToTransactions, isExcludedBudgetCategory, transactionsForBudget, type BudgetTransactionBreakdown, type BudgetWallet } from "./utils/budgetSpending";
type Props = { page: string; onNotice: (text: string) => void };
type ExpectedIncomeRecord = {
  id: number | string;
  source?: string;
  name?: string;
  type?: string;
  category?: string;
  amount: number;
  expectedDate?: string;
  date?: string;
  dueDate?: string;
  frequency?: string;
  recurrenceEnd?: string;
  status?: string;
  archived?: boolean;
};
const peso = (n: number) =>
  `${n < 0 ? "−" : ""}₱${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const pesoExact = (n: number) =>
  `${n < 0 ? "−" : ""}₱${Math.abs(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const todayIso=()=>{const date=new Date();return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`};
const currentMonthLabel=()=>new Date().toLocaleDateString("en-US",{month:"long",year:"numeric"});
const currentMonthKey=()=>`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`;
const monthBounds=(monthKey:string)=>{
  const [year,month]=monthKey.split("-").map(Number),start=new Date(year,month-1,1,12),end=new Date(year,month,0,12);
  return {
    start:`${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,"0")}-${String(start.getDate()).padStart(2,"0")}`,
    end:`${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,"0")}-${String(end.getDate()).padStart(2,"0")}`,
  };
};
const monthName=(monthKey:string)=>new Date(`${monthKey}-01T12:00`).toLocaleDateString("en-US",{month:"long",year:"numeric"});
const normalizeCategoryKey=(value:string)=>value.toLowerCase().replace(/\s*\/\s*/g," / ").replace(/\s+/g," ").trim();
const budgetKey=(budget:Pick<CategoryBudget,"name"|"parent"|"subcategory">)=>normalizeCategoryKey(budget.subcategory?`${budget.parent||budget.name} / ${budget.subcategory}`:budget.parent||budget.name);
const stableNegativeId=(value:string)=>-Math.abs(Array.from(value).reduce((hash,char)=>((hash<<5)-hash+char.charCodeAt(0))|0,0))-1;
const addBudgetMonths=(value:string,months:number)=>{
  const source=new Date(`${value}T12:00`);
  const day=source.getDate();
  const target=new Date(source.getFullYear(),source.getMonth()+months+1,0,12);
  const date=new Date(source.getFullYear(),source.getMonth()+months,Math.min(day,target.getDate()),12);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
};
const addBudgetDays=(value:string,days:number)=>{
  const date=new Date(`${value}T12:00`);
  date.setDate(date.getDate()+days);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
};
const budgetFrequencyStep=(frequency=""):{days?:number;months?:number}|null=>{
  const value=frequency.toLowerCase().trim();
  if(!value||value==="one-time"||value==="one time")return null;
  if(value==="weekly")return{days:7};
  if(value==="every two weeks"||value==="biweekly")return{days:14};
  if(value==="monthly")return{months:1};
  if(value==="every two months")return{months:2};
  if(value==="quarterly")return{months:3};
  if(value==="semiannually"||value==="semi-annually")return{months:6};
  if(value==="annually"||value==="yearly")return{months:12};
  return null;
};
const budgetRecurringDates=(baseDate:string,frequency:string|undefined,rangeStart:string,rangeEnd:string)=>{
  if(!baseDate)return[] as string[];
  const step=budgetFrequencyStep(frequency);
  if(!step)return baseDate>=rangeStart&&baseDate<=rangeEnd?[baseDate]:[];
  const dates:string[]=[];
  let cursor=baseDate;
  let guard=0;
  while(cursor<rangeStart&&guard<180){
    cursor=step.days?addBudgetDays(cursor,step.days):addBudgetMonths(cursor,step.months??1);
    guard+=1;
  }
  while(cursor<=rangeEnd&&guard<280){
    if(cursor>=rangeStart)dates.push(cursor);
    cursor=step.days?addBudgetDays(cursor,step.days):addBudgetMonths(cursor,step.months??1);
    guard+=1;
  }
  return dates;
};
const expectedIncomeTotalForRange=(records:ExpectedIncomeRecord[],rangeStart:string,rangeEnd:string)=>{
  const inactive=new Set(["deleted","archived","cancelled","canceled","skipped"]);
  const seen=new Set<string>();
  return records
    .filter(record=>!record.archived&&!inactive.has(String(record.status||"").toLowerCase()))
    .reduce((sum,record)=>{
      const baseDate=record.expectedDate||record.date||record.dueDate||"";
      const dates=budgetRecurringDates(baseDate,record.frequency,rangeStart,rangeEnd);
      return sum+dates.reduce((inner,date)=>{
        const key=`${record.id}-${date}-${record.source||record.name||record.category||""}`;
        if(seen.has(key))return inner;
        seen.add(key);
        return inner+Number(record.amount||0);
      },0);
    },0);
};
const budgetActualStatus=(item:CategoryBudget)=>{
  const allocated=Number(item.allocated||0),actual=Number(item.actual||0),usage=allocated?actual/allocated*100:0;
  if(actual<=0)return "No Spending";
  if(usage>100)return "Over Limit";
  if(usage>=90)return "Near Limit";
  return "Healthy";
};
const budgetsSeed: CategoryBudget[] = [
  {
    id: 1,
    name: "Food",
    parent: "Household",
    subcategory: "",
    type: "Parent category",
    allocated: 12000,
    incomePercentage: 0,
    period: "Monthly",
    start: "2026-07-01",
    end: "2026-07-31",
    rollover: false,
    rolloverLimit: 0,
    includePlanned: true,
    includePending: false,
    warning: 70,
    critical: 90,
    actual: 5000,
    planned: 2000,
    status: "Monitor",
    notes: "Includes groceries, dining, and coffee",
    archived: false,
  },
  {
    id: 2,
    name: "Groceries",
    parent: "Food",
    subcategory: "Groceries",
    type: "Subcategory",
    allocated: 8000,
    incomePercentage: 0,
    period: "Monthly",
    start: "2026-07-01",
    end: "2026-07-31",
    rollover: true,
    rolloverLimit: 1500,
    includePlanned: true,
    includePending: true,
    warning: 70,
    critical: 90,
    actual: 5000,
    planned: 2000,
    status: "Monitor",
    notes: "Credit-card purchases count when posted.",
    archived: false,
  },
];
const debtsSeed: Debt[] = [
  {
    id: 1,
    name: "Salary loan",
    lender: "Employer Cooperative",
    type: "Salary loan",
    original: 20000,
    balance: 17000,
    interestType: "Declining balance",
    interestRate: 8,
    fees: 0,
    paymentAmount: 3500,
    frequency: "Monthly",
    start: "2026-06-01",
    nextDue: "2026-07-28",
    finalDue: "2026-12-28",
    paymentAccount: "BPI Savings",
    liabilityAccount: "Salary Loan Liability",
    status: "Due soon",
    principalPaid: 3000,
    interestPaid: 500,
    notes: "Payroll-linked loan",
    archived: false,
  },
];
const receivablesSeed: Receivable[] = [
  {
    id: 1,
    title: "Family loan",
    borrower: "Jamie Morgan",
    contact: "jamie@example.com",
    type: "Family loan",
    original: 10000,
    additional: 0,
    interest: 300,
    fees: 0,
    collectedPrincipal: 4000,
    collectedInterest: 300,
    writeOff: 0,
    transactionDate: "2026-06-10",
    expectedDate: "2026-07-25",
    sourceAccount: "BPI Savings",
    collectionAccount: "BPI Savings",
    status: "Partially collected",
    notes: "Second collection expected this week.",
    collectionHistory: [{id: 1, date: "2026-07-12", principal: 4000, interest: 300, fees: 0, account: "BPI Savings", status: "Posted"}],
    archived: false,
  },
];
const plannedSeed: PlannedPayment[] = [
  {
    id: 1,
    name: "Apartment rent",
    type: "Expense",
    amount: 5000,
    confidence: "Confirmed",
    expectedDate: "2026-07-27",
    dueDate: "2026-07-27",
    source: "BPI Savings",
    destination: "Landlord",
    category: "Housing",
    linkedModule: "Bills",
    frequency: "Monthly",
    recurrenceEnd: "2026-12-27",
    autoPost: false,
    status: "Upcoming",
    actualAmount: 0,
    notes: "Forecast only until posted.",
    archived: false,
  },
  {
    id: 2,
    name: "Client collection",
    type: "Receivable collection",
    amount: 3000,
    confidence: "Confirmed",
    expectedDate: "2026-07-25",
    dueDate: "2026-07-25",
    source: "Receivable",
    destination: "BPI Savings",
    category: "Collection",
    linkedModule: "Receivables",
    frequency: "One time",
    recurrenceEnd: "",
    autoPost: false,
    status: "Due soon",
    actualAmount: 0,
    notes: "",
    archived: false,
  },
];
const installmentSeed: Installment[] = [
  createInstallment({
    id: 1,
    name: "Laptop",
    merchant: "Tech Store",
    category: "Electronics",
    type: "Credit-card installment",
    original: 12000,
    downPayment: 0,
    interest: 0,
    fees: 0,
    count: 6,
    paidCount: 0,
    frequency: "Monthly",
    start: "2026-07-30",
    nextDue: "2026-07-30",
    fundingSource: "BPI Savings",
    linkedCard: "BPI Rewards",
    mode: "Expense by Installment",
    notes: "Six zero-interest payments",
    archived: false,
  }),
];

export default function AdvancedPlanning({ page, onNotice }: Props) {
  const [budgets, setBudgets] = useFirestoreState<CategoryBudget[]>("budgets", []),
    [debts, setDebts] = useFirestoreState<Debt[]>("debts", []),
    [receivables, setReceivables] = useFirestoreState<Receivable[]>("receivables", []),
    [planned, setPlanned] = useFirestoreState<PlannedPayment[]>("plannedPayments", []),
    [cashFlowPlanning] = useFirestoreState<ExpectedIncomeRecord[]>("planning", []),
    [expectedIncomeRecords] = useFirestoreState<ExpectedIncomeRecord[]>("income", []),
    [installments, setInstallments] = useFirestoreState<Installment[]>("installments", []),
    [query, setQuery] = useState(""),
    [showArchived, setShowArchived] = useState(false),
    [adding, setAdding] = useState(false),
    [action, setAction] = useState<number | null>(null),
    [collectionAction,setCollectionAction]=useState<number|null>(null),
    [historyAction,setHistoryAction]=useState<number|null>(null),
    [installmentFilter,setInstallmentFilter]=useState("Active"),
    [installmentSort,setInstallmentSort]=useState("next-due-asc"),
    [budgetStatus,setBudgetStatus]=useState("All"),
    [budgetSort,setBudgetSort]=useState("actual-desc"),
    [budgetMonth,setBudgetMonth]=useState(currentMonthKey()),
    [budgetTransactions,setBudgetTransactions]=useState<number|null>(null),
    [budgetWallet]=useWalletSnapshot<BudgetWallet>({accounts:[],accountTransactions:[],transactions:[],cards:[]});
  const categories=useCategories();
  const connectedBudgets=useMemo(()=>connectBudgetsToTransactions(budgets,budgetWallet),[budgets,budgetWallet]);
  const config =
    page === "Budgets"
      ? {
          title: "Category Budgets",
          desc: "Actual and forecasted spending by category and cycle.",
          button: "Add budget",
          icon: Target,
        }
      : page === "Debts"
        ? {
            title: "Debts — Money I Owe",
            desc: "Principal, interest, schedules, and payoff progress.",
            button: "Add debt",
            icon: ArrowDown,
          }
        : page === "Money owed to me"
          ? {
              title: "Money Owed to Me",
              desc: "Receivables, collections, and borrower payment progress.",
              button: "Add receivable",
              icon: ArrowUp,
            }
          : page === "Planned payments"
            ? {
                title: "Planned Payments",
                desc: "Future inflows and outflows that power your forecast.",
                button: "Plan payment",
                icon: CalendarClock,
              }
            : {
                title: "Installments",
                desc: "Multi-period purchases, balances, and payment schedules.",
                button: "Add installment",
                icon: WalletCards,
              };
  const list =
    page === "Budgets"
      ? connectedBudgets
      : page === "Debts"
        ? debts
        : page === "Money owed to me"
          ? receivables
          : page === "Planned payments"
            ? planned
            : installments;
  const isCompletedInstallment=(record:any)=>page==="Installments"&&(String(record.status).toLowerCase()==="completed"||Number(record.remainingPayable||0)<=0||Number(record.paidCount||0)>=Number(record.count||0));
  const effectiveArchived=(record:any)=>Boolean(record.archived)||isCompletedInstallment(record);
  const visible = list
    .filter((r: any) => {
      const archivedMatches=effectiveArchived(r)===showArchived;
      const queryMatches=JSON.stringify(r).toLowerCase().includes(query.toLowerCase());
      if(page!=="Installments")return archivedMatches&&queryMatches;
      const status=String(isCompletedInstallment(r)?"Completed":r.status||"Active").toLowerCase();
      const filterMatches=installmentFilter==="All"||status===installmentFilter.toLowerCase();
      return archivedMatches&&queryMatches&&filterMatches;
    })
    .sort((a:any,b:any)=>{
      if(page!=="Installments")return 0;
      if(installmentSort==="next-due-desc")return String(b.nextDue||"").localeCompare(String(a.nextDue||""));
      if(installmentSort==="balance-desc")return Number(b.remainingPayable||0)-Number(a.remainingPayable||0);
      if(installmentSort==="balance-asc")return Number(a.remainingPayable||0)-Number(b.remainingPayable||0);
      if(installmentSort==="progress-desc")return (Number(b.paidCount||0)/Math.max(1,Number(b.count||1)))-(Number(a.paidCount||0)/Math.max(1,Number(a.count||1)));
      return String(a.nextDue||"").localeCompare(String(b.nextDue||""));
    });
  const archive = (id: number) => {
    const updater = (rows: any[]) =>
      rows.map((r) => (r.id === id ? { ...r, archived: !r.archived } : r));
    page === "Budgets"
      ? setBudgets(updater)
      : page === "Debts"
        ? setDebts(updater)
        : page === "Money owed to me"
          ? setReceivables(updater)
          : page === "Planned payments"
            ? setPlanned(updater)
            : setInstallments(updater);
    onNotice(showArchived ? "Record restored" : "Record moved to archive");
  };
  if (page === "Budgets") {
    const budgetStatusOptions=["All","Healthy","Near Limit","Over Limit","No Spending","Archived"];
    const selectedMonth=monthBounds(budgetMonth);
    const monthOptionBase=new Date(`${currentMonthKey()}-01T12:00`);
    const rollingMonths=Array.from({length:13},(_,index)=>{
      const date=new Date(monthOptionBase);
      date.setMonth(date.getMonth()+index-6);
      return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
    });
    const monthOptions=Array.from(new Set([
      budgetMonth,
      ...rollingMonths,
      ...connectedBudgets.flatMap(item=>[item.start?.slice(0,7),item.end?.slice(0,7)]).filter(Boolean),
    ])).sort();
    const categoryTemplates=categories
      .filter(category=>category.name!=="Income"&&!isExcludedBudgetCategory(category.name))
      .flatMap(category=>(category.subcategories?.length?category.subcategories.map(sub=>({name:`${category.name} / ${sub.name}`,parent:category.name,subcategory:sub.name,type:"Subcategory"})):[{name:category.name,parent:category.name,subcategory:"",type:"Category"}]));
    const transactionCategoryTemplates=Array.from(new Set([
      ...(budgetWallet.accountTransactions??[]).filter(item=>item.type==="Expense").map(item=>item.category).filter(Boolean) as string[],
      ...(budgetWallet.transactions??[]).filter(item=>["posted","completed"].includes(String(item.status||"").toLowerCase())&&["purchase","installment","fee","interest"].includes(String(item.type||"").toLowerCase())).map(item=>item.category).filter(Boolean) as string[],
    ])).filter(value=>!isExcludedBudgetCategory(String(value))).map(value=>({name:value,parent:value.split(" / ")[0]||value,subcategory:value.split(" / ")[1]||"",type:value.includes(" / ")?"Subcategory":"Category"}));
    const allCategoryTemplates=Array.from(new Map([...categoryTemplates,...transactionCategoryTemplates].map(item=>[normalizeCategoryKey(item.name),item])).values());
    const monthBudgetByKey=new Map(connectedBudgets.filter(item=>item.start<=selectedMonth.end&&item.end>=selectedMonth.start).map(item=>[budgetKey(item),item]));
    const carriedBudgetByKey=new Map<string,CategoryBudget>();
    connectedBudgets
      .filter(item=>!item.archived&&item.end<selectedMonth.start)
      .sort((a,b)=>b.end.localeCompare(a.end))
      .forEach(item=>{const key=budgetKey(item);if(!carriedBudgetByKey.has(key))carriedBudgetByKey.set(key,item)});
    const allBudgetRows=connectBudgetsToTransactions(allCategoryTemplates.map(template=>{
      const key=normalizeCategoryKey(template.name),existing=monthBudgetByKey.get(key),carried=carriedBudgetByKey.get(key);
      return existing ?? {
        id: stableNegativeId(`${budgetMonth}-${template.name}`),
        name: template.name,
        parent: template.parent,
        subcategory: template.subcategory,
        type: template.type,
        allocated: Number(carried?.allocated||0),
        incomePercentage: 0,
        period: "Monthly",
        start: selectedMonth.start,
        end: selectedMonth.end,
        rollover: false,
        rolloverLimit: 0,
        includePlanned: true,
        includePending: true,
        warning: Number(carried?.warning||75),
        critical: Number(carried?.critical||100),
        actual: 0,
        planned: 0,
        status: "Not Set",
        notes: carried ? "Carried forward from previous month. Save to customize this month." : "Not Set",
        archived: false,
      } as CategoryBudget;
    }),budgetWallet);
    const monthFilteredBudgets=allBudgetRows.filter(item=>!isExcludedBudgetCategory(item.parent||item.name));
    const budgetVisible=monthFilteredBudgets.filter((item:any)=>{
      const monthMatches=item.start<=selectedMonth.end&&item.end>=selectedMonth.start;
      const archivedFilter=budgetStatus==="Archived"?item.archived:!item.archived;
      const textMatches=JSON.stringify(item).toLowerCase().includes(query.toLowerCase());
      const statusMatches=budgetStatus==="All"||budgetStatus==="Archived"||budgetActualStatus(item)===budgetStatus;
      return monthMatches&&archivedFilter&&textMatches&&statusMatches;
    });
    const exportBudgetReport=()=>{const csv=["Category,Budget,Spent,Remaining,Status,Progress",...budgetVisible.map((item:any)=>{const remaining=Number(item.allocated||0)-Number(item.actual||0),progress=item.allocated?Math.round(Number(item.actual||0)/Number(item.allocated||0)*100):0;return [`"${item.subcategory?`${item.parent} / ${item.subcategory}`:item.name}"`,item.allocated,item.actual,remaining,`"${budgetActualStatus(item)}"`,`${progress}%`].join(",")})].join("\n"),blob=new Blob([csv],{type:"text/csv"}),url=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=url;anchor.download="category-budgets.csv";anchor.click();URL.revokeObjectURL(url)}
    const activeBudgets=monthFilteredBudgets.filter(item=>!item.archived);
    const totalBudget=activeBudgets.reduce((sum,item)=>sum+Number(item.allocated||0),0);
    const totalActual=activeBudgets.reduce((sum,item)=>sum+Number(item.actual||0),0);
    const difference=totalBudget-totalActual;
    const periodStart=selectedMonth.start;
    const periodEnd=selectedMonth.end;
    const expectedIncome=expectedIncomeTotalForRange([
      ...expectedIncomeRecords,
      ...planned.filter(item=>item.type==="Income").map(item=>({
        id:`planned-${item.id}`,
        source:item.name,
        category:item.category,
        amount:item.amount,
        expectedDate:item.expectedDate||item.dueDate,
        frequency:item.frequency,
        status:item.status,
        archived:item.archived,
      })),
      ...cashFlowPlanning.filter(item=>item.type==="Income"),
    ],periodStart,periodEnd);
    const remainingAfterBudget=expectedIncome-totalBudget;
    const remainingAfterActual=expectedIncome-totalActual;
    const usage=totalBudget?totalActual/totalBudget*100:0;
    const remainingDays=Math.max(0,Math.ceil((new Date(`${periodEnd}T12:00`).getTime()-new Date(`${todayIso()}T12:00`).getTime())/86400000)+1);
    const displayedBudgets=budgetVisible.filter(item=>!item.archived);
    const sortName=(item:CategoryBudget)=>item.subcategory?`${item.parent} / ${item.subcategory}`:item.name;
    const sortDifference=(item:CategoryBudget)=>Number(item.allocated||0)-Number(item.actual||0);
    const sortPercent=(item:CategoryBudget)=>Number(item.allocated||0)?Number(item.actual||0)/Number(item.allocated||0)*100:0;
    const sortedDisplayedBudgets=displayedBudgets.slice().sort((a,b)=>{
      switch(budgetSort){
        case "category-asc": return sortName(a).localeCompare(sortName(b));
        case "category-desc": return sortName(b).localeCompare(sortName(a));
        case "budget-desc": return Number(b.allocated||0)-Number(a.allocated||0);
        case "budget-asc": return Number(a.allocated||0)-Number(b.allocated||0);
        case "actual-asc": return Number(a.actual||0)-Number(b.actual||0);
        case "difference-desc": return sortDifference(b)-sortDifference(a);
        case "difference-asc": return sortDifference(a)-sortDifference(b);
        case "percent-desc": return sortPercent(b)-sortPercent(a);
        case "percent-asc": return sortPercent(a)-sortPercent(b);
        case "actual-desc":
        default: return Number(b.actual||0)-Number(a.actual||0);
      }
    });
    const chartRows=displayedBudgets.slice().sort((a,b)=>Number(b.actual||0)-Number(a.actual||0)||Number(b.allocated||0)-Number(a.allocated||0));
    return (
      <section className="feature-page budget-page-redesign">
        <div className="budget-redesign-shell">
          <div className="budget-redesign-header">
            <div>
              <div className="budget-breadcrumb">Cash Flow Planning / Overview / <b>Budget vs Actual</b></div>
              <h2><TrendingUp/>Budget vs Actual</h2>
              <p>Compare your planned budget against actual spending.</p>
            </div>
            <div className="budget-redesign-actions">
              <label className="budget-month-select" aria-label="Budget month">
                <CalendarClock/>
                <select value={budgetMonth} onChange={event=>setBudgetMonth(event.target.value)}>
                  {monthOptions.map(option=><option key={option} value={option}>{monthName(option)}</option>)}
                </select>
              </label>
              <button className="outline" onClick={exportBudgetReport}><Download/>Export</button>
            </div>
          </div>
          <BudgetSummaryCards budgets={activeBudgets} expectedIncome={expectedIncome} daysLeft={remainingDays} periodEnd={periodEnd}/>
          <article className="budget-chart-card">
            <div className="budget-chart-title"><b>Budget vs Actual by Category</b><select value={budgetStatus} onChange={event=>setBudgetStatus(event.target.value)} aria-label="Budget category filter"><option>All</option>{budgetStatusOptions.filter(option=>option!=="All").map(option=><option key={option}>{option}</option>)}</select></div>
            <BudgetVsActualChart budgets={chartRows} onSelect={(item)=>setAction(item.id)}/>
          </article>
          <div className="budget-table-card">
            <div className="budget-table-title">
              <span>Category Breakdown</span>
              <label className="budget-sort-select" aria-label="Sort category budgets">
                <Filter/>
                <select value={budgetSort} onChange={event=>setBudgetSort(event.target.value)}>
                  <option value="actual-desc">Sort: Highest actual</option>
                  <option value="actual-asc">Sort: Lowest actual</option>
                  <option value="category-asc">Sort: Category A–Z</option>
                  <option value="category-desc">Sort: Category Z–A</option>
                  <option value="budget-desc">Sort: Highest budget</option>
                  <option value="budget-asc">Sort: Lowest budget</option>
                  <option value="difference-desc">Sort: Most remaining</option>
                  <option value="difference-asc">Sort: Most over budget</option>
                  <option value="percent-desc">Sort: Highest % used</option>
                  <option value="percent-asc">Sort: Lowest % used</option>
                </select>
              </label>
            </div>
            <div className="budget-table-head"><span>Category</span><span>Budget</span><span>Actual</span><span>Difference</span><span>% of Budget</span></div>
            <div className="budget-table-body">
              {sortedDisplayedBudgets.map((item:any)=><BudgetTableRow
                key={item.id}
                item={item}
                onEdit={()=>setAction(item.id)}
                onTransactions={()=>setBudgetTransactions(item.id)}
                onDelete={()=>{
                  if(Number(item.id)<0){onNotice("No saved budget to delete yet.");return}
                  setBudgets(current=>current.filter(budget=>String(budget.id)!==String(item.id)));
                  onNotice(`${item.subcategory?`${item.parent} / ${item.subcategory}`:item.name} budget deleted`);
                }}
              />)}
              {!!displayedBudgets.length&&<div className="budget-table-row budget-total-row">
                <span className="budget-category-cell"><span><b>Total</b></span></span>
                <strong>{pesoExact(displayedBudgets.reduce((sum,item)=>sum+Number(item.allocated||0),0))}</strong>
                <strong>{pesoExact(displayedBudgets.reduce((sum,item)=>sum+Number(item.actual||0),0))}</strong>
                {(()=>{const budget=displayedBudgets.reduce((sum,item)=>sum+Number(item.allocated||0),0),actual=displayedBudgets.reduce((sum,item)=>sum+Number(item.actual||0),0),diff=budget-actual,pct=budget?actual/budget*100:0;return <><strong className={diff<0?"negative":"positive"}>{pesoExact(diff)}</strong><span className="budget-table-progress"><strong>{pct.toFixed(1)}%</strong><i><b style={{width:`${Math.min(100,Math.max(0,pct))}%`}}/></i></span></>})()}
              </div>}
            </div>
            {!displayedBudgets.length&&<div className="budget-table-empty"><Archive/><b>No budgets found</b><span>Try another category filter or add a new budget.</span></div>}
          </div>
          <div className={`budget-insight-callout ${remainingAfterBudget<0?"negative":"positive"}`}><TrendingUp/><span><b>{remainingAfterBudget>=0?`Your budget fits your expected income with ${pesoExact(remainingAfterBudget)} left after planned budgets.`:`Your budgets exceed expected income by ${pesoExact(Math.abs(remainingAfterBudget))}.`}</b><small>{remainingAfterBudget>=0?`After actual spending, expected remaining is ${pesoExact(remainingAfterActual)}.`:"Reduce budget limits or add expected income for this month."}</small></span></div>
        </div>
        {adding&&<CreateModal page={page} onClose={()=>setAdding(false)} onSave={(record:any)=>{setBudgets(v=>[record,...v]);setAdding(false);onNotice(`${record.name} added`)}}/>}
        {action!==null&&<ActionModal page={page} item={allBudgetRows.find((r:any)=>r.id===action)!} onClose={()=>setAction(null)} onApply={(values:any)=>{
          const selected=allBudgetRows.find((r:any)=>r.id===action)!;
          if(values.action==="delete"){
            if(Number(selected.id)<0){onNotice("No saved budget to delete yet.");setAction(null);return}
            setBudgets(current=>current.map(budget=>budget.id===action?{...budget,archived:true}:budget));
            onNotice("Budget moved to archive");
          }else{
            const savedBudget={...selected,...values.budget,id:Number(selected.id)<0?Date.now():selected.id,archived:false};
            const key=budgetKey(savedBudget),applyFuture=values.applyScope==="future";
            setBudgets(current=>{
              const exists=current.some(budget=>String(budget.id)===String(selected.id));
              const withCurrent=exists?current.map(budget=>String(budget.id)===String(selected.id)?{...budget,...savedBudget,id:budget.id,archived:budget.archived}:budget):[savedBudget,...current];
              return applyFuture?withCurrent.map(budget=>budgetKey(budget)===key&&budget.start>savedBudget.start?{...budget,allocated:savedBudget.allocated,warning:savedBudget.warning,critical:savedBudget.critical,includePlanned:savedBudget.includePlanned,includePending:savedBudget.includePending,rollover:savedBudget.rollover,rolloverLimit:savedBudget.rolloverLimit,notes:savedBudget.notes}:budget):withCurrent;
            });
            onNotice(`${values.budget.name} budget updated`);
          }
          setAction(null);
        }}/>}
        {budgetTransactions!==null&&(()=>{
          const selected=allBudgetRows.find(item=>String(item.id)===String(budgetTransactions));
          return selected?<BudgetTransactionsModal item={selected} transactions={transactionsForBudget(selected,budgetWallet)} onClose={()=>setBudgetTransactions(null)}/>:null;
        })()}
      </section>
    )
  }
  return (
    <section className={`feature-page planning-module ${["Budgets","Debts","Money owed to me","Installments"].includes(page) ? "compact-list-module" : ""} ${page === "Budgets" ? "budget-list-module" : ""}`}>
      <div className="fp-head">
        <div>
          <h2>{config.title}</h2>
          <p>{config.desc}</p>
        </div>
        <button className="primary" onClick={() => setAdding(true)}>
          <Plus />
          {config.button}
        </button>
      </div>
      <PlanningSummary
        page={page}
        budgets={connectedBudgets}
        debts={debts}
        receivables={receivables}
        planned={planned}
        installments={installments}
      />
      <div className="planning-toolbar">
        <label>
          <Search />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${config.title.toLowerCase()}`}
          />
        </label>
        <button
          className={showArchived ? "active" : ""}
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? <RotateCcw /> : <Archive />}
          {showArchived ? "View active" : "View archive"}
        </button>
        {page === "Installments" ? (
          <div className="planning-filter-sort">
            <Filter />
            <select value={installmentFilter} onChange={(event)=>setInstallmentFilter(event.target.value)} aria-label="Filter installments">
              <option>Active</option>
              <option>Partially paid</option>
              <option>Completed</option>
              <option>All</option>
            </select>
            <select value={installmentSort} onChange={(event)=>setInstallmentSort(event.target.value)} aria-label="Sort installments">
              <option value="next-due-asc">Due date: earliest</option>
              <option value="next-due-desc">Due date: latest</option>
              <option value="balance-desc">Balance: highest</option>
              <option value="balance-asc">Balance: lowest</option>
              <option value="progress-desc">Progress: highest</option>
            </select>
          </div>
        ) : (
          <button onClick={() => onNotice("Filter and sort options opened")}>
            <Filter />
            Filter & sort
          </button>
        )}
      </div>
      <div className="planning-list">
        {visible.map((item: any) => (
          <PlanningCard
            key={item.id}
            page={page}
            item={item}
            onAction={() => setAction(item.id)}
            onCollect={() => setCollectionAction(item.id)}
            onHistory={() => setHistoryAction(item.id)}
            onArchive={() => archive(item.id)}
          />
        ))}
      </div>
      {!visible.length && (
        <div className="surface planning-empty">
          <Archive />
          <b>No {showArchived ? "archived" : "matching"} records</b>
          <span>Try another search or create a new item.</span>
        </div>
      )}
      {adding && (
        <CreateModal
          page={page}
          onClose={() => setAdding(false)}
          onSave={(record: any) => {
            page === "Budgets"
              ? setBudgets((v) => [record, ...v])
              : page === "Debts"
                ? setDebts((v) => [record, ...v])
                : page === "Money owed to me"
                  ? setReceivables((v) => [record, ...v])
                  : page === "Planned payments"
                    ? setPlanned((v) => [record, ...v])
                    : setInstallments((v) => [record, ...v]);
            setAdding(false);
            onNotice(`${record.name || record.title} added`);
          }}
        />
      )}
      {action !== null && (
        <ActionModal
          page={page}
          item={list.find((r: any) => r.id === action)!}
          onClose={() => setAction(null)}
          onApply={(values: any) => {
            if (page === "Budgets") {
              if (values.action === "delete") {
                setBudgets((current) => current.map((budget) => budget.id === action ? {...budget, archived: true} : budget));
                onNotice("Budget moved to archive");
              } else {
                setBudgets((current) => current.map((budget) => budget.id === action ? {...budget, ...values.budget, id: budget.id, archived: budget.archived} : budget));
                onNotice(`${values.budget.name} budget updated`);
              }
            } else if (page === "Debts") {
              if (values.action === "delete") {
                const deleted = debts.find((record) => record.id === action);
                setDebts((current) => current.filter((record) => record.id !== action));
                onNotice(`${deleted?.name ?? "Debt"} deleted`);
                setAction(null);
                return;
              }
              const result = payDebt(
                debts.find((d) => d.id === action)!,
                values.principal,
                values.interest,
                values.fees,
                values.date,
              );
              setDebts((v) =>
                v.map((d) => (d.id === action ? result.debt : d)),
              );
              onNotice(
                `Debt payment posted · ${result.entries.length} ledger entries`,
              );
            } else if (page === "Money owed to me") {
              if (values.action === "edit") {
                setReceivables((current) => current.map((record) => record.id === action ? {...record, ...values.receivable, id: record.id, archived: record.archived} : record));
                onNotice(`${values.receivable.title} updated`);
              } else if (values.action === "delete") {
                const deleted = receivables.find((record) => record.id === action);
                setReceivables((current) => current.filter((record) => record.id !== action));
                onNotice(`${deleted?.title ?? "Receivable"} deleted`);
                setAction(null);
                return;
              } else {
                const result = collect(
                  receivables.find((r) => r.id === action)!,
                  values.principal,
                  values.interest,
                  values.fees,
                  values.date,
                );
                setReceivables((v) =>
                  v.map((r) => (r.id === action ? result.receivable : r)),
                );
                onNotice(`Collection posted · principal excluded from income`);
              }
            } else if (page === "Planned payments") {
              if (values.action === "delete") {
                setPlanned((current) => current.map((record) => record.id === action ? {...record, archived: true} : record));
                onNotice("Planned payment moved to archive");
                setAction(null);
                return;
              }
              const result = completePlanned(
                planned.find((p) => p.id === action)!,
                values.amount,
                values.date,
              );
              setPlanned((v) =>
                v.map((p) => (p.id === action ? result.payment : p)),
              );
              onNotice(`${result.payment.status} · linked transaction created`);
            } else if (page === "Installments") {
              if (values.action === "delete") {
                const deleted = installments.find((record) => record.id === action);
                setInstallments((current) => current.filter((record) => record.id !== action));
                onNotice(`${deleted?.name ?? "Installment"} deleted`);
                setAction(null);
                return;
              }
              const currentInstallment = installments.find((i) => i.id === action)!;
              if (values.action === "edit") {
                const count = Math.max(currentInstallment.paidCount + 1, Number(values.count || currentInstallment.count));
                const monthly = Number(values.monthly || currentInstallment.amount);
                const updated = {
                  ...currentInstallment,
                  name: values.name || currentInstallment.name,
                  merchant: values.merchant || currentInstallment.merchant,
                  original: Number(values.original || currentInstallment.original),
                  start: values.start || currentInstallment.start,
                  nextDue: currentInstallment.paidCount > 0 ? currentInstallment.nextDue : values.start || currentInstallment.nextDue,
                  count,
                  amount: monthly,
                  remainingPayable: Math.max(0, monthly * (count - currentInstallment.paidCount)),
                  remainingPrincipal: Math.max(0, Number(values.original || currentInstallment.original) - monthly * currentInstallment.paidCount),
                  finalDue: recurrenceDates(values.start || currentInstallment.start, count).at(-1) || currentInstallment.finalDue,
                  status: currentInstallment.paidCount >= count ? "Completed" : currentInstallment.status,
                };
                setInstallments((records) => records.map((record) => record.id === action ? {...updated, archived: updated.status === "Completed" ? true : updated.archived} : record));
                onNotice(`${updated.name} installment updated`);
                setAction(null);
                return;
              }
              const edited={...currentInstallment,name:values.name||currentInstallment.name,merchant:values.merchant||currentInstallment.merchant,count:values.count||currentInstallment.count,amount:values.monthly||currentInstallment.amount,start:values.start||currentInstallment.start,original:Number(values.original||currentInstallment.original)};
              const result = payInstallment(
                edited,
                values.amount,
                values.date,
              );
              const savedInstallment={...result.installment, archived: result.installment.status === "Completed" ? true : result.installment.archived};
              setInstallments((v) =>
                v.map((i) => (i.id === action ? savedInstallment : i)),
              );
              onNotice(savedInstallment.status === "Completed" ? `Installment completed and archived` : `Installment payment posted`);
            }
            setAction(null);
          }}
        />
      )}
      {collectionAction !== null && (
        <RecordCollectionModal
          item={receivables.find((record)=>record.id===collectionAction)!}
          onClose={()=>setCollectionAction(null)}
          onSave={(values)=>{
            const record=receivables.find((item)=>item.id===collectionAction);
            if(!record)return;
            const result=collect(record,values.amount,0,0,values.date,values.method,values.reference,values.notes);
            setReceivables((current)=>current.map((item)=>item.id===collectionAction?result.receivable:item));
            setCollectionAction(null);
            onNotice(`Collection recorded for ${record.title}`);
          }}
        />
      )}
      {historyAction !== null && (
        <ReceivablePaymentHistoryModal
          item={receivables.find((record)=>record.id===historyAction)!}
          onClose={()=>setHistoryAction(null)}
        />
      )}
    </section>
  );
}

function PlanningSummary({
  page,
  budgets,
  debts,
  receivables,
  planned,
  installments,
}: {
  page: string;
  budgets: CategoryBudget[];
  debts: Debt[];
  receivables: Receivable[];
  planned: PlannedPayment[];
  installments: Installment[];
}) {
  let stats: [string, string, string][] = [];
  if (page === "Budgets") {
    const activeBudgets = budgets.filter((budget) => !budget.archived);
    const totalBudget = activeBudgets.reduce((n, b) => n + b.allocated, 0);
    const actualSpent = activeBudgets.reduce((n, b) => n + b.actual, 0);
    const remaining = totalBudget - actualSpent;
    const overLimitCount = activeBudgets.filter((budget) => budgetActualStatus(budget) === "Over Limit").length;
    stats = [
      ["Total budget", peso(totalBudget), ""],
      ["Actual spent", peso(actualSpent), ""],
      ["Remaining", peso(remaining), remaining < 0 ? "negative" : "positive"],
      ["Over limit", `${overLimitCount} ${overLimitCount === 1 ? "category" : "categories"}`, overLimitCount ? "negative" : "positive"],
    ];
  } else if (page === "Debts")
    stats = [
      [
        "Outstanding debt",
        peso(debts.reduce((n, d) => n + d.balance, 0)),
        "negative",
      ],
      [
        "Due this month",
        peso(debts.reduce((n, d) => n + d.paymentAmount, 0)),
        "",
      ],
      [
        "Principal paid",
        peso(debts.reduce((n, d) => n + d.principalPaid, 0)),
        "positive",
      ],
      [
        "Interest paid",
        peso(debts.reduce((n, d) => n + d.interestPaid, 0)),
        "",
      ],
    ];
  else if (page === "Money owed to me")
    stats = [
      [
        "Owed",
        peso(
          receivables.reduce((n, r) => {
            const isBusiness = /business|investment/i.test(r.type);
            return n + r.original + r.additional + (isBusiness ? 0 : r.interest) + r.fees;
          }, 0),
        ),
        "positive",
      ],
      [
        "Outstanding",
        peso(receivables.reduce((n, r) => n + receivableOutstanding(r), 0)),
        "positive",
      ],
      [
        "Collected Principal",
        peso(receivables.reduce((n, r) => n + r.collectedPrincipal, 0)),
        "",
      ],
      [
        "Active Receivable",
        String(
          receivables.filter(
            (r) => !r.archived && r.status !== "Fully collected",
          ).length,
        ),
        "",
      ],
    ];
  else if (page === "Planned payments") {
    const inflow = planned
        .filter((p) => ["Income", "Receivable collection"].includes(p.type))
        .reduce((n, p) => n + p.amount, 0),
      out = planned
        .filter((p) => !["Income", "Receivable collection"].includes(p.type))
        .reduce((n, p) => n + p.amount, 0);
    stats = [
      ["Upcoming inflows", peso(inflow), "positive"],
      ["Upcoming outflows", peso(out), "negative"],
      [
        "Net planned cash flow",
        peso(inflow - out),
        inflow - out >= 0 ? "positive" : "negative",
      ],
      ["Projected balance", peso(projectedBalance(30000, planned)), ""],
    ];
  } else
    stats = [
      [
        "Remaining payable",
        peso(installments.reduce((n, i) => n + i.remainingPayable, 0)),
        "negative",
      ],
      [
        "Due this month",
        peso(installments.reduce((n, i) => n + i.amount, 0)),
        "",
      ],
      [
        "Active plans",
        String(installments.filter((i) => i.status !== "Completed").length),
        "",
      ],
      [
        "Payments completed",
        String(installments.reduce((n, i) => n + i.paidCount, 0)),
        "positive",
      ],
    ];
  return (
    <div className="planning-summary">
      {stats.map(([l, v, t]) => (
        <div key={l}>
          <span>{l}</span>
          <b className={t}>{v}</b>
        </div>
      ))}
    </div>
  );
}

function BudgetSummaryCards({budgets,expectedIncome,daysLeft,periodEnd}:{budgets:CategoryBudget[];expectedIncome:number;daysLeft:number;periodEnd:string}){
  const total=budgets.reduce((sum,budget)=>sum+budget.allocated,0),
    actual=budgets.reduce((sum,budget)=>sum+budget.actual,0),
    remainingAfterBudget=expectedIncome-total,
    remainingAfterActual=expectedIncome-actual,
    actualPercent=total?actual/total*100:0,
    budgetIncomePercent=expectedIncome?total/expectedIncome*100:0,
    cards=[
      {label:"Expected Income",value:pesoExact(expectedIncome),note:"Funding for this month",Icon:HandCoins,tone:"green",valueTone:"positive"},
      {label:"Total Budget",value:pesoExact(total),note:expectedIncome?`${budgetIncomePercent.toFixed(1)}% of expected income`:"Add expected income",Icon:Wallet,tone:"blue",valueTone:remainingAfterBudget<0?"negative":""},
      {label:"Total Actual",value:pesoExact(actual),note:`${actualPercent.toFixed(1)}% of budget`,Icon:Receipt,tone:"purple",valueTone:""},
      {label:"Remaining After Budget",value:pesoExact(remainingAfterBudget),note:`After actual: ${pesoExact(remainingAfterActual)}`,Icon:TrendingUp,tone:"green",valueTone:remainingAfterBudget<0?"negative":"positive"},
      {label:"Days Left",value:`${daysLeft} ${daysLeft===1?"day":"days"}`,note:`Until ${new Date(`${periodEnd}T12:00`).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`,Icon:CalendarClock,tone:"orange",valueTone:""},
    ];
  return <div className="budget-summary-redesign">{cards.map(({label,value,note,Icon,tone,valueTone})=><article className={tone} key={label}><span><Icon/></span><div><small>{label}</small><b className={valueTone}>{value}</b>{note&&<em>{note}</em>}</div></article>)}</div>
}

function BudgetTableRow({item,onEdit,onTransactions,onDelete}:{item:CategoryBudget;onEdit:()=>void;onTransactions:()=>void;onDelete:()=>void}){
  const [menuPosition,setMenuPosition]=useState<{top:number;left:number}|null>(null);
  const menuButtonRef=useRef<HTMLButtonElement|null>(null);
  const progress=item.allocated?Math.round(Number(item.actual||0)/Number(item.allocated||0)*100):0,
    remaining=Number(item.allocated||0)-Number(item.actual||0),
    statusClass=budgetActualStatus(item).toLowerCase().replace(/\s+/g,"-"),
    name=item.subcategory?`${item.parent} / ${item.subcategory}`:item.name;
  const openMenu=()=>{
    const rect=menuButtonRef.current?.getBoundingClientRect();
    if(!rect)return;
    const menuWidth=190,menuHeight=142,gap=6;
    setMenuPosition({
      left:Math.max(10,Math.min(window.innerWidth-menuWidth-10,rect.right-menuWidth)),
      top:rect.bottom+menuHeight+gap>window.innerHeight?Math.max(10,rect.top-menuHeight-gap):rect.bottom+gap,
    });
  };
  const selectAction=(action:()=>void)=>{setMenuPosition(null);action()};
  return <div className={`budget-table-row ${statusClass}`}>
    <span className="budget-category-cell"><CategoryIcon value={name}/><span><b>{name}</b><small>{item.notes || item.period}</small></span></span>
    <strong className={Number(item.allocated||0)===0?"not-set":""}>{Number(item.allocated||0)===0?"Not Set":pesoExact(item.allocated)}</strong>
    <button type="button" className="budget-actual-button" onClick={onTransactions} aria-label={`View transactions included in ${name} actual amount`}>{pesoExact(item.actual)}</button>
    <strong className={remaining<0?"negative":"positive"}>{pesoExact(remaining)}</strong>
    <span className="budget-table-progress-cell">
      <span className="budget-table-progress"><strong className={progress>=100?"negative":progress>=90?"warning":"positive"}>{progress}%</strong><i><b style={{width:`${Math.min(100,Math.max(0,progress))}%`}}/></i></span>
      <button ref={menuButtonRef} type="button" className="budget-row-menu-button" onClick={openMenu} aria-label={`Actions for ${name}`} aria-haspopup="menu" aria-expanded={Boolean(menuPosition)}><MoreVertical/></button>
    </span>
    {menuPosition&&createPortal(<div className="budget-row-menu-layer" onMouseDown={()=>setMenuPosition(null)}>
      <div className="budget-row-menu-popover" role="menu" style={menuPosition} onMouseDown={event=>event.stopPropagation()}>
        <button type="button" role="menuitem" onClick={()=>selectAction(onEdit)}>Edit</button>
        <button type="button" role="menuitem" onClick={()=>selectAction(onTransactions)}>Transactions</button>
        <button type="button" role="menuitem" className="danger" onClick={()=>selectAction(onDelete)}>Delete</button>
      </div>
    </div>,document.body)}
  </div>
}

function BudgetTransactionsModal({item,transactions,onClose}:{item:CategoryBudget;transactions:BudgetTransactionBreakdown[];onClose:()=>void}){
  const name=item.subcategory?`${item.parent} / ${item.subcategory}`:item.name;
  const total=transactions.reduce((sum,transaction)=>sum+transaction.amount,0);
  return <Modal title={`${name} transactions`} onClose={onClose} wide className="budget-transactions-dialog">
    <div className="budget-transactions-modal">
      <div className="budget-transaction-summary">
        <span><small>Actual total</small><b>{pesoExact(total)}</b></span>
        <span><small>Transactions</small><b>{transactions.length}</b></span>
        <span><small>Budget period</small><b>{new Date(`${item.start}T12:00`).toLocaleDateString("en-US",{month:"short",day:"numeric"})} – {new Date(`${item.end}T12:00`).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</b></span>
      </div>
      <div className="budget-transaction-head"><span>Date</span><span>Description</span><span>Account / Card</span><span>Amount</span></div>
      <div className="budget-transaction-list">
        {transactions.map(transaction=><div className="budget-transaction-row" key={transaction.id}>
          <span>{new Date(`${transaction.date}T12:00`).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span>
          <span><b>{transaction.description}</b><small>{transaction.accountKind}</small></span>
          <span>{transaction.account}</span>
          <strong>{pesoExact(transaction.amount)}</strong>
        </div>)}
        {!transactions.length&&<div className="budget-transaction-empty"><Receipt/><b>No contributing transactions</b><span>The Actual amount is ₱0.00 for this budget period.</span></div>}
      </div>
      {!!transactions.length&&<div className="budget-transaction-total"><span>Total</span><strong>{pesoExact(total)}</strong></div>}
    </div>
  </Modal>
}

function BudgetVsActualChart({budgets,onSelect}:{budgets:CategoryBudget[];onSelect:(item:CategoryBudget)=>void}){
  const containerRef=useRef<HTMLDivElement | null>(null);
  const [containerWidth,setContainerWidth]=useState(0);
  useEffect(()=>{
    const element=containerRef.current;
    if(!element)return;
    let frame=0;
    const resolutionQuery=window.matchMedia?.(`(resolution: ${window.devicePixelRatio}dppx)`);
    const measure=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>setContainerWidth(element.getBoundingClientRect().width))};
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize",measure);
    window.visualViewport?.addEventListener("resize",measure);
    resolutionQuery?.addEventListener?.("change",measure);
    return ()=>{
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize",measure);
      window.visualViewport?.removeEventListener("resize",measure);
      resolutionQuery?.removeEventListener?.("change",measure);
    };
  },[]);
  const visibleBudgets=budgets.filter(item=>Number(item.allocated||0)>0);
  const measuredWidth=Math.max(0,Math.floor(containerWidth||0));
  const scrollWidth=visibleBudgets.length>8?visibleBudgets.length*118+76:0;
  const svgWidth=Math.max(420,measuredWidth,scrollWidth);
  const max=Math.max(1,...visibleBudgets.flatMap(item=>[Number(item.allocated||0),Number(item.actual||0)])),
    chartMax=Math.ceil(max/1000)*1000,
    left=44,right=Math.max(392,svgWidth-28),top=24,bottom=252,
    step=(right-left)/Math.max(1,visibleBudgets.length),
    barWidth=Math.min(28,Math.max(8,step*.20)),
    y=(value:number)=>bottom-(value/chartMax)*(bottom-top),
    label=(value:number)=>value>=1000?`₱${Number((value/1000).toFixed(1)).toLocaleString()}K`:`₱${value}`;
  return <div className="budget-chart-wrap" ref={containerRef}>
    <div className="budget-chart-legend"><span className="budget">Budget</span><span className="actual">Actual</span></div>
    <div className="budget-chart-scroll" aria-label={visibleBudgets.length>8?"Scrollable budget chart":"Budget chart"}>
    <svg style={{"--budget-chart-min-width": visibleBudgets.length>8?`${svgWidth}px`:"100%"} as React.CSSProperties} viewBox={`0 0 ${svgWidth} 320`} role="img" aria-label="Budget versus actual by category">
      <title>Budget versus actual by category</title>
      {[1,.75,.5,.25,0].map(ratio=>{const value=chartMax*ratio,yy=y(value);return <g key={ratio}><line x1={left} x2={right} y1={yy} y2={yy}/><text x="10" y={yy+5}>{label(value)}</text></g>})}
      {visibleBudgets.length?visibleBudgets.map((item,index)=>{
        const center=left+step*(index+.5),budgetY=y(Number(item.allocated||0)),actualY=y(Number(item.actual||0)),name=item.subcategory||item.parent||item.name;
        return <g key={item.id} className="clickable-chart-item" role="button" tabIndex={0} aria-label={`Open ${name} budget details`} onClick={()=>onSelect(item)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onSelect(item)}}}><rect className="budget" x={center-barWidth*1.15} y={budgetY} width={barWidth} height={bottom-budgetY} rx="5"/><rect className="actual" x={center+barWidth*.15} y={actualY} width={barWidth} height={bottom-actualY} rx="5"/><text className="x-label" x={center} y="292" textAnchor="middle">{name.length>13?`${name.slice(0,12)}…`:name}</text><title>{`${name}: Budget ${Number(item.allocated||0)===0?"Not Set":pesoExact(item.allocated)}, Actual ${pesoExact(item.actual)}`}</title></g>
      }):<text className="empty" x={svgWidth/2} y="150" textAnchor="middle">No budgeted categories to chart yet</text>}
    </svg>
    </div>
  </div>
}

function PlanningCard({
  page,
  item,
  onAction,
  onCollect,
  onHistory,
  onArchive,
}: {
  page: string;
  item: any;
  onAction: () => void;
  onCollect?: () => void;
  onHistory?: () => void;
  onArchive: () => void;
}) {
  let title = item.name || item.title,
    sub = "",
    amount = "",
    amountLabel = "",
    rows: [string, string][] = [];
  if (page === "Budgets") {
    const remaining = Number(item.allocated || 0) - Number(item.actual || 0);
    const status = budgetActualStatus(item);
    sub = item.period;
    rows = [
      ["Total budget", peso(item.allocated)],
      ["Spent", peso(item.actual)],
      ["Remaining", peso(remaining)],
      ["Status", status],
    ];
  } else if (page === "Debts") {
    sub = `${item.lender} · ${item.type}`;
    amount = peso(item.balance);
    amountLabel = "Remaining balance";
    rows = [
      ["Original principal", peso(item.original)],
      ["Next due", item.nextDue],
      ["Scheduled payment", peso(item.paymentAmount)],
      ["Principal paid", peso(item.principalPaid)],
      ["Status", item.status],
    ];
  } else if (page === "Money owed to me") {
    sub = `${item.borrower} · ${item.type}`;
    const isBusiness = /business|investment/i.test(item.type),
      totalOwed = item.original + item.additional + (isBusiness ? 0 : item.interest) + item.fees,
      collectedTotal = item.collectedPrincipal + item.collectedInterest,
      remaining = receivableOutstanding(item),
      progress = totalOwed > 0 ? Math.min(100, collectedTotal / totalOwed * 100) : 0,
      status = remaining <= 0 ? "Paid in Full" : item.expectedDate < todayIso() ? "Overdue" : collectedTotal > 0 ? "In Progress" : "Not Started";
    return (
      <article
        className="surface planning-card compact-list-item receivable-list-item receivable-card-v2"
        role="button"
        tabIndex={0}
        onClick={onAction}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onAction();
          }
        }}
        aria-label={`View ${title} receivable details`}
      >
        <div className="receivable-main-row">
          <div className="receivable-details-cell">
            <b>{title}</b>
            <small>{sub}</small>
          </div>
          <div><dt>Total owed</dt><dd>{peso(totalOwed)}</dd></div>
          <div><dt>Collected</dt><dd className="positive">{peso(collectedTotal)}</dd></div>
          <div><dt>Remaining</dt><dd>{peso(remaining)}</dd></div>
          <div><dt>Expected date</dt><dd>{item.expectedDate}</dd></div>
          <div><dt>Status</dt><dd><em className={`receivable-status ${status.toLowerCase().replace(/\s+/g,"-")}`}>{status}</em></dd></div>
        </div>
        <div className="receivable-progress-row">
          <div className="receivable-progress-summary">
            <span><b>{peso(collectedTotal)} of {peso(totalOwed)} collected</b><small>{progress.toFixed(2)}%</small></span>
            <i><em style={{width:`${progress}%`}} /></i>
          </div>
          <button className="primary" type="button" onClick={(event)=>{event.stopPropagation();onCollect?.()}}>Record Collection</button>
          <button className="outline" type="button" onClick={(event)=>{event.stopPropagation();onHistory?.()}}>Payment History</button>
        </div>
      </article>
    )
  } else if (page === "Planned payments") {
    sub = `${item.type} · ${item.linkedModule}`;
    amount = peso(item.amount);
    amountLabel = "Planned amount";
    rows = [
      ["Expected date", item.expectedDate],
      ["Account", item.source || item.destination],
      ["Confidence", item.confidence],
      ["Recurrence", item.frequency],
      ["Status", item.status],
    ];
  } else {
    sub = `${item.merchant} · ${item.type}`;
    amount = "";
    rows = [
      ["Total amount", peso(item.original + item.interest + item.fees)],
      ["Monthly payment", peso(item.amount)],
      ["Remaining balance", peso(item.remainingPayable)],
      ["Progress", `${item.paidCount}/${item.count}`],
      ["Next due", item.nextDue],
    ];
  }
  return (
    <article className={`surface planning-card ${["Budgets","Debts","Money owed to me","Installments"].includes(page) ? "compact-list-item" : ""} ${page==="Budgets"?"budget-list-item":""} ${page==="Installments"?"installment-list-item":""} ${page==="Money owed to me"?"receivable-list-item":""}`}>
      <div className="planning-card-head">
        <span>
          <b>{title}</b>
          <small>{sub}</small>
        </span>
        {amount&&<strong className="planning-primary-amount"><small>{amountLabel}</small>{amount}</strong>}
      </div>
      <dl>
        {rows.map(([l, v]) => (
          <div key={l}>
            <dt>{l}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {page === "Budgets" && (
        <div className="budget-progress" aria-label={`${Math.round(Number(item.allocated || 0) ? Number(item.actual || 0) / Number(item.allocated || 0) * 100 : 0)}% of budget used`}>
          <span><small>Progress</small><b>{Math.round(Number(item.allocated || 0) ? Number(item.actual || 0) / Number(item.allocated || 0) * 100 : 0)}%</b></span>
          <div><i style={{width:`${Math.min(100, Number(item.allocated || 0) ? Number(item.actual || 0) / Number(item.allocated || 0) * 100 : 0)}%`}} /></div>
        </div>
      )}
      {page === "Installments" && (
        <div className="planning-progress">
          <i
            style={{
              width: `${Math.min(100, item.count ? item.paidCount / item.count * 100 : 0)}%`,
            }}
          />
        </div>
      )}
      <div className="planning-card-actions">
        <button className="primary" onClick={onAction}>
          {page === "Debts"
            ? "Edit / payment"
            : page === "Money owed to me"
              ? "View Details"
              : page === "Planned payments"
                ? "Edit / post"
                : page === "Installments"
                  ? "View schedule"
                  : "View budget"}
        </button>
        {page !== "Money owed to me" && (
          <button onClick={onArchive}>
            {item.archived ? <RotateCcw /> : <Archive />}
            {item.archived ? "Restore" : "Archive"}
          </button>
        )}
        <button onClick={page==="Installments"?onAction:()=>{}}>
          <ChevronRight />
          {page==="Installments"?'Edit / payment':'Details'}
        </button>
      </div>
    </article>
  );
}

function CreateModal({
  page,
  onClose,
  onSave,
}: {
  page: string;
  onClose: () => void;
  onSave: (r: any) => void;
}) {
  return (
    <Modal
      title={
        page === "Budgets"
          ? "Add category budget"
          : page === "Debts"
            ? "Add debt"
            : page === "Money owed to me"
              ? "Add receivable"
              : page === "Planned payments"
                ? "Create planned payment"
                : "Add installment plan"
      }
      onClose={onClose}
    >
      <form
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget),
            id = Date.now(),
            categoryValue = String(f.get("category")||""),
            name = page === "Budgets" ? categoryValue : String(f.get("name")),
            amount = Number(f.get("amount")),
            date = String(f.get("date"));
          if (page === "Budgets") {
            onSave({
              ...budgetsSeed[0],
              id,
              name,
              allocated: amount,
              start: "2026-07-01",
              end: date,
              actual: 0,
              planned: 0,
              parent: categoryValue.split(" / ")[0]||categoryValue,
              subcategory: categoryValue.split(" / ")[1]||"",
              type: categoryValue.includes(" / ")?"Subcategory":"Category",
              archived: false,
            });
          } else if (page === "Debts")
            onSave({
              ...debtsSeed[0],
              id,
              name,
              lender: String(f.get("related")),
              original: amount,
              balance: amount,
              nextDue: date,
              principalPaid: 0,
              interestPaid: 0,
              archived: false,
            });
          else if (page === "Money owed to me")
            onSave({
              ...receivablesSeed[0],
              id,
              title: name,
              borrower: String(f.get("related")),
              type: String(f.get("receivableType") || "Personal receivable"),
              original: amount,
              interest: Number(f.get("totalInterest") || 0),
              businessIncome: Number(f.get("businessIncome") || 0),
              incomeFrequency: String(f.get("incomeFrequency") || "Monthly"),
              expectedDate: date,
              collectedPrincipal: 0,
              collectedInterest: 0,
              archived: false,
            });
          else if (page === "Planned payments")
            onSave({
              ...plannedSeed[0],
              id,
              name,
              amount,
              expectedDate: date,
              dueDate: date,
              type: String(f.get("type")),
              archived: false,
            });
          else {
            const installment=createInstallment({
                ...installmentSeed[0],
                id,
                name,
                merchant: String(f.get("related")),
                original: amount,
                start: date,
                nextDue: date,
                count: Number(f.get("count")),
                paidCount: Number(f.get("paid") || 0),
                downPayment: Number(f.get("down") || 0),
                interest: Number(f.get("interest") || 0),
                fees: Number(f.get("fees") || 0),
                type:String(f.get("installmentType")) as Installment['type'],
                linkedCard:String(f.get("linkedCard")||""),
                fundingSource:String(f.get("fundingSource")||""),
                archived: false,
              });
            onSave(installment);
          }
        }}
      >
        {page === "Budgets" ? <CategoryFields /> : <div className="form-grid">
          <label>
            {page === "Money owed to me" ? "Title" : "Name"}
            <input name="name" required autoFocus />
          </label>
          <label>
            {page === "Debts"
              ? "Lender"
              : page === "Money owed to me"
                ? "Borrower"
                : page === "Installments"
                  ? "Merchant"
                  : "Parent / linked module"}
            <input name="related" />
          </label>
        </div>}
        {page === "Money owed to me" && (
          <>
            <div className="form-grid">
              <label>
                Receivable type
                <select name="receivableType" defaultValue="Personal receivable">
                  <option>Personal receivable</option>
                  <option>Family loan</option>
                  <option>Business investment</option>
                  <option>Business income share</option>
                  <option>Other receivable</option>
                </select>
              </label>
              <label>
                Expected monthly income
                <input name="businessIncome" type="number" min="0" step="0.01" inputMode="decimal" defaultValue="0" />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Income frequency
                <select name="incomeFrequency" defaultValue="Monthly">
                  <option>Monthly</option>
                  <option>Quarterly</option>
                  <option>Semiannually</option>
                  <option>Annually</option>
                  <option>Custom</option>
                </select>
              </label>
              <label>
                Total interest owed
                <input name="totalInterest" type="number" min="0" step="0.01" inputMode="decimal" defaultValue="0" />
              </label>
            </div>
          </>
        )}
        <div className="form-grid">
          <label>
            {page === "Budgets"
              ? "Allocated amount"
              : page === "Debts"
                ? "Original principal"
                : page === "Money owed to me"
                  ? "Original amount"
                  : page === "Installments"
                    ? "Original purchase amount"
                    : "Planned amount"}
            <input name="amount" type="number" min="0" step="0.01" inputMode="decimal" required />
          </label>
          <label>
            {page === "Budgets"
              ? "Cycle end"
              : page === "Debts"
                ? "Next due"
                : page === "Money owed to me"
                  ? "Expected collection"
                  : page === "Installments"
                    ? "Start date"
                    : "Expected date"}
            <input name="date" type="date" required defaultValue="2026-07-31" />
          </label>
        </div>
        {page === "Planned payments" && (
          <label>
            Payment type
            <select name="type">
              <option>Expense</option>
              <option>Income</option>
              <option>Debt payment</option>
              <option>Receivable collection</option>
              <option>Installment payment</option>
              <option>Savings contribution</option>
              <option>Transfer</option>
            </select>
          </label>
        )}
        {page === "Installments" && (
          <>
            <div className="form-grid"><label>Installment type<select name="installmentType"><option>Credit-card installment</option><option>Store financing</option><option>Personal installment</option></select></label><label>Funding account<ConnectedAccountSelect name="fundingSource" required/></label></div>
            <div className="form-grid"><label>Connected credit card<ConnectedAccountSelect name="linkedCard" showBanks={false}/></label><div className="form-note">The full remaining installment amount reserves available credit immediately. Only monthly dues are added to the card balance on each due date.</div></div>
            <div className="form-grid">
              <label>
                Down payment
                <input name="down" type="number" min="0" step="0.01" inputMode="decimal" defaultValue="0" />
              </label>
              <label>
                Total interest
                <input name="interest" type="number" min="0" step="0.01" inputMode="decimal" defaultValue="0" />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Number of installments
                <input
                  name="count"
                  type="number"
                  min="1"
                  defaultValue="6"
                  required
                />
              </label>
              <label>
                Already paid
                <input name="paid" type="number" min="0" defaultValue="0" />
              </label>
            </div>
          </>
        )}
        <label>
          Notes
          <textarea name="notes" rows={2} />
        </label>
        <button className="primary submit">
          <Plus />
          Save {page.toLowerCase()}
        </button>
      </form>
    </Modal>
  );
}

function RecordCollectionModal({
  item,
  onClose,
  onSave,
}:{
  item:Receivable;
  onClose:()=>void;
  onSave:(values:{amount:number;date:string;method:string;reference:string;notes:string})=>void;
}){
  const totalOwed=item.original+item.additional+(/business|investment/i.test(item.type)?0:item.interest)+item.fees,
    collected=item.collectedPrincipal+item.collectedInterest,
    remaining=receivableOutstanding(item),
    progress=totalOwed>0?Math.min(100,collected/totalOwed*100):0;
  return (
    <Modal title={`Record collection · ${item.title}`} onClose={onClose}>
      <form className="record-collection-form" onSubmit={(event)=>{event.preventDefault();const form=new FormData(event.currentTarget);onSave({amount:Number(form.get("amount")||0),date:String(form.get("date")),method:String(form.get("method")),reference:String(form.get("reference")||""),notes:String(form.get("notes")||"")})}}>
        <div className="receivable-progress-summary modal-progress">
          <span><b>{peso(collected)} of {peso(totalOwed)} collected</b><small>{progress.toFixed(2)}% · {peso(remaining)} remaining</small></span>
          <i><em style={{width:`${progress}%`}} /></i>
        </div>
        <div className="form-grid">
          <label>Amount collected<input name="amount" type="number" min="0.01" max={remaining||undefined} step="0.01" inputMode="decimal" required autoFocus /></label>
          <label>Collection date<input name="date" type="date" required defaultValue={todayIso()} /></label>
        </div>
        <div className="form-grid">
          <label>Payment method<ConnectedAccountSelect name="method" required defaultValue={item.collectionAccount}/></label>
          <label>Reference number<input name="reference" placeholder="Receipt, transfer, or check no." /></label>
        </div>
        <label>Notes<textarea name="notes" rows={3} placeholder="Optional collection notes" /></label>
        <button className="primary submit" type="submit"><HandCoins/>Save collection</button>
      </form>
    </Modal>
  )
}

function ReceivablePaymentHistoryModal({
  item,
  onClose,
}:{
  item:Receivable;
  onClose:()=>void;
}){
  const history=item.collectionHistory ?? [];
  const totalOwed=item.original+item.additional+(/business|investment/i.test(item.type)?0:item.interest)+item.fees;
  const collected=item.collectedPrincipal+item.collectedInterest;
  const remaining=receivableOutstanding(item);
  return (
    <Modal title={`Payment history · ${item.title}`} onClose={onClose}>
      <div className="receivable-history-detail">
        <div className="budget-edit-summary">
          <span><small>Total owed</small><b>{peso(totalOwed)}</b></span>
          <span><small>Collected</small><b className="positive">{peso(collected)}</b></span>
          <span><small>Remaining</small><b>{peso(remaining)}</b></span>
          <span><small>Payments</small><b>{history.length}</b></span>
        </div>
        <section className="receivable-history receivable-history-full">
          <h3>Collections recorded</h3>
          {history.length ? (
            <>
              <div className="receivable-history-head">
                <span>Date / Account</span>
                <span>Principal</span>
                <span>Interest / Fees</span>
                <span>Reference / Notes</span>
                <span>Status</span>
              </div>
              {history
                .slice()
                .sort((a,b)=>String(b.date).localeCompare(String(a.date)))
                .map((payment) => (
                  <div key={payment.id}>
                    <span><b>{payment.date}</b><small>{payment.account || "No account selected"}</small></span>
                    <strong>{peso(payment.principal)}</strong>
                    <strong>{peso(payment.interest + payment.fees)}</strong>
                    <span><b>{payment.reference || "—"}</b><small>{payment.notes || "No notes"}</small></span>
                    <em>{payment.status}</em>
                  </div>
                ))}
            </>
          ) : (
            <p className="empty-card">No collections recorded yet. Use Record Collection once money is received.</p>
          )}
        </section>
      </div>
    </Modal>
  )
}

function ActionModal({
  page,
  item,
  onClose,
  onApply,
}: {
  page: string;
  item: any;
  onClose: () => void;
  onApply: (v: any) => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  if (page === "Budgets")
    return (
      <Modal title={`Edit ${item.name} budget`} onClose={onClose}>
        <form className="budget-edit-form" onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const categoryValue=String(form.get("category"));
          onApply({action: "save", applyScope: String(form.get("applyScope") || "month"), budget: {
            name: categoryValue,
            parent: categoryValue.split(" / ")[0]||categoryValue,
            subcategory: categoryValue.split(" / ")[1]||"",
            type: categoryValue.includes(" / ")?"Subcategory":"Category",
            allocated: Number(form.get("allocated")),
            actual: item.actual,
            planned: Number(form.get("planned")),
            period: String(form.get("period")),
            start: String(form.get("start")),
            end: String(form.get("end")),
            warning: Number(form.get("warning")),
            critical: Number(form.get("critical")),
            rollover: form.get("rollover") === "on",
            rolloverLimit: Number(form.get("rolloverLimit")),
            includePlanned: form.get("includePlanned") === "on",
            includePending: form.get("includePending") === "on",
            notes: String(form.get("notes")),
          }});
        }}>
          <div className="budget-edit-summary">
            <span><small>Total budget</small><b>{peso(item.allocated)}</b></span>
            <span><small>Spent</small><b>{peso(item.actual)}</b></span>
            <span><small>Remaining</small><b>{peso(Number(item.allocated || 0) - Number(item.actual || 0))}</b></span>
          </div>
          <CategoryFields defaultValue={item.subcategory?`${item.parent} / ${item.subcategory}`:item.name}/>
          <label>Period<select name="period" defaultValue={item.period}><option>Weekly</option><option>Monthly</option><option>Quarterly</option><option>Annually</option></select></label>
          <div className="form-grid">
            <label>Total budget<input name="allocated" type="number" min="0" step="0.01" required defaultValue={item.allocated}/></label>
            <label>Spent automatically<input type="number" value={item.actual} disabled/><small>Calculated from matching posted transactions.</small></label>
          </div>
          <div className="form-grid">
            <input name="planned" type="hidden" value={item.planned}/>
            <label>Rollover limit<input name="rolloverLimit" type="number" min="0" step="0.01" defaultValue={item.rolloverLimit}/></label>
          </div>
          <div className="form-grid">
            <label>Start date<input name="start" type="date" required defaultValue={item.start}/></label>
            <label>End date<input name="end" type="date" required defaultValue={item.end}/></label>
          </div>
          <div className="form-grid">
            <label>Warning at (%)<input name="warning" type="number" min="1" max="100" defaultValue={item.warning}/></label>
            <label>Critical at (%)<input name="critical" type="number" min="1" max="100" defaultValue={item.critical}/></label>
          </div>
          <div className="budget-edit-options">
            <label><input name="includePlanned" type="checkbox" defaultChecked={item.includePlanned}/> Include planned expenses</label>
            <label><input name="includePending" type="checkbox" defaultChecked={item.includePending}/> Include pending transactions</label>
            <label><input name="rollover" type="checkbox" defaultChecked={item.rollover}/> Carry unused budget forward</label>
          </div>
          <label>Apply update to<select name="applyScope" defaultValue="month"><option value="month">This month only</option><option value="future">This month and future months</option></select></label>
          <label>Notes<textarea name="notes" rows={3} defaultValue={item.notes}/></label>
          <p className="form-note">Credit-card purchases count once when posted. Card payments are excluded.</p>
          <div className="budget-edit-actions">
            <button className="primary" type="submit">Save budget changes</button>
            {!confirmingDelete ? <button className="danger-outline" type="button" onClick={() => setConfirmingDelete(true)}>Delete budget</button> : <button className="danger" type="button" onClick={() => onApply({action: "delete"})}>Confirm move to archive</button>}
          </div>
        </form>
      </Modal>
    );
  if (page === "Money owed to me") {
    const isBusiness = /business|investment/i.test(item.type);
    const totalOwed = item.original + item.additional + (isBusiness ? 0 : item.interest) + item.fees;
    const collectedTotal = item.collectedPrincipal + item.collectedInterest;
    const expectedIncome = item.businessIncome ?? (isBusiness ? item.interest : 0);
    return (
      <Modal title={item.title} onClose={onClose}>
        <div className="receivable-detail">
          <div className="budget-edit-summary">
            <span><small>{isBusiness ? "Investment / principal" : "Total owed"}</small><b>{peso(totalOwed)}</b></span>
            <span><small>Still owed</small><b>{peso(receivableOutstanding(item))}</b></span>
            <span><small>Collected</small><b>{peso(collectedTotal)}</b></span>
            {isBusiness && <span><small>Expected monthly income</small><b>{peso(expectedIncome)}</b></span>}
          </div>
          <section className="receivable-history">
            <h3>Payment history</h3>
            {(item.collectionHistory ?? []).length ? (item.collectionHistory ?? []).map((payment: any) => (
              <div key={payment.id}>
                <span><b>{payment.date}</b><small>{payment.account}</small></span>
                <span><small>Principal</small><b>{peso(payment.principal)}</b></span>
                <span><small>Interest</small><b>{peso(payment.interest + payment.fees)}</b></span>
                <em>{payment.status}</em>
              </div>
            )) : <p className="empty-card">No collections recorded yet.</p>}
          </section>
          <form onSubmit={(event) => {event.preventDefault();const form=new FormData(event.currentTarget);onApply({action:"edit",receivable:{title:String(form.get("title")),borrower:String(form.get("borrower")),type:String(form.get("receivableType")),original:Number(form.get("original")),additional:Number(form.get("additional")),interest:Number(form.get("totalInterest")),businessIncome:Number(form.get("businessIncome")||0),incomeFrequency:String(form.get("incomeFrequency")||"Monthly"),fees:Number(form.get("totalFees")),expectedDate:String(form.get("expectedDate")),collectionAccount:String(form.get("collectionAccount")),notes:String(form.get("notes"))}})}}>
            <h3 className="form-section-title">Edit receivable</h3>
            <div className="form-grid"><label>Receivable name<input name="title" required defaultValue={item.title}/></label><label>Borrower<input name="borrower" required defaultValue={item.borrower}/></label></div>
            <div className="form-grid"><label>Receivable type<select name="receivableType" defaultValue={item.type}><option>Personal receivable</option><option>Family loan</option><option>Business investment</option><option>Business income share</option><option>Other receivable</option></select></label><label>Expected monthly income<input name="businessIncome" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={expectedIncome}/></label></div>
            <div className="form-grid"><label>Original amount<input name="original" type="number" min="0" step="0.01" defaultValue={item.original}/></label><label>Additional amount<input name="additional" type="number" min="0" step="0.01" defaultValue={item.additional}/></label></div>
            <div className="form-grid"><label>Total interest owed<input name="totalInterest" type="number" min="0" step="0.01" defaultValue={isBusiness ? 0 : item.interest}/></label><label>Total fees owed<input name="totalFees" type="number" min="0" step="0.01" defaultValue={item.fees}/></label></div>
            <div className="form-grid"><label>Income frequency<select name="incomeFrequency" defaultValue={item.incomeFrequency ?? "Monthly"}><option>Monthly</option><option>Quarterly</option><option>Semiannually</option><option>Annually</option><option>Custom</option></select></label><span className="form-note">Business monthly income is tracked separately from the invested principal.</span></div>
            <div className="form-grid"><label>Expected collection<input name="expectedDate" type="date" defaultValue={item.expectedDate}/></label><label>Collection account<input name="collectionAccount" defaultValue={item.collectionAccount}/></label></div>
            <label>Notes<textarea name="notes" rows={2} defaultValue={item.notes}/></label>
            <button className="primary submit">Save receivable changes</button>
          </form>
          <form onSubmit={(event) => {event.preventDefault();const form=new FormData(event.currentTarget);onApply({action:"collect",principal:Number(form.get("principal")||0),interest:Number(form.get("interest")||0),fees:Number(form.get("fees")||0),date:String(form.get("date"))})}}>
            <h3 className="form-section-title">Record collection</h3>
            <div className="form-grid"><label>Principal collected<input name="principal" type="number" min="0" step="0.01" required/></label><label>Interest collected<input name="interest" type="number" min="0" step="0.01" defaultValue="0"/></label></div>
            <div className="form-grid"><label>Fees collected<input name="fees" type="number" min="0" step="0.01" defaultValue="0"/></label><label>Collection date<input name="date" type="date" required defaultValue="2026-07-20"/></label></div>
            <button className="outline submit">Record collection</button>
          </form>
          <div className="budget-edit-actions">
            {!confirmingDelete ? <button className="danger-outline" type="button" onClick={() => setConfirmingDelete(true)}>Delete receivable</button> : <button className="danger" type="button" onClick={() => onApply({action:"delete"})}>Confirm delete permanently</button>}
          </div>
        </div>
      </Modal>
    );
  }
  const installmentRows = page === "Installments" ? recurrenceDates(item.start, item.count).map((dueDate, index) => ({number:index+1,dueDate,amount:item.amount,status:index < item.paidCount ? "Paid" : dueDate < "2026-07-20" ? "Overdue" : "Unpaid"})) : [];
  if (page === "Installments") {
    return (
      <Modal title="Installment details" onClose={onClose}>
        <div className="installment-detail-progress">
          <span>
            <b>{item.paidCount}/{item.count} paid</b>
            <small>{peso(item.remainingPayable)} remaining</small>
          </span>
          <i><em style={{width:`${item.count ? item.paidCount/item.count*100 : 0}%`}}/></i>
        </div>
        <section className="installment-schedule">
          <h3>View schedule</h3>
          <div className="installment-schedule-head"><span>#</span><span>Due date</span><span>Amount</span><span>Status</span></div>
          {installmentRows.map(row=><div key={row.number}><span>{row.number}</span><span>{row.dueDate}</span><strong>{peso(row.amount)}</strong><em className={row.status.toLowerCase()}>{row.status}</em></div>)}
        </section>
        <form onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onApply({
            action: "edit",
            name: String(form.get("name") || ""),
            merchant: String(form.get("merchant") || ""),
            original: Number(form.get("original") || 0),
            start: String(form.get("start") || ""),
            count: Number(form.get("count") || 0),
            monthly: Number(form.get("monthly") || 0),
          });
        }}>
          <h3 className="form-section-title">Edit installment details</h3>
          <div className="form-grid"><label>Installment name<input name="name" defaultValue={item.name}/></label><label>Merchant<input name="merchant" defaultValue={item.merchant}/></label></div>
          <div className="form-grid"><label>Total amount<input name="original" type="number" min="0.01" step="0.01" inputMode="decimal" defaultValue={item.original} required/></label><label>Start date<input name="start" type="date" defaultValue={item.start} required/></label></div>
          <div className="form-grid"><label>Total months<input name="count" type="number" min={item.paidCount+1} defaultValue={item.count}/></label><label>Monthly payment<input name="monthly" type="number" min="0.01" step="0.01" inputMode="decimal" defaultValue={item.amount}/></label></div>
          <button className="outline submit" type="submit"><Check/>Save installment details</button>
        </form>
        <form onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onApply({amount: Number(form.get("amount") || 0), date: String(form.get("date")), account: String(form.get("account") || "")});
        }}>
          <h3 className="form-section-title">Record payment</h3>
          <label>Payment amount<input name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" required defaultValue={item.amount}/></label>
          <label>Date<input name="date" type="date" required defaultValue="2026-07-20" /></label>
          <label>Payment account<select name="account" required defaultValue=""><option value="" disabled>Select an account</option><option>Savings</option><option>Checking</option><option>Bank Account</option><option>eWallet</option><option>Cash</option></select></label>
          <button className="primary submit"><Check/>Post installment payment</button>
        </form>
        <button className="danger-outline submit" type="button" onClick={() => confirmingDelete ? onApply({action:"delete"}) : setConfirmingDelete(true)}>
          <Trash2 />
          {confirmingDelete ? "Confirm delete permanently" : "Delete installment"}
        </button>
      </Modal>
    );
  }
  return (
    <Modal
      title={
        page === "Debts"
          ? "Edit debt & payment"
          : page === "Money owed to me"
            ? "Record collection"
            : page === "Planned payments"
              ? "Edit planned payment"
              : "Pay installment"
      }
      onClose={onClose}
    >
      <form
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onApply({
            principal: Number(f.get("principal") || 0),
            interest: Number(f.get("interest") || 0),
            fees: Number(f.get("fees") || 0),
            amount: Number(f.get("amount") || 0),
            date: String(f.get("date")),
            account: String(f.get("account") || ""),
            name:String(f.get("name")||""),merchant:String(f.get("merchant")||""),count:Number(f.get("count")||0),monthly:Number(f.get("monthly")||0),
          });
        }}
      >
        {page === "Installments" && <><div className="installment-detail-progress"><span><b>{item.paidCount}/{item.count} paid</b><small>{peso(item.remainingPayable)} remaining</small></span><i><em style={{width:`${item.count ? item.paidCount/item.count*100 : 0}%`}}/></i></div><section className="installment-schedule"><h3>Payment schedule</h3><div className="installment-schedule-head"><span>#</span><span>Due date</span><span>Amount</span><span>Status</span></div>{installmentRows.map(row=><div key={row.number}><span>{row.number}</span><span>{row.dueDate}</span><strong>{peso(row.amount)}</strong><em className={row.status.toLowerCase()}>{row.status}</em></div>)}</section><h3 className="form-section-title">Edit installment details</h3><div className="form-grid"><label>Installment name<input name="name" defaultValue={item.name}/></label><label>Merchant<input name="merchant" defaultValue={item.merchant}/></label></div><div className="form-grid"><label>Total months<input name="count" type="number" min={item.paidCount+1} defaultValue={item.count}/></label><label>Monthly payment<input name="monthly" type="number" min="0.01" step="0.01" inputMode="decimal" defaultValue={item.amount}/></label></div><h3 className="form-section-title">Record payment</h3></>}
        {["Debts", "Money owed to me"].includes(page) ? (
          <>
            <div className="form-grid">
              <label>
                Principal amount
                <input name="principal" type="number" min="0" step="0.01" inputMode="decimal" required />
              </label>
              <label>
                {page === "Debts" ? "Interest expense" : "Interest income"}
                <input name="interest" type="number" min="0" step="0.01" inputMode="decimal" defaultValue="0" />
              </label>
            </div>
            <label>
              Fees
              <input name="fees" type="number" min="0" step="0.01" inputMode="decimal" defaultValue="0" />
            </label>
          </>
        ) : (
          <label>
            {page === "Planned payments" ? "Actual amount" : "Payment amount"}
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              required
              defaultValue={item.amount}
            />
          </label>
        )}
        <label>
          Date
          <input name="date" type="date" required defaultValue="2026-07-20" />
        </label>
        {(page === "Debts" || page === "Installments") && <label>Payment account<select name="account" required defaultValue=""><option value="" disabled>Select an account</option><option>Savings</option><option>Checking</option><option>Bank Account</option><option>eWallet</option><option>Cash</option></select></label>}
        <button className="primary submit">
          <Check />
          Post and create ledger entry
        </button>
        <button className="danger-outline submit" type="button" onClick={() => confirmingDelete ? onApply({action:"delete"}) : setConfirmingDelete(true)}>
          <Trash2 />
          {confirmingDelete ? page === "Debts" ? "Confirm delete permanently" : "Confirm move to archive" : `Delete ${page === "Debts" ? "debt" : page === "Planned payments" ? "planned payment" : "installment"}`}
        </button>
      </form>
    </Modal>
  );
}
function Modal({
  title,
  onClose,
  children,
  wide = false,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className={["modal planning-modal", wide ? "planning-modal-wide" : "", className].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            <p>Changes are traceable and can be archived later.</p>
          </div>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
