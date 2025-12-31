'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from './Card'
import { Input } from './Input'
import { Button } from './Button'
import { Table } from './Table'
import { InlineCategoryEditor } from './InlineCategoryEditor'
import { InlineNoteEditor } from './InlineNoteEditor'
import { RecurringModal } from './RecurringModal'
import { formatCurrency, parseCurrency, roundCurrency } from '@/lib/utils/currency'
import { calculatePreallocations } from '@/lib/utils/calculations'
import { CATEGORIES, isRecurringCategory } from '@/lib/constants/categories'
import { formatDateDisplay, formatDate, parseDateInput } from '@/lib/utils/dates'
import { buildCompositeDescription } from '@/lib/utils/import/normalizer'
import {
  addIncomeItem,
  deleteIncomeItem,
  updateCategoryBudget,
  suggestCategoryBudgets,
} from '@/lib/actions/period'
import {
  addManualTransaction,
  markTransactionPosted,
  deleteTransaction,
  updateTransactionCategory,
  updateTransactionNote,
  linkTransactionToRecurring,
  createRecurringFromTransaction,
  getActiveRecurringDefinitions,
  setTransactionIgnored,
} from '@/lib/actions/transactions'
import {
  createCategoryMappingRule,
  dismissCategoryMappingSuggestion,
} from '@/lib/actions/category-mappings'
import { categorizeTransactionsWithLLM } from '@/lib/actions/llm-categorize'
import { matchExistingImportsForPeriod } from '@/lib/actions/recurring'
import { createIgnoreRuleFromTransaction } from '@/lib/actions/ignore-rules'

type Period = any // TODO: Type this properly
type Settings = any

export function BudgetDashboard({ period, settings }: { period: Period; settings: Settings }) {
  const router = useRouter()

  const [incomeSource, setIncomeSource] = useState('')
  const [incomeAmount, setIncomeAmount] = useState('')
  const [incomeDate, setIncomeDate] = useState(formatDate(new Date()))

  const [transactionDesc, setTransactionDesc] = useState('')
  const [transactionAmount, setTransactionAmount] = useState('')
  const [transactionCategory, setTransactionCategory] = useState<string>(CATEGORIES[0])
  const [transactionDate, setTransactionDate] = useState(formatDate(new Date()))
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [isMatchingRecurring, setIsMatchingRecurring] = useState(false)
  const [isCategorizingWithLLM, setIsCategorizingWithLLM] = useState(false)
  const [llmScope, setLlmScope] = useState<'period' | 'all'>('period')
  const [isSuggestingBudgets, setIsSuggestingBudgets] = useState(false)
  const [allowBudgetSetup, setAllowBudgetSetup] = useState(false)

  const [editingBudget, setEditingBudget] = useState<Record<string, string>>({})

  // Multi-select state
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(new Set())
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null)

  // Recurring modal state
  const [recurringModalOpen, setRecurringModalOpen] = useState(false)
  const [recurringTransaction, setRecurringTransaction] = useState<any>(null)
  const [recurringDefinitions, setRecurringDefinitions] = useState<any[]>([])

  // Calculate anticipated income
  const anticipatedIncome = period.incomeItems.reduce((sum: number, item: any) => sum + item.amount, 0)

  // Calculate preallocations
  const preallocations = calculatePreallocations({
    anticipatedIncome,
    charityPercent: settings.charityPercent,
    retirementAmount: settings.retirementAmount,
    otherSavingsAmount: settings.otherSavingsAmount,
  })

  // Calculate category budgets and actuals
  const activeTransactions = period.transactions.filter((t: any) => !t.isIgnored)

  const categoryData = CATEGORIES.map(category => {
    const budget = period.categoryBudgets.find((b: any) => b.category === category)
    const budgeted = budget?.amountBudgeted || 0

    const categoryTransactions = activeTransactions.filter((t: any) => t.category === category)
    const actual = categoryTransactions.reduce((sum: number, t: any) => sum + t.amount, 0)
    const difference = actual - budgeted

    return { category, budgeted, actual, difference }
  })

  const totalBudgeted = categoryData.reduce((sum, c) => sum + c.budgeted, 0)
  const totalActual = categoryData.reduce((sum, c) => sum + c.actual, 0)
  const totalDifference = totalActual - totalBudgeted
  const budgetVsGoal = totalBudgeted - preallocations.goalBudget

  // Filter transactions
  const filteredTransactions = period.transactions.filter((t: any) => {
    if (filterCategory !== 'all' && t.category !== filterCategory) return false
    if (filterStatus !== 'all' && t.status !== filterStatus) return false
    return true
  })

  const hasRecurringDefinitions = (period.user?.recurringDefinitions?.length ?? 0) > 0
  const budgetSetupLocked = !hasRecurringDefinitions && !allowBudgetSetup

  const getExpenseAmount = (transaction: any) => {
    if (transaction.source === 'import') {
      const accountType = transaction.importBatch?.account?.type
      if (accountType === 'bank') return -transaction.amount
      if (accountType === 'credit_card') return transaction.amount
    }
    return transaction.amount
  }

  const recurringCommitted = roundCurrency(
    activeTransactions
      .filter((t: any) => isRecurringCategory(t.category))
      .reduce((sum: number, t: any) => {
        const expense = getExpenseAmount(t)
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

  async function handleAddIncome(e?: React.FormEvent) {
    e?.preventDefault()
    if (!incomeSource || !incomeAmount) return

    await addIncomeItem(period.id, {
      date: parseDateInput(incomeDate),
      source: incomeSource,
      amount: parseCurrency(incomeAmount),
    })

    setIncomeSource('')
    setIncomeAmount('')
  }

  async function handleAddTransaction(e?: React.FormEvent) {
    e?.preventDefault()
    if (!transactionDesc || !transactionAmount) return

    await addManualTransaction(period.id, {
      date: parseDateInput(transactionDate),
      description: transactionDesc,
      amount: parseCurrency(transactionAmount),
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
      : await getActiveRecurringDefinitions(period.userId, undefined)

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

  function handleTransactionClick(transactionId: string, index: number, event: React.MouseEvent) {
    const newSelected = new Set(selectedTransactions)

    if (event.shiftKey && lastSelectedIndex !== null) {
      // Shift-click: select range
      const start = Math.min(lastSelectedIndex, index)
      const end = Math.max(lastSelectedIndex, index)
      for (let i = start; i <= end; i++) {
        newSelected.add(filteredTransactions[i].id)
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
    try {
      const result = await categorizeTransactionsWithLLM(period.id, { scope: llmScope })
      if (result.updated === 0) {
        alert('No transactions or linked Amazon orders were categorized.')
      } else {
        const updatedTransactions = result.updatedTransactions ?? 0
        const updatedOrders = result.updatedOrders ?? 0
        alert(`Categorized ${updatedTransactions} transactions and ${updatedOrders} Amazon orders. Skipped ${result.skipped}.`)
      }
      router.refresh()
    } catch (error: any) {
      alert(error?.message || 'Failed to categorize with gpt-5-mini.')
    } finally {
      setIsCategorizingWithLLM(false)
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

  const prevPeriod = getAdjacentPeriod(period.year, period.month, -1)
  const nextPeriod = getAdjacentPeriod(period.year, period.month, 1)
  const now = new Date()
  const isCurrentPeriod = period.year === now.getFullYear() && period.month === now.getMonth() + 1

  return (
    <div className="space-y-6">
      {/* Month Header */}
      <Card title={`${getMonthName(period.month)} ${period.year}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-monday-3pm">
            Status: {period.status === 'open' ? 'Open' : 'Locked'} (Naturally.)
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => router.push(`/?year=${prevPeriod.year}&month=${prevPeriod.month}`)}
            >
              ← PREV
            </Button>
            <Button
              variant="secondary"
              onClick={() => router.push(`/?year=${nextPeriod.year}&month=${nextPeriod.month}`)}
            >
              NEXT →
            </Button>
            <Button
              variant="secondary"
              onClick={() => router.push('/')}
              disabled={isCurrentPeriod}
            >
              CURRENT
            </Button>
          </div>
        </div>
      </Card>

      {/* Income Section */}
      <Card title="Anticipated Income">
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
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
            <Button onClick={handleAddIncome}>ADD INCOME</Button>
          </div>

          <div className="border-t-2 border-cubicle-taupe pt-4">
            {period.incomeItems.map((item: any) => (
              <div key={item.id} className="flex justify-between items-center py-2 border-b border-cubicle-taupe">
                <div>
                  <span className="font-medium">{item.source}</span>
                  <span className="text-monday-3pm text-xs ml-2">
                    {formatDateDisplay(item.date)}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span>{formatCurrency(item.amount)}</span>
                  <Button
                    variant="danger"
                    onClick={() => deleteIncomeItem(item.id)}
                  >
                    DELETE
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="text-lg font-medium pt-4 border-t-2 border-dark">
            Total: {formatCurrency(anticipatedIncome)}
          </div>
        </div>
      </Card>

      {/* Pre-allocations */}
      <Card title="Pre-allocations">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs uppercase text-monday-3pm">Charity ({settings.charityPercent}%)</div>
            <div className="text-lg">{formatCurrency(preallocations.charity)}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-monday-3pm">Retirement</div>
            <div className="text-lg">{formatCurrency(preallocations.retirement)}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-monday-3pm">Other Savings</div>
            <div className="text-lg">{formatCurrency(preallocations.otherSavings)}</div>
          </div>
          <div className="border-2 border-dark p-3">
            <div className="text-xs uppercase text-monday-3pm">Goal Budget</div>
            <div className="text-lg font-medium">{formatCurrency(preallocations.goalBudget)}</div>
          </div>
        </div>
      </Card>

      {/* Category Budgets */}
      <Card title="Category Budgets">
        <div className="space-y-2">
          {budgetSetupLocked && (
            <div className="border-2 border-dark bg-ceiling-grey p-3 text-sm text-dark space-y-2">
              <div>
                Set up recurring expenses first so your available budget reflects what’s already committed.
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => router.push('/recurring')}
                >
                  SET UP RECURRING
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setAllowBudgetSetup(true)}
                >
                  CONTINUE WITHOUT RECURRING
                </Button>
              </div>
            </div>
          )}
          <div className="border-2 border-cubicle-taupe bg-background p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-dark">
              Need a starting point? Suggest budgets from the last 3 months of posted spending.
              Recurring categories use this month's recurring totals.
            </div>
            <Button
              variant="secondary"
              onClick={handleSuggestBudgets}
              disabled={budgetSetupLocked || isSuggestingBudgets}
            >
              {isSuggestingBudgets ? 'SUGGESTING...' : 'SUGGEST BUDGETS'}
            </Button>
          </div>
          {CATEGORIES.map(category => {
            const budget = period.categoryBudgets.find((b: any) => b.category === category)
            const amount = budget?.amountBudgeted || 0

            return (
              <div key={category} className="grid grid-cols-[2fr_1fr_auto] gap-2 items-center py-2 border-b border-cubicle-taupe">
                <div className="text-sm">{category}</div>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={editingBudget[category] ?? amount.toString()}
                  onChange={(val) => setEditingBudget({ ...editingBudget, [category]: val })}
                  disabled={budgetSetupLocked}
                />
                <Button onClick={() => handleUpdateBudget(category)} disabled={budgetSetupLocked}>
                  UPDATE
                </Button>
              </div>
            )
          })}

          <div className="pt-4 border-t-2 border-dark space-y-2">
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
              <span className={budgetVsGoal > 0 ? 'text-red-700' : 'text-green-700'}>
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
              <span className={budgetVsAvailableAfterRecurring > 0 ? 'text-red-700' : 'text-green-700'}>
                {formatCurrency(budgetVsAvailableAfterRecurring)} {budgetVsAvailableAfterRecurring > 0 ? '(Over)' : '(Under)'}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Budget Dashboard Table */}
      <Card title="Budgeted vs Actual">
        <Table
          headers={['Category', 'Budgeted', 'Actual', 'Difference']}
          rows={[
            ...categoryData.map(c => [
              c.category,
              formatCurrency(c.budgeted),
              formatCurrency(c.actual),
              <span key={c.category} className={c.difference > 0 ? 'text-red-700' : 'text-green-700'}>
                {formatCurrency(c.difference)}
              </span>
            ]),
            [
              <strong key="total">TOTAL</strong>,
              <strong key="budgeted">{formatCurrency(totalBudgeted)}</strong>,
              <strong key="actual">{formatCurrency(totalActual)}</strong>,
              <strong key="diff" className={totalDifference > 0 ? 'text-red-700' : 'text-green-700'}>
                {formatCurrency(totalDifference)}
              </strong>
            ]
          ]}
        />
      </Card>

      {/* Transactions */}
      <Card title="Transactions">
        <div className="space-y-4">
          <form onSubmit={handleAddTransaction} className="grid grid-cols-[2fr_1fr_2fr_1fr_auto] gap-2 items-end">
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
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase tracking-wider text-dark font-medium">
                Category
              </label>
              <select
                value={transactionCategory}
                onChange={(e) => setTransactionCategory(e.target.value)}
                className="border-2 border-cubicle-taupe bg-white px-3 py-2 text-dark focus:outline-none focus:border-dark"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <Input
              label="Date"
              type="date"
              value={transactionDate}
              onChange={setTransactionDate}
            />
            <Button type="submit">ADD</Button>
          </form>

          <div className="flex flex-wrap gap-4 items-center border-y-2 border-cubicle-taupe py-3">
            <div className="flex gap-2 items-center">
              <label className="text-xs uppercase">Filter Category:</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="border-2 border-cubicle-taupe bg-white px-2 py-1 text-sm"
              >
                <option value="all">All</option>
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 items-center">
              <label className="text-xs uppercase">Filter Status:</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="border-2 border-cubicle-taupe bg-white px-2 py-1 text-sm"
              >
                <option value="all">All</option>
                <option value="projected">Projected</option>
                <option value="posted">Posted</option>
              </select>
            </div>
            <div className="flex gap-2 items-center">
              <label className="text-xs uppercase">LLM Scope:</label>
              <select
                value={llmScope}
                onChange={(e) => setLlmScope(e.target.value as 'period' | 'all')}
                className="border-2 border-cubicle-taupe bg-white px-2 py-1 text-sm"
              >
                <option value="period">This month</option>
                <option value="all">All months</option>
              </select>
            </div>
            <div className="ml-auto flex gap-2">
              <Button
                variant="secondary"
                onClick={handleMatchRecurring}
                disabled={isMatchingRecurring}
              >
                {isMatchingRecurring ? 'MATCHING...' : 'MATCH RECURRING'}
              </Button>
              <Button
                variant="secondary"
                onClick={handleLLMCategorize}
                disabled={isCategorizingWithLLM}
              >
                {isCategorizingWithLLM ? 'CATEGORIZING...' : 'LLM CATEGORIZE'}
              </Button>
            </div>
          </div>

          {/* Bulk Actions Toolbar */}
          {selectedTransactions.size > 0 && (
            <div className="bg-ceiling-grey border-2 border-dark p-4 flex gap-4 items-center">
              <div className="font-medium">{selectedTransactions.size} selected</div>
              <div className="flex gap-2 items-center">
                <label className="text-xs uppercase">Assign Category:</label>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleBulkCategoryUpdate(e.target.value)
                      e.target.value = ''
                    }
                  }}
                  className="border-2 border-cubicle-taupe bg-white px-2 py-1 text-sm"
                  defaultValue=""
                >
                  <option value="">Select...</option>
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <Button variant="danger" onClick={handleBulkDelete}>
                DELETE SELECTED
              </Button>
              <Button variant="secondary" onClick={() => setSelectedTransactions(new Set())}>
                CLEAR SELECTION
              </Button>
            </div>
          )}

          <div className="space-y-2">
            {filteredTransactions.length === 0 ? (
              <div className="text-center py-8 text-monday-3pm">
                No transactions yet. How... peaceful.
              </div>
            ) : (
              filteredTransactions.map((t: any, index: number) => {
                const amazonLink = t.amazonOrderTransactions?.[0]
                const amazonOrder = amazonLink?.order
                const amazonItems = amazonOrder?.items || []
                const amazonItemPreview = amazonItems.slice(0, 3).map((item: any) => item.title).filter(Boolean)
                const extraAmazonItems = amazonItems.length - amazonItemPreview.length
                const amazonSplitCount = amazonOrder?._count?.amazonOrderTransactions || 0

                return (
                  <div
                    key={t.id}
                    className={`grid grid-cols-[auto_1fr_2fr_1fr_1fr_1fr_auto] gap-4 items-center py-2 border-b border-cubicle-taupe text-sm ${
                      t.isIgnored ? 'opacity-60' : ''
                    }`}
                  >
                    <div>
                      <input
                        type="checkbox"
                        checked={selectedTransactions.has(t.id)}
                        onChange={(e) => handleTransactionClick(t.id, index, e as any)}
                        onClick={(e) => handleTransactionClick(t.id, index, e)}
                        className="w-4 h-4 cursor-pointer"
                      />
                    </div>
                    <div className="text-xs text-monday-3pm">
                      {formatDateDisplay(t.date)}
                    </div>
                    <div>
                      <div className="font-medium">{t.description}</div>
                      {t.subDescription && (
                        <div className="text-xs text-monday-3pm">{t.subDescription}</div>
                      )}
                      {amazonOrder && (
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
                      )}
                      <InlineNoteEditor
                        transactionId={t.id}
                        note={t.userDescription}
                        onNoteChange={handleNoteChange}
                        disabled={t.status === 'projected' && t.source === 'recurring'}
                      />
                    </div>
                    <div>
                      <InlineCategoryEditor
                        transactionId={t.id}
                        currentCategory={t.category}
                        onCategoryChange={handleCategoryChange}
                        onRecurringCategorySelected={handleRecurringCategorySelected}
                        disabled={t.status === 'projected' && t.source === 'recurring'}
                      />
                    </div>
                    <div>{formatCurrency(t.amount)}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-1 text-xs uppercase ${t.status === 'posted' ? 'bg-ceiling-grey' : 'bg-background'}`}>
                        {t.status}
                      </span>
                      {t.isIgnored && (
                        <span className="px-2 py-1 text-xs uppercase bg-monday-3pm text-white">
                          ignored
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {t.status === 'projected' && (
                        <Button onClick={() => markTransactionPosted(t.id)}>
                          POST
                        </Button>
                      )}
                      {t.source === 'import' && (
                        <Button
                          variant="secondary"
                          onClick={() => handleIgnoreTransaction(t.id)}
                        >
                          IGNORE LIKE THIS
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        onClick={() => handleToggleIgnore(t.id, !t.isIgnored)}
                      >
                        {t.isIgnored ? 'UNIGNORE' : 'IGNORE'}
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => deleteTransaction(t.id)}
                      >
                        DELETE
                      </Button>
                    </div>
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
