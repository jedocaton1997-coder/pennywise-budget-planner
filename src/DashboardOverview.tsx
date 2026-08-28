import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarDays,
  CreditCard,
  PiggyBank,
  ReceiptText,
  Shield,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { useFirestoreState } from './hooks/useFirestoreState'
import { useWalletSnapshot } from './hooks/useWalletSnapshot'
import { CategoryIcon } from './components/CategoryIcon'
import type { CategoryBudget } from './domain/planningEngine'
import { connectBudgetsToTransactions } from './utils/budgetSpending'
import {
  billUsesActiveCard,
  filterIncludedCardTransactions,
} from './utils/netBalanceFilters'

type Props = {
  onSelect: (page: string) => void
  onNotice: (message: string) => void
  rangeMonths: number
}

type DashboardBill = {
  id: number
  sourceKey?: string
  name: string
  category: string
  amount: number
  dueDate: string
  status: string
}

type DashboardWallet = {
  accounts: {
    id: number
    name: string
    balance: number
  }[]
  cards: {
    id: number
    bankId?: string | null
    bank?: string
    customLogo?: string
    name: string
    last4: string
    creditLimit: number
    sharedLimitCardId?: number | null
    openingBalance: number
    active?: boolean
    includeInNetBalance?: boolean
  }[]
  accountTransactions: {
    id: number
    accountId: number
    date: string
    type: string
    category?: string
    amount: number
    status?: string
  }[]
  transactions: {
    id: number
    cardId: number
    transactionDate?: string
    postedDate: string
    type: string
    category?: string
    amount: number
    status: string
  }[]
  payments: {
    id: number
    cardId: number
    amount: number
    status: string
  }[]
}

type DashboardPlan = {
  id: number
  name: string
  amount: number
  status?: string
  archived?: boolean
}

type DashboardPlanningItem = {
  id: number
  type: 'Income' | 'Expense'
  name: string
  category: string
  amount: number
  date?: string
  expectedDate?: string
  dueDate?: string
  actualAmount?: number
  receivedAmount?: number
  paidAmount?: number
  actualDate?: string
  receivedDate?: string
  paymentDate?: string
  receivedOccurrenceDate?: string
  paidOccurrenceDate?: string
  status?: string
  archived?: boolean
}

type DashboardUpcomingRow = {
  id: string
  sortDate: string
  date: string
  name: string
  category: string
  amount: string
  rawAmount: number
  categoryTone: string
  label: string
  tone: string
}

const MONTH_LABELS = [
  'Jan.',
  'Feb.',
  'Mar.',
  'Apr.',
  'May',
  'Jun.',
  'Jul.',
  'Aug.',
  'Sep.',
  'Oct.',
  'Nov.',
  'Dec.',
]

function amount(value: string | number) {
  return Number(String(value).replace(/[^0-9.-]/g, '')) || 0
}

function format(value: number) {
  return `${value < 0 ? '-' : ''}₱${Math.abs(value).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function compactCurrency(value: number) {
  const absolute = Math.abs(value)
  const sign = value < 0 ? '-' : ''

  if (absolute >= 1_000_000) {
    return `${sign}₱${Number((absolute / 1_000_000).toFixed(1))}M`
  }

  if (absolute >= 1_000) {
    return `${sign}₱${Number((absolute / 1_000).toFixed(1))}K`
  }

  return format(value)
}

function rangeLabel(months: number) {
  if (months === 1) return 'This month'
  if (months === 3) return 'Last 3 months'
  if (months === 6) return 'Last 6 months'
  if (months === 7) return 'January–July'
  if (months === 12) return 'Last 12 months'
  return `Last ${months} months`
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return year && month && day ? new Date(year, month - 1, day) : null
}

function isWithinNextDays(value: string, days: number) {
  const due = parseLocalDate(value)

  if (!due) return false

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const end = new Date(today)
  end.setDate(end.getDate() + days)

  return due >= today && due <= end
}

function formatUpcomingDate(value: string) {
  const date = parseLocalDate(value)

  return date
    ? `${MONTH_LABELS[date.getMonth()]} ${date.getDate()} (${date.toLocaleDateString(
        'en-US',
        { weekday: 'short' },
      )})`
    : value
}

function getDaysLeft(value: string) {
  const due = parseLocalDate(value)

  if (!due) return { label: '—', tone: '' }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000)

  if (days < 0) return { label: `${Math.abs(days)}d overdue`, tone: 'overdue' }
  if (days === 0) return { label: 'Today', tone: 'due' }
  if (days === 1) return { label: '1 day', tone: 'due' }

  return { label: `${days} days`, tone: '' }
}

function todayIso() {
  const today = new Date()

  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(today.getDate()).padStart(2, '0')}`
}

function planningItemDate(item: DashboardPlanningItem) {
  return item.date || item.expectedDate || item.dueDate || ''
}

function isCompletedPlanningItem(item: DashboardPlanningItem) {
  const status = String(item.status || '').toLowerCase().trim()
  const inactiveStatuses = [
    'paid',
    'received',
    'completed',
    'posted',
    'skipped',
    'cancelled',
    'canceled',
    'deleted',
    'archived',
  ]

  if (inactiveStatuses.includes(status)) return true

  if (item.type === 'Income') {
    return Number(item.actualAmount || item.receivedAmount || 0) > 0
  }

  return Number(item.actualAmount || item.paidAmount || 0) > 0
}

function getCardBalance(
  card: DashboardWallet['cards'][number],
  transactions: DashboardWallet['transactions'],
  payments: DashboardWallet['payments'],
) {
  const transactionTotal = transactions
    .filter((transaction) => transaction.cardId === card.id)
    .filter((transaction) => transaction.status === 'posted')
    .reduce((sum, transaction) => {
      const isCredit = ['payment', 'refund', 'adjustment-credit'].includes(
        transaction.type,
      )

      return sum + (isCredit ? -transaction.amount : transaction.amount)
    }, 0)

  const paymentTotal = payments
    .filter((payment) => payment.cardId === card.id)
    .filter((payment) => payment.status === 'posted')
    .reduce((sum, payment) => sum + payment.amount, 0)

  return Math.max(0, amount(card.openingBalance) + transactionTotal - paymentTotal)
}

export default function DashboardOverview({
  onSelect,
  onNotice,
  rangeMonths,
}: Props) {
  const [compactDashboard, setCompactDashboard] = useState(() =>
    window.matchMedia('(max-width:600px)').matches,
  )

  const [bills] = useFirestoreState<DashboardBill[]>('bills', [])
  const [planning] = useFirestoreState<DashboardPlanningItem[]>('planning', [])
  const [savedBudgets] = useFirestoreState<CategoryBudget[]>('budgets', [])
  const [goals] = useFirestoreState<DashboardPlan[]>('savingsGoals', [])
  const [debts] = useFirestoreState<DashboardPlan[]>('debts', [])
  const [receivables] = useFirestoreState<DashboardPlan[]>('receivables', [])
  const [installments] = useFirestoreState<DashboardPlan[]>('installments', [])
  const [wallet] = useWalletSnapshot<DashboardWallet>({
    accounts: [],
    cards: [],
    accountTransactions: [],
    transactions: [],
    payments: [],
  })

  useEffect(() => {
    const query = window.matchMedia('(max-width:600px)')
    const sync = () => setCompactDashboard(query.matches)

    sync()
    query.addEventListener('change', sync)

    return () => query.removeEventListener('change', sync)
  }, [])

  const includedCardTransactions = filterIncludedCardTransactions(
    wallet.transactions,
    wallet.cards,
  )
  const visibleBills = bills.filter((bill) =>
    billUsesActiveCard(bill, wallet.cards),
  )
  const budgets = connectBudgetsToTransactions(savedBudgets, {
    ...wallet,
    transactions: includedCardTransactions,
    cards: wallet.cards,
  })
  const activeCards = wallet.cards.filter((card) => card.active !== false)
  const includedCards = activeCards.filter(
    (card) => card.includeInNetBalance !== false,
  )

  const safeRange = Math.max(1, Math.min(12, rangeMonths || 7))
  const selectedRangeLabel = rangeLabel(safeRange)
  const rangeEnd = new Date()
  const monthBuckets = Array.from({ length: safeRange }, (_, index) => {
    const date = new Date(
      rangeEnd.getFullYear(),
      rangeEnd.getMonth() - (safeRange - 1 - index),
      1,
    )
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      '0',
    )}`

    return {
      key,
      label: date.toLocaleDateString('en-US', { month: 'short' }),
    }
  })

  const monthlyIncome = monthBuckets.map(({ key }) =>
    wallet.accountTransactions
      .filter(
        (transaction) =>
          transaction.date.startsWith(key) && transaction.type === 'Income',
      )
      .reduce((sum, transaction) => sum + transaction.amount, 0),
  )
  const monthlyExpenses = monthBuckets.map(
    ({ key }) =>
      wallet.accountTransactions
        .filter(
          (transaction) =>
            transaction.date.startsWith(key) && transaction.type === 'Expense',
        )
        .reduce((sum, transaction) => sum + transaction.amount, 0) +
      includedCardTransactions
        .filter(
          (transaction) =>
            transaction.postedDate.startsWith(key) &&
            transaction.status === 'posted' &&
            ['purchase', 'installment', 'fee', 'interest'].includes(
              transaction.type,
            ),
        )
        .reduce((sum, transaction) => sum + transaction.amount, 0),
  )

  const rangeIncomeTotal = monthlyIncome.reduce((sum, value) => sum + value, 0)
  const rangeExpenseTotal = monthlyExpenses.reduce((sum, value) => sum + value, 0)
  const rangeNetCashFlow = rangeIncomeTotal - rangeExpenseTotal

  const availableCash = wallet.accounts.reduce(
    (sum, account) => sum + account.balance,
    0,
  )
  const creditUsed = includedCards.reduce(
    (sum, card) =>
      sum + getCardBalance(card, includedCardTransactions, wallet.payments),
    0,
  )
  const creditLimit = includedCards.reduce(
    (sum, card) => sum + amount(card.creditLimit),
    0,
  )
  const availableCredit = Math.max(0, creditLimit - creditUsed)

  const plannedExpenseTotal = planning
    .filter((item) => item.type === 'Expense' && !item.archived)
    .reduce((sum, item) => sum + item.amount, 0)
  const dueNextSevenDaysTotal = visibleBills
    .filter(
      (bill) =>
        !['Paid', 'Skipped'].includes(bill.status) &&
        isWithinNextDays(bill.dueDate, 7),
    )
    .reduce((sum, bill) => sum + bill.amount, 0)
  const safeToSpend = availableCash - dueNextSevenDaysTotal - plannedExpenseTotal

  const budgetRows = budgets.filter(
    (budget) => !budget.archived && budget.name.toLowerCase() !== 'credit card',
  )
  const budgetRowsForTotals = budgetRows.filter((budget) => budget.allocated > 0)
  const budgetTotal = budgetRowsForTotals.reduce(
    (sum, budget) => sum + budget.allocated,
    0,
  )
  const budgetSpent = budgetRowsForTotals.reduce(
    (sum, budget) => sum + budget.actual,
    0,
  )
  const budgetRemaining = budgetTotal - budgetSpent
  const budgetChartRows = budgetRowsForTotals
    .sort((a, b) => b.actual - a.actual)
    .slice(0, 8)
  const currentMonthKey = `${rangeEnd.getFullYear()}-${String(
    rangeEnd.getMonth() + 1,
  ).padStart(2, '0')}`
  const expenseCategoryRows = [...wallet.accountTransactions
    .filter(
      (transaction) =>
        transaction.date.startsWith(currentMonthKey) &&
        transaction.type === 'Expense',
    )
    .map((transaction) => ({
      category: transaction.category || 'Uncategorized',
      amount: transaction.amount,
    })),
  ...includedCardTransactions
    .filter(
      (transaction) =>
        transaction.postedDate.startsWith(currentMonthKey) &&
        transaction.status === 'posted' &&
        ['purchase', 'installment', 'fee', 'interest'].includes(
          transaction.type,
        ),
    )
    .map((transaction) => ({
      category: transaction.category || '',
      amount: transaction.amount,
    }))]
    .reduce<{ category: string; amount: number }[]>((rows, entry) => {
      const key = entry.category.split('/').map((part) => part.trim())[0]

      if (!key || key.toLowerCase() === 'credit card') {
        return rows
      }

      const existing = rows.find((row) => row.category === key)

      if (existing) {
        existing.amount += entry.amount
      } else {
        rows.push({ category: key, amount: entry.amount })
      }

      return rows
    }, [])
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
  const expenseCategoryTotal = expenseCategoryRows.reduce(
    (sum, row) => sum + row.amount,
    0,
  )

  const billRows: DashboardUpcomingRow[] = visibleBills
    .filter((bill) => !['Paid', 'Skipped'].includes(bill.status))
    .map((bill) => ({
      id: `bill-${bill.id}`,
      sortDate: bill.dueDate,
      date: formatUpcomingDate(bill.dueDate),
      name: bill.name.replace(/\s+statement$/i, ''),
      category: bill.category,
      amount: format(bill.amount),
      rawAmount: bill.amount,
      categoryTone: bill.category.toLowerCase().includes('credit')
        ? 'blue'
        : 'green',
      ...getDaysLeft(bill.dueDate),
    }))

  const today = todayIso()
  const planningRows: DashboardUpcomingRow[] = planning
    .filter((item) => !item.archived)
    .filter((item) => !isCompletedPlanningItem(item))
    .filter((item) => {
      const date = planningItemDate(item)

      if (!date) return false
      if (item.type === 'Income') return date >= today

      return true
    })
    .map((item) => ({
      id: `plan-${item.id}`,
      sortDate: planningItemDate(item),
      date: formatUpcomingDate(planningItemDate(item)),
      name: item.name,
      category: item.type === 'Income' ? 'Plan income' : 'Plan expense',
      amount: `${item.type === 'Income' ? '+' : '−'}${format(item.amount)}`,
      rawAmount: item.type === 'Income' ? 0 : item.amount,
      categoryTone: item.type === 'Income' ? 'blue' : 'cyan',
      ...getDaysLeft(planningItemDate(item)),
    }))

  const upcoming = [...billRows, ...planningRows]
    .sort((a, b) => a.sortDate.localeCompare(b.sortDate))
    .slice(0, 6)
  const upcomingTotal = upcoming.reduce((sum, row) => sum + row.rawAmount, 0)

  const nextBill = billRows
    .filter((row) => row.rawAmount > 0)
    .sort((a, b) => a.sortDate.localeCompare(b.sortDate))[0]

  const recentActivity = useMemo(() => {
    const accountActivity = wallet.accountTransactions.map((transaction) => ({
      id: `account-${transaction.id}`,
      date: transaction.date,
      title:
        (transaction as unknown as { description?: string }).description ||
        transaction.category ||
        transaction.type,
      subtitle: transaction.type,
      amount:
        transaction.type === 'Income'
          ? format(transaction.amount)
          : `-${format(transaction.amount)}`,
      tone: transaction.type === 'Income' ? 'positive' : 'negative',
      category: transaction.category || transaction.type,
    }))

    const cardActivity = includedCardTransactions.map((transaction) => ({
      id: `card-${transaction.id}`,
      date: transaction.postedDate || transaction.transactionDate || '',
      title:
        (transaction as unknown as { description?: string; merchant?: string })
          .description ||
        (transaction as unknown as { merchant?: string }).merchant ||
        transaction.category ||
        transaction.type,
      subtitle: 'Credit card',
      amount: `-${format(transaction.amount)}`,
      tone: 'negative',
      category: transaction.category || transaction.type,
    }))

    return [...accountActivity, ...cardActivity]
      .filter((item) => item.date)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 6)
  }, [includedCardTransactions, wallet.accountTransactions])

  const savingsTarget = goals.reduce((sum, goal) => sum + amount(goal.amount), 0)
  const debtOutstanding = debts
    .filter((item) => !item.archived)
    .reduce((sum, item) => sum + amount(item.amount), 0)
  const receivableOutstanding = receivables
    .filter((item) => !item.archived)
    .reduce((sum, item) => sum + amount(item.amount), 0)
  const installmentOutstanding = installments
    .filter((item) => !item.archived)
    .reduce((sum, item) => sum + amount(item.amount), 0)

  const insight =
    safeToSpend < 0
      ? `You are short by ${format(Math.abs(safeToSpend))} after upcoming bills and planned expenses.`
      : dueNextSevenDaysTotal > 0
        ? `${format(dueNextSevenDaysTotal)} is due in the next 7 days. You still have ${format(safeToSpend)} estimated safe-to-spend.`
        : `No urgent bills in the next 7 days. Estimated safe-to-spend is ${format(safeToSpend)}.`

  return (
    <div className="command-center-dashboard">
      <section className="command-hero-card">
        <div>
          <span className="command-eyebrow">Command Center</span>
          <h2>Today’s money picture</h2>
          <p>{insight}</p>
        </div>
        <button onClick={() => onSelect('Cash Flow')}>Open cash flow plan</button>
      </section>

      <section className="command-kpi-grid" aria-label="Financial summary">
        <CommandKpi
          icon={Wallet}
          label="Available Cash"
          value={format(availableCash)}
          note={`${wallet.accounts.length} accounts`}
          tone="green"
        />
        <CommandKpi
          icon={Shield}
          label="Safe to Spend"
          value={format(safeToSpend)}
          note="After bills and planned expenses"
          tone={safeToSpend >= 0 ? 'green' : 'red'}
        />
        <CommandKpi
          icon={ArrowDownToLine}
          label="Expected Income"
          value={format(rangeIncomeTotal)}
          note={selectedRangeLabel}
          tone="blue"
        />
        <CommandKpi
          icon={CalendarDays}
          label="Due Next 7 Days"
          value={format(dueNextSevenDaysTotal)}
          note={nextBill ? `Next: ${nextBill.name}` : 'No urgent due dates'}
          tone="amber"
        />
        <CommandKpi
          icon={CreditCard}
          label="Credit Used"
          value={format(creditUsed)}
          note={`${format(availableCredit)} available`}
          tone="red"
        />
      </section>

      <section className="command-main-grid">
        <CommandPanel
          className="command-cashflow-panel"
          title={`Monthly Cash Flow · ${selectedRangeLabel}`}
          description="Income and expenses from connected transactions."
          action="View forecast"
          onAction={() => onSelect('Forecast')}
        >
          <CommandLegend
            items={[
              ['Income', 'income'],
              ['Expenses', 'expense'],
            ]}
          />
          <FlowChart
            labels={monthBuckets.map((bucket) => bucket.label)}
            income={monthlyIncome}
            expenses={monthlyExpenses}
          />
          <div className="command-total-strip command-total-strip--two">
            <span>
              Total income <b>{format(rangeIncomeTotal)}</b>
            </span>
            <span>
              Total expenses <b>{format(rangeExpenseTotal)}</b>
            </span>
          </div>
        </CommandPanel>

        <CommandPanel
          className="command-budget-panel"
          title="Budget vs Actual"
          description="Current-month budget performance from transaction categories."
          action="View budget"
          onAction={() => onSelect('Budget')}
        >
          <CommandLegend
            items={[
              ['Budget', 'budget'],
              ['Actual', 'actual'],
            ]}
          />
          <BudgetChart
            labels={budgetChartRows.map(
              (budget) => budget.subcategory || budget.name,
            )}
            planned={budgetChartRows.map((budget) => budget.allocated)}
            actual={budgetChartRows.map((budget) => budget.actual)}
          />
          <div className="command-total-strip">
            <span>
              Total budget <b>{format(budgetTotal)}</b>
            </span>
            <span>
              Actual spent <b>{format(budgetSpent)}</b>
            </span>
            <span>
              Remaining <b>{format(budgetRemaining)}</b>
            </span>
          </div>
        </CommandPanel>
      </section>

      <section className="command-secondary-grid">
        <CommandPanel
          className="command-upcoming-panel"
          title="Upcoming payments"
          description="Bills, planned income, and planned expenses by due date."
          action="Open calendar"
          onAction={() => onSelect('Calendar')}
        >
          <div className="command-list-head">
            <span>Date</span>
            <span>Description</span>
            <span>Days</span>
            <span>Amount</span>
          </div>
          <div className="command-list">
            {upcoming.map((row) => (
              <button
                key={row.id}
                onClick={() => {
                  onSelect(row.id.startsWith('bill-') ? 'Bills' : 'Cash Flow Plan')
                  onNotice(`${row.name} selected`)
                }}
                type="button"
              >
                <span>{row.date}</span>
                <strong>
                  <CategoryIcon value={row.category} />
                  <span>
                    {row.name}
                    <small className={row.categoryTone}>{row.category}</small>
                  </span>
                </strong>
                <em className={row.tone}>{row.label}</em>
                <b>{row.amount}</b>
              </button>
            ))}
            {!upcoming.length && (
              <p className="command-empty">No upcoming payments yet.</p>
            )}
          </div>
          <div className="command-panel-footer">
            <span>Total visible</span>
            <b>{format(upcomingTotal)}</b>
          </div>
        </CommandPanel>

        <CommandPanel
          className="command-credit-panel"
          title="Credit snapshot"
          description="Active cards, utilization, and the next statement pressure point."
          action="Open cards"
          onAction={() => onSelect('Accounts & Cards')}
        >
          <div className="command-credit-grid">
            <MiniStat
              label="Active Cards"
              value={String(activeCards.length)}
              note="Cards in wallet"
            />
            <MiniStat
              label="Total Credit Limit"
              value={format(creditLimit)}
              note="Included active cards"
            />
            <MiniStat
              label="Credit Used"
              value={format(creditUsed)}
              note={`${creditLimit ? Math.round((creditUsed / creditLimit) * 100) : 0}% utilization`}
            />
            <MiniStat
              label="Available Credit"
              value={format(availableCredit)}
              note="Ready to use"
            />
          </div>
        </CommandPanel>

        <CommandPanel
          className="command-expense-pie-panel"
          title="Expenses by category"
          description="This month’s spending grouped by main category."
          action="View transactions"
          onAction={() => onSelect('Transactions')}
        >
          <ExpenseDonutChart
            rows={expenseCategoryRows}
            total={expenseCategoryTotal}
          />
        </CommandPanel>
      </section>

      <CommandPanel
        className="command-activity-panel"
        title="Recent activity"
        description="Latest money movement from accounts and cards."
        action="View transactions"
        onAction={() => onSelect('Transactions')}
      >
        <div className="command-activity-list">
          {recentActivity.map((item) => (
            <button
              key={item.id}
              onClick={() => onNotice(`${item.title} selected`)}
              type="button"
            >
              <CategoryIcon value={item.category} />
              <span>
                <strong>{item.title}</strong>
                <small>
                  {formatUpcomingDate(item.date)} · {item.subtitle}
                </small>
              </span>
              <b className={item.tone}>{item.amount}</b>
            </button>
          ))}
          {!recentActivity.length && (
            <p className="command-empty">No transactions recorded yet.</p>
          )}
        </div>
      </CommandPanel>

      <details className="command-more-details" open={!compactDashboard}>
        <summary>More financial details</summary>
        <section className="command-mini-grid">
          <CommandMini
            tone="green"
            icon={<PiggyBank />}
            title="Savings goals"
            value={format(savingsTarget)}
            meta={`${goals.filter((goal) => !goal.archived).length} active`}
            onClick={() => onSelect('Savings')}
          />
          <CommandMini
            tone="red"
            icon={<ReceiptText />}
            title="Debt outstanding"
            value={format(debtOutstanding)}
            meta={`${debts.filter((item) => !item.archived).length} debts`}
            onClick={() => onSelect('Debts')}
          />
          <CommandMini
            tone="blue"
            icon={<ArrowDownToLine />}
            title="Receivables"
            value={format(receivableOutstanding)}
            meta={`${receivables.filter((item) => !item.archived).length} active`}
            onClick={() => onSelect('Money owed to me')}
          />
          <CommandMini
            tone="amber"
            icon={<CalendarDays />}
            title="Installments"
            value={format(installmentOutstanding)}
            meta={`${installments.filter((item) => !item.archived).length} plans`}
            onClick={() => onSelect('Installments')}
          />
        </section>
      </details>
    </div>
  )
}

function CommandPanel({
  title,
  description,
  action,
  onAction,
  className,
  children,
}: {
  title: string
  description: string
  action?: string
  onAction?: () => void
  className: string
  children: React.ReactNode
}) {
  return (
    <article className={`command-panel ${className}`}>
      <div className="command-panel-title">
        <span>
          <h2>{title}</h2>
          <p>{description}</p>
        </span>
        {action && (
          <button onClick={onAction} type="button">
            {action}
          </button>
        )}
      </div>
      {children}
    </article>
  )
}

function CommandKpi({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: typeof Wallet
  label: string
  value: string
  note: string
  tone: string
}) {
  return (
    <article className={`command-kpi ${tone}`}>
      <i>
        <Icon />
      </i>
      <span>
        <small>{label}</small>
        <b>{value}</b>
        <em>{note}</em>
      </span>
    </article>
  )
}

function MiniStat({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note: string
}) {
  return (
    <div className="command-mini-stat">
      <small>{label}</small>
      <b>{value}</b>
      <span>{note}</span>
    </div>
  )
}

function ExpenseDonutChart({
  rows,
  total,
}: {
  rows: { category: string; amount: number }[]
  total: number
}) {
  const colors = ['#2eaa7a', '#78cfa0', '#f0b34c', '#ef6b8f', '#82afe9']
  const radius = 42
  const circumference = 2 * Math.PI * radius
  let offset = 0

  if (!rows.length || total <= 0) {
    return (
      <div className="command-expense-empty">
        <CategoryIcon value="Expenses" />
        <b>No expense categories yet</b>
        <span>Add transactions to see where money is going.</span>
      </div>
    )
  }

  return (
    <div className="command-expense-pie">
      <div className="command-donut-wrap">
        <svg viewBox="0 0 112 112" role="img" aria-label="Expenses by category">
          <title>Expenses by category this month</title>
          <circle className="track" cx="56" cy="56" r={radius} />
          {rows.map((row, index) => {
            const segment = (row.amount / total) * circumference
            const dashOffset = offset
            offset += segment

            return (
              <circle
                key={row.category}
                className="segment"
                cx="56"
                cy="56"
                r={radius}
                stroke={colors[index % colors.length]}
                strokeDasharray={`${segment} ${circumference - segment}`}
                strokeDashoffset={-dashOffset}
              >
                <title>
                  {row.category}: {format(row.amount)}
                </title>
              </circle>
            )
          })}
        </svg>
        <span>
          <b>{format(total)}</b>
          <small>Total spent</small>
        </span>
      </div>
      <div className="command-expense-legend">
        {rows.map((row, index) => (
          <div key={row.category}>
            <i style={{ backgroundColor: colors[index % colors.length] }} />
            <span>{row.category}</span>
            <b>{format(row.amount)}</b>
            <em>{Math.round((row.amount / total) * 100)}%</em>
          </div>
        ))}
      </div>
    </div>
  )
}

function CommandLegend({
  items,
}: {
  items: [label: string, tone: string][]
}) {
  return (
    <div className="command-chart-legend">
      {items.map(([label, tone]) => (
        <span key={label}>
          <i className={tone} />
          {label}
        </span>
      ))}
    </div>
  )
}

function FlowChart({
  labels,
  income,
  expenses,
}: {
  labels: string[]
  income: number[]
  expenses: number[]
}) {
  const maximum = Math.max(1, ...income, ...expenses)
  const magnitude = 10 ** Math.floor(Math.log10(maximum))
  const chartMax = Math.ceil(maximum / magnitude) * magnitude
  const axisLeft = 58
  const axisRight = 954
  const left = 70
  const right = 936
  const top = 24
  const bottom = 218
  const step = (right - left) / Math.max(1, labels.length)
  const barWidth = Math.min(28, Math.max(14, step * 0.22))
  const y = (value: number) => bottom - (value / chartMax) * (bottom - top)

  return (
    <svg
      className="command-flow-chart"
      viewBox="0 0 980 270"
      role="img"
      aria-label="Monthly cash flow chart"
    >
      <title>Monthly income and expenses</title>
      {[1, 0.75, 0.5, 0.25, 0].map((ratio) => {
        const tickY = y(chartMax * ratio)

        return (
          <g key={ratio}>
            <line
              x1={axisLeft}
              y1={tickY}
              x2={axisRight}
              y2={tickY}
            />
            <text x="4" y={tickY + 5}>
              {compactCurrency(chartMax * ratio)}
            </text>
          </g>
        )
      })}
      {income.map((value, index) => {
        const center = left + step * (index + 0.5)
        const incomeY = y(value)
        const expenseY = y(expenses[index])

        return (
          <g key={`${labels[index]}-${index}`}>
            <rect
              className="income"
              x={center - barWidth - 3}
              y={incomeY}
              width={barWidth}
              height={bottom - incomeY}
              rx="6"
            >
              <title>
                {labels[index]} income: {format(value)}
              </title>
            </rect>
            <rect
              className="expense"
              x={center + 3}
              y={expenseY}
              width={barWidth}
              height={bottom - expenseY}
              rx="6"
            >
              <title>
                {labels[index]} expenses: {format(expenses[index])}
              </title>
            </rect>
            <text x={center} y="252" textAnchor="middle">
              {labels[index].length > 12 ? `${labels[index].slice(0, 11)}…` : labels[index]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function BudgetChart({
  labels,
  planned,
  actual,
}: {
  labels: string[]
  planned: number[]
  actual: number[]
}) {
  const maximum = Math.max(1, ...planned, ...actual)
  const magnitude = 10 ** Math.floor(Math.log10(maximum))
  const chartMax = Math.ceil(maximum / magnitude) * magnitude
  const left = 70
  const right = 936
  const top = 24
  const bottom = 218
  const step = (right - left) / Math.max(1, labels.length)
  const barWidth = Math.min(28, Math.max(14, step * 0.22))
  const y = (value: number) => bottom - (value / chartMax) * (bottom - top)

  return (
    <svg
      className="command-budget-chart"
      viewBox="0 0 980 270"
      role="img"
      aria-label="Budget versus actual spending by category"
    >
      <title>Budget versus actual spending</title>
      {[1, 0.75, 0.5, 0.25, 0].map((ratio) => {
        const yy = y(chartMax * ratio)

        return (
          <g key={ratio}>
            <line x1="58" y1={yy} x2="954" y2={yy} />
            <text x="4" y={yy + 5}>
              {compactCurrency(chartMax * ratio)}
            </text>
          </g>
        )
      })}
      {labels.length ? (
        labels.map((label, index) => {
          const center = left + step * (index + 0.5)
          const plannedY = y(planned[index])
          const actualY = y(actual[index])

          return (
            <g key={`${label}-${index}`}>
              <rect
                className="budget"
                x={center - barWidth - 3}
                y={plannedY}
                width={barWidth}
                height={bottom - plannedY}
                rx="6"
              >
                <title>
                  {label} budget: {format(planned[index])}
                </title>
              </rect>
              <rect
                className="actual"
                x={center + 3}
                y={actualY}
                width={barWidth}
                height={bottom - actualY}
                rx="6"
              >
                <title>
                  {label} actual: {format(actual[index])}
                </title>
              </rect>
              <text x={center} y="252" textAnchor="middle">
                {label.length > 12 ? `${label.slice(0, 11)}…` : label}
              </text>
            </g>
          )
        })
      ) : (
        <text className="empty" x="490" y="135" textAnchor="middle">
          Add budgets to see performance
        </text>
      )}
    </svg>
  )
}

function CommandMini({
  tone,
  icon,
  title,
  value,
  meta,
  onClick,
}: {
  tone: string
  icon: React.ReactNode
  title: string
  value: string
  meta: string
  onClick: () => void
}) {
  return (
    <button className={`command-mini-card ${tone}`} onClick={onClick} type="button">
      <i>{icon}</i>
      <span>
        <small>{title}</small>
        <b>{value}</b>
        <em>{meta}</em>
      </span>
    </button>
  )
}
