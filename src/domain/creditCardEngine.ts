export type DueDateRule='fixed-next-month'|'days-after-statement'|'manual'
export type MinimumPaymentType='fixed'|'percentage'|'higher-of'|'manual'
export type CardTransactionType='purchase'|'installment'|'fee'|'interest'|'refund'|'credit'|'payment'|'adjustment'
export type TransactionStatus='pending'|'posted'
export type StatementStatus='Open'|'Closed'|'Partially paid'|'Paid'|'Overdue'|'Adjusted'

export type CardConfig={
  id:number;bankId?:string|null;customLogo?:string;name:string;bank:string;last4:string;creditLimit:number;sharedLimitCardId?:number|null;openingBalance:number;color:string;linkedAccount:string;active:boolean;
  includeInNetBalance?:boolean|string|number;
  excludeFromNetBalance?:boolean|string|number;
  excludedFromNetBalance?:boolean|string|number;
  excludeFromNetWorth?:boolean|string|number;
  excludeFromCashFlow?:boolean|string|number;
  statementDay:number;dueDateRule:DueDateRule;fixedDueDay:number;daysAfterStatement:number;manualDueDate?:string;
  minimumType:MinimumPaymentType;minimumFixed:number;minimumPercentage:number;manualMinimum:number;
  interestRate:number;annualFee:number;autoPaymentEnabled:boolean;autoPaymentMethod:string;forecastPreference:'minimum'|'remaining'|'full'|'custom';customPlannedAmount:number;notes:string;
}
export type CardTransaction={id:number;cardId:number;type:CardTransactionType;description:string;category:string;amount:number;transactionDate:string;postedDate:string;status:TransactionStatus;statementId?:number;notes?:string;expenseCounted:boolean}
export type PaymentAllocation={statementId?:number;cycle:'statement'|'current-cycle'|'credit';amount:number;date:string}
export type CardPayment={id:number;cardId:number;account:string;date:string;amount:number;option:string;status:'Scheduled'|'Posted';notes:string;allocations:PaymentAllocation[]}
export type InstallmentPlan={id:number;cardId:number;description:string;originalAmount:number;downPayment:number;numberOfInstallments:number;installmentAmount:number;startDate:string;frequency:'Monthly';remainingInstallments:number;remainingPrincipal:number;status:'Active'|'Completed'}
export type CardStatement={id:number;cardId:number;cycleStart:string;cycleEnd:string;statementDate:string;dueDate:string;previousBalance:number;purchases:number;installments:number;fees:number;interest:number;paymentsBeforeClose:number;refunds:number;credits:number;statementBalance:number;minimumDue:number;remainingDue:number;paymentsApplied:number;status:StatementStatus;generatedAutomatically:boolean}
export type CardComputed={currentBalance:number;unbilledBalance:number;creditBalance:number;availableCredit:number;utilization:number;lastStatement?:CardStatement;currentCycleStart:string;nextStatementDate:string;nextDueDate:string;cycleTransactions:CardTransaction[];cyclePurchases:number;cycleInstallments:number;cycleFees:number;cycleInterest:number;cycleRefunds:number;cycleCredits:number;thisStatementSoFar:number;plannedPayment:number;paymentStatus:string}

const iso=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const parse=(value:string)=>new Date(`${value}T12:00:00`)
const addDays=(value:string,days:number)=>{const date=parse(value);date.setDate(date.getDate()+days);return iso(date)}
export function adjustToWeekday(value:string){const date=parse(value),day=date.getDay();if(day===6)date.setDate(date.getDate()-1);else if(day===0)date.setDate(date.getDate()+1);return iso(date)}
export const daysInMonth=(year:number,monthIndex:number)=>new Date(year,monthIndex+1,0).getDate()
export const dateForDay=(year:number,monthIndex:number,day:number)=>new Date(year,monthIndex,Math.min(day,daysInMonth(year,monthIndex)),12)
export function nextStatementDate(statementDay:number,from:string){const d=parse(from),raw=dateForDay(d.getFullYear(),d.getMonth(),statementDay),candidate=parse(adjustToWeekday(iso(raw)));return adjustToWeekday(iso(candidate<d?dateForDay(d.getFullYear(),d.getMonth()+1,statementDay):raw))}
export function previousStatementDate(statementDay:number,fromStatementDate:string){const current=parse(fromStatementDate);return adjustToWeekday(iso(dateForDay(current.getFullYear(),current.getMonth()-1,statementDay)))}
export const statementCutoffDate=(statementDate:string)=>addDays(statementDate,-1)
export function latestClosedStatementDate(statementDay:number,today=iso(new Date())){const d=parse(today),raw=dateForDay(d.getFullYear(),d.getMonth(),statementDay),candidate=adjustToWeekday(iso(raw));return parse(candidate)<=d?candidate:adjustToWeekday(iso(dateForDay(d.getFullYear(),d.getMonth()-1,statementDay)))}
export function isSecurityBankCard(card:Pick<CardConfig,'bank'|'bankId'>){return card.bankId==='security-bank'||/security\s*bank/i.test(card.bank||'')}
export function ensureDueDateAfterStatement(statementDate:string,dueDate:string){
  const statement=parse(statementDate),due=parse(dueDate)
  if(Number.isNaN(statement.getTime())||Number.isNaN(due.getTime()))return dueDate
  // A payment due date belongs to the statement it follows. Legacy/manual
  // dates can be left in an earlier month; keep their chosen day, but advance
  // it until it is after the statement rather than displaying a backwards
  // billing sequence.
  while(due<=statement)due.setMonth(due.getMonth()+1)
  return adjustToWeekday(iso(due))
}
export function calculateDueDate(card:CardConfig,statementDate:string){const s=parse(statementDate);if(card.dueDateRule==='manual')return ensureDueDateAfterStatement(statementDate,card.manualDueDate||statementDate);if(card.dueDateRule==='days-after-statement'||isSecurityBankCard(card)){s.setDate(s.getDate()+(isSecurityBankCard(card)?21:card.daysAfterStatement));return ensureDueDateAfterStatement(statementDate,iso(s))}return ensureDueDateAfterStatement(statementDate,iso(dateForDay(s.getFullYear(),s.getMonth()+1,card.fixedDueDay)))}
export function minimumDue(card:CardConfig,balance:number){const configuredFixed=Number(card.minimumFixed||0),configuredPercentage=Number(card.minimumPercentage||0),configuredManual=Number(card.manualMinimum||0),fixed=configuredFixed>0?configuredFixed:500,pct=balance*(configuredPercentage>0?configuredPercentage:3)/100;if(balance<=0)return 0;if(card.minimumType==='percentage')return Math.min(balance,pct);if(card.minimumType==='manual'&&configuredManual>0)return Math.min(balance,configuredManual);if(card.minimumType==='fixed')return Math.min(balance,fixed);return Math.min(balance,Math.max(fixed,pct))}
export function reconciledStatementDue(statementBalance:number,savedPayments=0,ledgerPayments=0){return Math.max(0,Number(statementBalance||0)-Math.max(Number(savedPayments||0),Number(ledgerPayments||0)))}
export function reconciledStatementStatus(remainingDue:number,paymentsApplied=0):StatementStatus{return remainingDue<=0?'Paid':paymentsApplied>0?'Partially paid':'Closed'}
export function allocatedPaymentsForStatement(payments:CardPayment[],statementId:number|string){return payments.reduce((total,payment)=>total+(payment.allocations??[]).filter(allocation=>allocation.cycle==='statement'&&String(allocation.statementId)===String(statementId)).reduce((sum,allocation)=>sum+Number(allocation.amount||0),0),0)}
const signed=(t:CardTransaction)=>['refund','credit','payment'].includes(t.type)?-t.amount:t.amount
const sameCard=(left:unknown,right:unknown)=>String(left)===String(right)
const isPosted=(value:unknown)=>String(value||'').toLowerCase()==='posted'
const activityDate=(transaction:CardTransaction)=>transaction.postedDate||transaction.transactionDate
const amountKey=(value:number)=>Number(value||0).toFixed(2)
const paymentDedupKey=(payment:CardPayment)=>{
  const marker=String(payment.notes||'').match(/(?:bill-payment|card-payment):[^·]+/)?.[0]
  return marker||`${payment.cardId}|${payment.date}|${amountKey(payment.amount)}`
}
const uniquePostedPayments=(payments:CardPayment[])=>{
  const seen=new Set<string>()
  return payments.filter(payment=>{
    if(!isPosted(payment.status))return false
    const key=paymentDedupKey(payment)
    if(seen.has(key))return false
    seen.add(key)
    return true
  })
}
export function statementFromCycle(card:CardConfig,transactions:CardTransaction[],cycleStart:string,statementDate:string,previousUnpaid=0,id=Date.now()):CardStatement{
  const closedStatementDate=adjustToWeekday(statementDate),end=statementCutoffDate(closedStatementDate),eligible=transactions.filter(t=>{const date=activityDate(t);return sameCard(t.cardId,card.id)&&isPosted(t.status)&&date>=cycleStart&&date<=end})
  const sum=(type:CardTransactionType)=>eligible.filter(t=>t.type===type).reduce((n,t)=>n+t.amount,0)
  const purchases=sum('purchase'),installments=sum('installment'),fees=sum('fee'),interest=sum('interest'),payments=0,refunds=sum('refund'),credits=sum('credit')
  const raw=previousUnpaid+purchases+installments+fees+interest-payments-refunds-credits,statementBalance=Math.max(0,raw)
  return {id,cardId:card.id,cycleStart,cycleEnd:end,statementDate:closedStatementDate,dueDate:calculateDueDate(card,closedStatementDate),previousBalance:previousUnpaid,purchases,installments,fees,interest,paymentsBeforeClose:payments,refunds,credits,statementBalance,minimumDue:minimumDue(card,statementBalance),remainingDue:statementBalance,paymentsApplied:0,status:'Closed',generatedAutomatically:true}
}
export function paymentStatus(statement:CardStatement|undefined,today='2026-07-20'){if(!statement||statement.remainingDue<=0)return statement?.status==='Paid'?'Paid':'No payment due';const delta=Math.ceil((parse(statement.dueDate).getTime()-parse(today).getTime())/86400000);if(delta<0)return'Overdue';if(statement.paymentsApplied>0)return'Partially paid';if(delta===0)return'Due today';if(delta===1)return'Due tomorrow';if(delta<=7)return'Due soon';return'Upcoming'}
export function applyPayment(statements:CardStatement[],amount:number,date:string,currentCycleBalance:number){let remaining=amount;const allocations:PaymentAllocation[]=[];const updated=[...statements].sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).map(s=>({...s}));for(const s of updated){if(remaining<=0||s.remainingDue<=0)continue;const applied=Math.min(remaining,s.remainingDue);s.remainingDue-=applied;s.paymentsApplied+=applied;remaining-=applied;s.status=s.remainingDue===0?'Paid':'Partially paid';allocations.push({statementId:s.id,cycle:'statement',amount:applied,date})}if(remaining>0&&currentCycleBalance>0){const applied=Math.min(remaining,currentCycleBalance);remaining-=applied;allocations.push({cycle:'current-cycle',amount:applied,date})}if(remaining>0)allocations.push({cycle:'credit',amount:remaining,date});return{statements:updated,allocations,credit:remaining}}
export function computeCard(card:CardConfig,transactions:CardTransaction[],statements:CardStatement[],payments:CardPayment[],today='2026-07-20',reservedInstallmentCredit=0):CardComputed{
  const posted=transactions.filter(t=>sameCard(t.cardId,card.id)&&isPosted(t.status)),paymentTotal=uniquePostedPayments(payments).filter(p=>sameCard(p.cardId,card.id)).reduce((n,p)=>n+p.amount,0)
  const transactionBalance=posted.filter(t=>t.type!=='payment').reduce((n,t)=>n+signed(t),0),rawLedgerBalance=card.openingBalance+transactionBalance-paymentTotal
  const storedLastStatement=[...statements].filter(s=>sameCard(s.cardId,card.id)).sort((a,b)=>b.statementDate.localeCompare(a.statementDate))[0]
  const latestStatementDate=latestClosedStatementDate(card.statementDay,today)
  const lastStatement=storedLastStatement&&storedLastStatement.statementDate>=latestStatementDate
    ? storedLastStatement
    : statementFromCycle(card,transactions,previousStatementDate(card.statementDay,latestStatementDate),latestStatementDate,storedLastStatement?.remainingDue??0,storedLastStatement?.id??Date.now())
  const nextStatement=nextStatementDate(card.statementDay,lastStatement?addDays(lastStatement.statementDate,1):today)
  const cycleStart=lastStatement?addDays(lastStatement.cycleEnd,1):previousStatementDate(card.statementDay,nextStatement)
  const cycleEnd=statementCutoffDate(nextStatement)
  const cycleTransactions=posted.filter(t=>{const date=activityDate(t);return date>=cycleStart&&date<=cycleEnd&&date<=today&&t.type!=='payment'}),sum=(type:CardTransactionType)=>cycleTransactions.filter(t=>t.type===type).reduce((n,t)=>n+t.amount,0)
  const cyclePurchases=sum('purchase'),cycleInstallments=sum('installment'),cycleFees=sum('fee'),cycleInterest=sum('interest'),cycleRefunds=sum('refund'),cycleCredits=sum('credit'),thisStatementSoFar=Math.max(0,cyclePurchases+cycleInstallments+cycleFees+cycleInterest-cycleRefunds-cycleCredits)
  const currentCyclePayments=uniquePostedPayments(payments)
    .filter(payment=>sameCard(payment.cardId,card.id))
    .flatMap(payment=>payment.allocations??[])
    .filter(allocation=>allocation.cycle==='current-cycle'&&allocation.date>=cycleStart&&allocation.date<=today)
    .reduce((total,allocation)=>total+Number(allocation.amount||0),0)
  const unbilledBalance=Math.max(0,thisStatementSoFar-currentCyclePayments)
  const statementDue=Math.max(0,Number(lastStatement?.remainingDue||0))
  const currentBalance=statementDue+unbilledBalance
  const positive=Math.max(currentBalance,0),remaining=lastStatement?.remainingDue||0,planned=card.forecastPreference==='minimum'?(lastStatement?.minimumDue||0):card.forecastPreference==='full'?positive:card.forecastPreference==='custom'?card.customPlannedAmount:remaining
  return{currentBalance,unbilledBalance,creditBalance:Math.max(-rawLedgerBalance,0),availableCredit:Math.max(0,card.creditLimit-positive-reservedInstallmentCredit),utilization:card.creditLimit?positive/card.creditLimit*100:0,lastStatement,currentCycleStart:cycleStart,nextStatementDate:nextStatement,nextDueDate:calculateDueDate(card,nextStatement),cycleTransactions,cyclePurchases,cycleInstallments,cycleFees,cycleInterest,cycleRefunds,cycleCredits,thisStatementSoFar,plannedPayment:Math.min(planned,positive),paymentStatus:paymentStatus(lastStatement,today)}
}
export const utilizationBand=(value:number)=>value>=80?'Critical':value>=50?'High':value>=30?'Moderate':'Good'
export const peso=(value:number)=>`${value<0?'−':''}₱${Math.abs(value).toLocaleString(undefined,{maximumFractionDigits:2})}`
export function createInstallmentSchedule(plan:InstallmentPlan,category='Installments'){return Array.from({length:plan.numberOfInstallments},(_,index)=>{const start=parse(plan.startDate),chargeDate=dateForDay(start.getFullYear(),start.getMonth()+index,start.getDate());return{id:plan.id+index+1,cardId:plan.cardId,type:'installment' as const,description:`${plan.description} · ${index+1}/${plan.numberOfInstallments}`,category,amount:plan.installmentAmount,transactionDate:iso(chargeDate),postedDate:iso(chargeDate),status:(index===0?'posted':'pending') as TransactionStatus,notes:`Installment plan ${plan.id}`,expenseCounted:true}})}
