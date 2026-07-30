import { FormEvent, useState } from 'react'
import { CalendarDays, Check, ChevronRight, CircleDollarSign, Filter, Plus, SlidersHorizontal, X } from 'lucide-react'
import { useFirestoreState } from './hooks/useFirestoreState'

type Status='Expected'|'Received'|'Delayed'|'Partially received'|'Cancelled'
type Confidence='Confirmed'|'Estimated'
type Income={id:number;source:string;type:string;amount:number;expectedDate:string;receivedDate:string;frequency:string;account:string;status:Status;confidence:Confidence;notes:string}
type Props={onNotice:(text:string)=>void}

const seedIncome:Income[]=[
  {id:1,source:'Acme Philippines payroll',type:'Salary',amount:25000,expectedDate:'2026-07-26',receivedDate:'',frequency:'Every two weeks',account:'BPI Savings',status:'Expected',confidence:'Confirmed',notes:'Regular net payroll'},
  {id:2,source:'Northstar website project',type:'Freelance work',amount:12000,expectedDate:'2026-07-29',receivedDate:'',frequency:'One-time',account:'Metrobank Savings',status:'Expected',confidence:'Estimated',notes:'Final milestone pending approval'},
  {id:3,source:'Acme Philippines payroll',type:'Salary',amount:25000,expectedDate:'2026-07-12',receivedDate:'2026-07-12',frequency:'Every two weeks',account:'BPI Savings',status:'Received',confidence:'Confirmed',notes:'Received on schedule'},
  {id:4,source:'Quarterly sales incentive',type:'Commission',amount:8500,expectedDate:'2026-07-18',receivedDate:'',frequency:'Quarterly',account:'BPI Savings',status:'Delayed',confidence:'Confirmed',notes:'Awaiting finance release'},
  {id:5,source:'Dividend distribution',type:'Investment income',amount:3200,expectedDate:'2026-08-02',receivedDate:'',frequency:'Quarterly',account:'BPI Savings',status:'Expected',confidence:'Estimated',notes:'Based on current declared range'},
]
const peso=(n:number)=>`₱${n.toLocaleString()}`
const date=(v:string)=>v?new Date(`${v}T12:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—'

export default function IncomeManagement({onNotice}:Props){
  const [items,setItems]=useFirestoreState<Income[]>('income',[])
  const [includeEstimated,setIncludeEstimated]=useState(false)
  const [status,setStatus]=useState('All')
  const [selected,setSelected]=useState<Income|null>(null)
  const [adding,setAdding]=useState(false)
  const visible=status==='All'?items:items.filter(i=>i.status===status)
  const confirmed=items.filter(i=>i.confidence==='Confirmed'&&!['Cancelled','Received'].includes(i.status)).reduce((sum,i)=>sum+i.amount,0)
  const estimated=items.filter(i=>i.confidence==='Estimated'&&!['Cancelled','Received'].includes(i.status)).reduce((sum,i)=>sum+i.amount,0)
  const forecast=confirmed+(includeEstimated?estimated:0)
  const received=items.filter(i=>i.status==='Received').reduce((sum,i)=>sum+i.amount,0)
  const add=(income:Income)=>{setItems(current=>[income,...current]);setSelected(income);setAdding(false);onNotice(`${income.source} added to income forecast`)}
  return <section className="feature-page income-management">
    <div className="fp-head"><div><h2>Income Management</h2><p>Track expected deposits and control what counts toward your forecast.</p></div><button className="primary" onClick={()=>setAdding(true)}><Plus/>Add income</button></div>
    <div className="income-summary">
      <div><span>Forecast income</span><b>{peso(forecast)}</b><small>{includeEstimated?'Confirmed + estimated':'Confirmed only'}</small></div>
      <div><span>Confirmed upcoming</span><b>{peso(confirmed)}</b><small>Included by default</small></div>
      <div><span>Estimated upcoming</span><b>{peso(estimated)}</b><small>{includeEstimated?'Included in forecast':'Not included'}</small></div>
      <div><span>Received this period</span><b>{peso(received)}</b><small>Deposited income</small></div>
    </div>
    <article className="surface forecast-settings">
      <span className="forecast-icon"><SlidersHorizontal/></span><div><b>Forecast settings</b><p>Only confirmed income is used to determine whether upcoming bills can be covered.</p></div>
      <label className="forecast-toggle"><input type="checkbox" checked={includeEstimated} onChange={e=>setIncludeEstimated(e.target.checked)}/><i/><span><b>Include estimated income</b><small>Add {peso(estimated)} to coverage calculations</small></span></label>
    </article>
    <div className="income-layout">
      <article className="surface income-list"><div className="income-list-head"><div><b>Income activity</b><small>{visible.length} records</small></div><label><Filter/><select aria-label="Filter income status" value={status} onChange={e=>setStatus(e.target.value)}>{['All','Expected','Received','Delayed','Partially received','Cancelled'].map(v=><option key={v}>{v}</option>)}</select></label></div>
        <div className="income-table-head"><span>Source</span><span>Expected</span><span>Amount</span><span>Status</span></div>
        {visible.map(item=><button key={item.id} className={selected?.id===item.id?'selected':''} onClick={()=>setSelected(item)}><span className="income-source-icon"><CircleDollarSign/></span><span className="income-source"><b>{item.source}</b><small>{item.type} · {item.frequency}</small></span><span data-label="Expected"><b>{date(item.expectedDate)}</b><small>{item.account}</small></span><strong data-label="Amount">{peso(item.amount)}</strong><span data-label="Status"><em className={`income-status ${item.status.toLowerCase().replaceAll(' ','-')}`}>{item.status}</em><small className={`confidence ${item.confidence.toLowerCase()}`}>{item.confidence}</small></span><ChevronRight/></button>)}
      </article>
      {selected&&<aside className="surface income-detail"><div className="income-detail-head"><span><CircleDollarSign/></span><div><small>{selected.type}</small><h3>{selected.source}</h3></div></div><div className="income-detail-amount"><span>Expected amount</span><b>{peso(selected.amount)}</b><em className={`income-status ${selected.status.toLowerCase().replaceAll(' ','-')}`}>{selected.status}</em></div><div className="income-detail-fields">{[['Expected date',date(selected.expectedDate)],['Received date',date(selected.receivedDate)],['Frequency',selected.frequency],['Receiving account',selected.account],['Forecast type',selected.confidence],['Income type',selected.type]].map(([label,value])=><div key={label}><span>{label}</span><b>{value}</b></div>)}</div><div className="income-notes"><span>Notes</span><p>{selected.notes||'No notes added.'}</p></div><div className={`coverage-note ${selected.confidence.toLowerCase()}`}>{selected.confidence==='Confirmed'?<Check/>:<CalendarDays/>}<span><b>{selected.confidence==='Confirmed'?'Included in bill coverage':'Excluded from bill coverage'}</b><small>{selected.confidence==='Confirmed'||includeEstimated?'This income is included in the current forecast.':'Enable estimated income to include this amount.'}</small></span></div></aside>}
    </div>
    {adding&&<IncomeModal onClose={()=>setAdding(false)} onAdd={add}/>} 
  </section>
}

function IncomeModal({onClose,onAdd}:{onClose:()=>void;onAdd:(income:Income)=>void}){
  const [confidence,setConfidence]=useState<Confidence>('Confirmed')
  const [status,setStatus]=useState<Status>('Expected')
  const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const data=new FormData(e.currentTarget);onAdd({id:Date.now(),source:String(data.get('source')),amount:Number(data.get('amount')),expectedDate:String(data.get('expectedDate')),receivedDate:String(data.get('receivedDate')||''),frequency:String(data.get('frequency')),account:String(data.get('account')),status,notes:String(data.get('notes')||''),type:String(data.get('type')),confidence})}
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal income-modal" role="dialog" aria-modal="true" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><h2>Add income</h2><p>Record an expected or received source of income.</p></div><button aria-label="Close" className="icon-button" onClick={onClose}><X/></button></div><form onSubmit={submit}>
    <div className="confidence-switch">{(['Confirmed','Estimated'] as Confidence[]).map(v=><button type="button" className={confidence===v?'selected':''} onClick={()=>setConfidence(v)} key={v}>{v}<small>{v==='Confirmed'?'Included in coverage':'Optional in forecast'}</small></button>)}</div>
    <label>Income source<input name="source" required autoFocus placeholder="e.g. Acme payroll"/></label>
    <div className="form-grid"><label>Amount<input name="amount" type="number" min="1" required placeholder="₱ 0.00"/></label><label>Income type<select name="type">{['Salary','Freelance work','Business income','Commission','Allowance','Bonus','Refund','Investment income','Other'].map(v=><option key={v}>{v}</option>)}</select></label></div>
    <div className="form-grid"><label>Expected date<input name="expectedDate" type="date" required defaultValue="2026-07-26"/></label><label>Received date<input name="receivedDate" type="date" disabled={!['Received','Partially received'].includes(status)}/></label></div>
    <div className="form-grid"><label>Frequency<select name="frequency">{['Weekly','Every two weeks','Monthly','Quarterly','Annually','One-time','Custom'].map(v=><option key={v}>{v}</option>)}</select></label><label>Receiving account<select name="account"><option>BPI Savings</option><option>Metrobank Savings</option><option>Cash</option></select></label></div>
    <label>Status<select value={status} onChange={e=>setStatus(e.target.value as Status)}>{['Expected','Received','Delayed','Partially received','Cancelled'].map(v=><option key={v}>{v}</option>)}</select></label>
    <label>Notes<textarea name="notes" rows={3} placeholder="Optional details about this income"/></label>
    <button className="primary submit" type="submit"><Plus/>Add income</button>
  </form></section></div>
}
