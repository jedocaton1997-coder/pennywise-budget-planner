import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Filter,
  Landmark,
  PiggyBank,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { useFirestoreState } from './hooks/useFirestoreState'
import { useWalletSnapshot } from './hooks/useWalletSnapshot'
import { CategoryIcon } from './components/CategoryIcon'
import type { CategoryBudget } from './domain/planningEngine'
import { connectBudgetsToTransactions } from './utils/budgetSpending'
import {
  billUsesIncludedCard,
  filterIncludedCardTransactions,
} from './utils/netBalanceFilters'
import './DashboardOverview.css'

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
  date: string
  status?: string
  archived?: boolean
}

type UpcomingRow = {
  id: string
  sortDate: string
  date: string
  name: string
  category: string
  amount: number
  displayAmount: string
  tone: 'income' | 'expense'
  daysLeft: string
}

const CURRENCY = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function formatMoney(value: number) {
  return CURRENCY.format(value).replace('PHP', '₱')
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return year && month && day ? new Date(year, month - 1, day) : null
}

function toUtcDay(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
}

function daysUntil(value: string) {
  const due = parseLocalDate(value)
  if (!due) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return Math.round((toUtcDay(due) - toUtcDay(today)) / 86_400_000)
}

function formatUpcomingDate(
  value: string,
): { month: string; day: string } {
  const date = parseLocalDate(value)

  if (!date) {
    return {
      month: '—',
      day: '—',
    }
  }

  return {
    month: MONTH_SHORT[date.getMonth()],
    day: String(date.getDate()).padStart(2, '0'),
  }
}

function isOpenBill(status?: string) {
  const normalized = status?.trim().toLowerCase()
  return normalized !== 'paid' && normalized !== 'skipped'
}

function isWithinDays(value: string, days: number, includeOverdue = false) {
  const difference = daysUntil(value)
  if (difference === null) return false
  if (includeOverdue && difference < 0) return true
  return difference >= 0 && difference <= days
}

function getRangeLabel(months: number) {
  if (months === 1) return 'This month'
  if (months === 3) return 'Last 3 months'
  if (months === 6) return 'Last 6 months'
  if (months === 12) return 'Last 12 months'
  return `Last ${months} months`
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function DashboardOverview({
  onSelect,
  onNotice,
  rangeMonths,
}: Props) {
  const [compactDashboard, setCompactDashboard] = useState(() =>
    window.matchMedia('(max-width: 760px)').matches,
  )

  const [bills] = useFirestoreState<DashboardBill[]>('bills', [])
  const [planning] = useFirestoreState<DashboardPlanningItem[]>('planning', [])
  const [savedBudgets] = useFirestoreState<CategoryBudget[]>('budgets', [])
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
    const query = window.matchMedia('(max-width: 760px)')
    const sync = () => setCompactDashboard(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  const safeRange = Math.max(1, Math.min(12, rangeMonths || 6))
  const selectedRangeLabel = getRangeLabel(safeRange)

  const includedCardTransactions = useMemo(
    () =>
      filterIncludedCardTransactions(wallet.transactions, wallet.cards).filter(
        transaction => transaction.status === 'posted',
      ),
    [wallet.transactions, wallet.cards],
  )

  const visibleBills = useMemo(
    () =>
      bills.filter(
        bill =>
          billUsesIncludedCard(bill, wallet.cards) && isOpenBill(bill.status),
      ),
    [bills, wallet.cards],
  )

  const budgets = useMemo(
    () =>
      connectBudgetsToTransactions(savedBudgets, {
        ...wallet,
        transactions: includedCardTransactions,
        cards: wallet.cards,
      }),
    [savedBudgets, wallet, includedCardTransactions],
  )

  const budgetRows = useMemo(() => {
    const active = budgets.filter(budget => !budget.archived)
    const leafBudgets = active.filter(budget => budget.subcategory)
    return leafBudgets.length ? leafBudgets : active
  }, [budgets])

  const monthBuckets = useMemo(() => {
    const end = new Date()

    return Array.from({ length: safeRange }, (_, index) => {
      const date = new Date(
        end.getFullYear(),
        end.getMonth() - (safeRange - 1 - index),
        1,
      )

      return {
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
          2,
          '0',
        )}`,
        label: date.toLocaleDateString('en-US', { month: 'short' }),
      }
    })
  }, [safeRange])

  const monthlyTotals = useMemo(() => {
    const totals = new Map<
      string,
      { expectedIncome: number; actualIncome: number; expenses: number }
    >()

    monthBuckets.forEach(bucket => {
      totals.set(bucket.key, {
        expectedIncome: 0,
        actualIncome: 0,
        expenses: 0,
      })
    })

    for (const item of planning) {
      if (item.archived || item.type !== 'Income') continue
      const key = item.date.slice(0, 7)
      const entry = totals.get(key)
      if (entry) entry.expectedIncome += Number(item.amount || 0)
    }

    for (const transaction of wallet.accountTransactions) {
      const key = transaction.date.slice(0, 7)
      const entry = totals.get(key)
      if (!entry) continue

      if (transaction.type === 'Income') {
        entry.actualIncome += Number(transaction.amount || 0)
      } else if (transaction.type === 'Expense') {
        entry.expenses += Number(transaction.amount || 0)
      }
    }

    for (const transaction of includedCardTransactions) {
      const key = transaction.postedDate.slice(0, 7)
      const entry = totals.get(key)
      if (!entry) continue

      if (
        ['purchase', 'installment', 'fee', 'interest'].includes(transaction.type)
      ) {
        entry.expenses += Number(transaction.amount || 0)
      }
    }

    return monthBuckets.map(bucket => ({
      ...bucket,
      ...(totals.get(bucket.key) ?? {
        expectedIncome: 0,
        actualIncome: 0,
        expenses: 0,
      }),
    }))
  }, [
    monthBuckets,
    planning,
    wallet.accountTransactions,
    includedCardTransactions,
  ])

  const totalExpectedIncome = monthlyTotals.reduce(
    (sum, month) => sum + month.expectedIncome,
    0,
  )
  const totalActualIncome = monthlyTotals.reduce(
    (sum, month) => sum + month.actualIncome,
    0,
  )
  const totalActualExpenses = monthlyTotals.reduce(
    (sum, month) => sum + month.expenses,
    0,
  )

  const totalExpectedExpenses = planning
    .filter(item => item.type === 'Expense' && !item.archived)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)

  const expectedNetCashFlow = totalExpectedIncome - totalExpectedExpenses
  const actualNetCashFlow = totalActualIncome - totalActualExpenses

  const budgetTotal = budgetRows.reduce(
    (sum, budget) => sum + Number(budget.allocated || 0),
    0,
  )
  const budgetSpent = budgetRows.reduce(
    (sum, budget) => sum + Number(budget.actual || 0),
    0,
  )
  const budgetRemaining = budgetTotal - budgetSpent
  const budgetUsedPercent = budgetTotal
    ? Math.min(999, (budgetSpent / budgetTotal) * 100)
    : 0

  const incomeReceivedPercent = totalExpectedIncome
    ? Math.min(999, (totalActualIncome / totalExpectedIncome) * 100)
    : 0

  const upcoming = useMemo<UpcomingRow[]>(() => {
    const billRows: UpcomingRow[] = visibleBills
      .filter(bill => isWithinDays(bill.dueDate, 7, true))
      .map(bill => {
        const difference = daysUntil(bill.dueDate)
        return {
          id: `bill-${bill.id}`,
          sortDate: bill.dueDate,
          date: bill.dueDate,
          name: bill.name.replace(/\s+statement$/i, ''),
          category: bill.category,
          amount: Number(bill.amount || 0),
          displayAmount: formatMoney(Number(bill.amount || 0)),
          tone: 'expense',
          daysLeft:
            difference === null
              ? '—'
              : difference < 0
                ? `${Math.abs(difference)} days overdue`
                : difference === 0
                  ? 'Due today'
                  : difference === 1
                    ? '1 day left'
                    : `${difference} days left`,
        }
      })

    const planningRows: UpcomingRow[] = planning
      .filter(
        item =>
          !item.archived &&
          item.type === 'Expense' &&
          isWithinDays(item.date, 7, true),
      )
      .map(item => {
        const difference = daysUntil(item.date)
        return {
          id: `plan-${item.id}`,
          sortDate: item.date,
          date: item.date,
          name: item.name,
          category: item.category || 'Planned expense',
          amount: Number(item.amount || 0),
          displayAmount: formatMoney(Number(item.amount || 0)),
          tone: 'expense',
          daysLeft:
            difference === null
              ? '—'
              : difference < 0
                ? `${Math.abs(difference)} days overdue`
                : difference === 0
                  ? 'Due today'
                  : difference === 1
                    ? '1 day left'
                    : `${difference} days left`,
        }
      })

    return [...billRows, ...planningRows]
      .sort((a, b) => a.sortDate.localeCompare(b.sortDate))
      .slice(0, 5)
  }, [visibleBills, planning])

  const upcomingSevenDayTotal = upcoming.reduce(
    (sum, row) => sum + row.amount,
    0,
  )

  const availableBalance = wallet.accounts.reduce(
    (sum, account) => sum + Number(account.balance || 0),
    0,
  )

  const safeToSpend = availableBalance - upcomingSevenDayTotal

  const highestIncomeSource = useMemo(() => {
    const sourceTotals = new Map<string, number>()

    wallet.accountTransactions
      .filter(transaction => transaction.type === 'Income')
      .forEach(transaction => {
        const source = transaction.category || 'Uncategorized income'
        sourceTotals.set(
          source,
          (sourceTotals.get(source) ?? 0) + Number(transaction.amount || 0),
        )
      })

    return [...sourceTotals.entries()].sort((a, b) => b[1] - a[1])[0] ?? [
      'No income yet',
      0,
    ]
  }, [wallet.accountTransactions])

  const highestExpenseCategory = useMemo(() => {
    const rows = budgetRows
      .map(budget => ({
        name: budget.subcategory || budget.name,
        amount: Number(budget.actual || 0),
      }))
      .sort((a, b) => b.amount - a.amount)

    return rows[0] ?? { name: 'No expenses yet', amount: 0 }
  }, [budgetRows])

  const activeDebts = debts.filter(item => !item.archived)
  const activeReceivables = receivables.filter(item => !item.archived)
  const activeInstallments = installments.filter(item => !item.archived)

  const periodProgress = (() => {
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    return Math.min(
      100,
      Math.max(
        0,
        ((today.getDate() - start.getDate() + 1) / end.getDate()) * 100,
      ),
    )
  })()

  return (
    <main className="cf-dashboard">
      <header className="cf-header">
        <div>
          <h1>
            {getGreeting()}, George! <span aria-hidden="true">👋</span>
          </h1>
          <p>
            Here&apos;s your cash flow overview for {selectedRangeLabel}.
          </p>
        </div>

        <div className="cf-header-actions">
          <button type="button" className="cf-date-button">
            <CalendarDays size={18} />
            {selectedRangeLabel}
            <ChevronDown size={16} />
          </button>
          <button type="button" className="cf-filter-button">
            <Filter size={18} />
            Filters
            <ChevronDown size={16} />
          </button>
        </div>
      </header>

      <section className="cf-kpi-grid">
        <MetricCard
          icon={<TrendingUp />}
          label="Total Expected Income"
          value={formatMoney(totalExpectedIncome)}
          supporting={`${planning.filter(item => item.type === 'Income' && !item.archived).length} income sources`}
          progress={incomeReceivedPercent}
          progressLabel={`${incomeReceivedPercent.toFixed(1)}% received`}
          tone="green"
        />
        <MetricCard
          icon={<ArrowUpFromLine />}
          label="Total Expected Expenses"
          value={formatMoney(totalExpectedExpenses)}
          supporting={`${planning.filter(item => item.type === 'Expense' && !item.archived).length} obligations`}
          progress={
            totalExpectedExpenses
              ? (totalActualExpenses / totalExpectedExpenses) * 100
              : 0
          }
          progressLabel={`${totalExpectedExpenses ? ((totalActualExpenses / totalExpectedExpenses) * 100).toFixed(1) : '0.0'}% spent`}
          tone="red"
        />
        <MetricCard
          icon={<Wallet />}
          label="Net Cash Flow (Expected)"
          value={formatMoney(expectedNetCashFlow)}
          supporting="Expected income − expected expenses"
          tone={expectedNetCashFlow >= 0 ? 'green' : 'red'}
        />
        <MetricCard
          icon={<Clock3 />}
          label="Days in Period"
          value={`${new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()} days`}
          supporting={`${periodProgress.toFixed(0)}% of period passed`}
          progress={periodProgress}
          progressLabel={`${periodProgress.toFixed(0)}% complete`}
          tone="purple"
        />
      </section>

      <section className="cf-dashboard-grid">
        <article className="cf-card cf-income-panel">
          <PanelHeader
            title="Income Overview"
            action="By Source"
            onAction={() => onSelect('Income')}
          />
          <div className="cf-income-layout">
            <div>
              <h3>Expected vs Actual</h3>
              <ExpectedActualChart rows={monthlyTotals} />
            </div>

            <div className="cf-source-section">
              <h3>By Source (Expected)</h3>
              <DonutSummary
                total={totalExpectedIncome}
                rows={planning
                  .filter(item => item.type === 'Income' && !item.archived)
                  .slice(0, 4)
                  .map(item => ({
                    label: item.name,
                    value: Number(item.amount || 0),
                  }))}
                tone="green"
              />
            </div>

            <div className="cf-income-summary">
              <h3>
                <TrendingUp size={17} />
                Income Summary
              </h3>
              <SummaryRow
                label="Total Expected"
                value={formatMoney(totalExpectedIncome)}
              />
              <SummaryRow
                label="Total Actual"
                value={formatMoney(totalActualIncome)}
              />
              <SummaryRow
                label="Difference"
                value={formatMoney(totalActualIncome - totalExpectedIncome)}
                negative={totalActualIncome < totalExpectedIncome}
              />
              <SummaryRow
                label="% of Expected Received"
                value={`${incomeReceivedPercent.toFixed(1)}%`}
              />
            </div>
          </div>
        </article>

        <article className="cf-card cf-budget-panel">
          <PanelHeader
            title="Budget vs Actual"
            action="By Category"
            onAction={() => onSelect('Budget')}
          />

          <div className="cf-budget-layout">
            <div className="cf-budget-chart-wrap">
              <h3>Spending Overview</h3>
              <BudgetActualChart
                rows={budgetRows.slice(0, compactDashboard ? 4 : 6)}
              />
            </div>

            <div className="cf-budget-table-wrap">
              <BudgetTable rows={budgetRows.slice(0, 6)} />
            </div>
          </div>
        </article>

        <aside className="cf-card cf-statistics-panel">
          <div className="cf-panel-heading">
            <h2>Statistics & Analytics</h2>
          </div>

          <AnalyticsRow
            icon={<TrendingUp />}
            label="Highest Income Source"
            value={highestIncomeSource[0]}
            note={formatMoney(Number(highestIncomeSource[1]))}
            tone="green"
          />
          <AnalyticsRow
            icon={<TrendingDown />}
            label="Highest Expense Category"
            value={highestExpenseCategory.name}
            note={formatMoney(highestExpenseCategory.amount)}
            tone="red"
          />
          <AnalyticsRow
            icon={<Wallet />}
            label="Average Daily Net Cash Flow"
            value={formatMoney(actualNetCashFlow / Math.max(1, new Date().getDate()))}
            note="Based on actual transactions"
            tone={actualNetCashFlow >= 0 ? 'green' : 'purple'}
          />
          <AnalyticsRow
            icon={<CircleDollarSign />}
            label="Income vs Expenses"
            value={`${totalActualIncome ? ((totalActualExpenses / totalActualIncome) * 100).toFixed(1) : '0.0'}%`}
            note="Actual expenses as a share of income"
            tone="blue"
          />
          <AnalyticsRow
            icon={<CalendarDays />}
            label="Projected End Balance"
            value={formatMoney(expectedNetCashFlow)}
            note="If current expectations continue"
            tone={expectedNetCashFlow >= 0 ? 'green' : 'amber'}
          />
        </aside>

        <article className="cf-card cf-upcoming-panel">
          <PanelHeader
            title="Upcoming Due Dates"
            action="View all"
            onAction={() => onSelect('Calendar')}
          />

          <div className="cf-upcoming-grid">
            {upcoming.map(row => {
              const date = formatUpcomingDate(row.date)

              return (
                <button
                  type="button"
                  key={row.id}
                  className="cf-upcoming-item"
                  onClick={() => onNotice(`${row.name} selected`)}
                >
                  <span className="cf-date-chip">
                    <small>{date.month}</small>
                    <strong>{date.day}</strong>
                  </span>
                  <span className="cf-upcoming-icon">
                    <CategoryIcon value={row.category} />
                  </span>
                  <span className="cf-upcoming-copy">
                    <strong>{row.name}</strong>
                    <small>Bill · {row.category}</small>
                    <em>{row.daysLeft}</em>
                  </span>
                  <b>{row.displayAmount}</b>
                </button>
              )
            })}

            {!upcoming.length && (
              <div className="cf-empty-state">
                No upcoming expenses in the next seven days.
              </div>
            )}
          </div>
        </article>

        <section className="cf-card cf-secondary-stats">
          <CompactStat
            icon={<PiggyBank />}
            label="Safe to Spend"
            value={formatMoney(safeToSpend)}
            supporting="Available balance minus 7-day obligations"
            tone={safeToSpend >= 0 ? 'green' : 'red'}
            onClick={() => onSelect('Planning')}
          />
          <CompactStat
            icon={<Landmark />}
            label="Debt Outstanding"
            value={formatMoney(
              activeDebts.reduce(
                (sum, item) => sum + Number(item.amount || 0),
                0,
              ),
            )}
            supporting={`${activeDebts.length} active debts`}
            tone="red"
            onClick={() => onSelect('Debts')}
          />
          <CompactStat
            icon={<ArrowDownToLine />}
            label="Money Owed to Me"
            value={formatMoney(
              activeReceivables.reduce(
                (sum, item) => sum + Number(item.amount || 0),
                0,
              ),
            )}
            supporting={`${activeReceivables.length} active receivables`}
            tone="green"
            onClick={() => onSelect('Money owed to me')}
          />
          <CompactStat
            icon={<CalendarDays />}
            label="Installments"
            value={formatMoney(
              activeInstallments.reduce(
                (sum, item) => sum + Number(item.amount || 0),
                0,
              ),
            )}
            supporting={`${activeInstallments.length} active plans`}
            tone="amber"
            onClick={() => onSelect('Installments')}
          />
        </section>
      </section>
    </main>
  )
}

function PanelHeader({
  title,
  action,
  onAction,
}: {
  title: string
  action: string
  onAction: () => void
}) {
  return (
    <div className="cf-panel-heading">
      <h2>{title}</h2>
      <button type="button" onClick={onAction}>
        {action}
        <ChevronDown size={15} />
      </button>
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
  supporting,
  progress,
  progressLabel,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  supporting: string
  progress?: number
  progressLabel?: string
  tone: string
}) {
  const boundedProgress = Math.max(0, Math.min(100, progress ?? 0))

  return (
    <article className="cf-metric-card">
      <div className={`cf-metric-icon ${tone}`}>{icon}</div>
      <div className="cf-metric-content">
        <small>{label}</small>
        <strong className={tone}>{value}</strong>
        <span>{supporting}</span>

        {progress !== undefined && (
          <>
            <div className="cf-progress-track" aria-hidden="true">
              <i
                className={tone}
                style={{ width: `${boundedProgress}%` }}
              />
            </div>
            <em>{progressLabel}</em>
          </>
        )}
      </div>
    </article>
  )
}

function ExpectedActualChart({
  rows,
}: {
  rows: {
    label: string
    expectedIncome: number
    actualIncome: number
  }[]
}) {
  const max = Math.max(
    1,
    ...rows.flatMap(row => [row.expectedIncome, row.actualIncome]),
  )

  return (
    <div
      className="cf-bar-chart"
      role="img"
      aria-label="Expected income compared with actual income"
    >
      <div className="cf-chart-legend">
        <span>
          <i className="expected" />
          Expected
        </span>
        <span>
          <i className="actual" />
          Actual
        </span>
      </div>

      <div className="cf-chart-plot">
        {rows.map(row => (
          <div className="cf-bar-group" key={row.label}>
            <div className="cf-bars">
              <i
                className="expected"
                style={{
                  height: `${Math.max(6, (row.expectedIncome / max) * 100)}%`,
                }}
                title={`${row.label} expected: ${formatMoney(row.expectedIncome)}`}
              />
              <i
                className="actual"
                style={{
                  height: `${Math.max(6, (row.actualIncome / max) * 100)}%`,
                }}
                title={`${row.label} actual: ${formatMoney(row.actualIncome)}`}
              />
            </div>
            <small>{row.label}</small>
          </div>
        ))}
      </div>
    </div>
  )
}

function DonutSummary({
  total,
  rows,
  tone,
}: {
  total: number
  rows: { label: string; value: number }[]
  tone: 'green' | 'red'
}) {
  const first = rows[0]?.value ?? total
  const firstShare = total ? Math.min(100, (first / total) * 100) : 0

  return (
    <div className="cf-donut-layout">
      <div
        className={`cf-donut ${tone}`}
        style={{ '--donut-value': `${firstShare}%` } as React.CSSProperties}
      >
        <div>
          <strong>{formatMoney(total)}</strong>
          <span>Total</span>
        </div>
      </div>

      <div className="cf-donut-list">
        {rows.length ? (
          rows.map((row, index) => (
            <div key={`${row.label}-${index}`}>
              <span>
                <i className={`${tone} shade-${index + 1}`} />
                {row.label}
              </span>
              <strong>{formatMoney(row.value)}</strong>
              <em>{total ? ((row.value / total) * 100).toFixed(1) : '0.0'}%</em>
            </div>
          ))
        ) : (
          <p>No expected income sources yet.</p>
        )}
      </div>
    </div>
  )
}

function BudgetActualChart({ rows }: { rows: CategoryBudget[] }) {
  const max = Math.max(
    1,
    ...rows.flatMap(row => [Number(row.allocated || 0), Number(row.actual || 0)]),
  )

  return (
    <div className="cf-budget-chart">
      <div className="cf-chart-legend">
        <span>
          <i className="budget" />
          Budget
        </span>
        <span>
          <i className="spent" />
          Actual
        </span>
        <span>
          <i className="remaining" />
          Remaining
        </span>
      </div>

      <div className="cf-chart-plot">
        {rows.map(row => {
          const allocated = Number(row.allocated || 0)
          const actual = Number(row.actual || 0)
          const remaining = Math.max(0, allocated - actual)
          const label = row.subcategory || row.name

          return (
            <div className="cf-bar-group" key={row.id}>
              <div className="cf-bars triple">
                <i
                  className="budget"
                  style={{ height: `${Math.max(5, (allocated / max) * 100)}%` }}
                  title={`${label} budget: ${formatMoney(allocated)}`}
                />
                <i
                  className="spent"
                  style={{ height: `${Math.max(5, (actual / max) * 100)}%` }}
                  title={`${label} actual: ${formatMoney(actual)}`}
                />
                <i
                  className="remaining"
                  style={{ height: `${Math.max(5, (remaining / max) * 100)}%` }}
                  title={`${label} remaining: ${formatMoney(remaining)}`}
                />
              </div>
              <small title={label}>{label}</small>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BudgetTable({ rows }: { rows: CategoryBudget[] }) {
  const totalBudget = rows.reduce(
    (sum, row) => sum + Number(row.allocated || 0),
    0,
  )
  const totalActual = rows.reduce(
    (sum, row) => sum + Number(row.actual || 0),
    0,
  )

  return (
    <div className="cf-budget-table">
      <div className="cf-budget-head">
        <span>Category</span>
        <span>Budget</span>
        <span>Actual</span>
        <span>Remaining</span>
        <span>% of Budget</span>
      </div>

      {rows.map(row => {
        const budget = Number(row.allocated || 0)
        const actual = Number(row.actual || 0)
        const remaining = budget - actual
        const percent = budget ? (actual / budget) * 100 : 0
        const label = row.subcategory || row.name

        return (
          <div className="cf-budget-row" key={row.id}>
            <span>
              <CategoryIcon value={`${row.name} / ${row.subcategory ?? ''}`} />
              <b>{label}</b>
            </span>
            <strong>{formatMoney(budget)}</strong>
            <strong>{formatMoney(actual)}</strong>
            <strong className={remaining < 0 ? 'negative' : ''}>
              {formatMoney(remaining)}
            </strong>
            <span className="cf-percent-cell">
              <small>{percent.toFixed(1)}%</small>
              <i>
                <b style={{ width: `${Math.min(100, percent)}%` }} />
              </i>
            </span>
          </div>
        )
      })}

      <div className="cf-budget-row total">
        <span>Total</span>
        <strong>{formatMoney(totalBudget)}</strong>
        <strong>{formatMoney(totalActual)}</strong>
        <strong>{formatMoney(totalBudget - totalActual)}</strong>
        <span>
          {totalBudget ? ((totalActual / totalBudget) * 100).toFixed(1) : '0.0'}%
        </span>
      </div>
    </div>
  )
}

function SummaryRow({
  label,
  value,
  negative,
}: {
  label: string
  value: string
  negative?: boolean
}) {
  return (
    <div className="cf-summary-row">
      <span>{label}</span>
      <strong className={negative ? 'negative' : ''}>{value}</strong>
    </div>
  )
}

function AnalyticsRow({
  icon,
  label,
  value,
  note,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  note: string
  tone: string
}) {
  return (
    <div className="cf-analytics-row">
      <i className={tone}>{icon}</i>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <span>{note}</span>
      </div>
    </div>
  )
}

function CompactStat({
  icon,
  label,
  value,
  supporting,
  tone,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  value: string
  supporting: string
  tone: string
  onClick: () => void
}) {
  return (
    <button type="button" className="cf-compact-stat" onClick={onClick}>
      <i className={tone}>{icon}</i>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{supporting}</em>
      </span>
    </button>
  )
}
