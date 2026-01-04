'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from './Card'
import { Input } from './Input'
import { Button } from './Button'
import { Table } from './Table'
import { InlineCategoryEditor } from './InlineCategoryEditor'
import { InlineNoteEditor } from './InlineNoteEditor'
import { SelectMenu } from './SelectMenu'
import { RecurringModal } from './RecurringModal'
import { formatCurrency, parseCurrency, roundCurrency } from '@/lib/utils/currency'
import { calculatePreallocations } from '@/lib/utils/calculations'
import {
  BUDGET_CATEGORIES,
  TRANSACTION_CATEGORIES,
  getCategoryColor,
  isRecurringCategory,
  isIncomeCategory,
} from '@/lib/constants/categories'
import { formatDateDisplay, formatDate, parseDateInput } from '@/lib/utils/dates'
import { buildCompositeDescription } from '@/lib/utils/import/normalizer'
import { updateCategoryBudget, suggestCategoryBudgets, togglePeriodLock } from '@/lib/actions/period'
import {
  addIncomeTransaction,
  addManualTransaction,
  markTransactionPosted,
  deleteTransaction,
  updateTransactionCategory,
  updateTransactionNote,
  linkTransactionToRecurring,
  createRecurringFromTransaction,
  getActiveRecurringDefinitions,
  setTransactionIgnored,
  createTransactionLink,
  removeTransactionLink,
  searchTransactionLinkCandidates,
  getIncomeMatchCandidates,
  mergeIncomeMatch,
  getRecurringMatchCandidates,
  mergeRecurringMatch,
} from '@/lib/actions/transactions'
import {
  createCategoryMappingRule,
  dismissCategoryMappingSuggestion,
} from '@/lib/actions/category-mappings'
import { matchExistingImportsForPeriod } from '@/lib/actions/recurring'
import { createIgnoreRuleFromTransaction } from '@/lib/actions/ignore-rules'
import { getExpenseAmount } from '@/lib/utils/transaction-amounts'

type Period = any // TODO: Type this properly
type Settings = any

export function BudgetDashboard({ period, settings }: { period: Period; settings: Settings }) {
  const router = useRouter()

  const [incomeSource, setIncomeSource] = useState('')
  const [incomeAmount, setIncomeAmount] = useState('')
  const [incomeDate, setIncomeDate] = useState(formatDate(new Date()))

  const [transactionDesc, setTransactionDesc] = useState('')
  const [transactionAmount, setTransactionAmount] = useState('')
  const [transactionCategory, setTransactionCategory] = useState<string>(BUDGET_CATEGORIES[0])
  const [transactionDate, setTransactionDate] = useState(formatDate(new Date()))
  const [transactionSearch, setTransactionSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showIgnored, setShowIgnored] = useState(false)
  const [sortKey, setSortKey] = useState<'date' | 'description' | 'category' | 'amount' | 'status'>('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [isMatchingRecurring, setIsMatchingRecurring] = useState(false)
  const [isCategorizingWithLLM, setIsCategorizingWithLLM] = useState(false)
  const llmScope: 'period' | 'all' = 'period'
  const [llmProgress, setLlmProgress] = useState({
    active: false,
    totalBatches: 0,
    totalItems: 0,
    currentBatch: 0,
    updatedOrders: 0,
    updatedTransactions: 0,
    skipped: 0,
  })
  const [isSuggestingBudgets, setIsSuggestingBudgets] = useState(false)
  const [allowBudgetSetup, setAllowBudgetSetup] = useState(false)
  const [isTogglingPeriod, setIsTogglingPeriod] = useState(false)
  const [showIncomePanel, setShowIncomePanel] = useState(false)
  const [showPreallocationsPanel, setShowPreallocationsPanel] = useState(false)
  const [showCategoryBudgetsPanel, setShowCategoryBudgetsPanel] = useState(false)
  const [showAddTransactionForm, setShowAddTransactionForm] = useState(false)
  const [showTransactionFilters, setShowTransactionFilters] = useState(false)
  const [budgetTableSelection, setBudgetTableSelection] = useState<string | null>(null)
  const [bulkCategory, setBulkCategory] = useState('')
  const [incomeMatchOpen, setIncomeMatchOpen] = useState(false)
  const [incomeMatchTarget, setIncomeMatchTarget] = useState<any>(null)
  const [incomeMatchCandidates, setIncomeMatchCandidates] = useState<any[]>([])
  const [incomeMatchTolerance, setIncomeMatchTolerance] = useState(0)
  const [incomeMatchLoading, setIncomeMatchLoading] = useState(false)
  const [incomeMatchLoadingId, setIncomeMatchLoadingId] = useState<string | null>(null)
  const [incomeMatchError, setIncomeMatchError] = useState<string | null>(null)
  const [incomeMatchSearch, setIncomeMatchSearch] = useState('')
  const [incomeMatchLinking, setIncomeMatchLinking] = useState(false)
  const [recurringMatchOpen, setRecurringMatchOpen] = useState(false)
  const [recurringMatchTarget, setRecurringMatchTarget] = useState<any>(null)
  const [recurringMatchCandidates, setRecurringMatchCandidates] = useState<any[]>([])
  const [recurringMatchTolerance, setRecurringMatchTolerance] = useState(0)
  const [recurringMatchLoading, setRecurringMatchLoading] = useState(false)
  const [recurringMatchLoadingId, setRecurringMatchLoadingId] = useState<string | null>(null)
  const [recurringMatchError, setRecurringMatchError] = useState<string | null>(null)
  const [recurringMatchSearch, setRecurringMatchSearch] = useState('')
  const [recurringMatchLinking, setRecurringMatchLinking] = useState(false)

  const [editingBudget, setEditingBudget] = useState<Record<string, string>>({})

  const [linkCandidates, setLinkCandidates] = useState<Record<string, any[]>>({})
  const [linkingTransactions, setLinkingTransactions] = useState<Set<string>>(new Set())
  const [linkAmountInputs, setLinkAmountInputs] = useState<Record<string, string>>({})
  const [linkSearchQueries, setLinkSearchQueries] = useState<Record<string, string>>({})
  const [linkSearchResults, setLinkSearchResults] = useState<Record<string, any[]>>({})
  const [linkSearchLoading, setLinkSearchLoading] = useState<Set<string>>(new Set())
  const [linkSearchErrors, setLinkSearchErrors] = useState<Record<string, string>>({})
  const linkSearchTimers = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({})

  // Multi-select state
  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(new Set())
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null)
  const [expandedTransactions, setExpandedTransactions] = useState<Set<string>>(new Set())
  const [mobileCategoryPicker, setMobileCategoryPicker] = useState<string | null>(null)

  // Recurring modal state
  const [recurringModalOpen, setRecurringModalOpen] = useState(false)
  const [recurringTransaction, setRecurringTransaction] = useState<any>(null)
  const [recurringDefinitions, setRecurringDefinitions] = useState<any[]>([])

  // Only include recurring income for anticipated income calculation
  // This excludes one-off income like interest payments
  const incomeTransactions = period.transactions
    .filter((t: any) => t.category === 'Income' && !t.isIgnored && t.isRecurringInstance)
    .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const anticipatedIncome = incomeTransactions.reduce(
    (sum: number, item: any) => sum + Math.abs(item.amount),
    0
  )

  // Calculate preallocations
  const preallocations = calculatePreallocations({
    anticipatedIncome,
    charityPercent: settings.charityPercent,
    retirementAmount: settings.retirementAmount,
    otherSavingsAmount: settings.otherSavingsAmount,
  })

  // Calculate category budgets and actuals
  const activeTransactions = period.transactions.filter((t: any) => !t.isIgnored)
  const expenseTransactions = activeTransactions.filter((t: any) => !isIncomeCategory(t.category))

  const getLinkTotal = (
    transaction: any,
    type: 'refund' | 'reimbursement',
    direction: 'from' | 'to'
  ) => {
    const links = direction === 'from' ? (transaction.linksFrom || []) : (transaction.linksTo || [])
    return links
      .filter((link: any) => link.type === type)
      .reduce((sum: number, link: any) => sum + (link.amount || 0), 0)
  }

  const getRemainingLinkAmount = (transaction: any, type: 'refund' | 'reimbursement') => {
    const expenseAmount = getExpenseAmount(transaction)
    if (!expenseAmount) return 0
    const isCredit = expenseAmount < 0
    const linkedTotal = getLinkTotal(transaction, type, isCredit ? 'from' : 'to')
    return roundCurrency(Math.max(0, Math.abs(expenseAmount) - linkedTotal))
  }

  const getNetExpenseAmount = (transaction: any) => {
    const expenseAmount = getExpenseAmount(transaction)
    if (expenseAmount <= 0) return 0
    const refunded = getLinkTotal(transaction, 'refund', 'to')
    const reimbursed = getLinkTotal(transaction, 'reimbursement', 'to')
    return roundCurrency(Math.max(0, expenseAmount - refunded - reimbursed))
  }

  const categoryData = BUDGET_CATEGORIES.map(category => {
    const budget = period.categoryBudgets.find((b: any) => b.category === category)
    const budgeted = budget?.amountBudgeted || 0

    const categoryTransactions = expenseTransactions.filter((t: any) => t.category === category)
    const actual = categoryTransactions.reduce((sum: number, t: any) => sum + getNetExpenseAmount(t), 0)
    const difference = actual - budgeted

    return { category, budgeted, actual, difference }
  })

  const totalBudgeted = categoryData.reduce((sum, c) => sum + c.budgeted, 0)
  const totalActual = categoryData.reduce((sum, c) => sum + c.actual, 0)
  const totalDifference = totalActual - totalBudgeted
  const budgetVsGoal = totalBudgeted - preallocations.goalBudget

  // Filter transactions
  const normalizedSearch = transactionSearch.trim().toLowerCase()
  const filteredTransactions = period.transactions.filter((t: any) => {
    if (!showIgnored && t.isIgnored) return false
    if (filterCategory !== 'all' && t.category !== filterCategory) return false
    if (filterStatus !== 'all' && t.status !== filterStatus) return false
    if (!normalizedSearch) return true

    const haystack = [
      t.description,
      t.subDescription,
      t.category,
      t.userDescription,
      formatCurrency(t.amount),
      t.amount?.toString?.(),
      formatDateDisplay(t.date),
      formatDate(t.date),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(normalizedSearch)
  })

  const sortedTransactions = filteredTransactions
    .map((t: any, index: number) => ({ t, index }))
    .sort((a: { t: any; index: number }, b: { t: any; index: number }) => {
      let comparison = 0
      switch (sortKey) {
        case 'date': {
          const aTime = new Date(a.t.date).getTime()
          const bTime = new Date(b.t.date).getTime()
          comparison = aTime - bTime
          break
        }
        case 'description': {
          const aDesc = buildCompositeDescription(a.t.description, a.t.subDescription).toLowerCase()
          const bDesc = buildCompositeDescription(b.t.description, b.t.subDescription).toLowerCase()
          comparison = aDesc.localeCompare(bDesc)
          break
        }
        case 'category':
          comparison = (a.t.category || '').localeCompare(b.t.category || '')
          break
        case 'amount':
          comparison = a.t.amount - b.t.amount
          break
        case 'status':
          comparison = (a.t.status || '').localeCompare(b.t.status || '')
          break
        default:
          comparison = 0
      }

      if (comparison === 0) {
        comparison = a.index - b.index
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })
    .map((item: { t: any }) => item.t)

  const hasRecurringDefinitions = (period.user?.recurringDefinitions?.length ?? 0) > 0
  const budgetSetupLocked = !hasRecurringDefinitions && !allowBudgetSetup

  const recurringCommitted = roundCurrency(
    expenseTransactions
      .filter((t: any) => isRecurringCategory(t.category))
      .reduce((sum: number, t: any) => {
        const expense = getNetExpenseAmount(t)
        return sum + (expense > 0 ? expense : 0)
      }, 0)
  )

  const availableAfterRecurring = roundCurrency(preallocations.goalBudget - recurringCommitted)
  const nonRecurringBudgeted = roundCurrency(
    categoryData
      .filter(c => !isRecurringCategory(c.category))
      .reduce((sum, c) => sum + c.budgeted, 0)
  )
  const budgetVsAvailableAfterRecurring = roundCurrency(
    nonRecurringBudgeted - availableAfterRecurring
  )
  const transactionGridStyle = {
    gridTemplateColumns: multiSelectMode
      ? 'auto 1fr 2fr 1fr auto 1fr'
      : '1fr 2fr 1fr auto 1fr'
  }

  useEffect(() => {
    if (filterCategory === 'all' || !BUDGET_CATEGORIES.includes(filterCategory as any)) {
      if (budgetTableSelection !== null) setBudgetTableSelection(null)
      return
    }
    if (budgetTableSelection !== filterCategory) {
      setBudgetTableSelection(filterCategory)
    }
  }, [filterCategory, budgetTableSelection])

  const formatCurrencyRounded = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(value))
  }

  const getMobileCategoryIcon = (category: string) => {
    const strokeProps = {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round' as const,
      strokeLinejoin: 'round' as const,
      className: 'h-4 w-4',
      'aria-hidden': true,
    }
    const filledProps = {
      viewBox: '0 0 16 16',
      fill: 'currentColor',
      className: 'h-4 w-4',
      'aria-hidden': true,
    }

    switch (category) {
      case 'Recurring - Essential':
      case 'Recurring - Non-Essential':
        return (
          <svg {...strokeProps}>
            <path d="M3 12a9 9 0 0115.3-6.3" />
            <path d="M18 3v4h-4" />
            <path d="M21 12a9 9 0 01-15.3 6.3" />
            <path d="M6 21v-4h4" />
          </svg>
        )
      case 'Auto':
        return (
          <svg {...filledProps}>
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M3 1L1.66667 5H0V8H1V15H3V13H13V15H15V8H16V5H14.3333L13 1H3ZM4 9C3.44772 9 3 9.44772 3 10C3 10.5523 3.44772 11 4 11C4.55228 11 5 10.5523 5 10C5 9.44772 4.55228 9 4 9ZM11.5585 3H4.44152L3.10819 7H12.8918L11.5585 3ZM12 9C11.4477 9 11 9.44772 11 10C11 10.5523 11.4477 11 12 11C12.5523 11 13 10.5523 13 10C13 9.44772 12.5523 9 12 9Z"
            />
          </svg>
        )
      case 'Grocery':
        return (
          <svg {...strokeProps}>
            <path d="M4 10h16l-1.5 8h-13z" />
            <path d="M9 10l3-4 3 4" />
          </svg>
        )
      case 'Dining':
        return (
          <svg viewBox="0 0 512 512" fill="currentColor" className="h-4 w-4" aria-hidden>
            <path d="M50.57,55.239C27.758,29.036-13.992,53.833,4.68,95.145c12.438,27.563,36.469,94.922,70.016,143.438c33.563,48.516,69.328,43.328,105.453,55.078l25.953,13.422l177.547,204.204l35.906-31.234l0.188-0.156c-5.25-6.047-166.719-191.782-230.563-265.204C125.992,142.02,61.664,68.004,50.57,55.239z" />
            <path d="M476.664,93.551l-61.938,71.266c-3.969,4.563-10.859,5.031-15.422,1.063l-2.203-1.906c-4.531-3.953-5.031-10.844-1.063-15.406l62.234-71.594c10.219-11.734,5.375-22.125-2.219-28.719c-7.578-6.578-18.531-9.938-28.75,1.813l-62.234,71.594c-3.953,4.547-10.859,5.031-15.406,1.063l-2.188-1.906c-4.563-3.953-5.047-10.859-1.094-15.406l61.953-71.266c18.297-21.031-12.297-46.375-30.156-25.828c-21.391,24.594-59.156,68.031-59.156,68.031c-33,37.688-32.5,55.344-27.844,80.078c3.781,19.938,9.328,34.281-11.156,57.844l-30.234,34.781l31.719,36.453l34.641-39.844c20.469-23.547,35.453-20.047,55.719-19.094c25.156,1.203,42.703-0.766,75.422-38.672c0,0,37.766-43.469,59.156-68.063C524.305,99.286,494.945,72.536,476.664,93.551z" />
            <polygon points="185.758,322.692 49.102,479.88 85.211,511.286 219.055,357.348 191.508,325.661" />
          </svg>
        )
      case 'Entertainment':
        return (
          <svg {...strokeProps}>
            <path d="M8 5l11 7-11 7z" />
          </svg>
        )
      case 'Other - Fun':
        return (
          <svg {...strokeProps}>
            <path d="M12 3l2.5 5 5.5.8-4 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4-3.9 5.5-.8z" />
          </svg>
        )
      case 'Other - Responsible':
        return (
          <svg {...strokeProps}>
            <path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6z" />
          </svg>
        )
      case 'Income':
        return (
          <svg {...strokeProps}>
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        )
      case 'Uncategorized':
        return (
          <svg {...strokeProps}>
            <path d="M9 9a3 3 0 016 0c0 2-3 2-3 4" />
            <circle cx="12" cy="17" r="1" />
          </svg>
        )
      default:
        return (
          <svg {...strokeProps}>
            <path d="M6 12h12" />
            <path d="M12 6v12" />
          </svg>
        )
    }
  }

  async function handleAddIncome(e?: React.FormEvent) {
    e?.preventDefault()
    if (!incomeSource || !incomeAmount) return

    await addIncomeTransaction(period.id, {
      date: parseDateInput(incomeDate),
      source: incomeSource,
      amount: parseCurrency(incomeAmount),
    })

    setIncomeSource('')
    setIncomeAmount('')
    setIncomeDate(formatDate(new Date()))
  }

  async function handlePostIncome(item: any) {
    setIncomeMatchLoading(true)
    setIncomeMatchLoadingId(item.id)
    setIncomeMatchError(null)
    setIncomeMatchSearch('')
    try {
      const result = await getIncomeMatchCandidates(item.id)
      const withinTolerance = result.candidates.filter((candidate: any) => candidate.withinTolerance)

      if (withinTolerance.length === 1) {
        const match = await mergeIncomeMatch(item.id, withinTolerance[0].id)
        if (!match.success) {
          throw new Error(match.error || 'Failed to link income.')
        }
        router.refresh()
        return
      }

      setIncomeMatchTarget(item)
      setIncomeMatchCandidates(result.candidates)
      setIncomeMatchTolerance(result.tolerance)
      setIncomeMatchOpen(true)
    } catch (error: any) {
      const message = error?.message || 'Failed to find income matches.'
      setIncomeMatchError(message)
      alert(message)
    } finally {
      setIncomeMatchLoading(false)
      setIncomeMatchLoadingId(null)
    }
  }

  function closeIncomeMatch() {
    setIncomeMatchOpen(false)
    setIncomeMatchTarget(null)
    setIncomeMatchCandidates([])
    setIncomeMatchTolerance(0)
    setIncomeMatchError(null)
    setIncomeMatchSearch('')
  }

  async function handleMatchIncomeCandidate(candidateId: string) {
    if (!incomeMatchTarget) return
    setIncomeMatchLinking(true)
    try {
      const result = await mergeIncomeMatch(incomeMatchTarget.id, candidateId)
      if (!result.success) {
        throw new Error(result.error || 'Failed to link income.')
      }
      closeIncomeMatch()
      router.refresh()
    } catch (error: any) {
      setIncomeMatchError(error?.message || 'Failed to link income.')
    } finally {
      setIncomeMatchLinking(false)
    }
  }

  async function handlePostIncomeWithoutMatch() {
    if (!incomeMatchTarget) return
    setIncomeMatchLinking(true)
    try {
      await markTransactionPosted(incomeMatchTarget.id)
      closeIncomeMatch()
      router.refresh()
    } catch (error: any) {
      setIncomeMatchError(error?.message || 'Failed to post income.')
    } finally {
      setIncomeMatchLinking(false)
    }
  }

  async function handlePostRecurring(item: any) {
    setRecurringMatchLoading(true)
    setRecurringMatchLoadingId(item.id)
    setRecurringMatchError(null)
    setRecurringMatchSearch('')
    try {
      const result = await getRecurringMatchCandidates(item.id)
      const withinTolerance = result.candidates.filter((candidate: any) => candidate.withinTolerance)

      if (withinTolerance.length === 1) {
        const match = await mergeRecurringMatch(item.id, withinTolerance[0].id)
        if (!match.success) {
          throw new Error(match.error || 'Failed to link recurring transaction.')
        }
        router.refresh()
        return
      }

      setRecurringMatchTarget(item)
      setRecurringMatchCandidates(result.candidates)
      setRecurringMatchTolerance(result.tolerance)
      setRecurringMatchOpen(true)
    } catch (error: any) {
      const message = error?.message || 'Failed to find recurring matches.'
      setRecurringMatchError(message)
      alert(message)
    } finally {
      setRecurringMatchLoading(false)
      setRecurringMatchLoadingId(null)
    }
  }

  function closeRecurringMatch() {
    setRecurringMatchOpen(false)
    setRecurringMatchTarget(null)
    setRecurringMatchCandidates([])
    setRecurringMatchTolerance(0)
    setRecurringMatchError(null)
    setRecurringMatchSearch('')
  }

  async function handleMatchRecurringCandidate(candidateId: string) {
    if (!recurringMatchTarget) return
    setRecurringMatchLinking(true)
    try {
      const result = await mergeRecurringMatch(recurringMatchTarget.id, candidateId)
      if (!result.success) {
        throw new Error(result.error || 'Failed to link recurring transaction.')
      }
      closeRecurringMatch()
      router.refresh()
    } catch (error: any) {
      setRecurringMatchError(error?.message || 'Failed to link recurring transaction.')
    } finally {
      setRecurringMatchLinking(false)
    }
  }

  async function handleAddTransaction(e?: React.FormEvent) {
    e?.preventDefault()
    if (!transactionDesc || !transactionAmount) return

    const parsedAmount = parseCurrency(transactionAmount)
    const finalAmount = transactionCategory === 'Income'
      ? -Math.abs(parsedAmount)
      : parsedAmount

    await addManualTransaction(period.id, {
      date: parseDateInput(transactionDate),
      description: transactionDesc,
      amount: finalAmount,
      category: transactionCategory,
    })

    setTransactionDesc('')
    setTransactionAmount('')
  }

  async function handleUpdateBudget(category: string) {
    const amount = parseCurrency(editingBudget[category] || '0')
    await updateCategoryBudget(period.id, category, amount)
    setEditingBudget({ ...editingBudget, [category]: '' })
  }

  async function handleSuggestBudgets() {
    if (budgetSetupLocked || isSuggestingBudgets) return

    const confirmed = confirm(
      'Suggest budgets from the last 3 months of posted spending? This will overwrite current category budgets.'
    )
    if (!confirmed) return

    setIsSuggestingBudgets(true)
    try {
      const result = await suggestCategoryBudgets(period.id)
      if (result.updated === 0) {
        if (result.monthsUsed === 0) {
          alert('No prior months found. Import and post transactions first.')
        } else {
          alert('No suggested budgets found from history.')
        }
      } else {
        alert(`Suggested budgets applied across ${result.updated} categories from the last ${result.monthsUsed} months.`)
      }
      setEditingBudget({})
      router.refresh()
    } catch (error: any) {
      alert(error?.message || 'Failed to suggest budgets.')
    } finally {
      setIsSuggestingBudgets(false)
    }
  }

  async function handleCategoryChange(transactionId: string, newCategory: string) {
    const result = await updateTransactionCategory(transactionId, newCategory)
    if (!result.success && result.error) {
      alert(result.error)
    } else {
      if (result.mappingSuggestion) {
        const compositeDescription = buildCompositeDescription(
          result.mappingSuggestion.description,
          result.mappingSuggestion.subDescription
        )
        const confirmed = confirm(
          `Always categorize "${compositeDescription}" as ${result.mappingSuggestion.category}?`
        )
        if (confirmed) {
          try {
            await createCategoryMappingRule({
              description: result.mappingSuggestion.description,
              subDescription: result.mappingSuggestion.subDescription,
              category: result.mappingSuggestion.category,
            })
          } catch (error: any) {
            alert(error?.message || 'Failed to create mapping rule.')
          }
        } else {
          try {
            await dismissCategoryMappingSuggestion(
              result.mappingSuggestion.description,
              result.mappingSuggestion.subDescription
            )
          } catch (error: any) {
            alert(error?.message || 'Failed to dismiss mapping rule suggestion.')
          }
        }
      }
      router.refresh()
    }
  }

  async function handleRecurringCategorySelected(transactionId: string, category: string) {
    const transaction = period.transactions.find((t: any) => t.id === transactionId)
    if (!transaction) return

    // Fetch ALL active recurring definitions (not filtered by category)
    // User can link to any recurring schedule, which will then set the category
    const definitions = recurringDefinitions.length > 0
      ? recurringDefinitions
      : await getActiveRecurringDefinitions(undefined)

    // Store the intended category to apply after modal completion (if creating new)
    setRecurringTransaction({ ...transaction, intendedCategory: category })
    setRecurringDefinitions(definitions)
    setRecurringModalOpen(true)
  }

  async function handleNoteChange(transactionId: string, note: string | null) {
    await updateTransactionNote(transactionId, note)
    router.refresh()
  }

  async function handleLinkRecurring(transactionId: string, definitionId: string) {
    const result = await linkTransactionToRecurring(transactionId, definitionId)
    if (!result.success && result.error) {
      alert(result.error)
    }
  }

  async function handleCreateRecurring(transactionId: string, data: any) {
    const result = await createRecurringFromTransaction(transactionId, data)
    if (!result.success && result.error) {
      alert(result.error)
    }
  }

  function handleSortChange(nextKey: 'date' | 'description' | 'category' | 'amount' | 'status') {
    if (sortKey === nextKey) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(nextKey)
      setSortDirection(nextKey === 'date' ? 'desc' : 'asc')
    }
  }

  function getSortIndicator(key: 'date' | 'description' | 'category' | 'amount' | 'status') {
    if (sortKey !== key) return ''
    return sortDirection === 'asc' ? ' ↑' : ' ↓'
  }

  function handleQuickFilterCategory(category: string) {
    setShowTransactionFilters(true)
    setBudgetTableSelection(prev => {
      const next = prev === category ? null : category
      setFilterCategory(next ?? 'all')
      return next
    })
  }

  function handleCategorySelection(transactionId: string, category: string) {
    if (isRecurringCategory(category)) {
      handleRecurringCategorySelected(transactionId, category)
    } else {
      handleCategoryChange(transactionId, category)
    }
    setMobileCategoryPicker(null)
  }

  function handleToggleMultiSelect() {
    setMultiSelectMode(prev => {
      const next = !prev
      setSelectedTransactions(new Set())
      setLastSelectedIndex(null)
      if (next) {
        setExpandedTransactions(new Set())
        setMobileCategoryPicker(null)
      }
      return next
    })
  }

  function toggleTransactionExpanded(transactionId: string) {
    setMobileCategoryPicker(null)
    setExpandedTransactions(prev => {
      if (prev.has(transactionId)) {
        return new Set()
      }
      return new Set([transactionId])
    })
  }

  function handleRowClick(transactionId: string, index: number, event: React.MouseEvent) {
    if (multiSelectMode) {
      handleTransactionSelect(transactionId, index, event)
      return
    }
    toggleTransactionExpanded(transactionId)
  }

  function handleTransactionSelect(transactionId: string, index: number, event: React.MouseEvent) {
    const newSelected = new Set(selectedTransactions)

    if (event.shiftKey && lastSelectedIndex !== null) {
      // Shift-click: select range
      const start = Math.min(lastSelectedIndex, index)
      const end = Math.max(lastSelectedIndex, index)
      for (let i = start; i <= end; i++) {
        newSelected.add(sortedTransactions[i].id)
      }
    } else if (event.metaKey || event.ctrlKey) {
      // Command/Ctrl-click: toggle single item
      if (newSelected.has(transactionId)) {
        newSelected.delete(transactionId)
      } else {
        newSelected.add(transactionId)
      }
    } else {
      // Normal click: toggle single item
      if (newSelected.has(transactionId)) {
        newSelected.delete(transactionId)
      } else {
        newSelected.add(transactionId)
      }
    }

    setSelectedTransactions(newSelected)
    setLastSelectedIndex(index)
  }

  async function handleBulkCategoryUpdate(category: string) {
    const promises = Array.from(selectedTransactions).map(id =>
      updateTransactionCategory(id, category, { skipMappingSuggestion: true })
    )
    await Promise.all(promises)
    setSelectedTransactions(new Set())
    router.refresh()
  }

  async function handleBulkDelete() {
    if (!confirm(`Delete ${selectedTransactions.size} transactions?`)) return

    const promises = Array.from(selectedTransactions).map(id =>
      deleteTransaction(id)
    )
    await Promise.all(promises)
    setSelectedTransactions(new Set())
    router.refresh()
  }

  async function handleIgnoreTransaction(transactionId: string) {
    if (!confirm('Ignore transactions like this? Existing matching imported transactions will be removed.')) return

    try {
      const result = await createIgnoreRuleFromTransaction(transactionId)
      if (!result.created) {
        alert('Ignore rule already exists.')
      } else if (result.deletedTransactions > 0) {
        alert(`Ignored ${result.deletedTransactions} existing imported transactions.`)
      }
      router.refresh()
    } catch (error: any) {
      alert(error?.message || 'Failed to create ignore rule')
    }
  }

  async function handleMatchRecurring() {
    setIsMatchingRecurring(true)
    try {
      const result = await matchExistingImportsForPeriod(period.id)
      if (result.matched === 0) {
        alert('No recurring matches found for this period.')
      }
      router.refresh()
    } catch (error: any) {
      alert(error?.message || 'Failed to match recurring transactions.')
    } finally {
      setIsMatchingRecurring(false)
    }
  }

  async function handleLLMCategorize() {
    if (isCategorizingWithLLM) return

    const scopeLabel = llmScope === 'all' ? 'all months' : 'this month'
    const confirmed = confirm(
      `Use gpt-5-mini to categorize uncategorized transactions (including linked Amazon orders) for ${scopeLabel}?`
    )
    if (!confirmed) return

    setIsCategorizingWithLLM(true)
    setLlmProgress({
      active: true,
      totalBatches: 0,
      totalItems: 0,
      currentBatch: 0,
      updatedOrders: 0,
      updatedTransactions: 0,
      skipped: 0,
    })
    try {
      const res = await fetch('/api/llm-categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodId: period.id, scope: llmScope }),
      })

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '')
        throw new Error(text || 'Unexpected response from the server.')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finalResult: any = null

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let boundaryIndex = buffer.indexOf('\n\n')
        while (boundaryIndex !== -1) {
          const chunk = buffer.slice(0, boundaryIndex).trim()
          buffer = buffer.slice(boundaryIndex + 2)
          boundaryIndex = buffer.indexOf('\n\n')

          if (!chunk) continue
          const dataLine = chunk.split('\n').find(line => line.startsWith('data:'))
          if (!dataLine) continue

          const payloadText = dataLine.replace(/^data:\s*/, '')
          let payload: any = null
          try {
            payload = JSON.parse(payloadText)
          } catch {
            continue
          }

          if (payload?.type === 'error') {
            throw new Error(payload?.message || 'Failed to categorize with gpt-5-mini.')
          }

          if (payload?.type === 'start') {
            setLlmProgress(prev => ({
              ...prev,
              totalBatches: payload.totalBatches || 0,
              totalItems: payload.totalItems || 0,
              currentBatch: 0,
              updatedOrders: 0,
              updatedTransactions: 0,
              skipped: 0,
            }))
          } else if (payload?.type === 'batch') {
            setLlmProgress(prev => ({
              ...prev,
              totalBatches: payload.totalBatches || prev.totalBatches,
              totalItems: payload.totalItems || prev.totalItems,
              currentBatch: payload.batch || prev.currentBatch,
              updatedOrders: payload.updatedOrders ?? prev.updatedOrders,
              updatedTransactions: payload.updatedTransactions ?? prev.updatedTransactions,
              skipped: payload.skipped ?? prev.skipped,
            }))
          } else if (payload?.type === 'done') {
            finalResult = payload
            setLlmProgress(prev => ({
              ...prev,
              currentBatch: prev.totalBatches || prev.currentBatch,
              updatedOrders: payload.updatedOrders ?? prev.updatedOrders,
              updatedTransactions: payload.updatedTransactions ?? prev.updatedTransactions,
              skipped: payload.skipped ?? prev.skipped,
            }))
          }
        }
      }

      if (finalResult) {
        if (finalResult.updated === 0) {
          alert('No transactions or linked Amazon orders were categorized.')
        } else {
          const updatedTransactions = finalResult.updatedTransactions ?? 0
          const updatedOrders = finalResult.updatedOrders ?? 0
          alert(`Categorized ${updatedTransactions} transactions and ${updatedOrders} Amazon orders. Skipped ${finalResult.skipped}.`)
        }
      } else {
        alert('No transactions or linked Amazon orders were categorized.')
      }
      router.refresh()
    } catch (error: any) {
      alert(error?.message || 'Failed to categorize with gpt-5-mini.')
    } finally {
      setIsCategorizingWithLLM(false)
      setLlmProgress(prev => ({ ...prev, active: false }))
    }
  }

  async function handleToggleIgnore(transactionId: string, ignored: boolean) {
    const result = await setTransactionIgnored(transactionId, ignored)
    if (!result.success && result.error) {
      alert(result.error)
    } else {
      router.refresh()
    }
  }

  function seedLinkAmounts(
    transactionId: string,
    type: 'refund' | 'reimbursement',
    candidates: any[],
    primaryRemainingOverride?: number
  ) {
    const primary = period.transactions.find((t: any) => t.id === transactionId)
    const primaryRemaining = primaryRemainingOverride ?? (primary ? getRemainingLinkAmount(primary, type) : 0)
    const prefix = `${transactionId}:${type}:`
    const candidateIds = new Set(candidates.map(candidate => candidate.id))

    setLinkAmountInputs(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(key => {
        if (key.startsWith(prefix) && !candidateIds.has(key.slice(prefix.length))) {
          delete next[key]
        }
      })
      for (const candidate of candidates) {
        const key = `${transactionId}:${type}:${candidate.id}`
        if (next[key] === undefined) {
          const candidateRemaining = candidate.remainingAmount ?? Math.abs(candidate.amount)
          const suggested = Math.min(primaryRemaining, candidateRemaining)
          next[key] = suggested > 0 ? roundCurrency(suggested).toFixed(2) : ''
        }
      }
      return next
    })
  }

  function shouldRunLinkSearch(query: string) {
    const trimmed = query.trim()
    if (!trimmed) return false
    if (trimmed.length >= 2) return true
    return /[0-9]/.test(trimmed) && Math.abs(parseCurrency(trimmed)) > 0
  }

  async function runLinkSearch(
    transactionId: string,
    type: 'refund' | 'reimbursement',
    query: string,
    primaryRemainingOverride?: number
  ) {
    const key = `${transactionId}:${type}`
    const trimmed = query.trim()
    if (!shouldRunLinkSearch(trimmed)) {
      setLinkSearchResults(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      setLinkSearchErrors(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      return
    }

    setLinkSearchLoading(prev => new Set([...prev, key]))
    try {
      const results = await searchTransactionLinkCandidates(transactionId, type, trimmed)
      setLinkSearchResults(prev => ({ ...prev, [key]: results }))
      seedLinkAmounts(transactionId, type, results, primaryRemainingOverride)
    } catch (error: any) {
      setLinkSearchErrors(prev => ({ ...prev, [key]: error?.message || 'Search failed.' }))
    } finally {
      setLinkSearchLoading(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  function handleLinkSearchChange(
    transactionId: string,
    type: 'refund' | 'reimbursement',
    value: string
  ) {
    const key = `${transactionId}:${type}`
    setLinkSearchQueries(prev => ({ ...prev, [key]: value }))

    if (linkSearchTimers.current[key]) {
      clearTimeout(linkSearchTimers.current[key]!)
    }

    if (!shouldRunLinkSearch(value)) {
      setLinkSearchResults(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      setLinkSearchErrors(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      setLinkSearchLoading(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      return
    }

    linkSearchTimers.current[key] = setTimeout(() => {
      runLinkSearch(transactionId, type, value)
    }, 300)
  }

  async function toggleLinkCandidates(transactionId: string, type: 'refund' | 'reimbursement') {
    const key = `${transactionId}:${type}`
    if (Object.prototype.hasOwnProperty.call(linkCandidates, key)) {
      setLinkCandidates(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      setLinkAmountInputs(prev => {
        const next = { ...prev }
        const prefix = `${transactionId}:${type}:`
        Object.keys(next).forEach(inputKey => {
          if (inputKey.startsWith(prefix)) delete next[inputKey]
        })
        return next
      })
      setLinkSearchQueries(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      setLinkSearchResults(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      setLinkSearchErrors(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      setLinkSearchLoading(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      if (linkSearchTimers.current[key]) {
        clearTimeout(linkSearchTimers.current[key]!)
        linkSearchTimers.current[key] = null
      }
      return
    }

    setLinkCandidates(prev => ({ ...prev, [key]: [] }))
  }

  async function handleCreateLink(
    transactionId: string,
    candidateId: string,
    type: 'refund' | 'reimbursement'
  ) {
    const key = `${transactionId}:${type}`
    const amountKey = `${transactionId}:${type}:${candidateId}`
    const amountValue = linkAmountInputs[amountKey] ?? ''
    const parsedAmount = parseCurrency(amountValue)

    if (!parsedAmount || parsedAmount <= 0) {
      alert('Enter a link amount greater than zero.')
      return
    }

    const primary = period.transactions.find((t: any) => t.id === transactionId)
    const primaryRemaining = primary ? getRemainingLinkAmount(primary, type) : null
    const candidate = linkCandidates[key]?.find(item => item.id === candidateId)
      ?? linkSearchResults[key]?.find(item => item.id === candidateId)
    const candidateRemaining = candidate?.remainingAmount ?? (candidate ? Math.abs(candidate.amount) : null)

    if (primaryRemaining !== null && parsedAmount > primaryRemaining + 0.01) {
      alert('Link amount exceeds the remaining balance on this transaction.')
      return
    }
    if (candidateRemaining !== null && parsedAmount > candidateRemaining + 0.01) {
      alert('Link amount exceeds the remaining balance on the candidate.')
      return
    }

    setLinkingTransactions(prev => new Set([...prev, key]))
    try {
      const result = await createTransactionLink(transactionId, candidateId, type, parsedAmount)
      if (!result.success && result.error) {
        alert(result.error)
      } else {
        const updatedRemaining = primaryRemaining !== null
          ? roundCurrency(Math.max(0, primaryRemaining - parsedAmount))
          : undefined
        const searchQuery = linkSearchQueries[key]
        if (searchQuery && shouldRunLinkSearch(searchQuery)) {
          runLinkSearch(transactionId, type, searchQuery, updatedRemaining)
        }
        router.refresh()
      }
    } catch (error: any) {
      alert(error?.message || 'Failed to link transaction.')
    } finally {
      setLinkingTransactions(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  async function handleRemoveLink(linkId: string) {
    const result = await removeTransactionLink(linkId)
    if (!result.success && result.error) {
      alert(result.error)
    } else {
      router.refresh()
    }
  }

  async function handleTogglePeriodStatus() {
    setIsTogglingPeriod(true)
    try {
      await togglePeriodLock(period.id)
      router.refresh()
    } catch (error: any) {
      alert(error?.message || 'Failed to update period status.')
    } finally {
      setIsTogglingPeriod(false)
    }
  }

  const prevPeriod = getAdjacentPeriod(period.year, period.month, -1)
  const nextPeriod = getAdjacentPeriod(period.year, period.month, 1)
  const now = new Date()
  const isCurrentPeriod = period.year === now.getFullYear() && period.month === now.getMonth() + 1

  const progressPercent = llmProgress.totalBatches > 0
    ? Math.min(100, Math.round((llmProgress.currentBatch / llmProgress.totalBatches) * 100))
    : 0

  const incomeMatchQuery = incomeMatchSearch.trim().toLowerCase()
  const filteredIncomeMatches = incomeMatchCandidates.filter(candidate => {
    if (!incomeMatchQuery) return true
    const amountText = Math.abs(candidate.amount || 0).toFixed(2)
    const haystack = [
      candidate.description || '',
      candidate.subDescription || '',
      amountText,
    ].join(' ').toLowerCase()
    return haystack.includes(incomeMatchQuery)
  })

  const recurringMatchQuery = recurringMatchSearch.trim().toLowerCase()
  const filteredRecurringMatches = recurringMatchCandidates.filter(candidate => {
    if (!recurringMatchQuery) return true
    const amountText = Math.abs(candidate.amount || 0).toFixed(2)
    const haystack = [
      candidate.description || '',
      candidate.subDescription || '',
      amountText,
    ].join(' ').toLowerCase()
    return haystack.includes(recurringMatchQuery)
  })

  return (
    <div className="space-y-6">
      {llmProgress.active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg border border-line bg-white p-5 shadow-lg">
            <div className="text-sm font-semibold text-foreground">
              Categorizing with GPT-5-mini
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded bg-line">
              <div
                className="h-full bg-accent-2 transition-[width] duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-monday-3pm">
              {llmProgress.totalBatches > 0
                ? `Batch ${llmProgress.currentBatch || 0} of ${llmProgress.totalBatches} · ${progressPercent}%`
                : 'Preparing batches...'}
            </div>
            <div className="mt-2 text-xs text-monday-3pm">
              Updated {llmProgress.updatedTransactions} transactions · {llmProgress.updatedOrders} Amazon orders · Skipped {llmProgress.skipped}
            </div>
            <div className="mt-2 text-xs text-monday-3pm">
              Please wait — other actions are paused while this runs.
            </div>
          </div>
        </div>
      )}
      {incomeMatchOpen && incomeMatchTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-lg border border-line bg-white p-5 shadow-lg">
            <div className="text-sm font-semibold text-foreground">
              Match Income to Import
            </div>
            <div className="mt-2 text-sm text-monday-3pm">
              {incomeMatchTarget.description} · {formatDateDisplay(incomeMatchTarget.date)} · {formatCurrency(Math.abs(incomeMatchTarget.amount))}
            </div>
            <div className="mt-2 text-xs text-monday-3pm">
              Tolerance: ±{formatCurrency(incomeMatchTolerance)}
            </div>

            <div className="mt-4">
              <input
                type="text"
                value={incomeMatchSearch}
                onChange={(e) => setIncomeMatchSearch(e.target.value)}
                placeholder="Search description or amount"
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-2"
              />
            </div>

            {incomeMatchError && (
              <div className="mt-3 text-sm text-rose-600">{incomeMatchError}</div>
            )}

            <div className="mt-4 space-y-2 max-h-72 overflow-y-auto border-t border-line pt-3">
              {filteredIncomeMatches.length === 0 ? (
                <div className="text-sm text-monday-3pm">No matches found.</div>
              ) : (
                filteredIncomeMatches.map(candidate => (
                  <div key={candidate.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 border-b border-line pb-2">
                    <div>
                      <div className="text-sm">
                        {candidate.date} · {formatCurrency(candidate.amount)} · {candidate.description}
                        {candidate.subDescription ? ` · ${candidate.subDescription}` : ''}
                      </div>
                      <div className="text-xs text-monday-3pm">
                        Δ {formatCurrency(candidate.amountDiff)} · {candidate.withinTolerance ? 'within tolerance' : 'outside tolerance'}
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => handleMatchIncomeCandidate(candidate.id)}
                      disabled={incomeMatchLinking}
                    >
                      {incomeMatchLinking ? 'Linking...' : 'Link'}
                    </Button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2 justify-end">
              <Button variant="secondary" onClick={handlePostIncomeWithoutMatch} disabled={incomeMatchLinking}>
                {incomeMatchLinking ? 'Posting...' : 'Post without match'}
              </Button>
              <Button variant="secondary" onClick={closeIncomeMatch} disabled={incomeMatchLinking}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
      {recurringMatchOpen && recurringMatchTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-lg border border-line bg-white p-5 shadow-lg">
            <div className="text-sm font-semibold text-foreground">
              Match Recurring to Transaction
            </div>
            <div className="mt-2 text-sm text-monday-3pm">
              {recurringMatchTarget.description} · {formatDateDisplay(recurringMatchTarget.date)} · {formatCurrency(Math.abs(recurringMatchTarget.amount))}
            </div>
            <div className="mt-2 text-xs text-monday-3pm">
              Tolerance: ±{formatCurrency(recurringMatchTolerance)}
            </div>

            <div className="mt-4">
              <input
                type="text"
                value={recurringMatchSearch}
                onChange={(e) => setRecurringMatchSearch(e.target.value)}
                placeholder="Search description or amount"
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-2"
              />
            </div>

            {recurringMatchError && (
              <div className="mt-3 text-sm text-rose-600">{recurringMatchError}</div>
            )}

            <div className="mt-4 space-y-2 max-h-72 overflow-y-auto border-t border-line pt-3">
              {filteredRecurringMatches.length === 0 ? (
                <div className="text-sm text-monday-3pm">No matches found.</div>
              ) : (
                filteredRecurringMatches.map(candidate => (
                  <div key={candidate.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 border-b border-line pb-2">
                    <div>
                      <div className="text-sm">
                        {candidate.date} · {formatCurrency(candidate.amount)} · {candidate.description}
                        {candidate.subDescription ? ` · ${candidate.subDescription}` : ''}
                      </div>
                      <div className="text-xs text-monday-3pm">
                        Δ {formatCurrency(candidate.amountDiff)} · {candidate.withinTolerance ? 'within tolerance' : 'outside tolerance'}
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => handleMatchRecurringCandidate(candidate.id)}
                      disabled={recurringMatchLinking}
                    >
                      {recurringMatchLinking ? 'Linking...' : 'Link'}
                    </Button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2 justify-end">
              <Button variant="secondary" onClick={closeRecurringMatch} disabled={recurringMatchLinking}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Month Header */}
      <Card title={`${getMonthName(period.month)} ${period.year}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-monday-3pm">
            Status: {period.status === 'open' ? 'Open' : 'Locked'} (Naturally.)
          </div>
          <div className="flex flex-wrap gap-2 w-full md:w-auto md:justify-end">
            <Button
              variant="secondary"
              onClick={() => router.push(`/?year=${prevPeriod.year}&month=${prevPeriod.month}`)}
            >
              Prev
            </Button>
            <Button
              variant="secondary"
              onClick={() => router.push(`/?year=${nextPeriod.year}&month=${nextPeriod.month}`)}
            >
              Next →
            </Button>
            <Button
              variant="secondary"
              onClick={() => router.push('/')}
              disabled={isCurrentPeriod}
            >
              Current
            </Button>
            <Button
              variant="secondary"
              onClick={handleTogglePeriodStatus}
              disabled={isTogglingPeriod}
            >
              {isTogglingPeriod
                ? 'Updating...'
                : period.status === 'open'
                  ? 'Lock month'
                  : 'Unlock month'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Income Section */}
      <Card title="Anticipated Income">
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setShowIncomePanel(prev => !prev)}
            className="md:hidden w-full rounded-md border border-line bg-white px-3 py-2 flex items-center justify-between text-left transition hover:bg-surface-muted"
          >
            <div>
              <div className="mono-label">Total income</div>
              <div className="text-lg font-medium">{formatCurrency(anticipatedIncome)}</div>
            </div>
            <div className="mono-label">
              {showIncomePanel ? 'Hide' : 'Show'}
            </div>
          </button>

          <div className={`${showIncomePanel ? 'block' : 'hidden'} md:block space-y-4`}>
            <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_auto] gap-2 items-end">
              <Input
                label="Source"
                value={incomeSource}
                onChange={setIncomeSource}
                placeholder="Paycheck, etc."
              />
              <Input
                label="Amount"
                type="text"
                inputMode="decimal"
                value={incomeAmount}
                onChange={setIncomeAmount}
                placeholder="0.00"
              />
              <Input
                label="Date"
                type="date"
                value={incomeDate}
                onChange={setIncomeDate}
              />
              <Button onClick={handleAddIncome}>Add income</Button>
            </div>

            <div className="border-t border-line pt-4">
              {incomeTransactions.length === 0 ? (
                <div className="text-sm text-monday-3pm py-2">
                  No income yet. (Project it, then make it real.)
                </div>
              ) : (
                incomeTransactions.map((item: any) => (
                  <div
                    key={item.id}
                    className="flex flex-col md:flex-row md:justify-between md:items-center gap-2 py-2 border-b border-line"
                  >
                    <div>
                      <span className="font-medium">{item.description}</span>
                      <span className="text-monday-3pm text-xs ml-2">
                        {formatDateDisplay(item.date)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{formatCurrency(Math.abs(item.amount))}</span>
                      <span className="rounded-full bg-accent-soft px-2 py-1 mono-label">
                        {item.status}
                      </span>
                      {item.status === 'projected' && (
                        <Button
                          onClick={() => handlePostIncome(item)}
                          disabled={incomeMatchLoading && incomeMatchLoadingId === item.id}
                        >
                          {incomeMatchLoading && incomeMatchLoadingId === item.id ? 'Matching...' : 'Post'}
                        </Button>
                      )}
                      <Button
                        variant="danger"
                        onClick={() => deleteTransaction(item.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="text-lg font-medium pt-4 border-t border-line">
              Total: {formatCurrency(anticipatedIncome)}
            </div>
          </div>
        </div>
      </Card>

      {/* Pre-allocations */}
      <Card title="Pre-allocations">
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setShowPreallocationsPanel(prev => !prev)}
            className="md:hidden w-full rounded-md border border-line bg-white px-3 py-2 flex items-center justify-between text-left transition hover:bg-surface-muted"
          >
            <div>
              <div className="mono-label">Goal budget</div>
              <div className="text-lg font-medium">{formatCurrency(preallocations.goalBudget)}</div>
            </div>
            <div className="mono-label">
              {showPreallocationsPanel ? 'Hide' : 'Show'}
            </div>
          </button>

          <div className={`${showPreallocationsPanel ? 'block' : 'hidden'} md:block`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="mono-label">Charity ({settings.charityPercent}%)</div>
                <div className="text-lg">{formatCurrency(preallocations.charity)}</div>
              </div>
              <div>
                <div className="mono-label">Retirement</div>
                <div className="text-lg">{formatCurrency(preallocations.retirement)}</div>
              </div>
              <div>
                <div className="mono-label">Other Savings</div>
                <div className="text-lg">{formatCurrency(preallocations.otherSavings)}</div>
              </div>
              <div className="border border-line p-3">
                <div className="mono-label">Goal Budget</div>
                <div className="text-lg font-medium">{formatCurrency(preallocations.goalBudget)}</div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Category Budgets */}
      <Card title="Category Budgets">
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setShowCategoryBudgetsPanel(prev => !prev)}
            className="md:hidden w-full rounded-md border border-line bg-white px-3 py-2 flex items-center justify-between text-left transition hover:bg-surface-muted"
          >
            <div>
              <div className="mono-label">Sum of budgets</div>
              <div className="text-lg font-medium">{formatCurrency(totalBudgeted)}</div>
            </div>
            <div className="mono-label">
              {showCategoryBudgetsPanel ? 'Hide' : 'Show'}
            </div>
          </button>

          <div className={`${showCategoryBudgetsPanel ? 'block' : 'hidden'} md:block space-y-2`}>
            {budgetSetupLocked && (
              <div className="border border-line bg-surface-muted p-3 text-sm text-foreground space-y-2">
                <div>
                  Set up recurring expenses first so your available budget reflects what’s already committed.
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => router.push('/recurring')}
                  >
                    Set up recurring
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setAllowBudgetSetup(true)}
                  >
                    Continue without recurring
                  </Button>
                </div>
              </div>
            )}
            <div className="border border-line bg-surface-muted p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-foreground">
                Need a starting point? Suggest budgets from the last 3 months of posted spending.
                Recurring categories use this month's recurring totals.
              </div>
              <Button
                variant="secondary"
                onClick={handleSuggestBudgets}
                disabled={budgetSetupLocked || isSuggestingBudgets}
              >
                {isSuggestingBudgets ? 'Suggesting...' : 'Suggest budgets'}
              </Button>
            </div>
            {BUDGET_CATEGORIES.map(category => {
              const budget = period.categoryBudgets.find((b: any) => b.category === category)
              const amount = budget?.amountBudgeted || 0

              return (
                <div key={category} className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_auto] gap-2 items-start sm:items-center py-2 border-b border-line">
                  <div className="text-sm">{category}</div>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={editingBudget[category] ?? amount.toString()}
                    onChange={(val) => setEditingBudget({ ...editingBudget, [category]: val })}
                    disabled={budgetSetupLocked}
                  />
                  <Button onClick={() => handleUpdateBudget(category)} disabled={budgetSetupLocked}>
                    Update
                  </Button>
                </div>
              )
            })}

            <div className="pt-4 border-t border-line space-y-2">
              <div className="flex justify-between text-sm">
                <span>Sum of Budgets:</span>
                <span className="font-medium">{formatCurrency(totalBudgeted)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Goal Budget:</span>
                <span>{formatCurrency(preallocations.goalBudget)}</span>
              </div>
              <div className="flex justify-between text-sm font-medium">
                <span>Difference:</span>
                <span className={budgetVsGoal > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                  {formatCurrency(budgetVsGoal)} {budgetVsGoal > 0 ? '(Over)' : '(Under)'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Recurring Committed:</span>
                <span>{formatCurrency(recurringCommitted)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Available After Recurring:</span>
                <span className="font-medium">{formatCurrency(availableAfterRecurring)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Non-Recurring Budgets:</span>
                <span>{formatCurrency(nonRecurringBudgeted)}</span>
              </div>
              <div className="flex justify-between text-sm font-medium">
                <span>Diff vs Available:</span>
                <span className={budgetVsAvailableAfterRecurring > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                  {formatCurrency(budgetVsAvailableAfterRecurring)} {budgetVsAvailableAfterRecurring > 0 ? '(Over)' : '(Under)'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Budget Dashboard Table */}
      <Card title="Budgeted vs Actual">
        <Table
          headers={[
            <span key="cat">Category</span>,
            <span key="bud">
              <span className="hidden sm:inline">Budgeted</span>
              <span className="sm:hidden">Bud</span>
            </span>,
            <span key="act">
              <span className="hidden sm:inline">Actual</span>
              <span className="sm:hidden">Act</span>
            </span>,
            <span key="diff">
              <span className="hidden sm:inline">Difference</span>
              <span className="sm:hidden">Diff</span>
            </span>,
          ]}
          rows={[
            ...categoryData.map(c => {
              const iconColors = getCategoryColor(c.category)
              const categoryCell = (
                <button
                  key={c.category}
                  type="button"
                  onClick={() => handleQuickFilterCategory(c.category)}
                  className="flex items-center gap-2 text-left"
                  title={`Filter by ${c.category}`}
                >
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${iconColors.bg} ${iconColors.text}`}
                    aria-hidden
                  >
                    {getMobileCategoryIcon(c.category)}
                  </span>
                  <span className="hidden md:inline">{c.category}</span>
                </button>
              )

              return [
                categoryCell,
                <div key={`${c.category}-bud`} className="text-right tabular-nums whitespace-nowrap">
                  {formatCurrencyRounded(c.budgeted)}
                </div>,
                <div key={`${c.category}-act`} className="text-right tabular-nums whitespace-nowrap">
                  {formatCurrencyRounded(c.actual)}
                </div>,
                <div
                  key={`${c.category}-diff`}
                  className={`text-right tabular-nums whitespace-nowrap ${c.difference > 0 ? 'text-rose-600' : 'text-emerald-600'}`}
                >
                  {formatCurrencyRounded(c.difference)}
                </div>
              ]
            }),
            [
              <strong key="total">Total</strong>,
              <strong key="budgeted" className="text-right tabular-nums whitespace-nowrap">
                {formatCurrencyRounded(totalBudgeted)}
              </strong>,
              <strong key="actual" className="text-right tabular-nums whitespace-nowrap">
                {formatCurrencyRounded(totalActual)}
              </strong>,
              <strong
                key="diff"
                className={`text-right tabular-nums whitespace-nowrap ${totalDifference > 0 ? 'text-rose-600' : 'text-emerald-600'}`}
              >
                {formatCurrencyRounded(totalDifference)}
              </strong>
            ]
          ]}
          rowClassNames={[
            ...categoryData.map(c => (budgetTableSelection === c.category ? 'bg-surface-muted' : '')),
            ''
          ]}
        />
      </Card>

      {/* Transactions */}
      <Card title="Transactions">
        <div className="space-y-4">
          <Input
            label="Search"
            value={transactionSearch}
            onChange={setTransactionSearch}
            placeholder="Search amount, description, category, or note"
          />
          <div className="md:hidden flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowAddTransactionForm(prev => !prev)}
              className="w-full rounded-md border border-line bg-white px-3 py-2 flex items-center justify-between text-left transition hover:bg-surface-muted"
            >
              <span className="mono-label">Add transaction</span>
              <span className="mono-label">{showAddTransactionForm ? 'Hide' : 'Show'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowTransactionFilters(prev => !prev)}
              className="w-full rounded-md border border-line bg-white px-3 py-2 flex items-center justify-between text-left transition hover:bg-surface-muted"
            >
              <span className="mono-label">Filters & actions</span>
              <span className="mono-label">{showTransactionFilters ? 'Hide' : 'Show'}</span>
            </button>
          </div>

          <form
            onSubmit={handleAddTransaction}
            className={`grid grid-cols-1 md:grid-cols-[2fr_1fr_2fr_1fr_auto] gap-2 items-end ${showAddTransactionForm ? '' : 'hidden md:grid'}`}
          >
            <Input
              label="Description"
              value={transactionDesc}
              onChange={setTransactionDesc}
              placeholder="Transaction description"
            />
            <Input
              label="Amount"
              type="text"
              inputMode="decimal"
              value={transactionAmount}
              onChange={setTransactionAmount}
              placeholder="0.00"
            />
            <SelectMenu
              label="Category"
              value={transactionCategory}
              onChange={setTransactionCategory}
              options={TRANSACTION_CATEGORIES.map(cat => ({ value: cat, label: cat }))}
              className="min-w-[200px]"
            />
            <Input
              label="Date"
              type="date"
              value={transactionDate}
              onChange={setTransactionDate}
            />
            <Button type="submit">Add</Button>
          </form>

          <div
            className={`flex flex-col md:flex-row md:items-center flex-wrap gap-4 border-y border-line py-3 ${
              showTransactionFilters ? '' : 'hidden md:flex'
            }`}
          >
            <SelectMenu
              label="Filter category"
              value={filterCategory}
              onChange={setFilterCategory}
              options={[
                { value: 'all', label: 'All' },
                ...TRANSACTION_CATEGORIES.map(cat => ({ value: cat, label: cat })),
              ]}
              className="min-w-[180px]"
            />
            <SelectMenu
              label="Filter status"
              value={filterStatus}
              onChange={setFilterStatus}
              options={[
                { value: 'all', label: 'All' },
                { value: 'projected', label: 'Projected' },
                { value: 'posted', label: 'Posted' },
              ]}
              className="min-w-[160px]"
            />
            <label className="flex items-center gap-2 mono-label">
              <input
                type="checkbox"
                checked={showIgnored}
                onChange={(e) => setShowIgnored(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-accent-2"
              />
              show ignored
            </label>
            <div className="flex flex-wrap gap-2 md:ml-auto">
              <Button
                variant={multiSelectMode ? 'primary' : 'secondary'}
                onClick={handleToggleMultiSelect}
                className={multiSelectMode ? 'shadow-sm' : ''}
              >
                {multiSelectMode ? 'Done selecting' : 'Select multiple'}
              </Button>
              <Button
                variant="secondary"
                onClick={handleMatchRecurring}
                disabled={isMatchingRecurring}
              >
                {isMatchingRecurring ? 'Matching...' : 'Match recurring'}
              </Button>
              <Button
                variant="secondary"
                onClick={handleLLMCategorize}
                disabled={isCategorizingWithLLM}
              >
                {isCategorizingWithLLM ? 'Categorizing...' : 'LLM categorize'}
              </Button>
            </div>
          </div>

          {/* Bulk Actions Toolbar */}
          {selectedTransactions.size > 0 && (
            <div className="bg-surface-muted border border-line p-4 flex flex-col md:flex-row md:items-center flex-wrap gap-4">
              <div className="font-medium">{selectedTransactions.size} selected</div>
              <SelectMenu
                label="Assign category"
                value={bulkCategory}
                placeholder="Select"
                onChange={(nextValue) => {
                  if (!nextValue) return
                  handleBulkCategoryUpdate(nextValue)
                  setBulkCategory('')
                }}
                options={TRANSACTION_CATEGORIES.map(cat => ({ value: cat, label: cat }))}
                className="min-w-[200px]"
              />
              <Button variant="danger" onClick={handleBulkDelete}>
                Delete selected
              </Button>
              <Button variant="secondary" onClick={() => setSelectedTransactions(new Set())}>
                Clear selection
              </Button>
            </div>
          )}

          <div className="hidden md:grid gap-4 items-center px-1 mono-label" style={transactionGridStyle}>
            {multiSelectMode && <div />}
            <button type="button" onClick={() => handleSortChange('date')} className="text-left hover:text-foreground">
              Date{getSortIndicator('date')}
            </button>
            <button type="button" onClick={() => handleSortChange('description')} className="text-left hover:text-foreground">
              Description{getSortIndicator('description')}
            </button>
            <button type="button" onClick={() => handleSortChange('category')} className="text-left hover:text-foreground">
              Category{getSortIndicator('category')}
            </button>
            <div className="text-monday-3pm">
              Account
            </div>
            <button type="button" onClick={() => handleSortChange('amount')} className="text-left hover:text-foreground">
              Amount{getSortIndicator('amount')}
            </button>
          </div>

          <div className="space-y-2">
            {sortedTransactions.length === 0 ? (
              <div className="text-center py-8 text-monday-3pm">
                No transactions yet. How... peaceful.
              </div>
            ) : (
              sortedTransactions.map((t: any, index: number) => {
                const amazonLink = t.amazonOrderTransactions?.[0]
                const amazonOrder = amazonLink?.order
                const showAmazonOrder = Boolean(amazonOrder && !amazonOrder.isIgnored)
                const amazonItems = showAmazonOrder ? (amazonOrder?.items || []) : []
                const amazonItemPreview = amazonItems.slice(0, 3).map((item: any) => item.title).filter(Boolean)
                const extraAmazonItems = amazonItems.length - amazonItemPreview.length
                const amazonSplitCount = amazonOrder?._count?.amazonOrderTransactions || 0
                const refundLinksFrom = (t.linksFrom || []).filter((link: any) => link.type === 'refund')
                const refundLinksTo = (t.linksTo || []).filter((link: any) => link.type === 'refund')
                const reimbursementLinksFrom = (t.linksFrom || []).filter((link: any) => link.type === 'reimbursement')
                const reimbursementLinksTo = (t.linksTo || []).filter((link: any) => link.type === 'reimbursement')
                const expenseValue = getExpenseAmount(t)
                const expenseAmount = Math.abs(expenseValue)
                const refundedTotal = refundLinksTo.reduce((sum: number, link: any) => sum + (link.amount || 0), 0)
                const reimbursedTotal = reimbursementLinksTo.reduce((sum: number, link: any) => sum + (link.amount || 0), 0)
                const refundRemaining = getRemainingLinkAmount(t, 'refund')
                const reimbursementRemaining = getRemainingLinkAmount(t, 'reimbursement')
                const refundKey = `${t.id}:refund`
                const reimbursementKey = `${t.id}:reimbursement`
                const refundPanelOpen = Object.prototype.hasOwnProperty.call(linkCandidates, refundKey)
                const reimbursementPanelOpen = Object.prototype.hasOwnProperty.call(linkCandidates, reimbursementKey)
                const refundLinking = linkingTransactions.has(refundKey)
                const reimbursementLinking = linkingTransactions.has(reimbursementKey)
                const refundSearchQuery = linkSearchQueries[refundKey] ?? ''
                const reimbursementSearchQuery = linkSearchQueries[reimbursementKey] ?? ''
                const refundSearchResults = linkSearchResults[refundKey]
                const reimbursementSearchResults = linkSearchResults[reimbursementKey]
                const refundSearchError = linkSearchErrors[refundKey]
                const reimbursementSearchError = linkSearchErrors[reimbursementKey]
                const refundSearchLoading = linkSearchLoading.has(refundKey)
                const reimbursementSearchLoading = linkSearchLoading.has(reimbursementKey)
                const isExpanded = expandedTransactions.has(t.id)
                const isSelected = selectedTransactions.has(t.id)
                const categoryColors = getCategoryColor(t.category || 'Uncategorized')
                const statusLabel = t.status || 'posted'
                const hasNote = Boolean(t.userDescription && t.userDescription.trim())
                const projectedClass = statusLabel === 'projected' ? 'text-monday-3pm italic' : ''
                const categoryLabel = t.category || 'Uncategorized'
                const mobileCategoryIcon = getMobileCategoryIcon(categoryLabel)
                const categoryDisabled = t.status === 'projected' && t.source === 'recurring'
                const isMobileCategoryOpen = mobileCategoryPicker === t.id
                const currentDateKey = formatDate(t.date)
                const previousDateKey = index > 0 ? formatDate(sortedTransactions[index - 1].date) : null
                const showMobileDateHeader = currentDateKey !== previousDateKey
                const hasLinkActivity =
                  refundLinksFrom.length > 0
                  || reimbursementLinksFrom.length > 0
                  || refundLinksTo.length > 0
                  || reimbursementLinksTo.length > 0

                return (
                  <div
                    key={t.id}
                    className={`border-b border-line text-sm ${t.isIgnored ? 'opacity-60' : ''}`}
                  >
                    {showMobileDateHeader && (
                      <div className="md:hidden pt-3 mono-label">
                        {formatDateDisplay(t.date)}
                      </div>
                    )}
                    <div
                      className={`md:hidden flex items-center gap-3 py-2 ${
                        !multiSelectMode ? 'cursor-pointer hover:bg-surface-muted' : ''
                      } ${isSelected ? 'bg-surface-muted' : ''}`}
                      onClick={(e) => handleRowClick(t.id, index, e)}
                    >
                      {multiSelectMode && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          onClick={(e) => {
                            e.stopPropagation()
                            handleTransactionSelect(t.id, index, e)
                          }}
                          className="w-4 h-4 cursor-pointer"
                        />
                      )}
                      <button
                        type="button"
                        disabled={categoryDisabled}
                        aria-label={`Category: ${categoryLabel}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (categoryDisabled) return
                          setMobileCategoryPicker(prev => (prev === t.id ? null : t.id))
                        }}
                        className={`flex h-8 w-8 items-center justify-center rounded-full ${categoryColors.bg} ${categoryColors.text} ${
                          categoryDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80'
                        }`}
                      >
                        {mobileCategoryIcon}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className={`truncate ${projectedClass}`}>{t.description}</div>
                      </div>
                      <div className={`font-medium tabular-nums ${projectedClass}`}>
                        {formatCurrency(t.amount)}
                      </div>
                    </div>
                    {isMobileCategoryOpen && (
                      <div
                        className="md:hidden pl-11 pb-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="mono-label">Category</div>
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {TRANSACTION_CATEGORIES.map(cat => {
                            const colors = getCategoryColor(cat)
                            const isActive = cat === categoryLabel
                            return (
                              <button
                                key={cat}
                                type="button"
                                disabled={categoryDisabled}
                                onClick={() => handleCategorySelection(t.id, cat)}
                                className={`flex items-center gap-2 rounded-md border px-2 py-2 text-left text-xs transition ${
                                  isActive ? 'border-accent' : 'border-line'
                                } ${categoryDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-surface-muted'}`}
                              >
                                <span className={`flex h-7 w-7 items-center justify-center rounded-full ${colors.bg} ${colors.text}`}>
                                  {getMobileCategoryIcon(cat)}
                                </span>
                                <span>{cat}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    <div
                      className={`hidden md:grid gap-3 md:gap-4 items-start py-3 ${
                        !multiSelectMode ? 'cursor-pointer hover:bg-surface-muted' : ''
                      } ${isSelected ? 'bg-surface-muted' : ''}`}
                      style={transactionGridStyle}
                      onClick={(e) => handleRowClick(t.id, index, e)}
                    >
                      {multiSelectMode && (
                        <div className="pt-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            onClick={(e) => {
                              e.stopPropagation()
                              handleTransactionSelect(t.id, index, e)
                            }}
                            className="w-4 h-4 cursor-pointer"
                          />
                        </div>
                      )}
                      <div>
                        <div className="text-xs text-monday-3pm md:text-sm">
                          {formatDateDisplay(t.date)}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className={`font-medium ${projectedClass}`}>{t.description}</div>
                        {t.subDescription && (
                          <div className="text-xs text-monday-3pm">{t.subDescription}</div>
                        )}
                        {hasNote && (
                          <div className="text-xs text-monday-3pm">Note: {t.userDescription}</div>
                        )}
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        {isExpanded ? (
                          <InlineCategoryEditor
                            transactionId={t.id}
                            currentCategory={categoryLabel}
                            onCategoryChange={handleCategoryChange}
                            onRecurringCategorySelected={handleRecurringCategorySelected}
                            disabled={t.status === 'projected' && t.source === 'recurring'}
                          />
                        ) : (
                          <span
                            className={`inline-flex items-center px-3 py-1 rounded-full mono-chip ${categoryColors.bg} ${categoryColors.text}`}
                          >
                            {categoryLabel}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-monday-3pm truncate">
                        {t.account?.name || t.importBatch?.account?.name || '—'}
                      </div>
                      <div>
                        <div className={`font-medium tabular-nums ${projectedClass}`}>
                          {formatCurrency(t.amount)}
                        </div>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="bg-white px-4 py-4">
                        <div className="space-y-4">
                          {t.subDescription && (
                            <div>
                              <div className="mono-label">Details</div>
                              <div className="mt-1 text-sm text-foreground">{t.subDescription}</div>
                            </div>
                          )}
                          <div>
                            <div className="mono-label">Status</div>
                            <div className="mt-1 text-sm text-foreground">
                              {statusLabel}{t.isIgnored ? ' · ignored' : ''}
                            </div>
                          </div>
                          <div>
                            <div className="mono-label">Note</div>
                            <div className="mt-2">
                              <InlineNoteEditor
                                transactionId={t.id}
                                note={t.userDescription}
                                onNoteChange={handleNoteChange}
                                disabled={t.status === 'projected' && t.source === 'recurring'}
                              />
                            </div>
                          </div>
                          <div>
                            <div className="mono-label">Actions</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {t.status === 'projected' && (
                                <Button
                                  onClick={() => (
                                    t.category === 'Income'
                                      ? handlePostIncome(t)
                                      : t.source === 'recurring'
                                        ? handlePostRecurring(t)
                                        : markTransactionPosted(t.id)
                                  )}
                                  disabled={
                                    (t.category === 'Income' && incomeMatchLoading && incomeMatchLoadingId === t.id)
                                    || (t.source === 'recurring' && recurringMatchLoading && recurringMatchLoadingId === t.id)
                                  }
                                >
                                  {(t.category === 'Income' && incomeMatchLoading && incomeMatchLoadingId === t.id)
                                    || (t.source === 'recurring' && recurringMatchLoading && recurringMatchLoadingId === t.id)
                                    ? 'Matching...'
                                    : 'Post'}
                                </Button>
                              )}
                              {t.source === 'import' && (
                                <Button
                                  variant="secondary"
                                  onClick={() => handleIgnoreTransaction(t.id)}
                                >
                                  Ignore like this
                                </Button>
                              )}
                              <Button
                                variant="secondary"
                                onClick={() => handleToggleIgnore(t.id, !t.isIgnored)}
                              >
                                {t.isIgnored ? 'Unignore' : 'Ignore'}
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() => toggleLinkCandidates(t.id, 'refund')}
                                disabled={t.status !== 'posted' || t.isIgnored}
                              >
                                Link refund
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() => toggleLinkCandidates(t.id, 'reimbursement')}
                                disabled={t.status !== 'posted' || t.isIgnored}
                              >
                                Link reimbursement
                              </Button>
                              <Button
                                variant="danger"
                                onClick={() => deleteTransaction(t.id)}
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                          {showAmazonOrder && (
                            <div>
                              <div className="mono-label">Amazon</div>
                              <div className="mt-2 text-xs text-monday-3pm space-y-1">
                                <div>
                                  Amazon order #{amazonOrder.amazonOrderId} · {formatDateDisplay(amazonOrder.orderDate)} · {formatCurrency(amazonOrder.orderTotal, amazonOrder.currency || 'CAD')}
                                  {amazonSplitCount > 1 && ` · split (${amazonSplitCount} transactions)`}
                                </div>
                                {amazonItemPreview.length > 0 && (
                                  <div>
                                    Items: {amazonItemPreview.join(', ')}
                                    {extraAmazonItems > 0 && ` +${extraAmazonItems} more`}
                                  </div>
                                )}
                                {amazonOrder.orderUrl && (
                                  <a href={amazonOrder.orderUrl} target="_blank" rel="noreferrer" className="hover:underline">
                                    View Amazon order
                                  </a>
                                )}
                              </div>
                            </div>
                          )}
                          {hasLinkActivity && (
                            <div>
                              <div className="mono-label">Links</div>
                              <div className="mt-2 text-xs text-monday-3pm space-y-2">
                                {refundLinksFrom.length > 0 && (
                                  <div className="space-y-1">
                                    {refundLinksFrom.map((link: any) => (
                                      <div key={link.id} className="flex flex-wrap items-center gap-2">
                                        <span>
                                          Refund for {link.toTransaction?.description} · {link.toTransaction?.date ? formatDateDisplay(link.toTransaction.date) : 'Unknown date'} · {formatCurrency(Math.abs(link.amount))}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveLink(link.id)}
                                          className="mono-label hover:text-foreground"
                                        >
                                          Unlink
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {reimbursementLinksFrom.length > 0 && (
                                  <div className="space-y-1">
                                    {reimbursementLinksFrom.map((link: any) => (
                                      <div key={link.id} className="flex flex-wrap items-center gap-2">
                                        <span>
                                          Reimbursement for {link.toTransaction?.description} · {link.toTransaction?.date ? formatDateDisplay(link.toTransaction.date) : 'Unknown date'} · {formatCurrency(Math.abs(link.amount))}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveLink(link.id)}
                                          className="mono-label hover:text-foreground"
                                        >
                                          Unlink
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {refundLinksTo.length > 0 && (
                                  <div className="space-y-1">
                                    <div>
                                      {refundedTotal >= expenseAmount - 0.01 ? 'Refunded' : 'Partially refunded'} · {formatCurrency(refundedTotal)}
                                    </div>
                                    {refundLinksTo.map((link: any) => (
                                      <div key={link.id} className="flex flex-wrap items-center gap-2">
                                        <span>
                                          From {link.fromTransaction?.description} · {link.fromTransaction?.date ? formatDateDisplay(link.fromTransaction.date) : 'Unknown date'} · {formatCurrency(Math.abs(link.amount))}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveLink(link.id)}
                                          className="mono-label hover:text-foreground"
                                        >
                                          Unlink
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {reimbursementLinksTo.length > 0 && (
                                  <div className="space-y-1">
                                    <div>
                                      {reimbursedTotal >= expenseAmount - 0.01 ? 'Reimbursed' : 'Partially reimbursed'} · {formatCurrency(reimbursedTotal)}
                                    </div>
                                    {reimbursementLinksTo.map((link: any) => (
                                      <div key={link.id} className="flex flex-wrap items-center gap-2">
                                        <span>
                                          From {link.fromTransaction?.description} · {link.fromTransaction?.date ? formatDateDisplay(link.fromTransaction.date) : 'Unknown date'} · {formatCurrency(Math.abs(link.amount))}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveLink(link.id)}
                                          className="mono-label hover:text-foreground"
                                        >
                                          Unlink
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        {refundPanelOpen && (
                          <div className="mt-4 border border-line bg-white px-4 py-3 text-xs">
                            <div className="mono-label">Refund search</div>
                            <div className="mt-1 text-monday-3pm">
                              {expenseValue < 0 ? 'Remaining refund balance' : 'Remaining to refund'}: {formatCurrency(refundRemaining)}
                            </div>
                            <div className="mt-2 text-monday-3pm">
                              Search and link specific transactions.
                            </div>
                            <div className="mt-4 border-t border-line pt-3">
                              <div className="mono-label">Search</div>
                              <input
                                type="text"
                                placeholder="Search description, note, or amount"
                                value={refundSearchQuery}
                                onChange={(e) => handleLinkSearchChange(t.id, 'refund', e.target.value)}
                                className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-2"
                              />
                              {refundSearchLoading && (
                                <div className="mt-2 text-monday-3pm">Searching...</div>
                              )}
                              {refundSearchError && (
                                <div className="mt-2 text-rose-600">{refundSearchError}</div>
                              )}
                              {refundSearchQuery && !refundSearchLoading && refundSearchResults && refundSearchResults.length === 0 && (
                                <div className="mt-2 text-monday-3pm">No matches found.</div>
                              )}
                              {refundSearchResults && refundSearchResults.length > 0 && (
                                <div className="mt-2 space-y-2">
                                  {refundSearchResults.map((candidate: any) => (
                                    <div key={candidate.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                      <div>
                                        <div>
                                          {candidate.date} · {formatCurrency(candidate.amount)} · {candidate.description}
                                          {candidate.subDescription ? ` · ${candidate.subDescription}` : ''}
                                          {candidate.category ? ` · ${candidate.category}` : ''}
                                        </div>
                                        <div className="text-monday-3pm">
                                          Available: {formatCurrency(candidate.remainingAmount ?? Math.abs(candidate.amount))}
                                        </div>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          value={linkAmountInputs[`${t.id}:refund:${candidate.id}`] ?? ''}
                                          onChange={(e) =>
                                            setLinkAmountInputs(prev => ({
                                              ...prev,
                                              [`${t.id}:refund:${candidate.id}`]: e.target.value,
                                            }))
                                          }
                                          className="w-28 rounded-md border border-line bg-white px-2 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-2"
                                        />
                                        <Button
                                          variant="secondary"
                                          onClick={() => handleCreateLink(t.id, candidate.id, 'refund')}
                                          disabled={
                                            refundLinking
                                            || refundRemaining <= 0
                                            || (candidate.remainingAmount ?? Math.abs(candidate.amount)) <= 0
                                          }
                                        >
                                          {refundLinking ? 'Linking...' : 'Link refund'}
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {reimbursementPanelOpen && (
                          <div className="mt-4 border border-line bg-white px-4 py-3 text-xs">
                            <div className="mono-label">Reimbursement search</div>
                            <div className="mt-1 text-monday-3pm">
                              {expenseValue < 0 ? 'Remaining reimbursement balance' : 'Remaining to reimburse'}: {formatCurrency(reimbursementRemaining)}
                            </div>
                            <div className="mt-2 text-monday-3pm">
                              Search and link specific transactions.
                            </div>
                            <div className="mt-4 border-t border-line pt-3">
                              <div className="mono-label">Search</div>
                              <input
                                type="text"
                                placeholder="Search description, note, or amount"
                                value={reimbursementSearchQuery}
                                onChange={(e) => handleLinkSearchChange(t.id, 'reimbursement', e.target.value)}
                                className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-2"
                              />
                              {reimbursementSearchLoading && (
                                <div className="mt-2 text-monday-3pm">Searching...</div>
                              )}
                              {reimbursementSearchError && (
                                <div className="mt-2 text-rose-600">{reimbursementSearchError}</div>
                              )}
                              {reimbursementSearchQuery && !reimbursementSearchLoading && reimbursementSearchResults && reimbursementSearchResults.length === 0 && (
                                <div className="mt-2 text-monday-3pm">No matches found.</div>
                              )}
                              {reimbursementSearchResults && reimbursementSearchResults.length > 0 && (
                                <div className="mt-2 space-y-2">
                                  {reimbursementSearchResults.map((candidate: any) => (
                                    <div key={candidate.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                      <div>
                                        <div>
                                          {candidate.date} · {formatCurrency(candidate.amount)} · {candidate.description}
                                          {candidate.subDescription ? ` · ${candidate.subDescription}` : ''}
                                          {candidate.category ? ` · ${candidate.category}` : ''}
                                        </div>
                                        <div className="text-monday-3pm">
                                          Available: {formatCurrency(candidate.remainingAmount ?? Math.abs(candidate.amount))}
                                        </div>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          value={linkAmountInputs[`${t.id}:reimbursement:${candidate.id}`] ?? ''}
                                          onChange={(e) =>
                                            setLinkAmountInputs(prev => ({
                                              ...prev,
                                              [`${t.id}:reimbursement:${candidate.id}`]: e.target.value,
                                            }))
                                          }
                                          className="w-28 rounded-md border border-line bg-white px-2 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-2"
                                        />
                                        <Button
                                          variant="secondary"
                                          onClick={() => handleCreateLink(t.id, candidate.id, 'reimbursement')}
                                          disabled={
                                            reimbursementLinking
                                            || reimbursementRemaining <= 0
                                            || (candidate.remainingAmount ?? Math.abs(candidate.amount)) <= 0
                                          }
                                        >
                                          {reimbursementLinking ? 'Linking...' : 'Link reimbursement'}
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </Card>

      {/* Recurring Modal */}
      {recurringTransaction && (
        <RecurringModal
          isOpen={recurringModalOpen}
          onClose={() => {
            setRecurringModalOpen(false)
            setRecurringTransaction(null)
            setRecurringDefinitions([])
          }}
          transactionId={recurringTransaction.id}
          transactionAmount={recurringTransaction.amount}
          transactionDescription={recurringTransaction.description}
          transactionRawDescription={buildCompositeDescription(
            recurringTransaction.description,
            recurringTransaction.subDescription
          )}
          transactionDate={recurringTransaction.date}
          category={recurringTransaction.intendedCategory ?? recurringTransaction.category}
          existingDefinitions={recurringDefinitions}
          onLink={handleLinkRecurring}
          onCreate={handleCreateRecurring}
        />
      )}
    </div>
  )
}

function getMonthName(month: number): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
  return months[month - 1]
}

function getAdjacentPeriod(year: number, month: number, delta: number) {
  let nextMonth = month + delta
  let nextYear = year

  if (nextMonth < 1) {
    nextMonth = 12
    nextYear -= 1
  } else if (nextMonth > 12) {
    nextMonth = 1
    nextYear += 1
  }

  return { year: nextYear, month: nextMonth }
}
