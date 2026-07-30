import type { CategoryBudget } from '../domain/planningEngine'
import { filterIncludedCardTransactions } from './netBalanceFilters'

export type BudgetWallet = {
  accountTransactions?: Array<{date:string;type:string;category?:string;amount:number;status?:string}>
  transactions?: Array<{cardId:number|string;transactionDate?:string;postedDate:string;type:string;category?:string;amount:number;status:string}>
  cards?: Array<{id:number|string;active?:boolean;includeInNetBalance?:boolean}>
}

const normalized=(value:string)=>value.toLowerCase().replace(/\s*\/\s*/g,' / ').replace(/\s+/g,' ').trim()

function belongsToBudget(category:string,budget:CategoryBudget){
  const value=normalized(category),parent=normalized(budget.parent||budget.name),subcategory=normalized(budget.subcategory||'')
  if(subcategory)return value===`${parent} / ${subcategory}`||value===subcategory
  return value===parent||value.startsWith(`${parent} / `)
}

export function spentForBudget(budget:CategoryBudget,wallet:BudgetWallet){
  const inPeriod=(date:string)=>date>=budget.start&&date<=budget.end
  const accountSpend=(wallet.accountTransactions??[]).filter(transaction=>transaction.type==='Expense'&&inPeriod(transaction.date)&&belongsToBudget(transaction.category??'',budget)).reduce((sum,transaction)=>sum+Number(transaction.amount||0),0)
  const cardTransactions=wallet.cards?filterIncludedCardTransactions(wallet.transactions??[],wallet.cards):wallet.transactions??[]
  const cardSpend=cardTransactions.filter(transaction=>transaction.status.toLowerCase()==='posted'&&['purchase','installment','fee','interest'].includes(transaction.type.toLowerCase())&&inPeriod(transaction.transactionDate||transaction.postedDate)&&belongsToBudget(transaction.category??'',budget)).reduce((sum,transaction)=>sum+Number(transaction.amount||0),0)
  return accountSpend+cardSpend
}

export function connectBudgetsToTransactions(budgets:CategoryBudget[],wallet:BudgetWallet){
  return budgets.map(budget=>({...budget,actual:spentForBudget(budget,wallet)}))
}
