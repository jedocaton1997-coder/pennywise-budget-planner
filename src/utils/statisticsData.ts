import { filterIncludedCardTransactions } from './netBalanceFilters'

export type StatisticsPeriod='30D'|'90D'|'12M'|'All'
export type StatisticsMeasure='Amount'|'Count'
export type StatisticsTrend='Area'|'Bar'|'Line'
export type StatisticsFocus='All'|'Expense'|'Income'

export type StatisticsWallet={
  accounts?:Array<{id:number|string;name:string;balance?:number}>
  cards?:Array<{id:number|string;name:string;active?:boolean;includeInNetBalance?:boolean}>
  accountTransactions?:Array<{id:number|string;accountId:number|string;date:string;description?:string;type:string;category?:string;amount:number;status?:string}>
  transactions?:Array<{id:number|string;cardId:number|string;transactionDate?:string;postedDate:string;description?:string;type:string;category?:string;amount:number;status:string}>
}

export type StatTransaction={
  id:string
  date:string
  type:'Income'|'Expense'
  category:string
  account:string
  amount:number
}

export type TrendBucket={key:string;label:string;income:number;expenses:number;incomeCount:number;expenseCount:number}
export type RankedStat={name:string;value:number;kind:'Income'|'Expense'|'Mixed';color:string;percentage:number}

const colors=['#17865b','#2f7de1','#ef6456','#e6a11d','#8a63d2','#0d9488','#64748b']
const dayMs=86_400_000

const iso=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
const parse=(value:string)=>new Date(`${value}T12:00:00`)
const monthKey=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`
const weekKey=(date:Date)=>{const start=new Date(date);start.setDate(date.getDate()-date.getDay());return iso(start)}
const labelForKey=(key:string,mode:'day'|'week'|'month'|'year')=>{
  if(mode==='year')return key
  const date=parse(mode==='month'?`${key}-01`:key)
  if(mode==='month')return date.toLocaleDateString('en-US',{month:'short',year:'2-digit'})
  if(mode==='week')return date.toLocaleDateString('en-US',{month:'short',day:'numeric'})
  return date.toLocaleDateString('en-US',{month:'short',day:'numeric'})
}
const categoryParent=(category:string)=>category.split('/').map(part=>part.trim()).filter(Boolean)[0]||'Uncategorized'
const isCreditCardCategory=(category:string)=>categoryParent(category).toLowerCase()==='credit card'

export function normalizeStatisticsTransactions(wallet:StatisticsWallet):StatTransaction[]{
  const accounts=wallet.accounts??[],cards=wallet.cards??[]
  const accountRows=(wallet.accountTransactions??[])
    .filter(transaction=>['Income','Expense'].includes(transaction.type)&&!['Deleted','Voided','Void','Duplicate'].includes(transaction.status??''))
    .map(transaction=>({
      id:`account-${transaction.id}`,
      date:transaction.date,
      type:transaction.type as 'Income'|'Expense',
      category:transaction.category?.trim()||'Uncategorized',
      account:accounts.find(account=>String(account.id)===String(transaction.accountId))?.name||'Unknown Account',
      amount:Number(transaction.amount||0),
    }))
  const cardRows=filterIncludedCardTransactions(wallet.transactions??[],cards)
    .filter(transaction=>transaction.status?.toLowerCase()==='posted'&&transaction.type.toLowerCase()!=='payment')
    .flatMap(transaction=>{
      const type=transaction.type.toLowerCase()
      const isExpense=['purchase','installment','fee','interest'].includes(type)
      const isIncome=['refund','credit'].includes(type)
      if(!isExpense&&!isIncome)return []
      return [{
        id:`card-${transaction.id}`,
        date:transaction.postedDate||transaction.transactionDate||'',
        type:isExpense?'Expense' as const:'Income' as const,
        category:transaction.category?.trim()||'Uncategorized',
        account:cards.find(card=>String(card.id)===String(transaction.cardId))?.name||'Unknown Account',
        amount:Number(transaction.amount||0),
      }]
    })
  return [...accountRows,...cardRows].filter(transaction=>transaction.date&&transaction.amount>0).sort((a,b)=>a.date.localeCompare(b.date))
}

export function filterTransactionsByPeriod(transactions:StatTransaction[],period:StatisticsPeriod){
  if(period==='All')return transactions
  const days=period==='30D'?30:period==='90D'?90:365
  const today=new Date();today.setHours(12,0,0,0)
  const start=new Date(today);start.setDate(today.getDate()-days+1)
  const startKey=iso(start),endKey=iso(today)
  return transactions.filter(transaction=>transaction.date>=startKey&&transaction.date<=endKey)
}

export function filterTransactionsByFocus(transactions:StatTransaction[],focus:StatisticsFocus){
  if(focus==='All')return transactions
  return transactions.filter(transaction=>transaction.type===focus)
}

export function calculateNetMovement(transactions:StatTransaction[]){
  return transactions.reduce((sum,transaction)=>sum+(transaction.type==='Income'?transaction.amount:-transaction.amount),0)
}

export function calculateTopCategory(transactions:StatTransaction[],measure:StatisticsMeasure):RankedStat|null{
  return rankBy(transactions,'category',measure,true)[0]??null
}

export function calculateBusiestAccount(transactions:StatTransaction[],measure:StatisticsMeasure):RankedStat|null{
  return rankBy(transactions,'account',measure,true)[0]??null
}

export function calculateCategoryBreakdown(transactions:StatTransaction[],measure:StatisticsMeasure,focus:StatisticsFocus){
  const relevant=focus==='Income'?transactions.filter(t=>t.type==='Income'):transactions.filter(t=>focus==='All'||t.type==='Expense')
  const ranked=rankBy(relevant,'category',measure,false)
  if(ranked.length<=6)return ranked
  const top=ranked.slice(0,6),otherRows=ranked.slice(6),otherValue=otherRows.reduce((sum,row)=>sum+row.value,0),total=ranked.reduce((sum,row)=>sum+row.value,0)
  return [...top,{name:'Other',value:otherValue,kind:'Mixed' as const,color:colors[6],percentage:total?otherValue/total*100:0}]
}

function rankBy(transactions:StatTransaction[],field:'category'|'account',measure:StatisticsMeasure,absolute:boolean):RankedStat[]{
  const rows=new Map<string,{income:number;expenses:number;incomeCount:number;expenseCount:number}>()
  transactions.forEach(transaction=>{
    const key=field==='category'?categoryParent(transaction.category):transaction[field]

    if(field==='category'&&isCreditCardCategory(key))return

    const row=rows.get(key)??{income:0,expenses:0,incomeCount:0,expenseCount:0}
    if(transaction.type==='Income'){row.income+=transaction.amount;row.incomeCount+=1}else{row.expenses+=transaction.amount;row.expenseCount+=1}
    rows.set(key,row)
  })
  const mapped=[...rows.entries()].map(([name,row],index)=>{
    const incomeValue=measure==='Amount'?row.income:row.incomeCount,expenseValue=measure==='Amount'?row.expenses:row.expenseCount
    const value=absolute?incomeValue+expenseValue:expenseValue||incomeValue
    const kind:RankedStat['kind']=row.income&&row.expenses?'Mixed':row.income?'Income':'Expense'
    return{name,value,kind,color:colors[index%colors.length],percentage:0}
  }).filter(row=>row.value>0).sort((a,b)=>b.value-a.value)
  const total=mapped.reduce((sum,row)=>sum+row.value,0)
  return mapped.map((row,index)=>({...row,color:colors[index%colors.length],percentage:total?row.value/total*100:0}))
}

export function groupTransactionsByDate(transactions:StatTransaction[],period:StatisticsPeriod):TrendBucket[]{
  const mode: 'day'|'week'|'month'|'year'=period==='30D'?'day':period==='90D'?'week':period==='12M'?'month':dateSpanDays(transactions)>900?'year':'month'
  const rows=new Map<string,TrendBucket>()
  transactions.forEach(transaction=>{
    const date=parse(transaction.date)
    const key=mode==='day'?transaction.date:mode==='week'?weekKey(date):mode==='month'?monthKey(date):String(date.getFullYear())
    const row=rows.get(key)??{key,label:labelForKey(key,mode),income:0,expenses:0,incomeCount:0,expenseCount:0}
    if(transaction.type==='Income'){row.income+=transaction.amount;row.incomeCount+=1}else{row.expenses+=transaction.amount;row.expenseCount+=1}
    rows.set(key,row)
  })
  return fillMissingBuckets([...rows.values()].sort((a,b)=>a.key.localeCompare(b.key)),mode,period,transactions)
}

function dateSpanDays(transactions:StatTransaction[]){
  if(!transactions.length)return 0
  return Math.round((parse(transactions.at(-1)!.date).getTime()-parse(transactions[0].date).getTime())/dayMs)
}

function fillMissingBuckets(existing:TrendBucket[],mode:'day'|'week'|'month'|'year',period:StatisticsPeriod,transactions:StatTransaction[]){
  if(!existing.length||period==='All')return existing
  const byKey=new Map(existing.map(row=>[row.key,row]))
  const today=new Date();today.setHours(12,0,0,0)
  const start=new Date(today)
  if(period==='30D')start.setDate(today.getDate()-29)
  else if(period==='90D')start.setDate(today.getDate()-89)
  else start.setMonth(today.getMonth()-11,1)
  const rows:TrendBucket[]=[]
  const cursor=new Date(start)
  while(cursor<=today){
    const key=mode==='day'?iso(cursor):mode==='week'?weekKey(cursor):mode==='month'?monthKey(cursor):String(cursor.getFullYear())
    if(!rows.some(row=>row.key===key))rows.push(byKey.get(key)??{key,label:labelForKey(key,mode),income:0,expenses:0,incomeCount:0,expenseCount:0})
    if(mode==='day')cursor.setDate(cursor.getDate()+1)
    else if(mode==='week')cursor.setDate(cursor.getDate()+7)
    else if(mode==='month')cursor.setMonth(cursor.getMonth()+1,1)
    else cursor.setFullYear(cursor.getFullYear()+1,0,1)
  }
  return rows
}

export function formatChartCurrency(value:number){
  const sign=value<0?'-':''
  const absolute=Math.abs(value)
  if(absolute>=1_000_000)return`${sign}₱${Number((absolute/1_000_000).toFixed(1))}M`
  if(absolute>=1_000)return`${sign}₱${Number((absolute/1_000).toFixed(1))}K`
  return`${sign}₱${absolute.toLocaleString('en-PH',{maximumFractionDigits:2})}`
}
