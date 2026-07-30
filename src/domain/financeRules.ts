import type {
  Account,
  ArchivedEntityType,
  ArchivedFinancialRecord,
  Bill,
  FinanceDataStore,
  ID,
  Income,
  RecurringTransaction,
  Transaction,
} from '../types/finance'

export type FinancialEffect = {
  countsAsIncome: number
  countsAsExpense: number
  availableSpendingDelta: number
  netWorthDelta: number
  creditLiabilityDelta: number
}

const zeroEffect = (): FinancialEffect => ({
  countsAsIncome: 0,
  countsAsExpense: 0,
  availableSpendingDelta: 0,
  netWorthDelta: 0,
  creditLiabilityDelta: 0,
})

export function transactionEffect(transaction: Transaction): FinancialEffect {
  if (transaction.status !== 'Completed') return zeroEffect()
  const amount = Math.abs(transaction.amount)

  if (transaction.type === 'Income') {
    return { countsAsIncome: amount, countsAsExpense: 0, availableSpendingDelta: amount, netWorthDelta: amount, creditLiabilityDelta: 0 }
  }
  if (transaction.type === 'Expense') {
    const isCreditPurchase = Boolean(transaction.creditCardId)
    return { countsAsIncome: 0, countsAsExpense: amount, availableSpendingDelta: isCreditPurchase ? 0 : -amount, netWorthDelta: -amount, creditLiabilityDelta: isCreditPurchase ? amount : 0 }
  }
  if (transaction.type === 'Credit card payment') {
    return { countsAsIncome: 0, countsAsExpense: 0, availableSpendingDelta: -amount, netWorthDelta: 0, creditLiabilityDelta: -amount }
  }
  if (transaction.type === 'Savings contribution') {
    return { countsAsIncome: 0, countsAsExpense: 0, availableSpendingDelta: -amount, netWorthDelta: 0, creditLiabilityDelta: 0 }
  }
  return zeroEffect()
}

export function personalTransferEffect(amount: number, from: Account, to: Account): FinancialEffect {
  const effect = zeroEffect()
  if (from.includeInAvailableBalance) effect.availableSpendingDelta -= Math.abs(amount)
  if (to.includeInAvailableBalance) effect.availableSpendingDelta += Math.abs(amount)
  return effect
}

export const isExpectedTransaction = (transaction: Transaction) =>
  transaction.status === 'Pending' || transaction.status === 'Scheduled'

export const includeIncomeInForecast = (income: Income, includeEstimated = false) =>
  !['Cancelled', 'Received'].includes(income.status) &&
  (income.forecastConfidence === 'Confirmed' || includeEstimated)

export const shouldKeepBillVisible = (bill: Bill) =>
  !['Paid', 'Skipped', 'Rescheduled'].includes(bill.status)

function addFrequency(date: Date, frequency: RecurringTransaction['frequency']) {
  const next = new Date(date)
  if (frequency === 'Weekly') next.setDate(next.getDate() + 7)
  else if (frequency === 'Every two weeks') next.setDate(next.getDate() + 14)
  else if (frequency === 'Monthly') next.setMonth(next.getMonth() + 1)
  else if (frequency === 'Every two months') next.setMonth(next.getMonth() + 2)
  else if (frequency === 'Quarterly') next.setMonth(next.getMonth() + 3)
  else if (frequency === 'Semiannually') next.setMonth(next.getMonth() + 6)
  else if (frequency === 'Annually') next.setFullYear(next.getFullYear() + 1)
  else return null
  return next
}

export function createFutureExpectedEntries(series: RecurringTransaction, throughDate: string): Transaction[] {
  if (!series.isActive) return []
  const through = new Date(`${throughDate}T12:00:00`)
  const seriesEnd = series.endDate ? new Date(`${series.endDate}T12:00:00`) : through
  const stop = seriesEnd < through ? seriesEnd : through
  const entries: Transaction[] = []
  let occurrence = new Date(`${series.startDate}T12:00:00`)

  while (occurrence <= stop) {
    const date = occurrence.toISOString().slice(0, 10)
    entries.push({
      transactionId: `${series.recurringTransactionId}:${date}`,
      userId: series.userId,
      type: series.transactionType,
      category: series.category,
      amount: series.amount,
      date,
      accountId: series.accountId,
      creditCardId: series.creditCardId,
      status: 'Scheduled',
      forecastConfidence: series.forecastConfidence,
      recurringTransactionId: series.recurringTransactionId,
      notes: series.notes,
    })
    const next = addFrequency(occurrence, series.frequency)
    if (!next) break
    occurrence = next
  }
  return entries
}

export type RecurringEditScope = 'This occurrence' | 'Entire series'

export function editRecurringTransaction(
  occurrence: Transaction,
  series: RecurringTransaction,
  scope: RecurringEditScope,
  updates: Partial<Transaction>,
) {
  if (scope === 'This occurrence') return { occurrence: { ...occurrence, ...updates }, series }
  return {
    occurrence,
    series: {
      ...series,
      amount: updates.amount ?? series.amount,
      category: updates.category ?? series.category,
      notes: updates.notes ?? series.notes,
      accountId: updates.accountId ?? series.accountId,
    },
  }
}

export function moveToArchive(
  userId: ID,
  entityType: ArchivedEntityType,
  originalId: ID,
  record: unknown,
  deletedAt = new Date().toISOString(),
): ArchivedFinancialRecord {
  return {
    archiveId: `archive:${entityType}:${originalId}:${deletedAt}`,
    userId,
    entityType,
    originalId,
    deletedAt,
    permanentlyDeleteAfter: null,
    record,
  }
}

export const restoreArchivedRecord = (store: FinanceDataStore, archiveId: ID) => {
  const { [archiveId]: restored, ...remaining } = store.archivedRecords
  return { restored, store: { ...store, archivedRecords: remaining } }
}

export const permanentlyDeleteArchivedRecord = (store: FinanceDataStore, archiveId: ID) => {
  const { [archiveId]: _deleted, ...remaining } = store.archivedRecords
  return { ...store, archivedRecords: remaining }
}
