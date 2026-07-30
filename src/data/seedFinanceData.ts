import type { FinanceDataStore, NotificationSettings } from '../types/finance'

const notifications: NotificationSettings = {
  weeklyFinancialSummary: true,
  billsDueWithinSevenDays: true,
  billsDueTomorrow: true,
  overdueBills: true,
  salaryExpectedToday: true,
  creditCardPaymentDue: true,
  creditUtilizationWarning: true,
  budgetCategoryNearLimit: true,
  savingsContributionReminder: true,
  forecastedCashShortfall: true,
  subscriptionRenewalReminder: true,
}

export const seedFinanceData: FinanceDataStore = {
  users: {},
  accounts: {},
  creditCards: {},
  transactions: {},
  bills: {},
  incomes: {},
  savingsGoals: {},
  budgets: {},
  recurringTransactions: {},
  archivedRecords: {},
}
