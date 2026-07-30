import { FormEvent, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, CircleDollarSign, CreditCard, Landmark, PiggyBank, Plus, Receipt, Repeat2, Trash2, X } from 'lucide-react'
import { useFirestoreState } from './hooks/useFirestoreState'
import { useWalletSnapshot } from './hooks/useWalletSnapshot'
import { adjustToWeekday, calculateDueDate } from './domain/creditCardEngine'
import { billUsesIncludedCard } from './utils/netBalanceFilters'

type Tone='income'|'expense'|'credit-card'|'savings'|'overdue'|'completed'
type EventType='Income'|'Bill due'|'Credit card due'|'Statement date'|'Savings contribution'|'Subscription renewal'|'Loan payment'
type FinancialEvent={id:number;day:number;date?:string;name:string;type:EventType;amount:number;tone:Tone;account:string;status:string;recurring:string}
type BillRecord={id:number;sourceKey?:string;name:string;category:string;amount:number;dueDate:string;frequency?:string;status:string;account?:string;statementDate?:string}
type PlanRecord={id:number;type:'Income'|'Expense';name:string;category:string;amount:number;date:string;status?:string;account?:string;archived?:boolean}
type WalletSnapshot={cards?:Array<{id:number;name:string;bank?:string;bankId?:string|null;active?:boolean;includeInNetBalance?:boolean;statementDay?:number;dueDateRule?:'fixed-next-month'|'days-after-statement'|'manual';fixedDueDay?:number;daysAfterStatement?:number;manualDueDate?:string;openingBalance?:number}>;statements?:Array<{id:number;cardId:number;statementDate:string;dueDate:string;statementBalance:number;remainingDue?:number;status?:string}>}
type Props={onNotice:(text:string)=>void}

const money=(n:number)=>`₱${n.toLocaleString()}`
const icons:Record<EventType,typeof Receipt>={'Income':CircleDollarSign,'Bill due':Receipt,'Credit card due':CreditCard,'Statement date':CreditCard,'Savings contribution':PiggyBank,'Subscription renewal':Repeat2,'Loan payment':Landmark}
const typeTone:Record<EventType,Tone>={'Income':'income','Bill due':'expense','Credit card due':'credit-card','Statement date':'credit-card','Savings contribution':'savings','Subscription renewal':'expense','Loan payment':'expense'}
const isoDate=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
const eventDate=(event:FinancialEvent)=>event.date??`2026-07-${String(event.day).padStart(2,'0')}`
const monthKey=(date:Date)=>isoDate(date).slice(0,7)
const monthTitle=(date:Date)=>date.toLocaleDateString('en-US',{month:'long',year:'numeric'})
const stableNumberId=(value:string)=>Array.from(value).reduce((hash,char)=>((hash*31)+char.charCodeAt(0))>>>0,0)
const addMonths=(date:Date,months:number)=>new Date(date.getFullYear(),date.getMonth()+months,date.getDate(),12)
const dateFromDay=(base:Date,day:number)=>adjustToWeekday(isoDate(new Date(base.getFullYear(),base.getMonth(),Math.min(Math.max(day||1,1),new Date(base.getFullYear(),base.getMonth()+1,0).getDate()),12)))

export default function FinancialCalendar({onNotice}:Props){
  const [manualEvents,setManualEvents]=useFirestoreState<FinancialEvent[]>('calendar',[])
  const [bills]=useFirestoreState<BillRecord[]>('bills',[])
  const [planning]=useFirestoreState<PlanRecord[]>('planning',[])
  const [wallet]=useWalletSnapshot<WalletSnapshot>({})
  const [viewMonth,setViewMonth]=useState(()=>new Date())
  const [selectedDate,setSelectedDate]=useState(()=>isoDate(new Date()))
  const [adding,setAdding]=useState(false)
  const [editing,setEditing]=useState<FinancialEvent|null>(null)
  const [filter,setFilter]=useState('All')
  const key=monthKey(viewMonth)
  const generatedEvents=useMemo<FinancialEvent[]>(()=>{
    const currentMonthStart=new Date(viewMonth.getFullYear(),viewMonth.getMonth(),1,12)
    const nearbyMonths=[addMonths(currentMonthStart,-1),currentMonthStart,addMonths(currentMonthStart,1)]
    const billEvents=bills.filter(bill=>billUsesIncludedCard(bill,wallet.cards??[])&&!['Paid','Skipped'].includes(bill.status)).flatMap(bill=>{
      const isCreditCard=/credit\s*card/i.test(bill.category)||Boolean(bill.statementDate)
      const due:FinancialEvent={id:stableNumberId(`bill-due-${bill.id}-${bill.dueDate}`),day:Number(bill.dueDate.slice(-2)),date:bill.dueDate,name:bill.name.replace(/\s+statement$/i,''),type:isCreditCard?'Credit card due':'Bill due',amount:Number(bill.amount||0),tone:bill.status==='Overdue'?'overdue':isCreditCard?'credit-card':'expense',account:bill.account||'Select when paid',status:bill.status,recurring:bill.frequency||'One-time'}
      const statement=bill.statementDate?{id:stableNumberId(`bill-statement-${bill.id}-${bill.statementDate}`),day:Number(bill.statementDate.slice(-2)),date:bill.statementDate,name:due.name,type:'Statement date' as EventType,amount:Number(bill.amount||0),tone:'credit-card' as Tone,account:due.account,status:'Statement ready',recurring:bill.frequency||'One-time'}:null
      return statement?[statement,due]:[due]
    })
    const planEvents=planning.filter(item=>!item.archived).map(item=>({id:stableNumberId(`plan-${item.id}-${item.date}`),day:Number(item.date.slice(-2)),date:item.date,name:item.name,type:item.type==='Income'?'Income':'Bill due' as EventType,amount:Number(item.amount||0),tone:item.type==='Income'?'income':'expense' as Tone,account:item.account||'Unassigned',status:item.status||'Expected',recurring:'Planned'}))
    const statementEvents=(wallet.statements??[]).flatMap(statement=>{
      const card=(wallet.cards??[]).find(item=>item.id===statement.cardId&&item.includeInNetBalance!==false)
      if(!card)return []
      const name=card?.name??'Credit card'
      return [
        {id:stableNumberId(`wallet-statement-${statement.id}-${statement.statementDate}`),day:Number(statement.statementDate.slice(-2)),date:statement.statementDate,name,type:'Statement date' as EventType,amount:Number(statement.statementBalance||0),tone:'credit-card' as Tone,account:name,status:statement.status||'Statement ready',recurring:'Monthly'},
        {id:stableNumberId(`wallet-due-${statement.id}-${statement.dueDate}`),day:Number(statement.dueDate.slice(-2)),date:statement.dueDate,name,type:'Credit card due' as EventType,amount:Number(statement.remainingDue??statement.statementBalance??0),tone:(statement.status==='Paid'?'completed':'credit-card') as Tone,account:name,status:statement.status||'Upcoming',recurring:'Monthly'}
      ]
    })
    const cardEstimateEvents=(wallet.cards??[]).filter(card=>card.active!==false&&card.includeInNetBalance!==false&&!statementEvents.some(event=>event.account===card.name)).flatMap(card=>nearbyMonths.flatMap(month=>{const statementDate=dateFromDay(month,Number(card.statementDay||1)),dueDate=calculateDueDate({statementDay:Number(card.statementDay||1),dueDateRule:card.dueDateRule??'fixed-next-month',fixedDueDay:Number(card.fixedDueDay||1),daysAfterStatement:Number(card.daysAfterStatement||21),manualDueDate:card.manualDueDate,bank:card.bank??'',bankId:card.bankId??null} as never,statementDate);return [
      {id:stableNumberId(`card-est-statement-${card.id}-${monthKey(month)}`),day:Number(statementDate.slice(-2)),date:statementDate,name:card.name,type:'Statement date' as EventType,amount:Number(card.openingBalance||0),tone:'credit-card' as Tone,account:card.name,status:'Estimated',recurring:'Monthly'},
      {id:stableNumberId(`card-est-due-${card.id}-${monthKey(month)}`),day:Number(dueDate.slice(-2)),date:dueDate,name:card.name,type:'Credit card due' as EventType,amount:Number(card.openingBalance||0),tone:'credit-card' as Tone,account:card.name,status:'Estimated',recurring:'Monthly'}
    ]}))
    return [...billEvents,...planEvents,...statementEvents,...cardEstimateEvents]
  },[bills,planning,wallet,viewMonth])
  const events=useMemo(()=>[...generatedEvents,...manualEvents].sort((a,b)=>eventDate(a).localeCompare(eventDate(b))||a.name.localeCompare(b.name)),[generatedEvents,manualEvents])
  const monthEvents=events.filter(event=>eventDate(event).startsWith(key))
  const visible=filter==='All'?monthEvents:monthEvents.filter(event=>event.tone===filter)
  const selected=events.filter(event=>eventDate(event)===selectedDate)
  const cells=useMemo(()=>{
    const first=new Date(viewMonth.getFullYear(),viewMonth.getMonth(),1,12)
    const start=new Date(first);start.setDate(1-first.getDay())
    return Array.from({length:42},(_,index)=>{const date=new Date(start);date.setDate(start.getDate()+index);return date})
  },[viewMonth])
  const moveMonth=(amount:number)=>{const next=new Date(viewMonth.getFullYear(),viewMonth.getMonth()+amount,1,12);setViewMonth(next);setSelectedDate(isoDate(next))}
  const goToday=()=>{const today=new Date();const next=new Date(today.getFullYear(),today.getMonth(),1,12);setViewMonth(next);setSelectedDate(isoDate(today))}
  const add=(event:FinancialEvent)=>{setManualEvents(current=>[...current,event]);setSelectedDate(eventDate(event));setAdding(false);onNotice(`${event.name} added to ${new Date(`${eventDate(event)}T12:00`).toLocaleDateString('en-US',{month:'long',day:'numeric'})}`)}
  const selectedObject=new Date(`${selectedDate}T12:00`)

  return <section className="feature-page financial-calendar">
    <div className="fp-head"><div><h2>Financial Calendar</h2><p>Review every deposit, payment, renewal, and transfer by date.</p></div><button className="primary" onClick={()=>setAdding(true)}><Plus/>Add item</button></div>
    <div className="calendar-summary"><div><span>Income scheduled</span><b className="positive">{money(monthEvents.filter(event=>event.tone==='income').reduce((sum,event)=>sum+event.amount,0))}</b></div><div><span>Payments scheduled</span><b>{money(monthEvents.filter(event=>['expense','credit-card'].includes(event.tone)).reduce((sum,event)=>sum+event.amount,0))}</b></div><div><span>Savings scheduled</span><b>{money(monthEvents.filter(event=>event.tone==='savings').reduce((sum,event)=>sum+event.amount,0))}</b></div><div><span>Needs attention</span><b className="negative">{monthEvents.filter(event=>event.tone==='overdue').length} overdue</b></div></div>
    <div className="calendar-legend"><button className={filter==='All'?'active':''} onClick={()=>setFilter('All')}>All</button>{([['income','Income'],['expense','Expense'],['credit-card','Credit card'],['savings','Savings'],['overdue','Overdue'],['completed','Completed']] as [Tone,string][]).map(([tone,label])=><button className={filter===tone?'active':''} onClick={()=>setFilter(tone)} key={tone}><i className={tone}/>{label}</button>)}</div>
    <div className="financial-calendar-layout">
      <article className="surface financial-month">
        <div className="financial-cal-nav"><div><button aria-label="Previous month" onClick={()=>moveMonth(-1)}><ChevronLeft/></button><button onClick={goToday}>Today</button></div><h3>{monthTitle(viewMonth)}</h3><button aria-label="Next month" onClick={()=>moveMonth(1)}><ChevronRight/></button></div>
        <div className="financial-weekdays">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(value=><b key={value}>{value}</b>)}</div>
        <div className="financial-days">{cells.map(date=>{const dateKey=isoDate(date),inMonth=date.getMonth()===viewMonth.getMonth(),dayEvents=visible.filter(event=>eventDate(event)===dateKey);return <button aria-label={`${date.toLocaleDateString('en-US',{month:'long',day:'numeric'})}${dayEvents.length?`, ${dayEvents.length} financial items`:''}`} className={`${!inMonth?'outside':''} ${selectedDate===dateKey?'selected':''}`} onClick={()=>{setSelectedDate(dateKey);if(!events.some(event=>eventDate(event)===dateKey))setAdding(true)}} key={dateKey}><span>{date.getDate()}</span><div>{dayEvents.slice(0,3).map(event=><em className={event.tone} key={event.id}>{event.name}<b>{money(event.amount)}</b></em>)}{dayEvents.length>3&&<small>+{dayEvents.length-3} more</small>}</div></button>})}</div>
      </article>
      <aside className="surface day-agenda"><div className="agenda-date"><span><small>{selectedObject.toLocaleDateString('en-US',{month:'short'}).toUpperCase()}</small>{selectedObject.getDate()}</span><div><small>Selected date</small><h3>{selectedObject.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</h3></div></div><div className="agenda-list">{selected.length?selected.map(event=>{const Icon=icons[event.type];return <button onClick={()=>setEditing(event)} key={event.id}><span className={`agenda-icon ${event.tone}`}><Icon/></span><span><b>{event.name}</b><small>{event.type} · {event.account}</small><em>{event.status} · {event.recurring}</em></span><strong className={event.tone==='income'?'positive':''}>{event.tone==='income'?'+':''}{money(event.amount)}</strong><ChevronRight/></button>}):<div className="empty-date"><CalendarDays/><b>No financial activity</b><p>Add an income, payment, or transfer for this date.</p></div>}</div><button className="outline agenda-add" onClick={()=>setAdding(true)}><Plus/>Add item on {selectedObject.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</button></aside>
    </div>
    {adding&&<CalendarItemModal date={selectedDate} onClose={()=>setAdding(false)} onSave={add}/>} 
    {editing&&<CalendarItemModal event={editing} date={eventDate(editing)} onClose={()=>setEditing(null)} onSave={updated=>{setManualEvents(current=>current.some(item=>item.id===updated.id)?current.map(item=>item.id===updated.id?updated:item):[...current,updated]);setSelectedDate(eventDate(updated));setEditing(null);onNotice(`${updated.name} updated`)}} onDelete={()=>{setManualEvents(current=>current.filter(item=>item.id!==editing.id));setEditing(null);onNotice(`${editing.name} deleted`)}}/>}
  </section>
}

function CalendarItemModal({event,date,onClose,onSave,onDelete}:{event?:FinancialEvent;date:string;onClose:()=>void;onSave:(event:FinancialEvent)=>void;onDelete?:()=>void}){
  const [type,setType]=useState<EventType>(event?.type??'Bill due')
  const submit=(submitEvent:FormEvent<HTMLFormElement>)=>{submitEvent.preventDefault();const form=new FormData(submitEvent.currentTarget),status=String(form.get('status')),chosenDate=String(form.get('date'));onSave({id:event?.id??Date.now(),day:Number(chosenDate.slice(-2)),date:chosenDate,name:String(form.get('name')),type,amount:Number(form.get('amount')),tone:status==='Completed'?'completed':status==='Overdue'?'overdue':typeTone[type],account:String(form.get('account')),status,recurring:String(form.get('recurring'))})}
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal calendar-item-modal" role="dialog" aria-modal="true" onMouseDown={click=>click.stopPropagation()}><div className="modal-head"><div><h2>{event?'Edit':'Add'} financial item</h2><p>{event?'Update or remove this financial event.':'Add activity to a specific calendar date.'}</p></div><button aria-label="Close" className="icon-button" onClick={onClose}><X/></button></div><form onSubmit={submit}><div className="form-grid"><label>Item type<select value={type} onChange={change=>setType(change.target.value as EventType)}>{Object.keys(icons).map(value=><option key={value}>{value}</option>)}</select></label><label>Name<input name="name" required autoFocus defaultValue={event?.name} placeholder="e.g. Electricity payment"/></label></div><div className="form-grid"><label>Amount<input name="amount" type="number" min="0" required defaultValue={event?.amount} placeholder="₱ 0.00"/></label><label>Date<input name="date" type="date" required defaultValue={date}/></label></div><div className="form-grid"><label>Account<input name="account" required defaultValue={event?.account??''} placeholder="e.g. Checking"/></label><label>Status<select name="status" defaultValue={event?.status??'Upcoming'}><option>Upcoming</option><option>Confirmed</option><option>Scheduled</option><option>Completed</option><option>Overdue</option><option>Statement ready</option><option>Due soon</option><option>Automatic</option></select></label></div><label>Repeats<select name="recurring" defaultValue={event?.recurring??'One-time'}><option>One-time</option><option>Weekly</option><option>Every two weeks</option><option>Monthly</option><option>Quarterly</option><option>Annually</option></select></label>{event?<div className="record-edit-actions"><button className="primary" type="submit">Save changes</button><button className="danger-outline" type="button" onClick={onDelete}><Trash2/>Delete item</button></div>:<button className="primary submit" type="submit"><Plus/>Add to calendar</button>}</form></section></div>
}
