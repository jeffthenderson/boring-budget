'use client'

import { useEffect, useMemo, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { parseCSVFile, detectColumnMapping, type CSVParseResult, type ColumnMapping } from '@/lib/utils/import/csv-parser'
import Link from 'next/link'

type Step = 'select' | 'map' | 'preview' | 'complete'
type PeriodMode = 'current' | 'auto' | 'specific'
type ImportProgress = {
  current: number
  total: number
  fileName: string
  rows: number
}

interface Account {
  id: string
  name: string
  type: 'credit_card' | 'bank'
  active: boolean
  displayAlias?: string
  last4?: string
}

interface FileImportState {
  id: string
  file: File
  csvData: CSVParseResult
  mapping: ColumnMapping
  accountId: string
  accountType?: 'credit_card' | 'bank'
  detectedType?: 'credit_card' | 'bank' | null
}

interface ImportSummary {
  imported: number
  skippedDuplicates: number
  ignoredTransfers: number
  ignoredByRule: number
  outOfPeriod: number
  matchedRecurring: number
  pendingConfirmation: number
  batchIds?: string[]
  periodsTouched?: Array<{ year: number; month: number; batchId: string }>
}

function ImportWizard() {
  const searchParams = useSearchParams()
  const accountParam = searchParams.get('account')

  const [step, setStep] = useState<Step>('select')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [files, setFiles] = useState<FileImportState[]>([])
  const [currentFileIndex, setCurrentFileIndex] = useState(0)
  const [importing, setImporting] = useState(false)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [periodMode, setPeriodMode] = useState<PeriodMode>('current')
  const [targetMonth, setTargetMonth] = useState<string>('')
  const [parsingFiles, setParsingFiles] = useState(false)
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)

  const importOverlay = importing ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80">
      <div className="border-2 border-dark bg-white px-6 py-4 text-center">
        <div className="text-sm text-monday-3pm mb-2">Importing transactions...</div>
        {importProgress?.fileName && (
          <div className="text-xs text-dark mb-2">
            File {importProgress.current} of {importProgress.total}: {importProgress.fileName} ({importProgress.rows} rows)
          </div>
        )}
        <div className="flex items-center justify-center gap-2">
          <div className="h-2 w-2 bg-cubicle-taupe animate-pulse"></div>
          <div className="h-2 w-2 bg-cubicle-taupe animate-pulse delay-75"></div>
          <div className="h-2 w-2 bg-cubicle-taupe animate-pulse delay-150"></div>
        </div>
      </div>
    </div>
  ) : null

  useEffect(() => {
    loadAccounts()
  }, [])

  useEffect(() => {
    if (accounts.length === 0 || files.length === 0) return

    let changed = false
    const nextFiles = files.map(file => {
      const matchedAccountId = file.accountId || autoMatchAccount(file.file.name, file.detectedType)
      const account = matchedAccountId
        ? accounts.find(a => a.id === matchedAccountId)
        : undefined

      const nextAccountId = matchedAccountId || file.accountId
      const nextAccountType = account?.type || file.accountType

      if (nextAccountId !== file.accountId || nextAccountType !== file.accountType) {
        changed = true
        return {
          ...file,
          accountId: nextAccountId,
          accountType: nextAccountType,
        }
      }

      return file
    })

    if (changed) {
      setFiles(nextFiles)
    }
  }, [accounts, files])

  async function loadAccounts() {
    const res = await fetch('/api/accounts')
    const data = await res.json()
    setAccounts(data.filter((a: Account) => a.active))
  }

  const canProceedToMap = useMemo(() => {
    return files.length > 0 && files.every(f => f.accountId && f.mapping && f.csvData)
  }, [files])

  function normalizeToken(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '')
  }

  function detectAccountType(fileName: string, csvData: CSVParseResult): 'credit_card' | 'bank' | null {
    const name = normalizeToken(fileName)
    let creditScore = 0
    let bankScore = 0

    if (/(visa|mastercard|amex|creditcard|card)/.test(name)) creditScore += 2
    if (/(chequing|checking|savings|bank|debit)/.test(name)) bankScore += 2

    const headers = csvData.headers.map(h => h.toLowerCase())
    if (headers.some(h => h.includes('balance'))) bankScore += 2
    if (headers.some(h => h.includes('status'))) creditScore += 1
    if (headers.some(h => h.includes('credit limit'))) creditScore += 2

    if (creditScore > bankScore) return 'credit_card'
    if (bankScore > creditScore) return 'bank'
    return null
  }

  function autoMatchAccount(fileName: string, detectedType?: 'credit_card' | 'bank' | null): string {
    if (accountParam && accounts.some(a => a.id === accountParam)) {
      return accountParam
    }

    if (accounts.length === 1) {
      return accounts[0].id
    }

    const name = normalizeToken(fileName)
    const candidates = accounts.filter(acc => !detectedType || acc.type === detectedType)

    const matches = candidates.filter(acc => {
      const alias = acc.displayAlias ? normalizeToken(acc.displayAlias) : ''
      const accName = normalizeToken(acc.name)
      return (
        (alias && name.includes(alias)) ||
        (accName && name.includes(accName)) ||
        (acc.last4 && name.includes(acc.last4))
      )
    })

    return matches.length === 1 ? matches[0].id : ''
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = e.target.files
    if (!selectedFiles || selectedFiles.length === 0) return
    await addFiles(selectedFiles)
    e.target.value = ''
  }

  async function addFiles(fileList: FileList) {
    setParsingFiles(true)
    const newStates: FileImportState[] = []

    for (const file of Array.from(fileList)) {
      const id = `${file.name}-${file.size}-${file.lastModified}`
      if (files.some(existing => existing.id === id)) continue

      try {
        const csvData = await parseCSVFile(file)
        const mapping = detectColumnMapping(csvData.columns)
        const detectedType = detectAccountType(file.name, csvData)
        const accountId = autoMatchAccount(file.name, detectedType)
        const accountType = accountId ? accounts.find(a => a.id === accountId)?.type : detectedType || undefined

        newStates.push({
          id,
          file,
          csvData,
          mapping,
          accountId: accountId || '',
          accountType,
          detectedType,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Please try again.'
        alert(`Error parsing ${file.name}. ${message}`)
        console.error(error)
      }
    }

    if (newStates.length > 0) {
      setFiles(prev => [...prev, ...newStates])
    }
    setParsingFiles(false)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files)
      e.dataTransfer.clearData()
    }
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
  }

  function updateFile(id: string, updates: Partial<FileImportState>) {
    setFiles(prev =>
      prev.map(file => (file.id === id ? { ...file, ...updates } : file))
    )
  }

  function handleAccountChange(fileId: string, accountId: string) {
    const account = accounts.find(a => a.id === accountId)
    updateFile(fileId, {
      accountId,
      accountType: account?.type,
    })
  }

  function handleRemoveFile(fileId: string) {
    setFiles(prev => prev.filter(file => file.id !== fileId))
  }

  function startMapping() {
    setCurrentFileIndex(0)
    setStep('map')
  }

  function moveMapping(direction: 'prev' | 'next') {
    const nextIndex = direction === 'next' ? currentFileIndex + 1 : currentFileIndex - 1
    if (nextIndex < 0) {
      setStep('select')
      return
    }
    if (nextIndex >= files.length) {
      setStep('preview')
      return
    }
    setCurrentFileIndex(nextIndex)
  }

  async function handleImport() {
    const filesToImport = files.filter(file => file.accountId && file.accountType)
    if (filesToImport.length === 0) return
    if (periodMode === 'specific' && !targetMonth) {
      alert('Select a target month for this import.')
      return
    }

    setImporting(true)
    setImportProgress({
      current: 0,
      total: filesToImport.length,
      fileName: '',
      rows: 0,
    })
    let periodId: string | undefined
    let targetYear: number | undefined
    let targetMonthNumber: number | undefined

    if (periodMode === 'current') {
      const periodRes = await fetch('/api/period/current')
      const period = await periodRes.json()
      periodId = period.id
    }

    if (periodMode === 'specific') {
      const [yearStr, monthStr] = targetMonth.split('-')
      targetYear = Number(yearStr)
      targetMonthNumber = Number(monthStr)
    }

    try {
      let combinedSummary: ImportSummary = {
        imported: 0,
        skippedDuplicates: 0,
        ignoredTransfers: 0,
        ignoredByRule: 0,
        outOfPeriod: 0,
        matchedRecurring: 0,
        pendingConfirmation: 0,
        batchIds: [],
        periodsTouched: [],
      }

      for (const [index, file] of filesToImport.entries()) {
        setImportProgress({
          current: index + 1,
          total: filesToImport.length,
          fileName: file.file.name,
          rows: file.csvData.rows.length,
        })

        const res = await fetch('/api/import/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId: file.accountId,
            periodId,
            rows: file.csvData.rows,
            mapping: file.mapping,
            accountType: file.accountType,
            periodMode,
            targetYear,
            targetMonth: targetMonthNumber,
          }),
        })

        const result = await res.json()
        if (result.error) {
          throw new Error(result.error)
        }

        combinedSummary = mergeSummaries(combinedSummary, result as ImportSummary)
      }

      setSummary(combinedSummary)
      setStep('complete')
    } catch (error) {
      alert('Error importing CSV. Please try again.')
      console.error(error)
    } finally {
      setImporting(false)
      setImportProgress(null)
    }
  }

  if (step === 'select') {
    return (
      <div className="min-h-screen p-8">
        {importOverlay}
        <header className="mb-8">
          <Link href="/accounts" className="text-dark hover:underline text-sm">← BACK TO ACCOUNTS</Link>
          <h1 className="text-2xl uppercase tracking-widest font-medium text-dark mt-4 mb-2">
            CSV Import Wizard
          </h1>
          <p className="text-sm text-monday-3pm">
            Step 1: Drop CSVs and choose accounts. (We will try to guess.)
          </p>
        </header>

        <Card title="Upload CSV Files">
          <div className="space-y-4">
            {accounts.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-monday-3pm mb-4">
                  No accounts found. Create one first.
                </p>
                <Link href="/accounts">
                  <Button>GO TO ACCOUNTS</Button>
                </Link>
              </div>
            ) : (
              <>
                <div
                  className="border-2 border-dashed border-cubicle-taupe p-6 text-center bg-background"
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                >
                  <p className="text-sm text-dark mb-2">Drag & drop CSV files here</p>
                  <p className="text-xs text-monday-3pm mb-4">(Multiple files supported)</p>
                  <input
                    type="file"
                    accept=".csv"
                    multiple
                    onChange={handleFileSelect}
                    className="border-2 border-cubicle-taupe bg-white px-3 py-2 text-dark focus:outline-none focus:border-dark"
                  />
                </div>

                {parsingFiles && (
                  <div className="flex items-center gap-2 text-sm text-monday-3pm">
                    <div className="h-2 w-2 bg-cubicle-taupe animate-pulse"></div>
                    <span>Parsing files... (Please wait.)</span>
                  </div>
                )}

                {files.length > 0 && (
                  <div className="space-y-3">
                    {files.map(file => (
                      <div
                        key={file.id}
                        className="grid grid-cols-[2fr_2fr_1fr_auto] gap-4 items-center border-b border-cubicle-taupe pb-3"
                      >
                        <div>
                          <div className="font-medium">{file.file.name}</div>
                          <div className="text-xs text-monday-3pm">
                            {file.csvData.rows.length} rows
                            {file.detectedType && ` · detected ${file.detectedType === 'credit_card' ? 'credit card' : 'bank'}`}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs uppercase tracking-wider text-dark font-medium">
                            Account (REQUIRED)
                          </label>
                          <select
                            value={file.accountId}
                            onChange={(e) => handleAccountChange(file.id, e.target.value)}
                            className="border-2 border-cubicle-taupe bg-white px-3 py-2 text-dark focus:outline-none focus:border-dark w-full"
                          >
                            <option value="">-- Choose Account --</option>
                            {accounts.map(acc => (
                              <option key={acc.id} value={acc.id}>
                                {acc.name} ({acc.type === 'credit_card' ? 'Credit Card' : 'Bank'})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="text-xs text-monday-3pm">
                          {file.accountType ? `Using ${file.accountType === 'credit_card' ? 'credit card' : 'bank'} rules` : 'No account'}
                        </div>
                        <Button variant="secondary" onClick={() => handleRemoveFile(file.id)}>
                          REMOVE
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2 border-t-2 border-cubicle-taupe pt-4">
                  <label className="text-xs uppercase tracking-wider text-dark font-medium">
                    Import Range
                  </label>
                  <select
                    value={periodMode}
                    onChange={(e) => setPeriodMode(e.target.value as PeriodMode)}
                    className="border-2 border-cubicle-taupe bg-white px-3 py-2 text-dark focus:outline-none focus:border-dark"
                  >
                    <option value="current">Current Month Only</option>
                    <option value="auto">All Dates (Auto-create months)</option>
                    <option value="specific">Specific Month</option>
                  </select>

                  {periodMode === 'specific' && (
                    <input
                      type="month"
                      value={targetMonth}
                      onChange={(e) => setTargetMonth(e.target.value)}
                      className="border-2 border-cubicle-taupe bg-white px-3 py-2 text-dark focus:outline-none focus:border-dark"
                    />
                  )}
                </div>

                <div className="flex gap-4">
                  <Button onClick={startMapping} disabled={!canProceedToMap}>
                    NEXT: MAP COLUMNS
                  </Button>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>
    )
  }

  if (step === 'map' && files[currentFileIndex]) {
    const activeFile = files[currentFileIndex]
    const mapping = activeFile.mapping

    return (
      <div className="min-h-screen p-8">
        {importOverlay}
        <header className="mb-8">
          <Link href="/import" className="text-dark hover:underline text-sm">← START OVER</Link>
          <h1 className="text-2xl uppercase tracking-widest font-medium text-dark mt-4 mb-2">
            CSV Import Wizard
          </h1>
          <p className="text-sm text-monday-3pm">
            Step 2: Map columns. ({currentFileIndex + 1} of {files.length})
          </p>
        </header>

        <Card title="Column Mapping">
          <div className="space-y-4">
            <div className="p-3 bg-background border border-cubicle-taupe">
              <p className="text-sm text-dark">
                <strong>File:</strong> {activeFile.file.name}
              </p>
              <p className="text-sm text-dark">
                <strong>Account:</strong> {accounts.find(a => a.id === activeFile.accountId)?.name}
              </p>
              <p className="text-sm text-dark">
                <strong>Rows:</strong> {activeFile.csvData.rows.length}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-wider text-dark font-medium">
                  Date Column (REQUIRED)
                </label>
                <select
                  value={mapping.date}
                  onChange={(e) => updateFile(activeFile.id, { mapping: { ...mapping, date: e.target.value } })}
                  className="border-2 border-cubicle-taupe bg-white px-3 py-2 text-dark focus:outline-none focus:border-dark"
                >
                  {activeFile.csvData.headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-wider text-dark font-medium">
                  Description Column (REQUIRED)
                </label>
                <select
                  value={mapping.description}
                  onChange={(e) => updateFile(activeFile.id, { mapping: { ...mapping, description: e.target.value } })}
                  className="border-2 border-cubicle-taupe bg-white px-3 py-2 text-dark focus:outline-none focus:border-dark"
                >
                  {activeFile.csvData.headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-wider text-dark font-medium">
                  Amount Column (REQUIRED)
                </label>
                <select
                  value={mapping.amount}
                  onChange={(e) => updateFile(activeFile.id, { mapping: { ...mapping, amount: e.target.value } })}
                  className="border-2 border-cubicle-taupe bg-white px-3 py-2 text-dark focus:outline-none focus:border-dark"
                >
                  {activeFile.csvData.headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-wider text-dark font-medium">
                  Merchant/Sub-description (Optional)
                </label>
                <select
                  value={mapping.merchant || ''}
                  onChange={(e) => updateFile(activeFile.id, { mapping: { ...mapping, merchant: e.target.value || undefined } })}
                  className="border-2 border-cubicle-taupe bg-white px-3 py-2 text-dark focus:outline-none focus:border-dark"
                >
                  <option value="">-- None --</option>
                  {activeFile.csvData.headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-wider text-dark font-medium">
                  Transaction Type (Optional)
                </label>
                <select
                  value={mapping.transactionType || ''}
                  onChange={(e) => updateFile(activeFile.id, { mapping: { ...mapping, transactionType: e.target.value || undefined } })}
                  className="border-2 border-cubicle-taupe bg-white px-3 py-2 text-dark focus:outline-none focus:border-dark"
                >
                  <option value="">-- None --</option>
                  {activeFile.csvData.headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border-t-2 border-dark pt-4">
              <h3 className="text-sm uppercase font-medium mb-2">Preview (First 5 Rows)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-2 border-dark">
                  <thead className="bg-ceiling-grey">
                    <tr>
                      <th className="px-2 py-1 text-left border-r border-dark">Date</th>
                      <th className="px-2 py-1 text-left border-r border-dark">Description</th>
                      {mapping.merchant && (
                        <th className="px-2 py-1 text-left border-r border-dark">Sub-description</th>
                      )}
                      <th className="px-2 py-1 text-left">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeFile.csvData.rows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-t border-cubicle-taupe">
                        <td className="px-2 py-1 border-r border-cubicle-taupe">{row[mapping.date]}</td>
                        <td className="px-2 py-1 border-r border-cubicle-taupe">{row[mapping.description]}</td>
                        {mapping.merchant && (
                          <td className="px-2 py-1 border-r border-cubicle-taupe">
                            {row[mapping.merchant]}
                          </td>
                        )}
                        <td className="px-2 py-1">{row[mapping.amount]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-4">
              <Button onClick={() => moveMapping('prev')}>BACK</Button>
              <Button onClick={() => moveMapping('next')}>
                {currentFileIndex === files.length - 1 ? 'NEXT: PREVIEW' : 'NEXT FILE'}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  if (step === 'preview') {
    return (
      <div className="min-h-screen p-8">
        {importOverlay}
        <header className="mb-8">
          <Link href="/import" className="text-dark hover:underline text-sm">← START OVER</Link>
          <h1 className="text-2xl uppercase tracking-widest font-medium text-dark mt-4 mb-2">
            CSV Import Wizard
          </h1>
          <p className="text-sm text-monday-3pm">
            Step 3: Confirm and import. (Last chance to back out.)
          </p>
        </header>

        <Card title="Ready to Import">
          <div className="space-y-4">
            <div className="p-4 bg-background border-2 border-dark space-y-2">
              <div className="text-sm text-dark">
                <strong>Files:</strong> {files.length}
              </div>
              <div className="text-sm text-dark">
                <strong>Import Range:</strong>{' '}
                {periodMode === 'current'
                  ? 'Current month only'
                  : periodMode === 'auto'
                  ? 'All dates (auto-create months)'
                  : `Specific month: ${targetMonth}`}
              </div>
            </div>

            <div className="space-y-2">
              {files.map(file => (
                <div key={file.id} className="p-3 border border-cubicle-taupe bg-white">
                  <div className="text-sm text-dark">
                    <strong>{file.file.name}</strong>
                  </div>
                  <div className="text-xs text-monday-3pm">
                    Account: {accounts.find(a => a.id === file.accountId)?.name} · Rows: {file.csvData.rows.length}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-background border border-cubicle-taupe">
              <p className="text-sm text-dark">
                The importer will:
              </p>
              <ul className="list-disc list-inside text-sm text-monday-3pm ml-4">
                <li>Normalize amounts based on account type</li>
                <li>Filter or split periods based on your import range</li>
                <li>Skip duplicates</li>
                <li>Detect and ignore transfers</li>
                <li>Apply ignore rules</li>
                <li>Match to existing recurring expenses</li>
              </ul>
            </div>

            <div className="flex gap-4">
              <Button onClick={() => setStep('map')}>BACK</Button>
              <Button onClick={handleImport} disabled={importing}>
                {importing ? 'IMPORTING... (Please wait.)' : 'START IMPORT'}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  if (step === 'complete' && summary) {
    const uniquePeriods = summary.periodsTouched
      ? new Set(summary.periodsTouched.map(p => `${p.year}-${p.month}`))
      : new Set<string>()

    return (
      <div className="min-h-screen p-8">
        {importOverlay}
        <header className="mb-8">
          <Link href="/" className="text-dark hover:underline text-sm">← BACK TO BUDGET</Link>
          <h1 className="text-2xl uppercase tracking-widest font-medium text-dark mt-4 mb-2">
            Import Complete
          </h1>
          <p className="text-sm text-monday-3pm">
            That's done. (Was it worth it?)
          </p>
        </header>

        <Card title="Import Summary">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 border-2 border-dark bg-white">
                <div className="text-2xl font-medium">{summary.imported}</div>
                <div className="text-xs uppercase text-monday-3pm">Imported</div>
              </div>
              <div className="p-3 border-2 border-cubicle-taupe bg-white">
                <div className="text-2xl font-medium">{summary.skippedDuplicates}</div>
                <div className="text-xs uppercase text-monday-3pm">Duplicates Skipped</div>
              </div>
              <div className="p-3 border-2 border-cubicle-taupe bg-white">
                <div className="text-2xl font-medium">{summary.ignoredTransfers}</div>
                <div className="text-xs uppercase text-monday-3pm">Transfers Ignored</div>
              </div>
              <div className="p-3 border-2 border-cubicle-taupe bg-white">
                <div className="text-2xl font-medium">{summary.ignoredByRule}</div>
                <div className="text-xs uppercase text-monday-3pm">Ignored by Rule</div>
              </div>
              <div className="p-3 border-2 border-cubicle-taupe bg-white">
                <div className="text-2xl font-medium">{summary.outOfPeriod}</div>
                <div className="text-xs uppercase text-monday-3pm">Out of Period</div>
              </div>
            </div>

            {uniquePeriods.size > 1 && (
              <div className="p-4 bg-background border border-cubicle-taupe text-sm text-monday-3pm">
                Imported across {uniquePeriods.size} months.
              </div>
            )}

            <div className="p-4 bg-background border border-cubicle-taupe">
              <p className="text-sm text-dark">
                {summary.imported} transactions have been imported and are now visible in your budget.
              </p>
              {summary.matchedRecurring > 0 && (
                <p className="text-sm text-dark mt-2">
                  {summary.matchedRecurring} potential matches to recurring expenses were found.
                  (Review them manually if needed.)
                </p>
              )}
            </div>

            <div className="flex gap-4">
              <Link href="/">
                <Button>VIEW BUDGET</Button>
              </Link>
              <Link href="/import">
                <Button variant="secondary">IMPORT MORE</Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  return null
}

function mergeSummaries(base: ImportSummary, next: ImportSummary): ImportSummary {
  return {
    imported: base.imported + (next.imported || 0),
    skippedDuplicates: base.skippedDuplicates + (next.skippedDuplicates || 0),
    ignoredTransfers: base.ignoredTransfers + (next.ignoredTransfers || 0),
    ignoredByRule: base.ignoredByRule + (next.ignoredByRule || 0),
    outOfPeriod: base.outOfPeriod + (next.outOfPeriod || 0),
    matchedRecurring: base.matchedRecurring + (next.matchedRecurring || 0),
    pendingConfirmation: base.pendingConfirmation + (next.pendingConfirmation || 0),
    batchIds: [...(base.batchIds || []), ...(next.batchIds || [])],
    periodsTouched: [
      ...(base.periodsTouched || []),
      ...(next.periodsTouched || []),
    ],
  }
}

export default function ImportPage() {
  return (
    <Suspense fallback={<div className="min-h-screen p-8">Loading...</div>}>
      <ImportWizard />
    </Suspense>
  )
}
