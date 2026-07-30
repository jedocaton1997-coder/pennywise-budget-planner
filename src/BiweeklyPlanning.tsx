import { FormEvent, useEffect, useMemo, useState } from 'react'
import type React from 'react'
import { ArrowDown, ArrowUp, CalendarDays, Check, ChevronLeft, ChevronRight, Copy, Download, Eye, Filter, MoreHorizontal, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { BankLogo } from './components/BankLogo'
import { CategoryFields } from './components/CategoryFields'
import { CategoryIcon } from './components/CategoryIcon'
import { ConnectedAccountSelect } from './components/ConnectedAccountSelect'
import { useFirestoreState } from './hooks/useFirestoreState'
import { useWalletSnapshot } from './hooks/useWalletSnapshot'
import { processBillPayment, type BillPaymentRecord, type WalletForBillPayment } from './utils/billPaymentProcessor'
import { billUsesIncludedCard, filterIncludedCardTransactions } from './utils/netBalanceFilters'

type PlanType='Income'|'Expense'
type PlanStatus='Expected'|'Confirmed'|'Actual'
type PlanItem={id:number;type:PlanType;name:string;category:string;amount:number;date:string;status:PlanStatus;account:string;actualAmount?:number;actualDate?:string;frequency?:string;archived?:boolean}
type Bill={id:number;name:string;category:string;amount:number;dueDate:string;frequency:string;account:string;status:string;autopay?:boolean;sourceKey?:string;statementDate?:string;plannedPayment?:number;paidDate?:string;lastPaymentDate?:string;lastPaymentAmount?:number;lastPaymentMethod?:string;paymentHistory?:BillPaymentRecord[]}
type IncomeRecord={id:number;source:string;type:string;amount:number;expectedDate:string;receivedDate?:string;frequency:string;account:string;status:string;confidence?:'Confirmed'|'Estimated'}
type CardLogoSource={id:number|string;name?:string;bank?:string;bankId?:string|null;customLogo?:string;active?:boolean;includeInNetBalance?:boolean}
type BudgetPeriod='weekly'|'monthly'
type PlanningMode=BudgetPeriod|'semi'
type PlanningPeriodView='weekly'|'semiMonthly'|'monthly'
type BudgetItem={id:number;period:BudgetPeriod;category:string;subcategory?:string;amount:number;dueDate:string;recurrence:string;account:string;notes:string;appliesTo:string;relationship?:string;rollover?:string;finalized?:boolean;finalizedAt?:string;snapshot?:{budget:number;actual:number;difference:number;status:string};archived?:boolean}
type WalletTransaction={id:number|string;accountId?:number|string;cardId?:number|string;date?:string;transactionDate?:string;postedDate?:string;description?:string;type:string;category?:string;amount:number;status?:string;notes?:string}
type BudgetWallet={accounts?:Array<{id:number|string;name:string}>;cards?:Array<CardLogoSource>;accountTransactions?:WalletTransaction[];transactions?:WalletTransaction[]}
type PlanningRow=PlanItem&{source:'manual'|'bill'|'income';sourceId:string;readOnly:boolean;cardLogo?:CardLogoSource|null}
type AddState={type:PlanType;status:PlanStatus}
type Props={onNotice:(message:string)=>void;initialBudgetView?:PlanningMode;initialPlanningView?:PlanningPeriodView}

const peso=(value:number)=>`₱${value.toLocaleString(undefined,{maximumFractionDigits:2})}`
const exactPeso=(value:number)=>`${value<0?'-':''}₱${Math.abs(value).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const longDate=(value:string)=>new Date(`${value}T12:00`).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})
const compactDate=(value:string)=>{const date=parseLocal(value),month=date.toLocaleDateString('en-US',{month:'short'}),day=date.getDate(),weekday=date.toLocaleDateString('en-US',{weekday:'short'});return `${month}. ${day} (${weekday})`}
const todayIso=()=>iso(new Date())
const iso=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
const parseLocal=(value:string)=>new Date(`${value}T12:00:00`)
const addMonths=(value:string,months:number)=>{const date=parseLocal(value),day=date.getDate();date.setMonth(date.getMonth()+months,1);date.setDate(Math.min(day,new Date(date.getFullYear(),date.getMonth()+1,0).getDate()));return iso(date)}
const addDays=(value:string,days:number)=>{const date=parseLocal(value);date.setDate(date.getDate()+days);return iso(date)}
const cleanStatementName=(value:string)=>value.replace(/\s+statement$/i,'')
const periodLabel=(start:string,end:string)=>`${parseLocal(start).toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${parseLocal(end).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`
const fullPeriodLabel=(start:string,end:string)=>`${parseLocal(start).toLocaleDateString('en-US',{month:'long',day:'numeric'})}–${parseLocal(end).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}`
type FrequencyStep={days:number}|{months:number}
const frequencyStep=(frequency:string):FrequencyStep|null=>frequency==='Weekly'?{days:7}:frequency==='Every two weeks'?{days:14}:frequency==='Monthly'?{months:1}:frequency==='Every two months'?{months:2}:frequency==='Quarterly'?{months:3}:frequency==='Semiannually'?{months:6}:frequency==='Annually'?{months:12}:null
const advanceDate=(date:string,frequency:string)=>{const step=frequencyStep(frequency);if(!step)return '';return 'days' in step?addDays(date,step.days):addMonths(date,step.months)}
const statusIsSkipped=(status:string)=>['Skipped','Cancelled'].includes(status)
const rowExpected=(item:PlanningRow)=>item.status==='Actual'?0:Number(item.amount||0)
const rowActual=(item:PlanningRow)=>Number(item.actualAmount??(item.status==='Actual'?item.amount:0)??0)
const normalizeCategory=(value='')=>value.toLowerCase().replace(/\s*\/\s*/g,' / ').trim()
const categoryMatches=(transactionCategory='',budget:BudgetItem)=>{const category=normalizeCategory(transactionCategory),base=normalizeCategory(budget.category),sub=normalizeCategory(budget.subcategory||'');return Boolean(category&&(category===base||(sub&&category===`${base} / ${sub}`)||(sub&&category===sub)||category.startsWith(`${base} / `)))}
const daysLeft=(value:string)=>{const due=parseLocal(value),today=parseLocal(todayIso()),days=Math.round((due.getTime()-today.getTime())/86400000);if(days<0)return`${Math.abs(days)} days overdue`;if(days===0)return'Due today';if(days===1)return'Due tomorrow';return`${days} days left`}
const weekStart=(anchor=new Date())=>{const date=new Date(anchor.getFullYear(),anchor.getMonth(),anchor.getDate(),12),day=date.getDay();date.setDate(date.getDate()-day);return iso(date)}
const weekEnd=(start:string)=>addDays(start,6)
const monthStart=(anchor=new Date())=>iso(new Date(anchor.getFullYear(),anchor.getMonth(),1,12))
const monthEnd=(start:string)=>{const date=parseLocal(start);return iso(new Date(date.getFullYear(),date.getMonth()+1,0,12))}
const monthName=(start:string)=>parseLocal(start).toLocaleDateString('en-US',{month:'long',year:'numeric'})
const inRange=(date:string,start:string,end:string)=>Boolean(date&&date>=start&&date<=end)
const planningWindowForView=(view:PlanningPeriodView,active:{start:string;end:string;label:string})=>{if(view==='weekly'){const start=weekStart(parseLocal(active.start));return{start,end:weekEnd(start),label:periodLabel(start,weekEnd(start))}}if(view==='monthly'){const start=monthStart(parseLocal(active.start));return{start,end:monthEnd(start),label:monthName(start)}}return active}
const transactionSignedAmount=(transaction:WalletTransaction)=>{const type=String(transaction.type).toLowerCase();const amount=Number(transaction.amount||0);if(['refund','credit','reversal','reimbursement'].includes(type))return -amount;if(['transfer','payment','adjustment'].includes(type))return 0;return amount}
function cardForBill(bill:Bill,cards:CardLogoSource[]=[]){
  const sourceCardId=bill.sourceKey?.match(/^credit-card-statement:([^:]+):/)?.[1]
  if(sourceCardId){
    const card=cards.find(item=>String(item.id)===sourceCardId)
    if(card)return card
  }
  const billName=cleanStatementName(bill.name).trim().toLowerCase()
  return cards.find(item=>item.active!==false&&String(item.name||'').trim().toLowerCase()===billName)
    ?? cards.find(item=>item.active!==false&&billName.includes(String(item.name||'').trim().toLowerCase()))
    ?? null
}

function hasWalletPaymentRecord(record:BillPaymentRecord,wallet:BudgetWallet){
  const id=String(record.transactionId??''),key=record.id
  return Boolean(
    (wallet.accountTransactions??[]).some(transaction=>
      (id&&String(transaction.id)===id)||
      String(transaction.notes||'').includes(key)
    )||
    (wallet.transactions??[]).some(transaction=>
      (id&&String(transaction.id)===id)||
      String(transaction.notes||'').includes(key)
    )
  )
}

function buildPeriods(anchor=new Date()){
  const start=new Date(anchor.getFullYear(),anchor.getMonth()-1,1,12)
  return Array.from({length:10},(_,index)=>{
    const monthOffset=Math.floor(index/2),firstHalf=index%2===0,date=new Date(start.getFullYear(),start.getMonth()+monthOffset,1,12)
    const year=date.getFullYear(),month=date.getMonth(),lastDay=new Date(year,month+1,0).getDate()
    const periodStart=new Date(year,month,firstHalf?1:16,12),periodEnd=new Date(year,month,firstHalf?15:lastDay,12)
    const startIso=iso(periodStart),endIso=iso(periodEnd)
    return{label:periodLabel(startIso,endIso),start:startIso,end:endIso}
  })
}

function nextSemiMonthlyPeriod(period:{start:string;end:string;label:string}){
  const start=parseLocal(period.start),firstHalf=start.getDate()===1
  if(firstHalf){
    const year=start.getFullYear(),month=start.getMonth(),lastDay=new Date(year,month+1,0).getDate()
    const nextStart=iso(new Date(year,month,16,12)),nextEnd=iso(new Date(year,month,lastDay,12))
    return{label:periodLabel(nextStart,nextEnd),start:nextStart,end:nextEnd}
  }
  const nextMonth=new Date(start.getFullYear(),start.getMonth()+1,1,12)
  const nextStart=iso(nextMonth),nextEnd=iso(new Date(nextMonth.getFullYear(),nextMonth.getMonth(),15,12))
  return{label:periodLabel(nextStart,nextEnd),start:nextStart,end:nextEnd}
}

function occurrences(baseDate:string,frequency:string,rangeStart:string,rangeEnd:string){
  const result:string[]=[]
  if(!baseDate||!frequency)return result
  if(!frequencyStep(frequency)){
    if(baseDate>=rangeStart&&baseDate<=rangeEnd)result.push(baseDate)
    return result
  }
  let current=baseDate,guard=0
  while(current<rangeStart&&guard<160){const next=advanceDate(current,frequency);if(!next||next===current)break;current=next;guard++}
  while(current<=rangeEnd&&guard<260){if(current>=rangeStart)result.push(current);const next=advanceDate(current,frequency);if(!next||next===current)break;current=next;guard++}
  return result
}

function expandManualRows(items:PlanItem[],rangeStart:string,rangeEnd:string):PlanningRow[]{
  return items.filter(item=>!item.archived).flatMap(item=>{
    const dates=item.frequency&&item.frequency!=='One-time'&&item.status!=='Actual'
      ? occurrences(item.date,item.frequency,rangeStart,rangeEnd)
      : item.date>=rangeStart&&item.date<=rangeEnd?[item.date]:[]
    return dates.map(date=>({...item,date,source:'manual' as const,sourceId:`manual-${item.id}-${date}`,readOnly:false}))
  })
}

function automaticRows({bills,incomes,cards,wallet,rangeStart,rangeEnd}:{bills:Bill[];incomes:IncomeRecord[];cards?:CardLogoSource[];wallet:BudgetWallet;rangeStart:string;rangeEnd:string}):PlanningRow[]{
  const rows:PlanningRow[]=[]
  bills.filter(bill=>billUsesIncludedCard(bill,cards??[])&&!statusIsSkipped(bill.status)).forEach(bill=>{
    const type:PlanType=bill.category==='Receivable collection'?'Income':'Expense'
    const cardLogo=cardForBill(bill,cards??[])
    const paidByDueDate=new Map<string,BillPaymentRecord>()
    ;(bill.paymentHistory??[]).filter(record=>hasWalletPaymentRecord(record,wallet)).forEach(record=>{
      const dueDate=record.relatedBillDetails?.dueDate||record.paymentDate
      if(dueDate)paidByDueDate.set(dueDate,record)
    })
    if(!(bill.paymentHistory?.length)&&String(bill.status).toLowerCase()==='paid'){
      const dueDate=bill.paidDate||bill.dueDate
      paidByDueDate.set(dueDate,{id:`bill-paid:${bill.id}:${dueDate}`,billId:bill.id,billName:bill.name,amount:Number(bill.lastPaymentAmount||bill.plannedPayment||bill.amount||0),paymentDate:bill.lastPaymentDate||bill.paidDate||dueDate,paymentMethod:bill.lastPaymentMethod||bill.account||'',accountType:'other',relatedBillDetails:{dueDate,category:bill.category,frequency:bill.frequency}})
    }
    paidByDueDate.forEach((record,date)=>{
      if(!inRange(date,rangeStart,rangeEnd))return
      rows.push({
        id:-Math.abs(Number(bill.id)||0),
        type,
        name:cleanStatementName(bill.name),
        category:record.relatedBillDetails?.category||bill.category||'Bills & Payments',
        amount:Number(bill.plannedPayment||bill.amount||record.amount||0),
        actualAmount:Number(record.amount||0),
        actualDate:record.paymentDate,
        date,
        status:'Expected',
        account:record.paymentMethod||bill.account||'',
        source:'bill',
        sourceId:`bill-${bill.id}-${date}`,
        readOnly:true,
        cardLogo,
      })
    })
    occurrences(bill.dueDate,bill.frequency,rangeStart,rangeEnd).forEach(date=>{
      const paid=paidByDueDate.get(date)
      rows.push({
        id:-Math.abs(Number(bill.id)||0),
        type,
        name:cleanStatementName(bill.name),
        category:bill.category||'Bills & Payments',
        amount:Number(bill.plannedPayment||bill.amount||paid?.amount||0),
        actualAmount:paid?Number(paid.amount||0):0,
        actualDate:paid?.paymentDate,
        date,
        status:'Expected',
        account:paid?.paymentMethod||bill.account||'',
        source:'bill',
        sourceId:`bill-${bill.id}-${date}`,
        readOnly:true,
        cardLogo,
      })
    })
  })
  incomes.filter(item=>!statusIsSkipped(item.status)&&item.confidence!=='Estimated').forEach(item=>{
    const baseDate=item.expectedDate
    occurrences(baseDate,item.frequency,rangeStart,rangeEnd).forEach(date=>rows.push({
      id:-Math.abs(Number(item.id)||0)-1_000_000,
      type:'Income',
      name:item.source,
      category:item.type||'Income',
      amount:Number(item.amount||0),
      actualAmount:/received/i.test(item.status)&&(!item.receivedDate||item.receivedDate===date)?Number(item.amount||0):0,
      actualDate:item.receivedDate,
      date,
      status:'Expected',
      account:item.account||'',
      source:'income',
      sourceId:`income-${item.id}-${date}`,
      readOnly:true,
    }))
  })
  const bySource=new Map<string,PlanningRow>()
  rows.forEach(row=>{
    if(row.amount<=0)return
    const existing=bySource.get(row.sourceId)
    if(!existing||rowActual(row)>rowActual(existing))bySource.set(row.sourceId,row)
  })
  return [...bySource.values()]
}

export default function BiweeklyPlanning({onNotice,initialPlanningView='semiMonthly'}:Props){
  const [items,setItems]=useFirestoreState<PlanItem[]>('planning',[])
  const [bills,setBills]=useFirestoreState<Bill[]>('bills',[])
  const [incomes]=useFirestoreState<IncomeRecord[]>('income',[])
  const [budgetItems,setBudgetItems]=useFirestoreState<BudgetItem[]>('planningBudgets',[])
  const [wallet,saveWallet]=useWalletSnapshot<WalletForBillPayment>({})
  const [period,setPeriod]=useState(()=>{const current=todayIso(),periods=buildPeriods();return Math.max(0,periods.findIndex(period=>current>=period.start&&current<=period.end))})
  const [planningView,setPlanningView]=useState<PlanningPeriodView>(initialPlanningView)
  const [weekAnchor,setWeekAnchor]=useState(()=>weekStart())
  const [monthAnchor,setMonthAnchor]=useState(()=>monthStart())
  const [adding,setAdding]=useState<AddState|null>(null)
  const [editing,setEditing]=useState<PlanItem|null>(null)
  const [selectedExpenseId,setSelectedExpenseId]=useState('')
  useEffect(()=>{setPlanningView(initialPlanningView);setSelectedExpenseId('')},[initialPlanningView])
  const periods=useMemo(()=>buildPeriods(),[])
  const active=periods[period]
  const incomeWindow=useMemo(()=>planningView==='weekly'?{start:weekAnchor,end:weekEnd(weekAnchor),label:periodLabel(weekAnchor,weekEnd(weekAnchor))}:planningView==='monthly'?{start:monthAnchor,end:monthEnd(monthAnchor),label:monthName(monthAnchor)}:planningWindowForView(planningView,active),[planningView,active,weekAnchor,monthAnchor])
  const expenseWindow=useMemo(()=>planningView==='semiMonthly'?nextSemiMonthlyPeriod(active):incomeWindow,[planningView,active,incomeWindow])
  const planningLabel=planningView==='weekly'?'Weekly':planningView==='monthly'?'Monthly':'Semi-monthly'
  const planningRangeStart=[periods[0].start,incomeWindow.start,expenseWindow.start].sort()[0],planningRangeEnd=[periods[periods.length-1].end,incomeWindow.end,expenseWindow.end].sort().at(-1)??expenseWindow.end
  const manualRows=useMemo<PlanningRow[]>(()=>expandManualRows(items,planningRangeStart,planningRangeEnd),[items,planningRangeStart,planningRangeEnd])
  const autoRows=useMemo(()=>automaticRows({bills,incomes,cards:wallet.cards,wallet,rangeStart:planningRangeStart,rangeEnd:planningRangeEnd}),[bills,incomes,wallet,planningRangeStart,planningRangeEnd])
  const rows=useMemo(()=>[...manualRows,...autoRows].sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name)),[manualRows,autoRows])
  const income=useMemo(()=>rows.filter(item=>item.type==='Income'&&item.date>=incomeWindow.start&&item.date<=incomeWindow.end),[rows,incomeWindow.start,incomeWindow.end])
  const expenses=useMemo(()=>rows.filter(item=>item.type==='Expense'&&item.date>=expenseWindow.start&&item.date<=expenseWindow.end),[rows,expenseWindow.start,expenseWindow.end])
  const selectedExpense=expenses.find(item=>item.sourceId===selectedExpenseId)
  const expectedIncome=income.reduce((sum,i)=>sum+rowExpected(i),0),expectedExpenses=expenses.reduce((sum,i)=>sum+rowExpected(i),0)
  const actualIncome=income.reduce((sum,i)=>sum+rowActual(i),0),actualExpenses=expenses.reduce((sum,i)=>sum+rowActual(i),0)
  const variance=(actualIncome-actualExpenses)-(expectedIncome-expectedExpenses)
  const goPrevious=()=>{if(planningView==='weekly')setWeekAnchor(value=>addDays(value,-7));else if(planningView==='monthly')setMonthAnchor(value=>addMonths(value,-1));else setPeriod(value=>Math.max(0,value-1))}
  const goNext=()=>{if(planningView==='weekly')setWeekAnchor(value=>addDays(value,7));else if(planningView==='monthly')setMonthAnchor(value=>addMonths(value,1));else setPeriod(value=>Math.min(periods.length-1,value+1))}
  const nextDisabled=planningView==='semiMonthly'&&period===periods.length-1
  const previousDisabled=planningView==='semiMonthly'&&period===0
  const add=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!adding)return;const form=new FormData(event.currentTarget),item:PlanItem={id:Date.now(),type:adding.type,name:String(form.get('name')),category:String(form.get('category')),amount:Number(form.get('amount')),actualAmount:Number(form.get('actualAmount')||0),frequency:adding.type==='Income'?String(form.get('frequency')||'One-time'):'One-time',date:String(form.get('date')),status:String(form.get('status')) as PlanStatus,account:String(form.get('account'))};setItems(current=>[...current,item]);setAdding(null);onNotice(`${item.name} added to the plan`)}
  const openAdd=(type:PlanType,status:PlanStatus)=>setAdding({type,status})

  return <section className="feature-page biweekly-planner">
    <div className="fp-head"><div><h2>Planning</h2><p>Expected income and expenses with weekly, semi-monthly, and monthly views.</p></div><div className="biweekly-actions planning-action-pair"><button className="outline" onClick={()=>openAdd('Income','Expected')}><Plus/>Plan income</button><button className="outline" onClick={()=>openAdd('Expense','Expected')}><Plus/>Plan expense</button></div></div>
    <div className="planning-section-label"><span>Planning</span><b>{planningLabel} Plan</b></div>
    <div className="planning-period-filter" aria-label="Planning period filter">
      {(['weekly','semiMonthly','monthly'] as PlanningPeriodView[]).map(option=><button key={option} className={planningView===option?'active':''} onClick={()=>{setPlanningView(option);setSelectedExpenseId('')}}>{option==='weekly'?'Weekly':option==='semiMonthly'?'Semi-monthly':'Monthly'}</button>)}
    </div>
    <div className="biweekly-period"><button aria-label="Previous period" onClick={goPrevious} disabled={previousDisabled}><ChevronLeft/></button><span><CalendarDays/><b>{incomeWindow.label}</b></span><button aria-label="Next period" onClick={goNext} disabled={nextDisabled}><ChevronRight/></button></div>
    <div className="biweekly-summary comparison-summary">
      <div className="income"><span>Expected income</span><b>{peso(expectedIncome)}</b><small>{income.filter(i=>rowExpected(i)>0).length} expected deposits</small></div>
      <div className="expense"><span>Expected expenses</span><b>{peso(expectedExpenses)}</b><small>{expenses.filter(i=>rowExpected(i)>0).length} expected payments</small></div>
      <div className="income"><span>Actual income</span><b>{peso(actualIncome)}</b><small>{income.filter(i=>rowActual(i)>0).length} received records</small></div>
      <div className="expense"><span>Actual expenses</span><b>{peso(actualExpenses)}</b><small>{expenses.filter(i=>rowActual(i)>0).length} paid/spent records</small></div>
      <div className={expectedIncome-expectedExpenses>=0?'available':'shortfall'}><span>Expected remaining</span><b>{peso(expectedIncome-expectedExpenses)}</b><small>Before actuals</small></div>
      <div className={variance>=0?'available':'shortfall'}><span>Actual vs expected</span><b>{variance>=0?'+':''}{peso(variance)}</b><small>Net variance</small></div>
    </div>
    <div className="biweekly-columns"><PlanList title="Expected Income" icon={<ArrowDown/>} tone="income" items={income} onEdit={setEditing} onAdd={()=>openAdd('Income','Expected')}/><PlanList title="Expected Expenses" icon={<ArrowUp/>} tone="expense" items={expenses} onEdit={setEditing} onAdd={()=>openAdd('Expense','Expected')} onSelect={setSelectedExpenseId} selectedId={selectedExpense?.sourceId}/></div>
    {selectedExpense&&<PlanningExpensePaymentModal item={selectedExpense} onClose={()=>setSelectedExpenseId('')} onEdit={()=>{if(!selectedExpense.readOnly){setEditing(selectedExpense);setSelectedExpenseId('')}}} onConfirm={({account,date})=>{if(selectedExpense.source==='bill'){const billId=Number(selectedExpense.sourceId.split('-')[1]),bill=bills.find(item=>item.id===billId);if(!bill){onNotice('The connected bill was not found.');return}const result=processBillPayment({bill,wallet,paymentMethod:account,paymentDate:date});onNotice(result.message);if(!result.processed&&!result.duplicate)return;if(result.processed)saveWallet(result.wallet);setBills(current=>current.map(item=>item.id===billId?result.bill as Bill:item));}else{setItems(current=>current.map(item=>item.id===selectedExpense.id?{...item,status:'Actual',actualAmount:selectedExpense.amount,actualDate:date,account}:item));onNotice(`${selectedExpense.name} marked as paid from ${account}`)}setSelectedExpenseId('')}}/>}
    {adding&&<div className="modal-backdrop" onMouseDown={()=>setAdding(null)}><section className="modal" role="dialog" aria-modal="true" onMouseDown={event=>event.stopPropagation()}><div className="modal-head"><div><h2>Plan {adding.type.toLowerCase()}</h2><p>Add an expected item. Actual amount can be filled in later once received or paid.</p></div><button className="icon-button" aria-label="Close" onClick={()=>setAdding(null)}><X/></button></div><form onSubmit={add}><label>Description<input name="name" required autoFocus placeholder={adding.type==='Income'?'e.g. Salary':'e.g. Electricity'}/></label><CategoryFields defaultValue={adding.type==='Income'?'Income':'Other'}/><div className="form-grid"><label>Expected amount<input name="amount" type="number" min="0.01" step="0.01" required/></label><label>Actual amount<input name="actualAmount" type="number" min="0" step="0.01" placeholder="Optional"/></label></div><div className="form-grid"><label>Expected date<input name="date" type="date" min={adding.type==='Income'?incomeWindow.start:expenseWindow.start} max={adding.type==='Income'?incomeWindow.end:expenseWindow.end} defaultValue={adding.type==='Income'?incomeWindow.start:expenseWindow.start} required/></label>{adding.type==='Income'?<label>Recurring<select name="frequency" defaultValue="One-time"><option>One-time</option><option>Weekly</option><option>Every two weeks</option><option>Monthly</option><option>Every two months</option><option>Quarterly</option><option>Semiannually</option><option>Annually</option></select></label>:<label>Status<select name="status" defaultValue={adding.status}><option>Expected</option><option>Confirmed</option></select></label>}</div><div className="form-grid">{adding.type==='Income'&&<label>Status<select name="status" defaultValue={adding.status}><option>Expected</option><option>Confirmed</option></select></label>}<label>{adding.type==='Income'?'Receiving account':'Payment account'}<ConnectedAccountSelect required/></label></div><button className="primary submit"><Plus/>Add to plan</button></form></section></div>}
    {editing&&<div className="modal-backdrop" onMouseDown={()=>setEditing(null)}><section className="modal" role="dialog" aria-modal="true" onMouseDown={event=>event.stopPropagation()}><div className="modal-head"><div><h2>Edit planned {editing.type.toLowerCase()}</h2><p>Update the expected amount, actual amount, or remove it from the plan.</p></div><button className="icon-button" aria-label="Close" onClick={()=>setEditing(null)}><X/></button></div><form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);const updated={...editing,name:String(form.get('name')),category:String(form.get('category')),amount:Number(form.get('amount')),actualAmount:Number(form.get('actualAmount')||0),frequency:editing.type==='Income'?String(form.get('frequency')||'One-time'):'One-time',date:String(form.get('date')),status:String(form.get('status')) as PlanStatus,account:String(form.get('account'))};setItems(current=>current.map(item=>item.id===updated.id?updated:item));onNotice(`${updated.name} updated`);setEditing(null)}}><label>Description<input name="name" required defaultValue={editing.name}/></label><CategoryFields defaultValue={editing.category}/><div className="form-grid"><label>Expected amount<input name="amount" type="number" min="0.01" step="0.01" required defaultValue={editing.amount}/></label><label>Actual amount<input name="actualAmount" type="number" min="0" step="0.01" defaultValue={editing.actualAmount??(editing.status==='Actual'?editing.amount:0)}/></label></div><div className="form-grid"><label>Date<input name="date" type="date" required defaultValue={editing.date}/></label>{editing.type==='Income'?<label>Recurring<select name="frequency" defaultValue={editing.frequency||'One-time'}><option>One-time</option><option>Weekly</option><option>Every two weeks</option><option>Monthly</option><option>Every two months</option><option>Quarterly</option><option>Semiannually</option><option>Annually</option></select></label>:<label>Status<select name="status" defaultValue={editing.status}><option>Expected</option><option>Confirmed</option><option>Actual</option></select></label>}</div><div className="form-grid">{editing.type==='Income'&&<label>Status<select name="status" defaultValue={editing.status}><option>Expected</option><option>Confirmed</option><option>Actual</option></select></label>}<label>{editing.type==='Income'?'Receiving account':'Payment account'}<ConnectedAccountSelect required defaultValue={editing.account}/></label></div><div className="record-edit-actions"><button className="primary" type="submit">Save changes</button><button className="danger-outline" type="button" onClick={()=>{setItems(current=>current.filter(item=>item.id!==editing.id));onNotice(`${editing.name} deleted`);setEditing(null)}}><Trash2/>Delete item</button></div></form></section></div>}
  </section>
}

function BudgetPlanningViews({initialView,items,setItems,wallet,planRows,onNotice}:{initialView:BudgetPeriod;items:BudgetItem[];setItems:React.Dispatch<React.SetStateAction<BudgetItem[]>>;wallet:BudgetWallet;planRows:PlanningRow[];onNotice:(message:string)=>void}){
  const [view,setView]=useState<BudgetPeriod>(initialView),[week,setWeek]=useState(()=>weekStart()),[month,setMonth]=useState(()=>monthStart()),[editing,setEditing]=useState<BudgetItem|null>(null),[related,setRelated]=useState<{budget:BudgetItem;transactions:WalletTransaction[]}|null>(null)
  useEffect(()=>setView(initialView),[initialView])
  const [filters,setFilters]=useState({category:'All',subcategory:'All',account:'All',status:'All',dueDate:'',overBudget:false,recurring:false,sort:'Due Date'})
  const periodStart=view==='weekly'?week:month,periodEnd=view==='weekly'?weekEnd(week):monthEnd(month),periodLabelText=view==='weekly'?fullPeriodLabel(periodStart,periodEnd):monthName(month)
  const allTransactions=budgetTransactions(wallet,periodStart,periodEnd)
  const incomeRows=planRows.filter(item=>item.type==='Income'&&inRange(item.date,periodStart,periodEnd))
  const actualIncomeFromTransactions=allTransactions.filter(item=>item.type==='Income').reduce((sum,item)=>sum+Number(item.amount||0),0)
  const categories=Array.from(new Set(items.filter(item=>!item.archived).map(item=>item.category).filter(Boolean))).sort()
  const subcategories=Array.from(new Set(items.filter(item=>!item.archived).map(item=>item.subcategory||'').filter(Boolean))).sort()
  const accounts=[...(wallet.accounts??[]).map(item=>item.name),...(wallet.cards??[]).filter(card=>card.active!==false).map(item=>item.name||String(item.id))].filter(Boolean)
  const budgetRows=items.filter(item=>!item.archived&&item.period===view&&budgetAppliesToPeriod(item,periodStart,periodEnd)).map(item=>budgetRowMetrics(item,allTransactions))
  const filteredRows=budgetRows.filter(row=>(filters.category==='All'||row.item.category===filters.category)&&(filters.subcategory==='All'||(row.item.subcategory||'')===filters.subcategory)&&(filters.account==='All'||row.item.account===filters.account)&&(filters.status==='All'||row.status===filters.status)&&(!filters.dueDate||row.item.dueDate===filters.dueDate)&&(!filters.overBudget||row.difference<0)&&(!filters.recurring||row.item.recurrence!=='One-time')).sort((a,b)=>sortBudgetRows(a,b,filters.sort))
  const expectedIncome=incomeRows.reduce((sum,item)=>sum+rowExpected(item),0),actualIncome=incomeRows.reduce((sum,item)=>sum+rowActual(item),0)+actualIncomeFromTransactions,totalBudget=filteredRows.reduce((sum,row)=>sum+row.budget,0),actualExpenses=filteredRows.reduce((sum,row)=>sum+row.actual,0),remaining=totalBudget-actualExpenses,difference=actualIncome-actualExpenses,savingsRate=actualIncome?`${(difference/actualIncome*100).toFixed(1)}%`:'Unavailable'
  const currentPeriodStart=view==='weekly'?weekStart():monthStart(),atCurrentOrFuture=periodStart>=currentPeriodStart
  const canCopyToNext=budgetRows.length>0,periodFinalized=filteredRows.length>0&&filteredRows.every(row=>row.item.finalized)
  const blankBudget=():BudgetItem=>({id:0,period:view,category:'Food',subcategory:'',amount:0,dueDate:periodStart,recurrence:'One-time',account:'',notes:'',appliesTo:view==='weekly'?'One specific week':'One specific month'})
  const saveBudget=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=new FormData(event.currentTarget),categoryValue=String(form.get('category')||'Other'),parts=categoryValue.split('/').map(part=>part.trim()).filter(Boolean),budget:BudgetItem={...(editing??blankBudget()),id:editing?.id||Date.now(),period:view,category:parts[0]||categoryValue,subcategory:parts[1]||'',amount:Number(form.get('amount')||0),dueDate:String(form.get('dueDate')),recurrence:String(form.get('recurrence')||'One-time'),account:String(form.get('account')||''),notes:String(form.get('notes')||''),appliesTo:String(form.get('appliesTo')||'One specific period'),relationship:String(form.get('relationship')||`Independent ${view==='weekly'?'Weekly':'Monthly'} Budget`),rollover:String(form.get('rollover')||'Do not carry over')};setItems(current=>editing?.id?current.map(item=>item.id===budget.id?budget:item):[...current,budget]);setEditing(null);onNotice(`${budget.category}${budget.subcategory?` / ${budget.subcategory}`:''} ${view} budget saved`)}
  const duplicatePrevious=()=>{const previousStart=view==='weekly'?addDays(periodStart,-7):addMonths(periodStart,-1),previousEnd=view==='weekly'?weekEnd(previousStart):monthEnd(previousStart),source=items.filter(item=>!item.archived&&item.period===view&&budgetAppliesToPeriod(item,previousStart,previousEnd));if(!source.length){onNotice(`No previous ${view} budgets to duplicate.`);return}setItems(current=>[...current,...source.map((item,index)=>({...item,id:Date.now()+index,dueDate:view==='weekly'?addDays(item.dueDate,7):addMonths(item.dueDate,1),finalized:false,finalizedAt:undefined,snapshot:undefined}))]);onNotice(`Previous ${view} budgets duplicated.`)}
  const copyNext=()=>{const source=items.filter(item=>!item.archived&&item.period===view&&budgetAppliesToPeriod(item,periodStart,periodEnd));if(!source.length){onNotice(`No ${view} budgets to copy.`);return}setItems(current=>[...current,...source.map((item,index)=>({...item,id:Date.now()+index,dueDate:view==='weekly'?addDays(item.dueDate,7):addMonths(item.dueDate,1),finalized:false,finalizedAt:undefined,snapshot:undefined}))]);onNotice(`${view==='weekly'?'Week':'Month'} copied to the next period.`)}
  const finalizePeriod=()=>{const snapshots=new Map(filteredRows.map(row=>[row.item.id,{budget:row.budget,actual:row.actual,difference:row.difference,status:row.status}]));setItems(current=>current.map(item=>snapshots.has(item.id)?{...item,finalized:true,finalizedAt:todayIso(),snapshot:snapshots.get(item.id)}:item));onNotice(`${periodLabelText} finalized. Future transaction changes will show as live adjustments.`)}
  const resetActualData=()=>{if(!window.confirm('Reset Actual Data? Actual amounts are calculated from transactions, so resetting means editing or removing the related transactions.'))return;onNotice('Actual amounts are calculated from transactions. Edit related transactions to reset actual data.')}
  const confirmFinalizePeriod=()=>{if(periodFinalized)return;if(!filteredRows.length){onNotice('Add a budget before finalizing this period.');return}if(!window.confirm(`Finalize ${periodLabelText}? This may lock the selected ${view} budget snapshot for reporting.`))return;finalizePeriod()}
  const exportCsv=()=>{const csv=['Category,Subcategory,Due Date,Budget,Actual,Difference,Status',...filteredRows.map(row=>[`"${row.item.category}"`,`"${row.item.subcategory||''}"`,row.item.dueDate,row.budget,row.actual,row.difference,`"${row.status}"`].join(','))].join('\n'),blob=new Blob([csv],{type:'text/csv'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=`${view}-budget-${periodStart}-${periodEnd}.csv`;anchor.click();URL.revokeObjectURL(url)}
  return <section className="budget-planning-dashboard">
    <div className="planning-section-label"><span>Planning</span><b>{view==='weekly'?'Weekly Budget':'Monthly Budget'}</b></div>
    <div className="budget-period-toolbar">
      <label className="budget-date-picker"><CalendarDays/><span>{view==='weekly'?'Select week':'Select month'}</span><input type={view==='weekly'?'date':'month'} max={view==='weekly'?currentPeriodStart:currentPeriodStart.slice(0,7)} value={view==='weekly'?week:month.slice(0,7)} onChange={event=>{if(view==='weekly'){const picked=weekStart(parseLocal(event.target.value));setWeek(picked>currentPeriodStart?currentPeriodStart:picked)}else{const picked=`${event.target.value}-01`;setMonth(picked>currentPeriodStart?currentPeriodStart:picked)}}}/></label>
      <div className="budget-period-center"><button className="outline budget-nav-button" onClick={()=>view==='weekly'?setWeek(addDays(week,-7)):setMonth(addMonths(month,-1))}><ChevronLeft/>Previous</button><strong>{periodLabelText}</strong><button className="outline budget-nav-button" disabled={atCurrentOrFuture} onClick={()=>view==='weekly'?setWeek(addDays(week,7)):setMonth(addMonths(month,1))}>Next<ChevronRight/></button></div>
      <button className="outline budget-current-button" disabled={periodStart===currentPeriodStart} onClick={()=>{setWeek(weekStart());setMonth(monthStart())}}><RotateCcw/>{view==='weekly'?'Current Week':'Current Month'}</button>
    </div>
    <div className="budget-summary-grid"><SummaryMetric label={view==='weekly'?'Expected Income':'Expected Monthly Income'} value={exactPeso(expectedIncome)}/><SummaryMetric label={view==='weekly'?'Actual Income':'Actual Monthly Income'} value={exactPeso(actualIncome)}/><SummaryMetric label={view==='weekly'?'Planned Expense Budget':'Total Monthly Budget'} value={exactPeso(totalBudget)}/><SummaryMetric label={view==='weekly'?'Actual Expenses':'Actual Monthly Expenses'} value={exactPeso(actualExpenses)}/><SummaryMetric label={view==='weekly'?'Remaining Budget':'Remaining Monthly Budget'} value={exactPeso(remaining)} tone={remaining<0?'negative':'positive'}/><SummaryMetric label={view==='weekly'?'Weekly Difference':'Monthly Difference'} value={exactPeso(difference)} tone={difference<0?'negative':'positive'} note={difference<0?'Deficit / overspending':'Surplus / savings'}/>{view==='monthly'&&<SummaryMetric label="Savings Rate" value={savingsRate}/>}</div>
    <div className="budget-planning-actions" aria-label={`${view} budget action toolbar`}>
      <div className="budget-action-group budget-actions-primary"><small>Budget actions</small><button className="primary budget-add-action" onClick={()=>setEditing(blankBudget())}><Plus/>Add {view==='weekly'?'Weekly':'Monthly'} Budget</button><button className="outline" onClick={duplicatePrevious}><Copy/>Duplicate Previous</button><button className="outline" onClick={copyNext} disabled={!canCopyToNext}><Copy/>Copy to Next</button></div>
      <div className="budget-action-group data-actions"><small>Data actions</small><button className="outline warning-action" onClick={resetActualData}><RotateCcw/>Reset Actual Data</button></div>
      <div className="budget-action-group period-actions"><small>Period actions</small><button className={`outline ${periodFinalized?'finalized-action':'confirm-action'}`} onClick={confirmFinalizePeriod} disabled={periodFinalized||!filteredRows.length}><Check/>{periodFinalized?'Period Finalized':'Finalize Period'}</button></div>
      <div className="budget-action-group report-actions"><small>Report actions</small><button className="outline" onClick={exportCsv}><Download/>Export Report</button></div>
      <details className="budget-mobile-actions"><summary><MoreHorizontal/>More Actions</summary><div><button className="outline" onClick={duplicatePrevious}><Copy/>Duplicate Previous</button><button className="outline" onClick={copyNext} disabled={!canCopyToNext}><Copy/>Copy to Next</button><button className="outline warning-action" onClick={resetActualData}><RotateCcw/>Reset Actual Data</button><button className={`outline ${periodFinalized?'finalized-action':'confirm-action'}`} onClick={confirmFinalizePeriod} disabled={periodFinalized||!filteredRows.length}><Check/>{periodFinalized?'Period Finalized':'Finalize Period'}</button><button className="outline" onClick={exportCsv}><Download/>Export Report</button></div></details>
    </div>
    <BudgetFilters filters={filters} setFilters={setFilters} categories={categories} subcategories={subcategories} accounts={accounts}/>
    <div className={`budget-compare-grid ${view}`}>{view==='weekly'&&<IncomeBudgetPanel rows={incomeRows} periodStart={periodStart} periodEnd={periodEnd}/>}<ExpenseBudgetPanel title={view==='weekly'?'Weekly Expenses':'Monthly Budget Table'} rows={filteredRows} onEdit={row=>setEditing(row.item)} onDelete={row=>setItems(current=>current.filter(item=>item.id!==row.item.id))} onRelated={row=>setRelated({budget:row.item,transactions:row.transactions})}/></div>
    {!filteredRows.length&&<div className="surface budget-empty-state"><b>No budget has been created for this period.</b><p>Add a weekly or monthly budget to begin tracking your planned and actual spending.</p><button className="primary" onClick={()=>setEditing(blankBudget())}><Plus/>Add Budget</button></div>}
    {editing&&<BudgetEditor budget={editing} period={view} periodStart={periodStart} onClose={()=>setEditing(null)} onSubmit={saveBudget} onDelete={editing.id?()=>{setItems(current=>current.filter(item=>item.id!==editing.id));setEditing(null);onNotice('Budget deleted')}:undefined}/>}
    {related&&<RelatedTransactionsModal budget={related.budget} transactions={related.transactions} onClose={()=>setRelated(null)}/>}
  </section>
}

function budgetAppliesToPeriod(item:BudgetItem,start:string,end:string){if(item.recurrence==='One-time')return inRange(item.dueDate,start,end);return occurrences(item.dueDate,item.recurrence,start,end).length>0||inRange(item.dueDate,start,end)}
function budgetTransactions(wallet:BudgetWallet,start:string,end:string):WalletTransaction[]{const account=(wallet.accountTransactions??[]).filter(item=>inRange(String(item.date||''),start,end)&&String(item.type)!=='Transfer'),cardInput=(wallet.transactions??[]).filter(item=>item.cardId!==undefined) as Array<WalletTransaction&{cardId:string|number}>,cards=(filterIncludedCardTransactions(cardInput,wallet.cards??[]) as WalletTransaction[]).filter(item=>inRange(String(item.transactionDate||item.postedDate||''),start,end)&&String(item.status).toLowerCase()==='posted');return [...account,...cards]}
function budgetRowMetrics(item:BudgetItem,transactions:WalletTransaction[]){const related=transactions.filter(transaction=>categoryMatches(transaction.category,item)&&String(transaction.type).toLowerCase()!=='income'),actual=related.reduce((sum,transaction)=>sum+transactionSignedAmount(transaction),0),budget=Number(item.amount||0),difference=budget-actual,usage=budget?actual/budget*100:0,status=item.finalized&&item.snapshot?item.snapshot.status:difference<0?'Over Budget':usage===100?'Budget Used':usage>=75?'Near Limit':actual===0?'Not Started':'On Track';return{item,budget,actual,difference,usage,status,transactions:related}}
function sortBudgetRows(a:ReturnType<typeof budgetRowMetrics>,b:ReturnType<typeof budgetRowMetrics>,sort:string){if(sort==='Category')return `${a.item.category} ${a.item.subcategory}`.localeCompare(`${b.item.category} ${b.item.subcategory}`);if(sort==='Budget')return b.budget-a.budget;if(sort==='Actual')return b.actual-a.actual;if(sort==='Difference')return a.difference-b.difference;if(sort==='Status')return a.status.localeCompare(b.status);return a.item.dueDate.localeCompare(b.item.dueDate)}
function SummaryMetric({label,value,tone='',note=''}:{label:string;value:string;tone?:string;note?:string}){return <article><small>{label}</small><b className={tone}>{value}</b>{note&&<span>{note}</span>}</article>}
function BudgetFilters({filters,setFilters,categories,subcategories,accounts}:{filters:any;setFilters:React.Dispatch<React.SetStateAction<any>>;categories:string[];subcategories:string[];accounts:string[]}){const statuses=['All','Not Started','On Track','Near Limit','Budget Used','Over Budget','Overdue'];return <details className="surface budget-filter-box"><summary><Filter/>Filters and sorting</summary><div><label>Category<select value={filters.category} onChange={e=>setFilters((f:any)=>({...f,category:e.target.value}))}><option>All</option>{categories.map(item=><option key={item}>{item}</option>)}</select></label><label>Subcategory<select value={filters.subcategory} onChange={e=>setFilters((f:any)=>({...f,subcategory:e.target.value}))}><option>All</option>{subcategories.map(item=><option key={item}>{item}</option>)}</select></label><label>Account / card<select value={filters.account} onChange={e=>setFilters((f:any)=>({...f,account:e.target.value}))}><option>All</option>{accounts.map(item=><option key={item}>{item}</option>)}</select></label><label>Status<select value={filters.status} onChange={e=>setFilters((f:any)=>({...f,status:e.target.value}))}>{statuses.map(item=><option key={item}>{item}</option>)}</select></label><label>Due date<input type="date" value={filters.dueDate} onChange={e=>setFilters((f:any)=>({...f,dueDate:e.target.value}))}/></label><label>Sort by<select value={filters.sort} onChange={e=>setFilters((f:any)=>({...f,sort:e.target.value}))}>{['Due Date','Category','Days Left','Budget','Actual','Difference','Status'].map(item=><option key={item}>{item}</option>)}</select></label><label className="check-row"><input type="checkbox" checked={filters.overBudget} onChange={e=>setFilters((f:any)=>({...f,overBudget:e.target.checked}))}/>Over-budget items</label><label className="check-row"><input type="checkbox" checked={filters.recurring} onChange={e=>setFilters((f:any)=>({...f,recurring:e.target.checked}))}/>Recurring items</label></div></details>}
function IncomeBudgetPanel({rows,periodStart,periodEnd}:{rows:PlanningRow[];periodStart:string;periodEnd:string}){return <article className="surface budget-income-panel"><div className="surface-title"><b><ArrowDown/>Weekly Income</b><span>{periodLabel(periodStart,periodEnd)}</span></div><div className="budget-income-head"><span>Category</span><span>Expected date</span><span>Expected</span><span>Actual</span><span>Diff</span></div>{rows.length?rows.map(item=>{const expected=rowExpected(item),actual=rowActual(item),difference=actual-expected,category=item.category||item.name;return <div className="budget-income-row" key={item.sourceId}><span><CategoryIcon value={category}/><b>{category}</b><small>{item.frequency||item.status}</small></span><span>{compactDate(item.date)}</span><strong>{exactPeso(expected)}</strong><strong>{actual?exactPeso(actual):'—'}</strong><strong className={difference<0?'negative':'positive'}>{exactPeso(difference)}</strong></div>}):<div className="budget-empty-inline">No weekly income has been created for this period.</div>}</article>}
function ExpenseBudgetPanel({title,rows,onEdit,onDelete,onRelated}:{title:string;rows:ReturnType<typeof budgetRowMetrics>[];onEdit:(row:ReturnType<typeof budgetRowMetrics>)=>void;onDelete:(row:ReturnType<typeof budgetRowMetrics>)=>void;onRelated:(row:ReturnType<typeof budgetRowMetrics>)=>void}){return <article className="surface budget-expense-panel"><div className="surface-title"><b><ArrowUp/>{title}</b><span>{rows.length} budgets</span></div><div className="budget-expense-head"><span>Category</span><span>Days Left</span><span>Due Date</span><span>Budget</span><span>Actual</span><span>Difference</span><span>Status</span><span>Actions</span></div>{rows.map(row=><div className="budget-expense-row" key={row.item.id}><span><CategoryIcon value={`${row.item.category}${row.item.subcategory?` / ${row.item.subcategory}`:''}`}/><b>{row.item.subcategory||row.item.category}</b><small>{row.item.subcategory?row.item.category:row.item.notes||'Budget item'}</small></span><span>{daysLeft(row.item.dueDate)}</span><span>{compactDate(row.item.dueDate)}</span><strong>{exactPeso(row.budget)}</strong><strong>{exactPeso(row.actual)}</strong><strong className={row.difference<0?'negative':'positive'}>{exactPeso(row.difference)}</strong><em>{row.status}</em><span className="budget-row-actions"><button title="View Related Transactions" onClick={()=>onRelated(row)}><Eye/></button><button title="Edit Budget" onClick={()=>onEdit(row)}>Edit</button><button title="Delete Budget" onClick={()=>onDelete(row)}><Trash2/></button></span><i className="budget-progress"><b style={{width:`${Math.min(140,Math.max(0,row.usage))}%`}}/><small>{row.usage.toFixed(0)}% used · {row.status}</small></i></div>)}</article>}
function BudgetEditor({budget,period,periodStart,onClose,onSubmit,onDelete}:{budget:BudgetItem;period:BudgetPeriod;periodStart:string;onClose:()=>void;onSubmit:(event:FormEvent<HTMLFormElement>)=>void;onDelete?:()=>void}){return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal planning-budget-modal" role="dialog" aria-modal="true" onMouseDown={event=>event.stopPropagation()}><div className="modal-head"><div><h2>{budget.id?'Edit':'Add'} {period} budget</h2><p>Select category, due date, recurrence, account/card, relationship, rollover, and notes.</p></div><button className="icon-button" onClick={onClose}><X/></button></div><form onSubmit={onSubmit}><CategoryFields defaultValue={`${budget.category}${budget.subcategory?` / ${budget.subcategory}`:''}`}/><div className="form-grid"><label>Budget amount<input name="amount" type="number" min="0.01" step="0.01" required defaultValue={budget.amount||''}/></label><label>Due date<input name="dueDate" type="date" required defaultValue={budget.dueDate||periodStart}/></label></div><div className="form-grid"><label>Recurrence<select name="recurrence" defaultValue={budget.recurrence||'One-time'}><option>One-time</option><option>Weekly</option><option>Every two weeks</option><option>Monthly</option><option>Every two months</option><option>Quarterly</option><option>Semiannually</option><option>Annually</option></select></label><label>Connected account or card<ConnectedAccountSelect name="account" defaultValue={budget.account}/></label></div><div className="form-grid"><label>Applies to<select name="appliesTo" defaultValue={budget.appliesTo||`One specific ${period==='weekly'?'week':'month'}`}><option>{period==='weekly'?'One specific week':'One specific month'}</option><option>{period==='weekly'?'Every week':'Every month'}</option><option>Selected periods</option><option>Custom date range</option></select></label><label>Relationship<select name="relationship" defaultValue={budget.relationship||`Independent ${period==='weekly'?'Weekly':'Monthly'} Budget`}><option>Independent Weekly Budget</option><option>Independent Monthly Budget</option><option>Weekly Budgets Count Toward Monthly Budget</option></select></label></div><label>Rollover<select name="rollover" defaultValue={budget.rollover||'Do not carry over'}><option>Do not carry over</option><option>Carry over remaining budget</option><option>Carry over overspending</option><option>Carry over both remaining and overspent amounts</option></select></label>{period==='monthly'&&<p className="budget-distribution-note">Optional distribution: monthly budget can be distributed into weekly periods after you confirm. Suggested weekly budget is approximately the monthly amount ÷ 4.33.</p>}<label>Notes<textarea name="notes" rows={3} defaultValue={budget.notes}/></label><div className="record-edit-actions"><button className="primary" type="submit">Save budget</button>{onDelete&&<button className="danger-outline" type="button" onClick={onDelete}><Trash2/>Delete Budget</button>}</div></form></section></div>}
function RelatedTransactionsModal({budget,transactions,onClose}:{budget:BudgetItem;transactions:WalletTransaction[];onClose:()=>void}){return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal related-transactions-modal" role="dialog" aria-modal="true" onMouseDown={event=>event.stopPropagation()}><div className="modal-head"><div><h2>Related Transactions</h2><p>{budget.category}{budget.subcategory?` / ${budget.subcategory}`:''}</p></div><button className="icon-button" onClick={onClose}><X/></button></div>{transactions.length?<div className="related-transaction-list">{transactions.map(transaction=><div className="history-row" key={transaction.id}><CategoryIcon value={transaction.category||budget.category}/><span>{longDate(String(transaction.date||transaction.transactionDate||transaction.postedDate))}</span><span><b>{transaction.description||transaction.type}</b><small>{transaction.category||'Uncategorized'}</small></span><strong>{exactPeso(transactionSignedAmount(transaction))}</strong></div>)}</div>:<div className="budget-empty-inline">No transactions have been recorded for this category during the selected period.</div>}</section></div>}

function PlanList({title,icon,tone,items,onEdit,onAdd,onSelect,selectedId}:{title:string;icon:React.ReactNode;tone:string;items:PlanningRow[];onEdit:(item:PlanItem)=>void;onAdd:()=>void;onSelect?:(sourceId:string)=>void;selectedId?:string}){return <article className={`surface biweekly-list ${tone}`}><div className="surface-title"><b>{icon}{title}</b><span>{items.length} items</span></div><div className="biweekly-list-head"><span aria-hidden="true"/><span>Date</span><span>Description</span><span>Expected amount</span><span>Actual amount</span></div>{items.length?items.map(item=>{const selectable=Boolean(onSelect)||!item.readOnly,selected=selectedId===item.sourceId,open=()=>onSelect?onSelect(item.sourceId):!item.readOnly&&onEdit(item),card=item.cardLogo;return <div className={`biweekly-row ${item.readOnly?'auto-row':'editable-row'} ${selectable?'selectable-row':''} ${selected?'selected':''}`} key={item.sourceId} role={selectable?'button':undefined} tabIndex={selectable?0:undefined} onClick={open} onKeyDown={event=>{if(selectable&&(event.key==='Enter'||event.key===' ')){event.preventDefault();open()}}}>{card?<BankLogo bankId={card.bankId??null} bankName={card.bank||card.name||item.name} customLogo={card.customLogo||''} size="small" className="planning-leading-icon"/>:<CategoryIcon value={item.category} className="planning-leading-icon"/>}<span className="planning-row-date">{compactDate(item.date)}</span><span className="planning-row-description"><b>{item.name}</b><small>{item.category} · {item.status} <em className={`source-badge ${item.source}`}>{item.source==='manual'?'Manual':item.source==='income'?'Income forecast':'Bills & Payments'}</em></small></span><strong>{item.type==='Expense'?'−':'+'}{peso(rowExpected(item))}</strong><strong className="actual-amount">{rowActual(item)>0?`${item.type==='Expense'?'−':'+'}${peso(rowActual(item))}`:'—'}</strong></div>}):<div className="planning-empty"><span>{icon}</span><b>No {tone} records</b><small>Add an expected or actual {tone} for this period.</small><button type="button" className="primary" onClick={onAdd}><Plus/>Plan {tone}</button></div>}</article>}

function PlanningExpensePaymentModal({item,onClose,onEdit,onConfirm}:{item:PlanningRow;onClose:()=>void;onEdit:()=>void;onConfirm:(values:{account:string;date:string})=>void}){
  return <div className="modal-backdrop" onMouseDown={onClose}>
    <section className="modal planning-expense-payment-modal" role="dialog" aria-modal="true" onMouseDown={event=>event.stopPropagation()}>
      <div className="modal-head">
        <div><h2>{item.name}</h2><p>{item.category} · Due {longDate(item.date)}</p></div>
        <button className="icon-button" aria-label="Close" onClick={onClose}><X/></button>
      </div>
      <div className="planning-payment-summary">
        <span><small>Expected amount</small><b>{peso(rowExpected(item))}</b></span>
        <span><small>Status</small><b>{item.status}</b></span>
        <span><small>Source</small><b>{item.source==='bill'?'Bills & Payments':item.source==='manual'?'Manual plan':'Income forecast'}</b></span>
        <span><small>Actual amount</small><b>{rowActual(item)>0?peso(rowActual(item)):'Not recorded'}</b></span>
      </div>
      <form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);onConfirm({account:String(form.get('account')),date:String(form.get('date'))})}}>
        <h3 className="form-section-title">Mark as Paid</h3>
        <label>Payment Account<ConnectedAccountSelect required defaultValue={item.account}/></label>
        <label>Payment Date<input name="date" type="date" required defaultValue={todayIso()}/></label>
        <button className="primary submit"><Check/>Confirm Payment</button>
      </form>
      {!item.readOnly&&<button className="outline submit" type="button" onClick={onEdit}>Edit planned expense</button>}
    </section>
  </div>
}
