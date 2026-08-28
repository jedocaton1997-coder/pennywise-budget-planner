import { useEffect, useState, type FormEvent } from 'react'
import {
  Bell, CalendarDays, CalendarRange, Check, ChevronDown, ChevronLeft, ChevronRight,
  BarChart3, CircleDollarSign, CreditCard, FileBarChart, Gauge, Home, Landmark,
  LayoutDashboard, ListRestart, LogOut, Plus, ReceiptText,
  ShieldCheck, Target, TrendingDown, TrendingUp, Utensils, WalletCards,
  Wifi, Zap, Car, Plane, ShoppingBasket, X, Search, UserCircle,
  ArrowLeftRight, Banknote, MoreHorizontal, Settings as SettingsIcon
} from 'lucide-react'
import FeaturePages from './FeaturePages'
import DashboardOverview from './DashboardOverview'
import CategorySettings from './CategorySettings'
import {CategoryFields} from './components/CategoryFields'
import {ConnectedAccountSelect} from './components/ConnectedAccountSelect'
import {useCreditCardBillSync} from './hooks/useCreditCardBillSync'
import {useInstallmentCreditSync} from './hooks/useInstallmentCreditSync'
import {useAutomaticBillPaymentSync} from './hooks/useAutomaticBillPaymentSync'
import { useFirestoreState } from './hooks/useFirestoreState'
import { useNotificationSummary } from './hooks/useNotificationSummary'
import { useWalletSnapshot } from './hooks/useWalletSnapshot'
import { signOut } from 'firebase/auth'
import { firebaseAuth } from './lib/firebase'
import { billUsesIncludedCard, filterIncludedCardTransactions } from './utils/netBalanceFilters'

type IconType = typeof Home

const userName=()=>{
  const user=firebaseAuth.currentUser
  const raw=user?.displayName?.trim()
  return raw?raw.split(/\s+/)[0].replace(/^./,letter=>letter.toUpperCase()):'Jed <3'
}

const money=(value:number)=>`${value<0?'-':''}₱${Math.abs(value).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const numeric=(value:unknown)=>Number(String(value??0).replace(/[^0-9.-]/g,''))||0
const inNextDays=(value:string,days:number)=>{const date=new Date(`${value}T12:00:00`),today=new Date();today.setHours(0,0,0,0);const end=new Date(today);end.setDate(end.getDate()+days);return !Number.isNaN(date.valueOf())&&date>=today&&date<=end}

function buildDashboardInsight(wallet:any,bills:any[],planning:any[],budgets:any[],goals:any[]){
  const accounts=wallet?.accounts??[],cards=wallet?.cards??[],accountTransactions=wallet?.accountTransactions??[],cardTransactions=filterIncludedCardTransactions(wallet?.transactions??[],cards)
  const available=accounts.reduce((sum:number,account:any)=>sum+numeric(account.balance),0)
  const dueSoon=bills.filter(bill=>billUsesIncludedCard(bill,cards)&&!['Paid','Skipped'].includes(String(bill.status))&&inNextDays(String(bill.dueDate),7)).reduce((sum,bill)=>sum+numeric(bill.amount),0)
  const plannedSoon=planning.filter(item=>!item.archived&&item.type==='Expense'&&inNextDays(String(item.date),7)).reduce((sum,item)=>sum+numeric(item.amount),0)
  const safeToSpend=available-dueSoon-plannedSoon
  const month=new Date().toISOString().slice(0,7)
  const income=accountTransactions.filter((transaction:any)=>String(transaction.date).startsWith(month)&&transaction.type==='Income').reduce((sum:number,transaction:any)=>sum+numeric(transaction.amount),0)
  const expenses=accountTransactions.filter((transaction:any)=>String(transaction.date).startsWith(month)&&transaction.type==='Expense').reduce((sum:number,transaction:any)=>sum+numeric(transaction.amount),0)+cardTransactions.filter((transaction:any)=>String(transaction.postedDate).startsWith(month)&&transaction.status==='posted'&&['purchase','installment','fee','interest'].includes(transaction.type)).reduce((sum:number,transaction:any)=>sum+numeric(transaction.amount),0)
  const atRiskBudget=budgets.filter(budget=>!budget.archived&&numeric(budget.allocated)>0).sort((a,b)=>numeric(b.actual)/numeric(b.allocated)-numeric(a.actual)/numeric(a.allocated))[0]
  const budgetName=atRiskBudget?.subcategory||atRiskBudget?.name||'your budget'
  const budgetRatio=atRiskBudget&&numeric(atRiskBudget.allocated)>0?numeric(atRiskBudget.actual)/numeric(atRiskBudget.allocated):0
  const savingsTotal=goals.reduce((sum,goal)=>sum+numeric(Array.isArray(goal)?goal[2]:goal?.current),0)
  if(safeToSpend<0)return <>Projected shortfall of <strong>{money(Math.abs(safeToSpend))}</strong> in the next 7 days. Review upcoming bills before adding new spending.</>
  if(dueSoon+plannedSoon>0)return <>You have <strong>{money(dueSoon+plannedSoon)}</strong> due in the next 7 days. Estimated safe-to-spend is <strong>{money(Math.max(0,safeToSpend))}</strong>.</>
  if(budgetRatio>=1)return <><strong>{budgetName}</strong> is over budget. Check recent transactions before approving more spending.</>
  if(budgetRatio>=.85)return <><strong>{budgetName}</strong> is close to its limit. Keep an eye on this category for the rest of the month.</>
  if(income>expenses)return <>Income is ahead of expenses by <strong>{money(income-expenses)}</strong> this month. Consider moving extra cash toward savings.</>
  if(expenses>income)return <>Expenses are ahead of income by <strong>{money(expenses-income)}</strong> this month. Review the largest categories today.</>
  if(savingsTotal>0)return <>Your savings balance is <strong>{money(savingsTotal)}</strong>. Keep contributions steady to protect your goals.</>
  return <>Add upcoming bills, planned income, and budgets to generate sharper financial insights.</>
}

function buildDashboardStatus(wallet:any,bills:any[],planning:any[],rangeMonths:number){
  const accounts=wallet?.accounts??[],cards=wallet?.cards??[],accountTransactions=wallet?.accountTransactions??[],cardTransactions=filterIncludedCardTransactions(wallet?.transactions??[],cards)
  const available=accounts.reduce((sum:number,account:any)=>sum+numeric(account.balance),0)
  const dueWithinSeven=bills.filter(bill=>billUsesIncludedCard(bill,cards)&&!['Paid','Skipped'].includes(String(bill.status))&&inNextDays(String(bill.dueDate),7)).reduce((sum,bill)=>sum+numeric(bill.amount),0)
  const plannedExpenses=planning.filter(item=>!item.archived&&item.type==='Expense').reduce((sum,item)=>sum+numeric(item.amount),0)
  const safeToSpend=available-dueWithinSeven-plannedExpenses
  const months=Math.max(1,Math.min(12,Number(rangeMonths)||1)),today=new Date(),keys=Array.from({length:months},(_,index)=>{const date=new Date(today.getFullYear(),today.getMonth()-(months-1-index),1);return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`})
  const income=accountTransactions.filter((transaction:any)=>keys.some(key=>String(transaction.date).startsWith(key))&&transaction.type==='Income').reduce((sum:number,transaction:any)=>sum+numeric(transaction.amount),0)
  const expenses=accountTransactions.filter((transaction:any)=>keys.some(key=>String(transaction.date).startsWith(key))&&transaction.type==='Expense').reduce((sum:number,transaction:any)=>sum+numeric(transaction.amount),0)+cardTransactions.filter((transaction:any)=>keys.some(key=>String(transaction.postedDate||transaction.transactionDate).startsWith(key))&&transaction.status==='posted'&&['purchase','installment','fee','interest'].includes(transaction.type)).reduce((sum:number,transaction:any)=>sum+numeric(transaction.amount),0)
  return{available,dueWithinSeven,plannedExpenses,safeToSpend,netCashFlow:income-expenses}
}

const nav: [string, IconType][] = [
  ['Overview', LayoutDashboard], ['Calendar', CalendarDays],
  ['Transactions', ListRestart], ['Expenses', TrendingUp], ['Credit cards', CreditCard], ['Bills', ReceiptText],
  ['Budget', Gauge], ['Budgets', Target], ['Debts', Landmark], ['Money owed to me', CircleDollarSign], ['Planned payments', CalendarRange], ['Installments', WalletCards], ['Savings', Target], ['Statistics', BarChart3], ['Reports', FileBarChart], ['Timesheets', CalendarRange], ['Notifications', Bell], ['Settings', SettingsIcon]
]

const upcoming = [
  { day: '21', icon: Zap, name: 'Electricity', amount: '₱3,500', status: 'Due tomorrow', tone: 'amber' },
  { day: '22', icon: Wifi, name: 'Internet', amount: '₱1,800', status: 'Auto-pay', tone: 'green' },
  { day: '24', icon: CreditCard, name: 'BPI Rewards', amount: '₱8,000', status: 'Scheduled', tone: 'blue' },
  { day: '25', icon: Home, name: 'Rent', amount: '₱10,000', status: 'Upcoming', tone: 'gray' }
]

const budgets = [
  { icon: ShoppingBasket, label: 'Groceries', value: '₱8,200 / ₱12,000', percent: 68, tone: 'green' },
  { icon: Car, label: 'Transport', value: '₱5,400 / ₱7,000', percent: 77, tone: 'green' },
  { icon: Utensils, label: 'Dining', value: '₱4,150 / ₱5,000', percent: 83, tone: 'amber' }
]

function Sidebar({ selected, onSelect, collapsed, onToggle }: { selected: string, onSelect: (v: string) => void, collapsed:boolean, onToggle:()=>void }) {
  const [openSections,setOpenSections]=useState<Record<string,boolean>>(()=>({
    Accounts:['Credit cards','Bills','Installments'].includes(selected),
    'Financial Goals':['Savings','Debts','Money owed to me'].includes(selected),
    Insights:['Statistics','Reports'].includes(selected),
  }))
  useEffect(()=>{
    const group=['Credit cards','Bills','Installments'].includes(selected)?'Accounts':['Savings','Debts','Money owed to me'].includes(selected)?'Financial Goals':['Statistics','Reports'].includes(selected)?'Insights':''
    if(group)setOpenSections(current=>({...current,[group]:true}))
  },[selected])
  const [now,setNow]=useState(()=>new Date())
  useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),30000);return()=>window.clearInterval(timer)},[])
  const timeParts=now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true}).split(' ')
  const dayLabel=now.toLocaleDateString('en-US',{weekday:'long'})
  const dateLabel=now.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})
  const topItems=[{label:'Dashboard',page:'Overview',Icon:LayoutDashboard},{label:'Calendar',page:'Calendar',Icon:CalendarDays},{label:'Transactions',page:'Transactions',Icon:ListRestart},{label:'Cash Flow Plan',page:'Cash Flow Plan',Icon:CalendarRange},{label:'Budget',page:'Budget',Icon:Gauge}]
  const groups=[
    {label:'Accounts',Icon:WalletCards,children:[{label:'Accounts & Cards',page:'Credit cards'},{label:'Bills & Payments',page:'Bills'},{label:'Installments',page:'Installments'}]},
    {label:'Financial Goals',Icon:Target,children:[{label:'Savings',page:'Savings'},{label:'Debts',page:'Debts'},{label:'Receivables',page:'Money owed to me'}]},
    {label:'Insights',Icon:BarChart3,children:[{label:'Statistics',page:'Statistics'},{label:'Reports',page:'Reports'}]},
  ]
  const groupActive=(group:{children:Array<{page:string}>})=>group.children.some(child=>selected===child.page)
  const toggleGroup=(label:string)=>setOpenSections(current=>({...current,[label]:!current[label]}))
  return <aside className={`sidebar${collapsed?' collapsed':''}`}>
    <div className="sidebar-top sidebar-clock-top">
      <button className="sidebar-toggle" aria-label={collapsed?'Expand sidebar':'Collapse sidebar'} title={collapsed?'Expand sidebar':'Collapse sidebar'} aria-expanded={!collapsed} onClick={onToggle}>{collapsed?<ChevronRight/>:<ChevronLeft/>}</button>
      <div className="sidebar-clock" aria-label={`${timeParts[0]} ${timeParts[1]}, ${dayLabel}, ${dateLabel}`}>
        <strong>{timeParts[0]} <span>{timeParts[1]}</span></strong>
        <b>{dayLabel}</b>
        <small>{dateLabel}</small>
      </div>
    </div>
    <nav>
      {topItems.map(({label,page,Icon})=><button title={label} aria-label={label} aria-current={selected===page?'page':undefined} key={page} onClick={()=>onSelect(page)} className={selected===page?'active':''}><Icon/><span>{label}</span></button>)}
      {groups.map(group=>{const Icon=group.Icon,active=groupActive(group),open=Boolean(openSections[group.label])
        return <div className={`sidebar-nav-group ${open&&!collapsed?'open':''}`} key={group.label}>
          <button title={group.label} aria-label={group.label} aria-current={active?'page':undefined} aria-expanded={open&&!collapsed} onClick={()=>toggleGroup(group.label)} className={active?'active parent-active':''}><Icon/><span>{group.label}</span><ChevronDown className="sidebar-subnav-chevron"/></button>
          {!collapsed&&open&&<div className="sidebar-subnav" role="group" aria-label={`${group.label} submenu`}>
            {group.children.map(child=><button title={child.label} aria-label={child.label} aria-current={selected===child.page?'page':undefined} key={child.page} onClick={()=>onSelect(child.page)} className={selected===child.page?'active':''}><span className="sidebar-subnav-dot"/><span>{child.label}</span></button>)}
          </div>}
        </div>
      })}
      <button title="Timesheets" aria-label="Timesheets" aria-current={selected==='Timesheets'?'page':undefined} onClick={()=>onSelect('Timesheets')} className={selected==='Timesheets'?'active':''}><CalendarRange/><span>Timesheets</span></button>
    </nav>
  </aside>
}

const quickAddItems=[['Transaction','Transactions'],['Bank Account','Credit cards'],['Credit Card','Credit cards'],['Bill','Bills'],['Budget','Budget'],['Savings Goal','Savings'],['Debt','Debts'],['Installment','Installments'],['Timesheet','Timesheets'],['Category','Settings']] as const
function TopActionBar({onAdd,onTransfer,onQuickPay,onSearch,onNotifications,onProfile,unreadCount}:{onAdd:(item:string,page:string)=>void;onTransfer:()=>void;onQuickPay:()=>void;onSearch:()=>void;onNotifications:()=>void;onProfile:()=>void;unreadCount:number}){
 const [menu,setMenu]=useState<'add'|'more'|'profile'|null>(null)
 return <div className="top-action-bar" aria-label="Quick actions">
  <div className="top-primary-actions">
   <div className="top-action-menu-wrap"><button className="toolbar-action" aria-haspopup="menu" aria-expanded={menu==='add'} onClick={()=>setMenu(value=>value==='add'?null:'add')}><Plus/>Add<ChevronDown/></button>{menu==='add'&&<div className="toolbar-menu add-menu" role="menu">{quickAddItems.map(([item,page])=><button role="menuitem" key={item} onClick={()=>{onAdd(item,page);setMenu(null)}}>{item}</button>)}</div>}</div>
   <button className="toolbar-action secondary-action" onClick={onTransfer}><ArrowLeftRight/>Transfer</button>
   <button className="toolbar-action quick-pay" onClick={onQuickPay}><Banknote/>Quick Pay</button>
  </div>
  <div className="top-icon-actions">
   <button className="toolbar-icon" aria-label="Global search" title="Search" onClick={onSearch}><Search/></button>
   <button className="toolbar-icon notification-action" aria-label={`${unreadCount} unread notifications`} title="Notifications" onClick={onNotifications}><Bell/>{unreadCount>0&&<i aria-hidden="true">{unreadCount>99?'99+':unreadCount}</i>}</button>
   <div className="top-action-menu-wrap"><button className="toolbar-icon" aria-label="Profile and account" title="Profile" aria-haspopup="menu" aria-expanded={menu==='profile'} onClick={()=>setMenu(value=>value==='profile'?null:'profile')}><UserCircle/></button>{menu==='profile'&&<div className="toolbar-menu profile-menu" role="menu"><button role="menuitem" onClick={()=>{onProfile();setMenu(null)}}><UserCircle/>Profile & settings</button><button role="menuitem" onClick={()=>void signOut(firebaseAuth)}><LogOut/>Log out</button></div>}</div>
   <div className="top-action-menu-wrap mobile-more"><button className="toolbar-icon" aria-label="More quick actions" aria-haspopup="menu" aria-expanded={menu==='more'} onClick={()=>setMenu(value=>value==='more'?null:'more')}><MoreHorizontal/></button>{menu==='more'&&<div className="toolbar-menu mobile-menu" role="menu"><button role="menuitem" onClick={()=>{onTransfer();setMenu(null)}}><ArrowLeftRight/>Transfer</button><button role="menuitem" onClick={()=>{onQuickPay();setMenu(null)}}><Banknote/>Quick Pay</button><button role="menuitem" onClick={()=>{onSearch();setMenu(null)}}><Search/>Search</button></div>}</div>
  </div>
 </div>
}

function CashFlowChart() {
  return <div className="chart-wrap" aria-label="Balance forecast chart for July 20 to 26">
    <svg className="chart" viewBox="0 0 640 176" role="img">
      <defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7eb78f" stopOpacity=".28"/><stop offset="1" stopColor="#7eb78f" stopOpacity=".03"/></linearGradient></defs>
      {[25,70,115,160].map(y => <line key={y} x1="45" y1={y} x2="625" y2={y} stroke="#e1dfd7"/>) }
      <path d="M45 63 L98 60 L116 46 L168 48 L203 70 L250 87 L301 90 L344 105 L379 118 L407 144 L440 135 L485 135 L515 119 L553 116 L578 96 L625 88 L625 160 L45 160 Z" fill="url(#fill)"/>
      <path d="M45 63 L98 60 L116 46 L168 48 L203 70 L250 87 L301 90 L344 105 L379 118 L407 144 L440 135 L485 135 L515 119 L553 116 L578 96 L625 88" fill="none" stroke="#176a3a" strokeWidth="3" strokeLinejoin="round"/>
      <line x1="116" y1="20" x2="116" y2="160" stroke="#65a77a" strokeDasharray="4 4"/><circle cx="116" cy="46" r="5" fill="#168143"/>
      <line x1="301" y1="20" x2="301" y2="160" stroke="#ef765d" strokeDasharray="4 4"/><circle cx="301" cy="90" r="5" fill="#e9573f"/>
      <line x1="485" y1="20" x2="485" y2="160" stroke="#ef765d" strokeDasharray="4 4"/><circle cx="485" cy="135" r="5" fill="#e9573f"/>
      <g className="svg-labels"><text x="116" y="13">₱10,000</text><text x="301" y="13" className="red">₱5,300</text><text x="485" y="13" className="red">₱10,000</text></g>
    </svg>
    <div className="axis"><span>Sun 20</span><span>Mon 21</span><span>Tue 22</span><span>Wed 23</span><span>Thu 24</span><span>Fri 25</span><span>Sat 26</span></div>
    <div className="legend"><span><i className="line"/>Balance</span><span><i className="dot green"/>Income</span><span><i className="dot coral"/>Bills</span></div>
  </div>
}

const cashFlowSyncNormalize = (value = "") => value.toLowerCase().replace(/\s+/g, " ").trim()
const cashFlowSyncCents = (value: unknown) => Math.round(numeric(value) * 100)
const cashFlowRecordDate = (record: any) => String(record?.date || record?.expectedDate || record?.dueDate || "")
const cashFlowRecordAccount = (record: any) => String(record?.accountName || record?.account || record?.autopayAccount || "")
const cashFlowRecordMatchesTransaction = (
  record: any,
  transaction: { category: string; amount: number; date: string; accountName: string; kind: "Income" | "Expense" },
) => {
  if (!record) return false
  if (transaction.kind === "Income" && record.type && record.type !== "Income") return false
  if (transaction.kind === "Expense" && record.type === "Income") return false
  const recordCategory = cashFlowSyncNormalize(String(record.category || ""))
  const transactionCategory = cashFlowSyncNormalize(transaction.category)
  const recordAccount = cashFlowSyncNormalize(cashFlowRecordAccount(record))
  const transactionAccount = cashFlowSyncNormalize(transaction.accountName)
  return recordCategory === transactionCategory &&
    cashFlowSyncCents(record.amount) === cashFlowSyncCents(transaction.amount) &&
    cashFlowRecordDate(record) === transaction.date &&
    (!recordAccount || recordAccount === transactionAccount)
}

function AddTransaction({ onClose, initialType='Expense' }: { onClose: () => void; initialType?:string }) {
  const [type, setType] = useState(initialType)
  const [saved, setSaved] = useState(false)
  const [wallet,saveWallet]=useWalletSnapshot<any>({accounts:[],cards:[],accountTransactions:[],transactions:[]})
  const [,setCashFlowIncome]=useFirestoreState<any[]>('income',[])
  const [,setPlanning]=useFirestoreState<any[]>('planning',[])
  const [,setPlannedPayments]=useFirestoreState<any[]>('plannedPayments',[])
  const [,setBills]=useFirestoreState<any[]>('bills',[])
  const syncTransactionToCashFlow = (transaction: { id: number; type: string; category: string; amount: number; date: string; accountName: string }) => {
    const isIncome = transaction.type === "Income"
    const syncPayload = {
      category: transaction.category,
      amount: transaction.amount,
      date: transaction.date,
      accountName: transaction.accountName,
      kind: isIncome ? "Income" as const : "Expense" as const,
    }
    if (isIncome) {
      const markReceived = (record: any) => ({
        ...record,
        status: "Received",
        actualAmount: transaction.amount,
        receivedAmount: transaction.amount,
        actualDate: transaction.date,
        receivedDate: transaction.date,
        receivedOccurrenceDate: cashFlowRecordDate(record),
        account: record.account || transaction.accountName,
        accountName: record.accountName || transaction.accountName,
        linkedTransactionId: transaction.id,
      })
      setCashFlowIncome((current) => current.map((record) => cashFlowRecordMatchesTransaction(record, syncPayload) ? markReceived(record) : record))
      setPlanning((current) => current.map((record) => cashFlowRecordMatchesTransaction(record, syncPayload) ? markReceived(record) : record))
      return
    }
    const markPaid = (record: any) => ({
      ...record,
      status: "Paid",
      actualAmount: transaction.amount,
      paidAmount: transaction.amount,
      actualDate: transaction.date,
      paymentDate: transaction.date,
      paidOccurrenceDate: cashFlowRecordDate(record),
      account: record.account || transaction.accountName,
      accountName: record.accountName || transaction.accountName,
      linkedTransactionId: transaction.id,
    })
    setPlanning((current) => current.map((record) => cashFlowRecordMatchesTransaction(record, syncPayload) ? markPaid(record) : record))
    setPlannedPayments((current) => current.map((record) => cashFlowRecordMatchesTransaction(record, syncPayload) ? markPaid(record) : record))
    setBills((current) => current.map((record) => cashFlowRecordMatchesTransaction(record, syncPayload) ? markPaid(record) : record))
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" onMouseDown={e => e.stopPropagation()} aria-modal="true" role="dialog">
    <div className="modal-head"><div><h2>Add transaction</h2><p>Record money coming in or going out.</p></div><button aria-label="Close" className="icon-button" onClick={onClose}><X/></button></div>
    {saved ? <div className="success"><span><Check/></span><h3>Transaction added</h3><p>Your balance and forecast are up to date.</p><button className="primary" onClick={onClose}>Done</button></div> : <form onSubmit={e => {e.preventDefault();const form=new FormData(e.currentTarget),accountName=String(form.get('account')),account=(wallet.accounts??[]).find((item:any)=>item.name===accountName),card=(wallet.cards??[]).find((item:any)=>item.name===accountName),id=Date.now(),date=String(form.get('date')),description=String(form.get('description')),category=String(form.get('category')),amount=Number(form.get('amount')),effect=type==='Income'?amount:type==='Expense'?-amount:0,next=card?{...wallet,transactions:[...(wallet.transactions??[]),{id,cardId:card.id,type:type==='Expense'?'purchase':type==='Income'?'credit':'payment',description,category,amount,transactionDate:date,postedDate:date,status:'posted',notes:'',expenseCounted:type==='Expense'}]}:{...wallet,accountTransactions:[...(wallet.accountTransactions??[]),{id,accountId:account?.id,date,description,type,category,amount,status:'Posted',notes:''}],accounts:(wallet.accounts??[]).map((item:any)=>item.id===account?.id?{...item,balance:Number(item.balance||0)+effect}:item)};saveWallet(next);syncTransactionToCashFlow({id,type,category,amount,date,accountName});setSaved(true)}}>
      <div className="type-switch">{['Expense','Income'].map(v => <button type="button" key={v} className={type === v ? 'selected' : ''} onClick={() => setType(v)}>{v}</button>)}</div>
      <label>Description<input name="description" required placeholder="e.g. Groceries" autoFocus/></label><CategoryFields/>
      <div className="form-grid"><label>Amount<input name="amount" required type="number" min="0.01" step="0.01" placeholder="₱ 0.00"/></label><label>Date<input name="date" required type="date" defaultValue="2026-07-20"/></label></div>
      <label>Account<ConnectedAccountSelect required/></label>
      <button className="primary submit" type="submit"><Plus/>Add {type.toLowerCase()}</button>
    </form>}
  </section></div>
}

type TransferWallet = {
  accounts: Array<{ id: number; name: string; balance: number; [key: string]: unknown }>;
  cards: Array<{ id: number; name: string; active?: boolean; [key: string]: unknown }>;
  accountTransactions: Array<{ id: number; accountId: number; date: string; description: string; type: "Income" | "Expense" | "Transfer"; category: string; amount: number; status: "Posted"; notes?: string }>;
  transactions: Array<{ id: number; cardId: number; type: "purchase" | "installment" | "fee" | "interest" | "refund" | "credit" | "payment" | "adjustment"; description: string; category: string; amount: number; transactionDate: string; postedDate: string; status: "pending" | "posted"; notes?: string; expenseCounted: boolean }>;
  payments?: Array<{ id: number; cardId: number; account: string; date: string; amount: number; option: string; status: "Scheduled" | "Posted"; notes: string; allocations: Array<{ cycle: "statement" | "current-cycle" | "credit"; amount: number; date: string }> }>;
  [key: string]: unknown;
};

function TransferMoney({ onClose }: { onClose: () => void }) {
  const [wallet, saveWallet] = useWalletSnapshot<TransferWallet>({ accounts: [], cards: [], accountTransactions: [], transactions: [], payments: [] });
  const [saved, setSaved] = useState("");
  const accountNames = [...(wallet.accounts ?? []).map((account) => account.name), ...(wallet.cards ?? []).filter((card) => card.active !== false).map((card) => card.name)];

  const postTransfer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const from = String(form.get("from"));
    const to = String(form.get("to"));
    const amount = Number(form.get("amount"));
    const date = String(form.get("date"));
    const notes = String(form.get("notes") || "");
    if (!from || !to || from === to || amount <= 0) return;

    const fromAccount = wallet.accounts.find((account) => account.name === from);
    const toAccount = wallet.accounts.find((account) => account.name === to);
    const fromCard = wallet.cards.find((card) => card.active !== false && card.name === from);
    const toCard = wallet.cards.find((card) => card.active !== false && card.name === to);
    const transferId = Date.now();
    const transferKey = `transfer:${transferId}:${from}->${to}`;

    const accountTransactions = [...(wallet.accountTransactions ?? [])];
    const cardTransactions = [...(wallet.transactions ?? [])];
    const payments = [...(wallet.payments ?? [])];

    if (fromAccount) {
      accountTransactions.push({
        id: transferId,
        accountId: fromAccount.id,
        date,
        description: `Transfer to ${to}`,
        type: "Transfer",
        category: "Transfer",
        amount,
        status: "Posted",
        notes: `${transferKey} · Source account${notes ? ` · ${notes}` : ""}`,
      });
    }
    if (toAccount) {
      accountTransactions.push({
        id: transferId + 1,
        accountId: toAccount.id,
        date,
        description: `Transfer from ${from}`,
        type: "Transfer",
        category: "Transfer",
        amount,
        status: "Posted",
        notes: `${transferKey} · Destination account${notes ? ` · ${notes}` : ""}`,
      });
    }
    if (fromCard) {
      cardTransactions.push({
        id: transferId + 2,
        cardId: fromCard.id,
        type: "adjustment",
        description: `Transfer to ${to}`,
        category: "Transfer",
        amount,
        transactionDate: date,
        postedDate: date,
        status: "posted",
        notes: `${transferKey} · Balance transfer / cash advance${notes ? ` · ${notes}` : ""}`,
        expenseCounted: false,
      });
    }
    if (toCard) {
      cardTransactions.push({
        id: transferId + 3,
        cardId: toCard.id,
        type: "payment",
        description: `Transfer from ${from}`,
        category: "Transfer",
        amount,
        transactionDate: date,
        postedDate: date,
        status: "posted",
        notes: `${transferKey} · Card balance payment${notes ? ` · ${notes}` : ""}`,
        expenseCounted: false,
      });
      payments.push({
        id: transferId + 4,
        cardId: toCard.id,
        account: from,
        date,
        amount,
        option: "Transfer",
        status: "Posted",
        notes: `${transferKey} · Transfer payment${notes ? ` · ${notes}` : ""}`,
        allocations: [{ cycle: "current-cycle", amount, date }],
      });
    }

    saveWallet({
      ...wallet,
      accounts: (wallet.accounts ?? []).map((account) => {
        if (fromAccount?.id === account.id) return { ...account, balance: Number(account.balance || 0) - amount };
        if (toAccount?.id === account.id) return { ...account, balance: Number(account.balance || 0) + amount };
        return account;
      }),
      accountTransactions,
      transactions: cardTransactions,
      payments,
    });
    setSaved(`${from} → ${to}`);
  };

  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal transfer-modal" onMouseDown={e => e.stopPropagation()} aria-modal="true" role="dialog">
    <div className="modal-head"><div><h2>Transfer money</h2><p>Move money between bank accounts and credit cards without counting it as income or expense.</p></div><button aria-label="Close" className="icon-button" onClick={onClose}><X/></button></div>
    {saved ? <div className="success"><span><Check/></span><h3>Transfer posted</h3><p>{saved} was recorded in the related account histories.</p><button className="primary" onClick={onClose}>Done</button></div> : <form onSubmit={postTransfer}>
      <div className="form-grid"><label>From account<ConnectedAccountSelect name="from" required/></label><label>To account<ConnectedAccountSelect name="to" required/></label></div>
      <div className="form-grid"><label>Amount<input name="amount" required type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="₱ 0.00"/></label><label>Transfer date<input name="date" required type="date" defaultValue={new Date().toISOString().slice(0,10)}/></label></div>
      {accountNames.length < 2 && <p className="form-note">Add at least two bank or credit-card accounts before creating a transfer.</p>}
      <label>Notes<textarea name="notes" rows={2} placeholder="Optional transfer memo"/></label>
      <button className="primary submit" disabled={accountNames.length < 2} type="submit"><ArrowLeftRight/>Post transfer</button>
    </form>}
  </section></div>
}

function FeatureAddModal({kind,onClose,onSaved}:{kind:'Budget'|'Savings';onClose:()=>void;onSaved:(message:string)=>void}){const isBudget=kind==='Budget',setSavingsGoals=useFirestoreState<string[][]>('savingsGoals',[])[1];return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" role="dialog" aria-modal="true" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><h2>{isBudget?'Add budget category':'Add savings goal'}</h2><p>{isBudget?'Set a monthly spending limit for a category.':'Create a goal and contribution plan.'}</p></div><button aria-label="Close" className="icon-button" onClick={onClose}><X/></button></div><form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget),name=String(f.get('name')),target=Number(f.get('amount')||0),current=Number(f.get('current')||0),contribution=Number(f.get('contribution')||0),progress=String(Math.min(100,Math.round(current/Math.max(target,1)*100)));if(!isBudget)setSavingsGoals((currentGoals:string[][])=>[[name,progress,`₱${current.toLocaleString('en-PH',{maximumFractionDigits:2})}`,`₱${target.toLocaleString('en-PH',{maximumFractionDigits:2})}`,String(f.get('date')),`₱${contribution.toLocaleString('en-PH',{maximumFractionDigits:2})}`,'On schedule'],...currentGoals]);onSaved(`${name} ${isBudget?'budget':'savings goal'} added`);onClose()}}><label>{isBudget?'Category':'Goal name'}<input name="name" required autoFocus placeholder={isBudget?'e.g. Groceries':'e.g. Emergency fund'}/></label><div className="form-grid"><label>{isBudget?'Monthly limit':'Target amount'}<input name="amount" type="number" min="1" step="0.01" inputMode="decimal" required placeholder="₱ 0.00"/></label><label>{isBudget?'Month':'Target date'}<input name="date" type={isBudget?'month':'date'} required defaultValue={isBudget?'2026-07':'2026-12-31'}/></label></div>{!isBudget&&<div className="form-grid"><label>Current amount<input name="current" type="number" min="0" step="0.01" inputMode="decimal" defaultValue="0"/></label><label>Planned contribution<input name="contribution" type="number" min="0" step="0.01" inputMode="decimal" defaultValue="0"/></label></div>}<button className="primary submit" type="submit"><Plus/>{isBudget?'Add budget':'Add savings goal'}</button></form></section></div>}

function ProgressRow({ icon: Icon, label, value, percent, tone = 'green' }: { icon: IconType, label: string, value: string, percent: number, tone?: string }) {
  return <div className="progress-row"><span className={`round-icon ${tone}`}><Icon/></span><div className="progress-main"><div><b>{label}</b><span>{value}</span></div><div className="track"><i className={tone} style={{width: `${percent}%`}}/></div></div><em className={tone}>{percent}%</em><ChevronRight/></div>
}

const pageContent: Record<string, { description: string, columns: string[], rows: string[][] }> = {
  Calendar: { description: 'See every bill, deposit, payment, and savings transfer by date.', columns: ['Date', 'Item', 'Type', 'Amount', 'Status'], rows: [['Jul 21','Electricity','Bill','₱3,500','Due tomorrow'],['Jul 22','Internet','Bill','₱1,800','Auto-pay'],['Jul 24','BPI Rewards','Card payment','₱8,000','Scheduled'],['Jul 25','Rent','Bill','₱10,000','Upcoming'],['Jul 26','Salary','Income','₱20,000','Confirmed']] },
  Transactions: { description: 'Review income, expenses, payments, and transfers in one ledger.', columns: ['Date', 'Description', 'Category', 'Account', 'Amount'], rows: [['Jul 19','Marketplace','Groceries','BPI Savings','−₱1,250'],['Jul 18','Salary','Income','BPI Savings','+₱25,000'],['Jul 17','Grab','Transport','BPI Rewards','−₱480'],['Jul 15','Emergency fund','Savings','BPI Savings','−₱2,000']] },
  'Credit cards': { description: 'Monitor balances, due dates, and credit utilization.', columns: ['Card', 'Balance', 'Available', 'Due date', 'Utilization'], rows: [['BPI Rewards • 4821','₱31,000','₱69,000','Jul 24','31% — Moderate'],['Metrobank Titanium • 0934','₱18,000','₱82,000','Aug 3','18% — Good']] },
  Bills: { description: 'Manage recurring commitments and upcoming payments.', columns: ['Bill', 'Category', 'Due', 'Amount', 'Status'], rows: [['Electricity','Utilities','Jul 21','₱3,500','Due tomorrow'],['Internet','Utilities','Jul 22','₱1,800','Auto-pay'],['BPI Rewards','Credit card','Jul 24','₱8,000','Scheduled'],['Rent','Housing','Jul 25','₱10,000','Upcoming']] },
  Budget: { description: 'Keep monthly category spending aligned with your plan.', columns: ['Category', 'Planned', 'Spent', 'Remaining', 'Status'], rows: [['Groceries','₱12,000','₱8,200','₱3,800','Healthy'],['Transport','₱7,000','₱5,400','₱1,600','Monitor'],['Dining','₱5,000','₱4,150','₱850','Near limit'],['Utilities','₱8,500','₱5,300','₱3,200','Healthy']] },
  Savings: { description: 'Track progress and contributions across your savings goals.', columns: ['Goal', 'Current', 'Target', 'Next contribution', 'Progress'], rows: [['Emergency fund','₱68,000','₱100,000','₱2,000 on Jul 26','68%'],['Japan trip','₱42,000','₱100,000','₱3,000 on Aug 1','42%']] },
  Reports: { description: 'Understand monthly cash flow and financial performance.', columns: ['Metric', 'June 2026', 'July 2026', 'Change'], rows: [['Income','₱52,000','₱58,000','+11.5%'],['Expenses','₱29,780','₱31,420','+5.5%'],['Net cash flow','₱17,220','₱20,580','+19.5%'],['Savings rate','16%','18%','+2 pts']] },
  Settings: { description: 'Manage accounts, reminders, currency, and profile preferences.', columns: ['Setting', 'Current value', 'Updated', 'Status'], rows: [['Currency','Philippine peso (₱)','Jul 20','Active'],['Time zone','America / New York','Jul 20','Active'],['Weekly summary','Monday at 8:00 AM','Jul 18','Enabled'],['Shortfall alerts','7 days ahead','Jul 18','Enabled']] }
}

function FeaturePage({ page, onAdd, onInspect }: { page: string, onAdd: () => void, onInspect: (v: string) => void }) {
  const content = pageContent[page]
  if (!content) return null
  return <section className="feature-page">
    <div className="feature-toolbar"><div><h2>{page}</h2><p>{content.description}</p></div><button className="primary" onClick={page === 'Settings' ? () => onInspect('Settings are ready to edit') : onAdd}><Plus/>{page === 'Settings' ? 'Edit settings' : 'Add new'}</button></div>
    <article className="panel data-panel"><div className="table-head">{content.columns.map(column => <b key={column}>{column}</b>)}</div>{content.rows.map((row, index) => <button className="data-row" key={index} onClick={() => onInspect(`${row[0]} selected`)}>{row.map((cell, i) => <span key={i} data-label={content.columns[i]} className={cell.includes('+') || cell.includes('Good') || cell === 'On track' || cell === 'Healthy' ? 'positive' : cell.includes('−') || cell.includes('Due') || cell.includes('Near') ? 'negative' : ''}>{cell}</span>)}<ChevronRight/></button>)}</article>
    <div className="feature-note"><ShieldCheck/><div><b>Forecast included</b><p>Confirmed income is used by default in coverage calculations.</p></div></div>
  </section>
}

export default function App() {
  useCreditCardBillSync()
  useInstallmentCreditSync()
  useAutomaticBillPaymentSync()
  const { unread: unreadNotifications } = useNotificationSummary()
  const [selected, setSelected] = useState('Overview')
  const [modal, setModal] = useState<string | null>(null)
  const [range, setRange] = useState('7')
  const [notice, setNotice] = useState('')
  const [sidebarCollapsed,setSidebarCollapsed]=useState(()=>localStorage.getItem('mypersonalfinance.sidebar-collapsed')==='true')
  const [dashboardBills]=useFirestoreState<any[]>('bills',[])
  const [dashboardPlanning]=useFirestoreState<any[]>('planning',[])
  const [dashboardBudgets]=useFirestoreState<any[]>('budgets',[])
  const [dashboardGoals]=useFirestoreState<any[]>('savingsGoals',[])
  const [dashboardWallet]=useWalletSnapshot<any>({accounts:[],cards:[],accountTransactions:[],transactions:[],payments:[]})
  const greeting = selected === 'Overview' ? `Good morning, ${userName()}!` : selected === 'Settings' ? 'Settings' : selected
  const dashboardStatus=buildDashboardStatus(dashboardWallet,dashboardBills,dashboardPlanning,Number(range))
  const dashboardStatusMessage=dashboardStatus.safeToSpend<0?'Safe-to-spend is below zero after upcoming bills and planned expenses.':dashboardStatus.netCashFlow<0?'Expenses are higher than income for the selected dashboard range.':'Income, upcoming bills, and planned expenses are currently manageable.'
  const toggleSidebar=()=>setSidebarCollapsed(value=>{const next=!value;localStorage.setItem('mypersonalfinance.sidebar-collapsed',String(next));return next})
  const quickAdd=(item:string,page:string)=>{if(item==='Transaction'){setModal('transaction');return}if(item==='Budget'){setModal('Budget');return}if(item==='Savings Goal'){setModal('Savings');return}setSelected(page);setNotice(`${item}: use the Add button on this page to continue.`)}
  return <div className={`app-shell${sidebarCollapsed?' sidebar-collapsed':''}`}>
    <Sidebar selected={selected} onSelect={setSelected} collapsed={sidebarCollapsed} onToggle={toggleSidebar}/>
    <main>
      {(selected === 'Overview' || selected === 'Settings') && <header className={`app-header${selected==='Overview'?' dashboard-hero-header':''}`}>{selected==='Overview'?<section className="dashboard-welcome-hero insight-only-hero" aria-label="Dashboard financial status"><div className={`finance-insight-message financial-status-banner ${dashboardStatus.netCashFlow<0||dashboardStatus.safeToSpend<0?'warning':'healthy'}`}><div><small>Financial status</small><p>{dashboardStatusMessage}</p></div><dl><div><dt>Due within 7 days</dt><dd>{money(dashboardStatus.dueWithinSeven)}</dd></div><div><dt>Safe to spend</dt><dd>{money(dashboardStatus.safeToSpend)}</dd></div><div><dt>Net cash flow</dt><dd className={dashboardStatus.netCashFlow<0?'negative':'positive'}>{money(dashboardStatus.netCashFlow)}</dd></div></dl></div></section>:<div className="header-copy"><h1>{greeting}</h1><p>Manage profile preferences, app settings, categories, and sub-categories.</p></div>}<div className="header-actions">{selected === 'Overview'&&<label className="month dashboard-period"><CalendarDays/><select aria-label="Dashboard date range" value={range} onChange={event=>setRange(event.target.value)}><option value="1">Current month</option><option value="3">Last 3 months</option><option value="6">Last 6 months</option><option value="7">January–July</option><option value="12">Last 12 months</option></select></label>}<TopActionBar unreadCount={unreadNotifications} onAdd={quickAdd} onTransfer={()=>setModal('transfer')} onQuickPay={()=>{setSelected('Bills');setNotice('Select a bill to record its payment.')}} onSearch={()=>setModal('global-search')} onNotifications={()=>setSelected('Notifications')} onProfile={()=>setSelected('Settings')}/></div></header>}
      {selected!=='Overview'&&selected!=='Settings'&&<div className="module-top-action-bar"><TopActionBar unreadCount={unreadNotifications} onAdd={quickAdd} onTransfer={()=>setModal('transfer')} onQuickPay={()=>{setSelected('Bills');setNotice('Select a bill to record its payment.')}} onSearch={()=>setModal('global-search')} onNotifications={()=>setSelected('Notifications')} onProfile={()=>setSelected('Settings')}/></div>}

      {selected === 'Overview' ? <DashboardOverview onSelect={setSelected} onNotice={setNotice} rangeMonths={Number(range)}/> : selected === 'Settings' ? <CategorySettings onNotice={setNotice}/> : <FeaturePages page={selected} onAdd={() => setModal(selected === 'Transactions' ? 'transaction' : selected)} onNotice={setNotice}/>} 
      {/* Legacy overview markup retained below for component reference only. */}
      {false && <><section className="summary">
        <article className="balance"><span>Available balance</span><strong>₱42,680.00</strong><small><b>+₱8,240</b> this month</small></article>
        <article className="safe"><div><span>Safe to spend</span><strong>₱12,880</strong><small>After bills, planned expenses,<br/>and savings.</small></div><i><ShieldCheck/></i></article>
        <div className="quick-stats"><div><span className="stat-icon income"><TrendingDown/></span><p><span>Income</span><b>₱58,000</b></p></div><div><span className="stat-icon expense"><TrendingUp/></span><p><span>Expenses</span><b>₱31,420</b></p></div><div><span className="stat-icon savings"><CircleDollarSign/></span><p><span>Savings</span><b>₱86,500</b></p></div></div>
      </section>

      <section className="work-grid">
        <article className="panel cashflow"><div className="panel-title"><div><h2>This week</h2><span>Jul 20 – 26</span></div><div><span className="on-track"><i/>On track</span><button onClick={() => setRange(range === 'This week' ? 'Next week' : 'This week')}>{range}<ChevronDown/></button></div></div>
          <div className="flow-metrics"><div><span>Starting</span><b>₱30,000</b></div><div><span>Incoming</span><b className="green">₱20,000</b></div><div><span>Outgoing</span><b className="coral">₱29,800</b></div><div><span>Ending</span><b>₱20,200</b></div></div><CashFlowChart/>
        </article>
        <article className="panel upcoming"><div className="panel-title"><h2>Upcoming</h2><button className="link" onClick={() => setSelected('Calendar')}><CalendarDays/>View calendar</button></div>
          <div className="bill-list">{upcoming.map(({day, icon: Icon, name, amount, status, tone}) => <button className="bill-row" key={name} onClick={() => {setSelected('Bills');setNotice(`${name} selected`)}}><span className="date"><small>Jul</small>{day}</span><span className={`round-icon ${tone}`}><Icon/></span><b>{name}</b><strong>{amount}</strong><em className={tone}><i/>{status}</em><ChevronRight/></button>)}</div>
          <button className="see-all" onClick={() => setSelected('Bills')}>See all upcoming</button>
        </article>
      </section>

      <section className="lower-grid">
        <article className="panel mini"><div className="panel-title"><h2>Monthly budget</h2><button className="link" onClick={() => setSelected('Budget')}>View budget</button></div>{budgets.map(item => <ProgressRow key={item.label} {...item}/>)}<button className="outline" onClick={() => setSelected('Budget')}>See all categories</button></article>
        <article className="panel mini"><div className="panel-title"><h2>Savings goals</h2><button className="link" onClick={() => setSelected('Savings')}>View all</button></div><ProgressRow icon={ShieldCheck} label="Emergency fund" value="₱68,000 of ₱100,000" percent={68}/><ProgressRow icon={Plane} label="Japan trip" value="₱42,000 of ₱100,000" percent={42}/><button className="outline" onClick={() => setModal('Savings')}><Plus/>Add goal</button></article>
        <article className="panel mini cards"><div className="panel-title"><h2>Credit cards</h2><button className="link" onClick={() => setSelected('Credit cards')}>View all</button></div><ProgressRow icon={CreditCard} label="BPI Rewards" value="₱31,000 of ₱100,000" percent={31} tone="amber"/><ProgressRow icon={Landmark} label="Metrobank Titanium" value="₱18,000 of ₱100,000" percent={18}/><button className="outline" onClick={() => setSelected('Credit cards')}><Plus/>Add card</button></article>
      </section>
      <section className="forecast"><span><Check/></span><strong>Your balance stays positive</strong><p>for the next 30 days.</p><button className="outline" onClick={() => setSelected('Forecast')}><TrendingUp/>View forecast</button></section></>}
    </main>
    {modal==='transaction' && <AddTransaction onClose={() => setModal(null)}/>} 
    {modal==='transfer' && <TransferMoney onClose={() => setModal(null)}/>} 
    {(modal==='Budget'||modal==='Savings') && <FeatureAddModal kind={modal} onClose={()=>setModal(null)} onSaved={setNotice}/>} 
    {modal==='global-search'&&<div className="modal-backdrop" onMouseDown={()=>setModal(null)}><section className="modal global-search-modal" role="dialog" aria-modal="true" aria-label="Global search" onMouseDown={event=>event.stopPropagation()}><div className="modal-head"><div><h2>Search MyPersonalFinance</h2><p>Find transactions, accounts, bills, budgets, and other records.</p></div><button className="icon-button" aria-label="Close" onClick={()=>setModal(null)}><X/></button></div><div className="global-search-body"><label className="global-search-field"><Search/><input autoFocus aria-label="Search all financial records" placeholder="Search transactions, accounts, bills…"/></label><div className="global-search-shortcuts">{['Transactions','Credit cards','Bills','Budget','Savings'].map(page=><button key={page} onClick={()=>{setSelected(page);setModal(null)}}>{page}<ChevronRight/></button>)}</div></div></section></div>}
    {notice && <button className="toast" onClick={() => setNotice('')}><Check/>{notice}<X/></button>}
  </div>
}
