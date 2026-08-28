import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, CalendarClock, Check, CreditCard, Lightbulb, PiggyBank, Receipt, RefreshCw, ShoppingBasket, TrendingUp } from 'lucide-react'
import { useFirestoreState } from './hooks/useFirestoreState'
import { useWalletSnapshot } from './hooks/useWalletSnapshot'
import type { CategoryBudget } from './domain/planningEngine'
import { connectBudgetsToTransactions } from './utils/budgetSpending'
import { billUsesActiveCard, filterIncludedCardTransactions } from './utils/netBalanceFilters'

type Basis='Actual data'|'Forecast estimate'
type Insight={id:number;title:string;detail:string;evidence:string;basis:Basis;tone:'warning'|'positive'|'info';icon:typeof Receipt;action:string}
type Props={onNotice:(text:string)=>void}
type Wallet={accounts?:Array<{balance:number}>;accountTransactions?:Array<{date:string;type:string;category?:string;amount:number}>;transactions?:Array<{cardId:number|string;postedDate:string;transactionDate?:string;type:string;category?:string;amount:number;status:string}>;cards?:Array<{id:number|string;name:string;creditLimit:number;openingBalance:number;active?:boolean;includeInNetBalance?:boolean}>}
type Bill={id:number;sourceKey?:string;name:string;amount:number;dueDate:string;status:string;category:string}
type Plan={id:number;name:string;type:string;amount:number;date?:string;expectedDate?:string;archived?:boolean;status?:string}
const money=(n:number)=>`${n<0?'-':''}₱${Math.abs(n).toLocaleString('en-PH',{maximumFractionDigits:2})}`

export default function SmartInsights({onNotice}:Props){
  const [filter,setFilter]=useState<'All'|Basis>('All')
  const [dismissed,setDismissed]=useState<number[]>([])
  const [bills]=useFirestoreState<Bill[]>('bills',[])
  const [budgets]=useFirestoreState<CategoryBudget[]>('budgets',[])
  const [planning]=useFirestoreState<Plan[]>('planning',[])
  const [goals]=useFirestoreState<string[][]>('savingsGoals',[])
  const [wallet]=useWalletSnapshot<Wallet>({})

  const insights=useMemo<Insight[]>(()=>{
    const today=new Date();today.setHours(0,0,0,0)
    const currentMonth=today.toISOString().slice(0,7)
    const includedCardTransactions=filterIncludedCardTransactions(wallet.transactions??[],wallet.cards??[])
    const connectedBudgets=connectBudgetsToTransactions(budgets,{accountTransactions:wallet.accountTransactions,transactions:includedCardTransactions,cards:wallet.cards})
    const accountMonth=(wallet.accountTransactions??[]).filter(item=>item.date.startsWith(currentMonth))
    const cardMonth=includedCardTransactions.filter(item=>(item.transactionDate||item.postedDate).startsWith(currentMonth)&&item.status?.toLowerCase()==='posted')
    const income=accountMonth.filter(item=>item.type==='Income').reduce((sum,item)=>sum+Number(item.amount||0),0)
    const expenses=accountMonth.filter(item=>item.type==='Expense').reduce((sum,item)=>sum+Number(item.amount||0),0)+cardMonth.filter(item=>['purchase','installment','fee','interest'].includes(item.type.toLowerCase())).reduce((sum,item)=>sum+Number(item.amount||0),0)
    const generated:Insight[]=[]
    const budgetRisk=connectedBudgets.filter(item=>!item.archived&&item.allocated>0).sort((a,b)=>b.actual/b.allocated-a.actual/a.allocated)[0]
    if(budgetRisk&&budgetRisk.actual>budgetRisk.allocated)generated.push({id:1,title:`${budgetRisk.subcategory||budgetRisk.name} is over budget`,detail:`You have spent ${money(budgetRisk.actual)} against a ${money(budgetRisk.allocated)} budget.`,evidence:'Actual posted transactions connected to this budget category.',basis:'Actual data',tone:'warning',icon:ShoppingBasket,action:'View budget'})
    else if(budgetRisk&&budgetRisk.actual/budgetRisk.allocated>=.75)generated.push({id:2,title:`${budgetRisk.subcategory||budgetRisk.name} is nearing its limit`,detail:`This category has used ${Math.round(budgetRisk.actual/budgetRisk.allocated*100)}% of its budget.`,evidence:'Actual spending compared with budget allocation.',basis:'Actual data',tone:'warning',icon:ShoppingBasket,action:'Review category'})
    if(expenses>income&&income>0)generated.push({id:3,title:'Expenses are higher than income this month',detail:`Monthly expenses are ${money(expenses-income)} above recorded income.`,evidence:'Posted account and credit-card transactions for the current month.',basis:'Actual data',tone:'warning',icon:Receipt,action:'Open transactions'})
    if(income>expenses&&income>0)generated.push({id:4,title:'Positive monthly cash flow',detail:`Recorded income is ahead of expenses by ${money(income-expenses)} this month.`,evidence:'Current-month posted transactions.',basis:'Actual data',tone:'positive',icon:TrendingUp,action:'View report'})
    const upcomingBills=bills.filter(bill=>billUsesActiveCard(bill,wallet.cards??[])&&!['Paid','Skipped'].includes(bill.status)).sort((a,b)=>a.dueDate.localeCompare(b.dueDate))
    const nextBill=upcomingBills[0]
    if(nextBill)generated.push({id:5,title:`${nextBill.name.replace(/\s+statement$/i,'')} is upcoming`,detail:`${money(Number(nextBill.amount||0))} is scheduled on ${nextBill.dueDate}.`,evidence:'Bills & Payments schedule.',basis:'Forecast estimate',tone:'info',icon:CalendarClock,action:'Open bill'})
    const available=(wallet.accounts??[]).reduce((sum,account)=>sum+Number(account.balance||0),0)
    const plannedOut=planning.filter(item=>!item.archived&&item.status!=='Completed'&&item.type!=='Income').reduce((sum,item)=>sum+Number(item.amount||0),0)+upcomingBills.reduce((sum,bill)=>sum+Number(bill.amount||0),0)
    const plannedIn=planning.filter(item=>!item.archived&&item.status!=='Completed'&&item.type==='Income').reduce((sum,item)=>sum+Number(item.amount||0),0)
    if(available+plannedIn-plannedOut<0)generated.push({id:6,title:'Forecasted cash shortfall',detail:`Scheduled outflow may exceed available funds by ${money(Math.abs(available+plannedIn-plannedOut))}.`,evidence:'Available balance plus planning income minus upcoming bills and planned expenses.',basis:'Forecast estimate',tone:'warning',icon:AlertTriangle,action:'View forecast'})
    const highCard=(wallet.cards??[]).filter(card=>card.active!==false&&card.includeInNetBalance!==false&&card.creditLimit>0).map(card=>({...card,utilization:Number(card.openingBalance||0)/card.creditLimit*100})).sort((a,b)=>b.utilization-a.utilization)[0]
    if(highCard&&highCard.utilization>=50)generated.push({id:7,title:`${highCard.name} utilization is high`,detail:`This card is using ${Math.round(highCard.utilization)}% of its credit limit.`,evidence:'Credit-card balance and limit.',basis:'Actual data',tone:highCard.utilization>=80?'warning':'info',icon:CreditCard,action:'Open card'})
    if(goals.length)generated.push({id:8,title:'Savings goals are being tracked',detail:`You have ${goals.length} active savings ${goals.length===1?'goal':'goals'} in the app.`,evidence:'Savings goal records.',basis:'Actual data',tone:'positive',icon:PiggyBank,action:'Open savings'})
    return generated
  },[bills,budgets,goals,planning,wallet])

  const visible=insights.filter(i=>(filter==='All'||i.basis===filter)&&!dismissed.includes(i.id)),actual=insights.filter(i=>i.basis==='Actual data').length,forecast=insights.length-actual
  return <section className="feature-page smart-insights"><div className="fp-head"><div><h2>Smart Financial Insights</h2><p>Data-backed observations and estimates generated from your financial activity.</p></div><span className="insight-updated"><RefreshCw/>Updated from records and forecasts</span></div>
    <article className="insights-trust"><span><Lightbulb/></span><div><b>Every insight shows its basis</b><p><strong>Actual data</strong> comes from recorded transactions. <strong>Forecast estimates</strong> use scheduled income, payments, and current spending pace.</p></div></article>
    <div className="insight-toolbar"><div role="tablist"><button role="tab" aria-selected={filter==='All'} className={filter==='All'?'active':''} onClick={()=>setFilter('All')}>All <small>{insights.length-dismissed.length}</small></button><button role="tab" aria-selected={filter==='Actual data'} className={filter==='Actual data'?'active':''} onClick={()=>setFilter('Actual data')}>Actual data <small>{actual-dismissed.filter(id=>insights.find(i=>i.id===id)?.basis==='Actual data').length}</small></button><button role="tab" aria-selected={filter==='Forecast estimate'} className={filter==='Forecast estimate'?'active':''} onClick={()=>setFilter('Forecast estimate')}>Forecast estimates <small>{forecast-dismissed.filter(id=>insights.find(i=>i.id===id)?.basis==='Forecast estimate').length}</small></button></div><span>{visible.length} insights shown</span></div>
    <div className="insights-grid">{visible.map(item=>{const Icon=item.icon;return <article className={`surface insight-card ${item.tone}`} key={item.id}><div className="insight-card-head"><span className={`insight-card-icon ${item.tone}`}><Icon/></span><em className={item.basis==='Actual data'?'actual':'forecast'}>{item.basis==='Actual data'?<Check/>:<CalendarClock/>}{item.basis}</em></div><h3>{item.title}</h3><p>{item.detail}</p><div className="insight-evidence"><small>Based on</small><b>{item.evidence}</b></div><div className="insight-actions"><button onClick={()=>onNotice(item.action)}>{item.action}<ArrowRight/></button><button onClick={()=>setDismissed(current=>[...current,item.id])}>Dismiss</button></div></article>})}</div>
    {!visible.length&&<div className="surface insights-empty"><Check/><h3>No insights yet</h3><p>Add financial records to generate data-backed insights.</p></div>}
    <div className="insight-method"><AlertTriangle/><p>Insights support planning but are not guarantees. Forecast estimates change when expected income, bills, or planned payments change.</p></div>
  </section>
}
