import type { CategoryBudget } from '../domain/planningEngine'
import { filterIncludedCardTransactions } from './netBalanceFilters'

export type BudgetWallet = {
  accounts?: Array<{id:number|string;name?:string;institution?:string}>
  accountTransactions?: Array<{id?:number|string;accountId?:number|string;date:string;description?:string;type:string;category?:string;amount:number;status?:string}>
  transactions?: Array<{id?:number|string;cardId:number|string;transactionDate?:string;postedDate:string;description?:string;type:string;category?:string;amount:number;status:string}>
  cards?: Array<{id:number|string;name?:string;institution?:string;active?:boolean;includeInNetBalance?:boolean}>
}

export type BudgetTransactionBreakdown = {
  id:string
  date:string
  description:string
  amount:number
  account:string
  accountKind:'Bank account'|'Credit card'
}

const normalized=(value:string)=>value.toLowerCase().replace(/\s*\/\s*/g,' / ').replace(/\s+/g,' ').trim()
const excludedBudgetCategories=new Set(['credit card','credit cards','credit card payment','credit card payments','card payment','card payments'])

export function isExcludedBudgetCategory(value:string=''){
  const clean=normalized(value)
  const parent=clean.split(' / ')[0]||clean
  return excludedBudgetCategories.has(clean)||excludedBudgetCategories.has(parent)
}

function belongsToBudget(category:string,budget:CategoryBudget){
  const value=normalized(category),parent=normalized(budget.parent||budget.name),subcategory=normalized(budget.subcategory||'')
  if(isExcludedBudgetCategory(value)||isExcludedBudgetCategory(parent))return false
  if(subcategory)return value===`${parent} / ${subcategory}`||value===subcategory
  return value===parent||value.startsWith(`${parent} / `)
}

export function transactionsForBudget(budget:CategoryBudget,wallet:BudgetWallet):BudgetTransactionBreakdown[]{
  if(isExcludedBudgetCategory(budget.parent||budget.name))return[]
  const inPeriod=(date:string)=>date>=budget.start&&date<=budget.end
  const accountSpend=(wallet.accountTransactions??[])
    .filter(transaction=>transaction.type==='Expense'&&inPeriod(transaction.date)&&belongsToBudget(transaction.category??'',budget))
    .map((transaction,index)=>{
      const account=(wallet.accounts??[]).find(item=>String(item.id)===String(transaction.accountId))
      return{
        id:`account-${String(transaction.id??index)}-${transaction.date}`,
        date:transaction.date,
        description:transaction.description||transaction.category||'Expense',
        amount:Number(transaction.amount||0),
        account:account?.name||account?.institution||'Bank account',
        accountKind:'Bank account' as const,
      }
    })
  const cardTransactions=wallet.cards?filterIncludedCardTransactions(wallet.transactions??[],wallet.cards):wallet.transactions??[]
  const cardSpend=cardTransactions
    .filter(transaction=>transaction.status.toLowerCase()==='posted'&&['purchase','installment','fee','interest'].includes(transaction.type.toLowerCase())&&inPeriod(transaction.transactionDate||transaction.postedDate)&&belongsToBudget(transaction.category??'',budget))
    .map((transaction,index)=>{
      const card=(wallet.cards??[]).find(item=>String(item.id)===String(transaction.cardId))
      return{
        id:`card-${String(transaction.id??index)}-${transaction.transactionDate||transaction.postedDate}`,
        date:transaction.transactionDate||transaction.postedDate,
        description:transaction.description||transaction.category||'Card expense',
        amount:Number(transaction.amount||0),
        account:card?.name||card?.institution||'Credit card',
        accountKind:'Credit card' as const,
      }
    })
  return[...accountSpend,...cardSpend].sort((a,b)=>b.date.localeCompare(a.date)||a.description.localeCompare(b.description))
}

export function spentForBudget(budget:CategoryBudget,wallet:BudgetWallet){
  return transactionsForBudget(budget,wallet).reduce((sum,transaction)=>sum+transaction.amount,0)
}

export function connectBudgetsToTransactions(budgets:CategoryBudget[],wallet:BudgetWallet){
  return budgets.map(budget=>({...budget,actual:spentForBudget(budget,wallet)}))
}
