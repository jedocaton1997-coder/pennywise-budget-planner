import { useState } from 'react'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react'

type Props = { onAdd: () => void; onNotice: (text: string) => void }

const weeks = [
  { label:'Jul 13–19, 2026', starting:18000, expectedIncome:15000, incomeReceived:15000, collections:0, expenses:11000, cards:7000, debts:0, installments:0, savings:2000, actual:12500 as number|null, safe:2000, status:'Attention Needed', description:'Upcoming commitments are close to the available balance.' },
  { label:'Jul 20–26, 2026', starting:30000, expectedIncome:20000, incomeReceived:20000, collections:3000, expenses:8500, cards:10000, debts:2500, installments:2000, savings:3000, actual:27000 as number|null, safe:5400, status:'On Track', description:'Income and confirmed collections cover every planned obligation.' },
  { label:'Jul 27–Aug 2, 2026', starting:27000, expectedIncome:25000, incomeReceived:0, collections:0, expenses:10000, cards:4000, debts:3500, installments:2000, savings:3000, actual:null as number|null, safe:10000, status:'Extra Available', description:'Bills and savings are covered with disposable money remaining.' },
  { label:'Aug 3–9, 2026', starting:4650, expectedIncome:0, incomeReceived:0, collections:0, expenses:7000, cards:10000, debts:3500, installments:2000, savings:1000, actual:null as number|null, safe:0, status:'Shortfall', description:'BPI Rewards has ₱10,000 remaining due Aug 5; projected funding is only ₱9,500.' },
]

const commitments = [['Scheduled expenses',19800],['Credit card payments',8000],['Savings contributions',2000]] as const
const peso = (value:number) => `${value < 0 ? '−' : ''}₱${Math.abs(value).toLocaleString()}`
const slug = (value:string) => value.toLowerCase().replaceAll(' ','-')

export default function WeeklyMonitor({onAdd,onNotice}:Props){
  const [index,setIndex]=useState(1)
  const [adding,setAdding]=useState(false)
  const week=weeks[index]
  const outflow=week.expenses+week.cards+week.debts+week.installments+week.savings
  const ending=week.starting+week.expectedIncome+week.collections-outflow
  const statusClass=slug(week.status)
  const good=week.status==='On Track'||week.status==='Extra Available'
  const summary=[
    ['Starting balance',peso(week.starting),''],['Expected income',peso(week.expectedIncome),'positive'],['Expected collections',peso(week.collections),'positive'],['Income received',peso(week.incomeReceived),'positive'],
    ['Upcoming expenses',peso(week.expenses),'negative'],['Credit card payments',peso(week.cards),'negative'],['Debt payments',peso(week.debts),'negative'],['Installment payments',peso(week.installments),'negative'],['Savings contributions',peso(week.savings),''],
    ['Total expected outflow',peso(outflow),'negative'],['Expected ending balance',peso(ending),ending<0?'negative':''],['Actual ending balance',week.actual===null?'Not closed':peso(week.actual),''],['Safe to spend',peso(week.safe),'positive']
  ]
  return <section className="feature-page weekly-monitor">
    <div className="fp-title-row">
      <div><h2>Weekly Financial Monitor</h2><p>Know what is coming in, going out, and safe to spend.</p></div>
      <div className="date-nav"><button aria-label="Previous week" onClick={()=>setIndex(Math.max(0,index-1))}><ChevronLeft/></button><b>{week.label}</b><button aria-label="Next week" onClick={()=>setIndex(Math.min(weeks.length-1,index+1))}><ChevronRight/></button></div>
      <span className={`weekly-status ${statusClass}`}>{good?<Check/>:<AlertTriangle/>}{week.status}</span>
    </div>
    <div className="weekly-summary-grid">{summary.map(([label,value,tone])=><div className={label==='Expected ending balance'?'ending-metric':label==='Safe to spend'?'safe-metric':''} key={label}><span>{label}</span><strong className={tone}>{value}</strong></div>)}</div>
    <div className={`status-explanation ${statusClass}`}><span className="weekly-status-icon">{good?<Check/>:<AlertTriangle/>}</span><div><b>{week.status}</b><p>{week.description}</p></div><span className="formula-result">Projected ending {peso(ending)}</span></div>
    <div className="weekly-layout">
      <article className="surface forecast-surface"><div className="surface-title"><b>Daily projected balance</b><span>Safe to spend <strong className="positive">{peso(week.safe)}</strong></span></div>
        <svg className="wide-chart" viewBox="0 0 820 210"><path d="M40 52 L160 40 L280 47 L400 67 L520 88 L640 103 L780 112" fill="none" stroke={ending<0?'#e85e46':'#237451'} strokeWidth="3"/><path d="M40 52 L160 40 L280 47 L400 67 L520 88 L640 103 L780 112 L780 155 L40 155Z" fill={ending<0?'#f8dfd9':'#dceadf'} opacity=".75"/>{[40,160,280,400,520,640,780].map((x,i)=><g key={x}><line x1={x} y1="25" x2={x} y2="155" stroke="#dedbd2" strokeDasharray="3 4"/><circle cx={x} cy={[52,40,47,67,88,103,112][i]} r="5" fill="#fff" stroke={ending<0?'#e85e46':'#237451'} strokeWidth="2"/><text x={x} y="180" textAnchor="middle">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]}</text></g>)}</svg>
        <div className="day-events">{['Income','Bills','Card payment','Groceries','Utilities','Dining','Transport'].map((x,i)=><button key={x} onClick={()=>onNotice(`${x} activity selected`)}><i className={i===0?'income-dot':'expense-dot'}/>{x}</button>)}</div>
      </article>
      <aside className="surface commitment"><div className="surface-title"><b>Expected outflow</b></div>{[['Bills and expenses',week.expenses],['Credit card payments',week.cards],['Debt payments',week.debts],['Installment payments',week.installments],['Savings contributions',week.savings]].map(([label,value])=><button key={String(label)} onClick={()=>onNotice(`${label} selected`)}><span>{label}</span><strong className="negative">{peso(Number(value))}</strong></button>)}<div className="commit-total"><span>Total expected outflow</span><strong className="negative">{peso(outflow)}</strong></div><button className="outline" onClick={()=>setAdding(true)}><Plus/>Add commitment</button></aside>
    </div>
    <div className="forecast-formula"><div><b>Weekly forecast formula</b><p>Starting + confirmed income + collections − expenses − cards − debts − installments − savings</p></div><code>{peso(week.starting)} + {peso(week.expectedIncome)} + {peso(week.collections)} − {peso(outflow)} = <b>{peso(ending)}</b></code></div>
    <div className="status-key">{[['On Track','Payments are fully covered.'],['Attention Needed','Funds are close to commitments.'],['Shortfall','Balance cannot cover payments.'],['Extra Available','Additional disposable money remains.']].map(([label,text])=><button key={label} className={slug(label)} onClick={()=>onNotice(`${label}: ${text}`)}><i/><span><b>{label}</b><small>{text}</small></span></button>)}</div>
    {adding&&<div className="modal-backdrop" onMouseDown={()=>setAdding(false)}><section className="modal" role="dialog" aria-modal="true" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><h2>Add commitment</h2><p>Add a planned weekly outflow.</p></div><button className="icon-button" aria-label="Close" onClick={()=>setAdding(false)}>×</button></div><form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);onNotice(`${String(f.get('name'))} commitment added`);setAdding(false)}}><div className="form-grid"><label>Commitment name<input name="name" required autoFocus/></label><label>Type<select name="type"><option>Bill or expense</option><option>Credit card payment</option><option>Debt payment</option><option>Installment payment</option><option>Savings contribution</option></select></label></div><div className="form-grid"><label>Amount<input name="amount" type="number" min="0.01" required/></label><label>Due date<input name="date" type="date" defaultValue="2026-07-26" required/></label></div><label>Payment account<select><option>BPI Savings</option><option>Metrobank Savings</option><option>Cash</option></select></label><button className="primary submit"><Plus/>Add commitment</button></form></section></div>}
  </section>
}
