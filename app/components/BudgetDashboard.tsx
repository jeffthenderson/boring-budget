'use client'

import { useState } from 'react'
import { Card } from './Card'
import { Input } from './Input'
import { Button } from './Button'
import { Table } from './Table'
import { formatCurrency, parseCurrency } from '@/lib/utils/currency'
import { calculatePreallocations } from '@/lib/utils/calculations'
import { CATEGORIES } from '@/lib/constants/categories'
import {
  addIncomeItem,
  deleteIncomeItem,
  updateCategoryBudget
} from '@/lib/actions/period'
import {
  addManualTransaction,
  markTransactionPosted,
  deleteTransaction
} from '@/lib/actions/transactions'

type Period = any // TODO: Type this properly
type Settings = any

export function BudgetDashboard({ period, settings }: { period: Period; settings: Settings }) {
  const [incomeSource, setIncomeSource] = useState('')
  const [incomeAmount, setIncomeAmount] = useState('')
  const [incomeDate, setIncomeDate] = useState(new Date().toISOString().split('T')[0])

  const [transactionDesc, setTransactionDesc] = useState('')
  const [transactionAmount, setTransactionAmount] = useState('')
  const [transactionCategory, setTransactionCategory] = useState(CATEGORIES[0])
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().split('T')[0])
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  const [editingBudget, setEditingBudget] = useState<Record<string, string>>({})

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
  const categoryData = CATEGORIES.map(category => {
    const budget = period.categoryBudgets.find((b: any) => b.category === category)
    const budgeted = budget?.amountBudgeted || 0

    const categoryTransactions = period.transactions.filter((t: any) => t.category === category)
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

  async function handleAddIncome(e: React.FormEvent) {
    e.preventDefault()
    if (!incomeSource || !incomeAmount) return

    await addIncomeItem(period.id, {
      date: new Date(incomeDate),
      source: incomeSource,
      amount: parseCurrency(incomeAmount),
    })

    setIncomeSource('')
    setIncomeAmount('')
  }

  async function handleAddTransaction(e: React.FormEvent) {
    e.preventDefault()
    if (!transactionDesc || !transactionAmount) return

    await addManualTransaction(period.id, {
      date: new Date(transactionDate),
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

  return (
    <div className="space-y-6">
      {/* Month Header */}
      <Card title={`${getMonthName(period.month)} ${period.year}`}>
        <div className="text-sm text-monday-3pm">
          Status: {period.status === 'open' ? 'Open' : 'Locked'} (Naturally.)
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
              type="number"
              step="0.01"
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
                    {new Date(item.date).toLocaleDateString()}
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
          {CATEGORIES.map(category => {
            const budget = period.categoryBudgets.find((b: any) => b.category === category)
            const amount = budget?.amountBudgeted || 0

            return (
              <div key={category} className="grid grid-cols-[2fr_1fr_auto] gap-2 items-center py-2 border-b border-cubicle-taupe">
                <div className="text-sm">{category}</div>
                <Input
                  type="number"
                  step="0.01"
                  value={editingBudget[category] ?? amount.toString()}
                  onChange={(val) => setEditingBudget({ ...editingBudget, [category]: val })}
                />
                <Button onClick={() => handleUpdateBudget(category)}>
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
              type="number"
              step="0.01"
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

          <div className="flex gap-4 items-center border-y-2 border-cubicle-taupe py-3">
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
          </div>

          <div className="space-y-2">
            {filteredTransactions.length === 0 ? (
              <div className="text-center py-8 text-monday-3pm">
                No transactions yet. How... peaceful.
              </div>
            ) : (
              filteredTransactions.map((t: any) => (
                <div key={t.id} className="grid grid-cols-[1fr_2fr_1fr_1fr_1fr_auto] gap-4 items-center py-2 border-b border-cubicle-taupe text-sm">
                  <div className="text-xs text-monday-3pm">
                    {new Date(t.date).toLocaleDateString()}
                  </div>
                  <div>{t.description}</div>
                  <div>{t.category}</div>
                  <div>{formatCurrency(t.amount)}</div>
                  <div>
                    <span className={`px-2 py-1 text-xs uppercase ${t.status === 'posted' ? 'bg-ceiling-grey' : 'bg-background'}`}>
                      {t.status}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {t.status === 'projected' && (
                      <Button onClick={() => markTransactionPosted(t.id)}>
                        POST
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      onClick={() => deleteTransaction(t.id)}
                    >
                      DELETE
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}

function getMonthName(month: number): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
  return months[month - 1]
}
