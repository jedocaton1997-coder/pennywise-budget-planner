export type ID = string
export type CurrencyCode = 'PHP' | 'USD' | 'EUR' | 'GBP' | 'JPY' | string

export type NotificationSettings = {
  weeklyFinancialSummary: boolean
  billsDueWithinSevenDays: boolean
  billsDueTomorrow: boolean
  overdueBills: boolean
  salaryExpectedToday: boolean
  creditCardPaymentDue: boolean
  creditUtilizationWarning: boolean
  budgetCategoryNearLimit: boolean
  savingsContributionReminder: boolean
  forecastedCashShortfall: boolean
  subscriptionRenewalReminder: boolean
}

export type User = {
  userId: ID
  name: string
  email: string
  currency: CurrencyCode
  timeZone: string
  notificationSettings: NotificationSettings
}

export type AccountType =
  | 'Checking'
  | 'Savings'
  | 'Cash'
  | 'E-wallet'
  | 'Investment'
  | 'Other'

export type Account = {
  accountId: ID
  userId: ID
  accountName: string
  accountType: AccountType
  currentBalance: number
  institution: string
  includeInAvailableBalance: boolean
  isActive: boolean
}

export type AutomaticPaymentStatus =
  | 'Disabled'
  | 'Minimum payment'
  | 'Statement balance'
  | 'Full balance'
  | 'Custom amount'

export type CreditCard = {
  creditCardId: ID
  userId: ID
  paymentAccountId: ID | null
  cardName: string
  creditLimit: number
  currentBalance: number
  includeInNetBalance: boolean
  statementBalance: number
  dueDate: string
  statementDate: string
  minimumPayment: number
  interestRate: number
  automaticPaymentStatus: AutomaticPaymentStatus
}

export type TransactionType =
  | 'Income'
  | 'Expense'
  | 'Credit card payment'
  | 'Savings contribution'
  | 'Transfer'

export type TransactionStatus =
  | 'Pending'
  | 'Scheduled'
  | 'Completed'
  | 'Partially completed'
  | 'Cancelled'

export type Transaction = {
  transactionId: ID
  userId: ID
  type: TransactionType
  category: string
  amount: number
  date: string
  accountId: ID
  creditCardId: ID | null
  status: TransactionStatus
  forecastConfidence: 'Confirmed' | 'Estimated'
  recurringTransactionId: ID | null
  notes: string
}

export type BillFrequency =
  | 'Weekly'
  | 'Every two weeks'
  | 'Monthly'
  | 'Every two months'
  | 'Quarterly'
  | 'Semiannually'
  | 'Annually'
  | 'Custom frequency'

export type BillStatus =
  | 'Upcoming'
  | 'Due soon'
  | 'Due today'
  | 'Paid'
  | 'Partially paid'
  | 'Overdue'
  | 'Skipped'
  | 'Rescheduled'

export type Bill = {
  billId: ID
  userId: ID
  name: string
  amount: number
  dueDate: string
  frequency: BillFrequency
  category: string
  paymentAccountId: ID
  status: BillStatus
  automaticPaymentStatus: AutomaticPaymentStatus
}

export type IncomeStatus =
  | 'Expected'
  | 'Received'
  | 'Delayed'
  | 'Partially received'
  | 'Cancelled'

export type Income = {
  incomeId: ID
  userId: ID
  source: string
  amount: number
  expectedDate: string
  receivedDate: string | null
  frequency: BillFrequency | 'One-time'
  status: IncomeStatus
  accountId: ID
  forecastConfidence: 'Confirmed' | 'Estimated'
}

export type RecurringTransaction = {
  recurringTransactionId: ID
  userId: ID
  transactionType: TransactionType
  category: string
  amount: number
  accountId: ID
  creditCardId: ID | null
  frequency: BillFrequency
  startDate: string
  endDate: string | null
  forecastConfidence: 'Confirmed' | 'Estimated'
  notes: string
  isActive: boolean
}

export type ArchivedEntityType =
  | 'Account'
  | 'CreditCard'
  | 'Transaction'
  | 'Bill'
  | 'Income'
  | 'SavingsGoal'
  | 'Budget'
  | 'RecurringTransaction'

export type ArchivedFinancialRecord = {
  archiveId: ID
  userId: ID
  entityType: ArchivedEntityType
  originalId: ID
  deletedAt: string
  permanentlyDeleteAfter: string | null
  record: unknown
}

export type SavingsGoal = {
  goalId: ID
  userId: ID
  goalName: string
  targetAmount: number
  currentAmount: number
  targetDate: string
  plannedContribution: number
}

export type Budget = {
  budgetId: ID
  userId: ID
  month: string
  category: string
  plannedAmount: number
  actualAmount: number
}

export type FinanceDataStore = {
  users: Record<ID, User>
  accounts: Record<ID, Account>
  creditCards: Record<ID, CreditCard>
  transactions: Record<ID, Transaction>
  bills: Record<ID, Bill>
  incomes: Record<ID, Income>
  savingsGoals: Record<ID, SavingsGoal>
  budgets: Record<ID, Budget>
  recurringTransactions: Record<ID, RecurringTransaction>
  archivedRecords: Record<ID, ArchivedFinancialRecord>
}

export const creditUtilization = (card: CreditCard) =>
  card.creditLimit > 0 ? (card.currentBalance / card.creditLimit) * 100 : 0

export const budgetVariance = (budget: Budget) =>
  budget.actualAmount - budget.plannedAmount

export const availableBalance = (accounts: Account[]) =>
  accounts
    .filter((account) => account.isActive && account.includeInAvailableBalance)
    .reduce((total, account) => total + account.currentBalance, 0)

export const isPersonalTransfer = (transaction: Transaction) =>
  transaction.type === 'Transfer'
