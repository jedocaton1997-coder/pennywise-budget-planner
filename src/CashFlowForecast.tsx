import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarRange, Check, ChevronRight, Info, TrendingDown, TrendingUp } from 'lucide-react'
import { useFirestoreState } from './hooks/useFirestoreState'
import { useWalletSnapshot } from './hooks/useWalletSnapshot'
import { billUsesActiveCard } from './utils/netBalanceFilters'

type Point={date:string;key:string;beginning:number;income:number;bills:number;expenses:number;cards:number;savings:number;ending:number;reason?:string}
type Horizon='Seven days'|'Four weeks'|'Three months'|'Six months'|'Twelve months'
type Bill={id:number;sourceKey?:string;name:string;category:string;amount:number;dueDate:string;status:string}
type Plan={id:number;name:string;type:string;amount:number;date?:string;expectedDate?:string;dueDate?:string;category?:string;archived?:boolean;status?:string}
type Wallet={accounts?:Array<{balance:number}>;cards?:Array<{id:number|string;name?:string;active?:boolean;includeInNetBalance?:boolean}>;accountTransactions?:Array<{date:string;type:string;amount:number;category?:string}>;transactions?:Array<{postedDate:string;type:string;amount:number;status:string;category?:string}>}
type Event={date:string;type:'income'|'bill'|'expense'|'card'|'savings';amount:number;name:string}

const horizons:Horizon[]=['Seven days','Four weeks','Three months','Six months','Twelve months']
const horizonDays:Record<Horizon,number>={'Seven days':7,'Four weeks':28,'Three months':92,'Six months':184,'Twelve months':366}
const iso=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
const addDays=(date:Date,days:number)=>new Date(date.getFullYear(),date.getMonth(),date.getDate()+days,12)
const money=(n:number)=>`${n<0?'−':''}₱${Math.abs(n).toLocaleString('en-PH',{maximumFractionDigits:2})}`

function pointLabel(date:Date,horizon:Horizon){
  if(['Three months','Six months','Twelve months'].includes(horizon))return date.toLocaleDateString('en-US',{month:'short'})
  return date.toLocaleDateString('en-US',{month:'short',day:'numeric'})
}

function createPointDates(horizon:Horizon){
  const today=new Date()
  today.setHours(12,0,0,0)
  const days=horizonDays[horizon]
  if(horizon==='Seven days')return Array.from({length:7},(_,index)=>addDays(today,index))
  if(horizon==='Four weeks')return Array.from({length:5},(_,index)=>addDays(today,index*7))
  const months=horizon==='Three months'?3:horizon==='Six months'?6:12
  return Array.from({length:months},(_,index)=>new Date(today.getFullYear(),today.getMonth()+index,1,12))
}

export default function CashFlowForecast(){
  const [horizon,setHorizon]=useState<Horizon>('Four weeks')
  const [selected,setSelected]=useState(0)
  const [bills]=useFirestoreState<Bill[]>('bills',[])
  const [planning]=useFirestoreState<Plan[]>('planning',[])
  const [savingsGoals]=useFirestoreState<string[][]>('savingsGoals',[])
  const [wallet]=useWalletSnapshot<Wallet>({})

  const data=useMemo<Point[]>(()=>{
    const dates=createPointDates(horizon)
    const startKey=iso(dates[0])
    const endKey=iso(addDays(dates.at(-1)!,horizon==='Four weeks'?6:0))
    const events:Event[]=[
      ...bills.filter(bill=>billUsesActiveCard(bill,wallet.cards??[])&&!['Paid','Skipped'].includes(bill.status)).map(bill=>({date:bill.dueDate,type:/credit\s*card/i.test(bill.category)?'card':'bill' as Event['type'],amount:Number(bill.amount||0),name:bill.name})),
      ...planning.filter(item=>!item.archived&&item.status!=='Completed').map(item=>{const type=item.type==='Income'||item.category==='Receivable collection'?'income':item.type==='Savings contribution'?'savings':'expense';return{date:item.date||item.expectedDate||item.dueDate||'',type:type as Event['type'],amount:Number(item.amount||0),name:item.name}}),
      ...savingsGoals.map(goal=>({date:goal[4]||'',type:'savings' as Event['type'],amount:Number(String(goal[5]||'').replace(/[^0-9.-]/g,''))||0,name:goal[0]})),
    ].filter(event=>event.date>=startKey&&event.date<=endKey&&event.amount>0)
    let running=(wallet.accounts??[]).reduce((sum,account)=>sum+Number(account.balance||0),0)
    return dates.map((date,index)=>{
      const key=iso(date),nextKey=index<dates.length-1?iso(dates[index+1]):iso(addDays(date,horizon==='Four weeks'?6:30))
      const monthMode=['Three months','Six months','Twelve months'].includes(horizon)
      const bucket=events.filter(event=>monthMode?event.date.slice(0,7)===key.slice(0,7):event.date>=key&&event.date<nextKey)
      const beginning=running,income=bucket.filter(event=>event.type==='income').reduce((sum,event)=>sum+event.amount,0),billsTotal=bucket.filter(event=>event.type==='bill').reduce((sum,event)=>sum+event.amount,0),expenses=bucket.filter(event=>event.type==='expense').reduce((sum,event)=>sum+event.amount,0),cards=bucket.filter(event=>event.type==='card').reduce((sum,event)=>sum+event.amount,0),savings=bucket.filter(event=>event.type==='savings').reduce((sum,event)=>sum+event.amount,0)
      running=beginning+income-billsTotal-expenses-cards-savings
      const biggest=bucket.filter(event=>event.type!=='income').sort((a,b)=>b.amount-a.amount)[0]
      return{date:pointLabel(date,horizon),key,beginning,income,bills:billsTotal,expenses,cards,savings,ending:running,reason:running<0&&biggest?`${biggest.name} and scheduled payments exceed available funds before the next income.`:undefined}
    })
  },[bills,horizon,planning,savingsGoals,wallet])

  const point=data[selected]??data[0],shortfall=data.find(p=>p.ending<0)
  if(!point)return <section className="feature-page cash-forecast"><div className="fp-head"><div><h2>Cash-Flow Forecast</h2><p>See how scheduled money movement changes your projected balance.</p></div></div><div className="forecast-horizons" role="tablist">{horizons.map(v=><button role="tab" aria-selected={horizon===v} className={horizon===v?'active':''} onClick={()=>{setHorizon(v);setSelected(0)}} key={v}>{v}</button>)}</div><article className="surface"><p className="empty-card">No forecast data yet. Add accounts, planned income, and payments to generate a forecast.</p></article></section>
  const ys=data.map(p=>p.ending),min=Math.min(...ys,0),max=Math.max(...ys,1),coords=data.map((p,i)=>({x:45+i*(710/Math.max(1,data.length-1)),y:35+(max-p.ending)/(max-min||1)*145,p})),path=coords.map((c,i)=>`${i?'L':'M'}${c.x} ${c.y}`).join(' '),zeroY=35+max/(max-min||1)*145
  return <section className="feature-page cash-forecast"><div className="fp-head"><div><h2>Cash-Flow Forecast</h2><p>See how scheduled money movement changes your projected balance.</p></div><span className={`forecast-health ${shortfall?'warning':'safe'}`}>{shortfall?<AlertTriangle/>:<Check/>}{shortfall?'Shortfall detected':'Balance stays positive'}</span></div>
    <div className="forecast-horizons" role="tablist">{horizons.map(v=><button role="tab" aria-selected={horizon===v} className={horizon===v?'active':''} onClick={()=>{setHorizon(v);setSelected(0)}} key={v}>{v}</button>)}</div>
    {shortfall?<article className="shortfall-banner"><span><AlertTriangle/></span><div><b>Projected shortfall of {money(Math.abs(shortfall.ending))} on {shortfall.date}</b><p>{shortfall.reason||'Scheduled outflows exceed available income before the next deposit.'}</p></div><button onClick={()=>setSelected(data.indexOf(shortfall))}>View date<ChevronRight/></button></article>:<article className="positive-banner"><span><Check/></span><div><b>No projected shortfall in this period</b><p>Confirmed income covers all scheduled payments and savings transfers.</p></div></article>}
    <div className="forecast-grid"><article className="surface timeline-panel"><div className="surface-title"><div><b>Projected balance</b><small>{horizon} · bills, planning, and savings goals</small></div><div className="forecast-legend"><span><i/>Positive</span><span><i/>Below zero</span></div></div><div className="forecast-chart"><svg viewBox="0 0 800 225" role="img" aria-label={`${horizon} projected balance timeline`}><line x1="35" x2="770" y1={zeroY} y2={zeroY} className="zero-line"/><path d={`${path} L${coords.at(-1)?.x} 190 L45 190Z`} className="forecast-area"/><path d={path} className="forecast-line"/>{coords.map((c,i)=><g key={`${c.p.key}-${i}`} onClick={()=>setSelected(i)} className={selected===i?'selected':''}><line x1={c.x} x2={c.x} y1="25" y2="190" className="guide"/><circle cx={c.x} cy={c.y} r="6" className={c.p.ending<0?'short':''}/><text x={c.x} y="214" textAnchor="middle">{c.p.date}</text></g>)}</svg></div><div className="forecast-events">{data.map((p,i)=><button className={`${selected===i?'selected':''} ${p.ending<0?'negative':''}`} onClick={()=>setSelected(i)} key={`${p.key}-${i}`}><span>{p.date}</span><b>{money(p.ending)}</b></button>)}</div></article>
      <aside className="surface forecast-detail"><div className="forecast-detail-head"><span><CalendarRange/></span><div><small>Forecast details</small><h3>{point.date}</h3></div></div><div className="balance-equation"><div><span>Beginning balance</span><b>{money(point.beginning)}</b></div><i>→</i><div><span>Ending balance</span><b className={point.ending<0?'negative':''}>{money(point.ending)}</b></div></div><div className="flow-breakdown"><div className="incoming"><TrendingUp/><span><small>Income</small><b>+{money(point.income)}</b></span></div>{[['Bills',point.bills],['Expenses',point.expenses],['Credit card payments',point.cards],['Savings transfers',point.savings]].map(([label,value])=><div key={String(label)}><TrendingDown/><span><small>{label}</small><b>−{money(Number(value))}</b></span></div>)}</div><div className="forecast-formula"><Info/><span><b>Forecast calculation</b><small>Beginning + income − bills − expenses − card payments − savings</small></span></div>{point.ending<0&&<div className="detail-warning"><AlertTriangle/><span><b>Balance falls below zero</b><small>{point.reason||'Review scheduled payments for this date.'}</small></span></div>}</aside>
    </div>
  </section>
}
