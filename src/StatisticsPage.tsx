import { useMemo, useState } from 'react'
import { AlertTriangle, BarChart3, CalendarClock, Check, LineChart, Lightbulb, PieChart, RefreshCw, ShieldCheck, TrendingDown, TrendingUp, WalletCards } from 'lucide-react'
import { useFirestoreState } from './hooks/useFirestoreState'
import { useWalletSnapshot } from './hooks/useWalletSnapshot'
import { billUsesIncludedCard } from './utils/netBalanceFilters'
import {
  calculateBusiestAccount,
  calculateCategoryBreakdown,
  calculateNetMovement,
  calculateTopCategory,
  filterTransactionsByFocus,
  filterTransactionsByPeriod,
  formatChartCurrency,
  groupTransactionsByDate,
  normalizeStatisticsTransactions,
  type RankedStat,
  type StatisticsFocus,
  type StatisticsMeasure,
  type StatisticsPeriod,
  type StatisticsTrend,
  type StatisticsWallet,
  type TrendBucket,
} from './utils/statisticsData'

const money=(value:number)=>`${value<0?'-':''}₱${Math.abs(value).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const periodOptions:StatisticsPeriod[]=['30D','90D','12M','All']
const measureOptions:StatisticsMeasure[]=['Amount','Count']
const trendOptions:StatisticsTrend[]=['Area','Bar','Line']
const focusOptions:StatisticsFocus[]=['All','Expense','Income']
type StatisticsBill={id:number;sourceKey?:string;name:string;category:string;amount:number;dueDate:string;status:string}
type StatisticsPlan={id:number;name:string;type:string;amount:number;date?:string;expectedDate?:string;dueDate?:string;category?:string;archived?:boolean;status?:string}
type ForecastSummary={available:number;expectedIncome:number;scheduledOutflow:number;savings:number;projectedEnding:number;upcomingCount:number;nextDue:StatisticsBill|null}
type InsightItem={title:string;detail:string;tone:'positive'|'warning'|'info';icon:typeof BarChart3}
const cleanStatus=(status:string)=>status.toLowerCase().trim()
const parseGoalAmount=(value:string|undefined)=>Number(String(value??'').replace(/[^0-9.-]/g,''))||0

export default function StatisticsPage(){
  const [period,setPeriod]=useState<StatisticsPeriod>('90D')
  const [measure,setMeasure]=useState<StatisticsMeasure>('Amount')
  const [trend,setTrend]=useState<StatisticsTrend>('Area')
  const [focus,setFocus]=useState<StatisticsFocus>('All')
  const [wallet,,ready,error]=useWalletSnapshot<StatisticsWallet>({accounts:[],cards:[],accountTransactions:[],transactions:[]})
  const [bills]=useFirestoreState<StatisticsBill[]>('bills',[])
  const [planning]=useFirestoreState<StatisticsPlan[]>('planning',[])
  const [savingsGoals]=useFirestoreState<string[][]>('savingsGoals',[])

  const stats=useMemo(()=>{
    const all=normalizeStatisticsTransactions(wallet)
    const periodRows=filterTransactionsByPeriod(all,period)
    const rows=filterTransactionsByFocus(periodRows,focus)
    const trendRows=groupTransactionsByDate(rows,period)
    const categoryRows=calculateCategoryBreakdown(rows,measure,focus)
    return{
      rows,
      trendRows,
      categoryRows,
      net:calculateNetMovement(rows),
      topCategory:calculateTopCategory(rows,measure),
      busiestAccount:calculateBusiestAccount(rows,measure),
    }
  },[focus,measure,period,wallet])

  const forecast=useMemo<ForecastSummary>(()=>{
    const available=(wallet.accounts??[]).reduce((sum,account)=>sum+Number(account.balance||0),0)
    const activeBills=bills
      .filter(bill=>billUsesIncludedCard(bill,wallet.cards??[]))
      .filter(bill=>!['paid','skipped','cancelled','canceled','deleted'].includes(cleanStatus(bill.status||'')))
      .sort((a,b)=>(a.dueDate||'').localeCompare(b.dueDate||''))
    const expectedIncome=planning
      .filter(item=>!item.archived&&cleanStatus(item.status||'')!=='completed'&&(item.type==='Income'||item.category==='Receivable collection'))
      .reduce((sum,item)=>sum+Number(item.amount||0),0)
    const plannedExpenses=planning
      .filter(item=>!item.archived&&cleanStatus(item.status||'')!=='completed'&&item.type!=='Income'&&item.category!=='Receivable collection')
      .reduce((sum,item)=>sum+Number(item.amount||0),0)
    const billOutflow=activeBills.reduce((sum,bill)=>sum+Number(bill.amount||0),0)
    const savings=savingsGoals.reduce((sum,goal)=>sum+parseGoalAmount(goal[5]),0)
    const scheduledOutflow=billOutflow+plannedExpenses+savings
    return{available,expectedIncome,scheduledOutflow,savings,projectedEnding:available+expectedIncome-scheduledOutflow,upcomingCount:activeBills.length,nextDue:activeBills[0]??null}
  },[bills,planning,savingsGoals,wallet.accounts,wallet.cards])

  const insights=useMemo<InsightItem[]>(()=>{
    const items:InsightItem[]=[]
    if(stats.net>0)items.push({title:'Positive movement in this view',detail:`Income is ahead of expenses by ${money(stats.net)} for the selected filters.`,tone:'positive',icon:TrendingUp})
    if(stats.net<0)items.push({title:'Expenses are higher in this view',detail:`Outflow is ahead of income by ${money(Math.abs(stats.net))} for the selected filters.`,tone:'warning',icon:TrendingDown})
    if(stats.topCategory)items.push({title:`Top category: ${stats.topCategory.name}`,detail:`This category represents ${stats.topCategory.percentage.toFixed(1)}% of the current ${measure.toLowerCase()} view.`,tone:'info',icon:PieChart})
    if(stats.busiestAccount)items.push({title:`Most active account: ${stats.busiestAccount.name}`,detail:`This account has the highest activity for the selected filters.`,tone:'info',icon:WalletCards})
    if(forecast.projectedEnding<0)items.push({title:'Forecasted cash shortfall',detail:`Scheduled items may exceed available funds by ${money(Math.abs(forecast.projectedEnding))}.`,tone:'warning',icon:AlertTriangle})
    else if(forecast.scheduledOutflow>0)items.push({title:'Forecast stays covered',detail:`After scheduled items, projected ending cash is ${money(forecast.projectedEnding)}.`,tone:'positive',icon:ShieldCheck})
    if(!items.length)items.push({title:'Add more activity to unlock insights',detail:'Statistics will generate smarter observations once transactions, bills, planning, and savings goals are connected.',tone:'info',icon:Lightbulb})
    return items.slice(0,5)
  },[forecast.projectedEnding,forecast.scheduledOutflow,measure,stats.busiestAccount,stats.net,stats.topCategory])

  const reset=()=>{setPeriod('90D');setMeasure('Amount');setTrend('Area');setFocus('All')}
  const empty=ready&&!error&&!stats.rows.length

  return <section className="feature-page statistics-page">
    <div className="fp-head statistics-head">
      <div><h2>Statistics</h2><p>Explore trends, categories, account performance, and insights from your transaction history with configurable charts.</p></div>
    </div>
    <StatisticsFilters period={period} measure={measure} trend={trend} focus={focus} onPeriod={setPeriod} onMeasure={setMeasure} onTrend={setTrend} onFocus={setFocus}/>
    {!ready?<StatisticsLoadingState/>:error?<StatisticsErrorState onRetry={()=>window.location.reload()}/>:<>
      {empty?<StatisticsEmptyState onReset={reset}/>:<>
        <StatisticSummaryGrid net={stats.net} count={stats.rows.length} topCategory={stats.topCategory} busiestAccount={stats.busiestAccount} measure={measure}/>
        <div className="statistics-chart-grid">
          <CashflowTrendCard buckets={stats.trendRows} measure={measure} trend={trend} focus={focus}/>
          <CategoryBreakdownCard rows={stats.categoryRows} measure={measure} focus={focus}/>
        </div>
      </>}
      <ForecastInsightGrid forecast={forecast} insights={insights}/>
    </>}
  </section>
}

function StatisticsFilters({period,measure,trend,focus,onPeriod,onMeasure,onTrend,onFocus}:{period:StatisticsPeriod;measure:StatisticsMeasure;trend:StatisticsTrend;focus:StatisticsFocus;onPeriod:(v:StatisticsPeriod)=>void;onMeasure:(v:StatisticsMeasure)=>void;onTrend:(v:StatisticsTrend)=>void;onFocus:(v:StatisticsFocus)=>void}){
  return <article className="surface statistics-filter-panel" aria-label="Statistics filters">
    <SegmentedControl label="Period" value={period} options={periodOptions} onChange={onPeriod}/>
    <SegmentedControl label="Measure" value={measure} options={measureOptions} onChange={onMeasure}/>
    <SegmentedControl label="Trend" value={trend} options={trendOptions} onChange={onTrend}/>
    <SegmentedControl label="Focus" value={focus} options={focusOptions} onChange={onFocus}/>
  </article>
}

function SegmentedControl<T extends string>({label,value,options,onChange}:{label:string;value:T;options:T[];onChange:(value:T)=>void}){
  return <div className="statistics-segment-group">
    <span>{label}</span>
    <div role="tablist" aria-label={label}>{options.map(option=><button key={option} role="tab" aria-selected={value===option} className={value===option?'active':''} onClick={()=>onChange(option)}>{option}</button>)}</div>
  </div>
}

function StatisticSummaryGrid({net,count,topCategory,busiestAccount,measure}:{net:number;count:number;topCategory:RankedStat|null;busiestAccount:RankedStat|null;measure:StatisticsMeasure}){
  return <div className="statistics-summary-grid">
    <StatisticSummaryCard label="Net Movement" value={money(net)} tone={net>0?'positive':net<0?'negative':'neutral'} icon={net>=0?TrendingUp:TrendingDown}/>
    <StatisticSummaryCard label="Transactions" value={String(count)} sub="Matching filters" icon={BarChart3}/>
    <StatisticSummaryCard label="Top Category" value={topCategory?.name??'—'} sub={topCategory?formatMeasure(topCategory.value,measure):'No category'} icon={PieChart}/>
    <StatisticSummaryCard label="Busiest Account" value={busiestAccount?.name??'—'} sub={busiestAccount?formatMeasure(busiestAccount.value,measure):'No account'} icon={WalletCards}/>
  </div>
}

function StatisticSummaryCard({label,value,sub='',tone='',icon:Icon}:{label:string;value:string;sub?:string;tone?:string;icon:typeof BarChart3}){
  return <article className={`surface statistic-summary-card ${tone}`}><span><Icon/></span><div><small>{label}</small><b>{value}</b>{sub&&<em>{sub}</em>}</div></article>
}

function CashflowTrendCard({buckets,measure,trend,focus}:{buckets:TrendBucket[];measure:StatisticsMeasure;trend:StatisticsTrend;focus:StatisticsFocus}){
  const values=buckets.flatMap(bucket=>[measure==='Amount'?bucket.income:bucket.incomeCount,measure==='Amount'?bucket.expenses:bucket.expenseCount])
  const max=Math.max(1,...values),width=760,height=290,left=54,right=730,top=28,bottom=238,plotWidth=right-left
  const x=(index:number)=>left+(plotWidth/Math.max(1,buckets.length-1))*index
  const y=(value:number)=>bottom-(value/max)*(bottom-top)
  const incomePoints=buckets.map((bucket,index)=>[x(index),y(measure==='Amount'?bucket.income:bucket.incomeCount)] as const)
  const expensePoints=buckets.map((bucket,index)=>[x(index),y(measure==='Amount'?bucket.expenses:bucket.expenseCount)] as const)
  const line=(points:readonly (readonly [number,number])[])=>points.map(([px,py],index)=>`${index?'L':'M'}${px} ${py}`).join(' ')
  const area=(points:readonly (readonly [number,number])[])=>`${line(points)} L${points.at(-1)?.[0]??left} ${bottom} L${points[0]?.[0]??left} ${bottom}Z`
  const shownIncome=focus!=='Expense',shownExpense=focus!=='Income'
  const tick=(value:number)=>measure==='Amount'?formatChartCurrency(value):String(Math.round(value))
  return <article className="surface statistics-chart-card trend-card">
    <div className="statistics-card-title"><div><small>Trend</small><h3>Cashflow and volume over time</h3></div><LineChart/></div>
    <div className="statistics-legend">{shownIncome&&<span><i className="income"/>Income</span>}{shownExpense&&<span><i className="expense"/>Expenses</span>}{focus==='All'&&<span><i className="net"/>Net movement</span>}</div>
    <div className="statistics-trend-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Statistics trend chart with ${buckets.length} periods`}>
        <title>Cashflow and volume over time</title>
        {[0,.25,.5,.75,1].map(ratio=>{const value=max*ratio,yy=y(value);return <g key={ratio}><line x1={left} x2={right} y1={yy} y2={yy}/><text x="6" y={yy+4}>{tick(value)}</text></g>})}
        {trend==='Area'&&shownIncome&&<path className="stat-area income-area" d={area(incomePoints)}/>}
        {trend==='Area'&&shownExpense&&<path className="stat-area expense-area" d={area(expensePoints)}/>}
        {trend==='Bar'&&buckets.map((bucket,index)=>{const center=x(index),bar=10,incomeValue=measure==='Amount'?bucket.income:bucket.incomeCount,expenseValue=measure==='Amount'?bucket.expenses:bucket.expenseCount;return <g key={bucket.key}>{shownIncome&&<rect className="income-bar" x={center-(shownExpense?bar+2:bar/2)} y={y(incomeValue)} width={bar} height={bottom-y(incomeValue)} rx="4"/>}{shownExpense&&<rect className="expense-bar" x={center+(shownIncome?2:-bar/2)} y={y(expenseValue)} width={bar} height={bottom-y(expenseValue)} rx="4"/>}</g>})}
        {trend!=='Bar'&&shownIncome&&<path className="stat-line income-line" d={line(incomePoints)}/>}
        {trend!=='Bar'&&shownExpense&&<path className="stat-line expense-line" d={line(expensePoints)}/>}
        {buckets.map((bucket,index)=>{const incomeValue=measure==='Amount'?bucket.income:bucket.incomeCount,expenseValue=measure==='Amount'?bucket.expenses:bucket.expenseCount,net=bucket.income-bucket.expenses,count=bucket.incomeCount+bucket.expenseCount;return <g key={`${bucket.key}-points`} tabIndex={0} className="stat-point"><title>{`${bucket.label} · Income ${formatMeasure(incomeValue,measure)} · Expenses ${formatMeasure(expenseValue,measure)} · Net ${money(net)} · ${count} transactions`}</title>{shownIncome&&<circle cx={x(index)} cy={y(incomeValue)} r="4" className="income-dot"/>}{shownExpense&&<circle cx={x(index)} cy={y(expenseValue)} r="4" className="expense-dot"/>}</g>})}
        {buckets.map((bucket,index)=><text key={`${bucket.key}-label`} x={x(index)} y="272" textAnchor="middle">{index%Math.ceil(Math.max(1,buckets.length/8))===0?bucket.label:''}</text>)}
      </svg>
    </div>
  </article>
}

function CategoryBreakdownCard({rows,measure,focus}:{rows:RankedStat[];measure:StatisticsMeasure;focus:StatisticsFocus}){
  const total=rows.reduce((sum,row)=>sum+row.value,0)
  let offset=0
  const title=focus==='Income'?'Income by category':focus==='All'?'Activity by category':'Spending by category'
  return <article className="surface statistics-chart-card category-card">
    <div className="statistics-card-title"><div><small>Breakdown</small><h3>{title}</h3></div><em>TOP 6</em></div>
    <div className="category-breakdown-layout">
      <svg className="statistics-donut" viewBox="0 0 220 220" role="img" aria-label={`${title} donut chart`}>
        <title>{title}</title>
        <circle cx="110" cy="110" r="72" className="donut-track"/>
        {rows.map(row=>{const dash=total?row.value/total*452.39:0,segment=<circle key={row.name} cx="110" cy="110" r="72" className="donut-segment" stroke={row.color} strokeDasharray={`${dash} ${452.39-dash}`} strokeDashoffset={-offset}/>;offset+=dash;return segment})}
        <text x="110" y="104" textAnchor="middle">Total</text>
        <text x="110" y="126" textAnchor="middle">{formatMeasure(total,measure)}</text>
      </svg>
      <div className="category-rank-list">{rows.length?rows.map(row=><div key={row.name}><span><i style={{background:row.color}}/><b title={row.name}>{row.name}</b></span><strong>{formatMeasure(row.value,measure)}</strong><small>{row.percentage.toFixed(1)}%</small></div>):<p className="empty-card">No category activity for this filter.</p>}</div>
    </div>
  </article>
}

function ForecastInsightGrid({forecast,insights}:{forecast:ForecastSummary;insights:InsightItem[]}){
  const healthy=forecast.projectedEnding>=0
  return <div className="statistics-forecast-insight-grid">
    <article className="surface statistics-forecast-card">
      <div className="statistics-card-title">
        <div><small>Forecast</small><h3>Projected cash position</h3></div>
        <em className={healthy?'safe':'warning'}>{healthy?<Check/>:<AlertTriangle/>}{healthy?'On track':'Shortfall risk'}</em>
      </div>
      <div className="statistics-mini-metrics">
        <div><span>Available cash</span><b>{money(forecast.available)}</b></div>
        <div><span>Expected income</span><b className="positive">+{money(forecast.expectedIncome)}</b></div>
        <div><span>Scheduled outflow</span><b className="negative">−{money(forecast.scheduledOutflow)}</b></div>
        <div><span>Projected ending</span><b className={forecast.projectedEnding<0?'negative':'positive'}>{money(forecast.projectedEnding)}</b></div>
      </div>
      <div className="statistics-forecast-note">
        <CalendarClock/>
        <p>{forecast.nextDue?<>Next scheduled item is <b>{forecast.nextDue.name.replace(/\s+statement$/i,'')}</b> for <b>{money(Number(forecast.nextDue.amount||0))}</b> on <b>{forecast.nextDue.dueDate}</b>.</>:<>No unpaid bills are currently scheduled. Add Bills & Payments or Planning items to enrich the forecast.</>} <span>{forecast.upcomingCount} open scheduled item{forecast.upcomingCount===1?'':'s'} included.</span></p>
      </div>
    </article>
    <article className="surface statistics-insights-card">
      <div className="statistics-card-title">
        <div><small>Insights</small><h3>Smart financial signals</h3></div>
        <Lightbulb/>
      </div>
      <div className="statistics-insight-list">
        {insights.map(item=>{const Icon=item.icon;return <div className={item.tone} key={item.title}><span><Icon/></span><p><b>{item.title}</b><small>{item.detail}</small></p></div>})}
      </div>
    </article>
  </div>
}

function StatisticsLoadingState(){
  return <div className="statistics-loading"><div className="statistics-summary-grid">{Array.from({length:4},(_,index)=><article className="surface statistic-summary-card skeleton" key={index}/>)}</div><div className="statistics-chart-grid"><article className="surface statistics-chart-card skeleton"/><article className="surface statistics-chart-card skeleton"/></div></div>
}

function StatisticsEmptyState({onReset}:{onReset:()=>void}){
  return <article className="surface statistics-state"><PieChart/><h3>No transaction data is available for the selected filters.</h3><button className="outline" onClick={onReset}>Reset Filters</button></article>
}

function StatisticsErrorState({onRetry}:{onRetry:()=>void}){
  return <article className="surface statistics-state error"><RefreshCw/><h3>We could not load your statistics. Please try again.</h3><button className="outline" onClick={onRetry}>Retry</button></article>
}

function formatMeasure(value:number,measure:StatisticsMeasure){
  return measure==='Amount'?money(value):`${value.toLocaleString('en-PH')} ${value===1?'transaction':'transactions'}`
}
