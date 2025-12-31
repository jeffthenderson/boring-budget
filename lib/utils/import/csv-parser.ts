import Papa from 'papaparse'

export interface CSVColumn {
  index: number
  name: string
  sampleValues: string[]
}

export interface CSVParseResult {
  headers: string[]
  rows: any[]
  columns: CSVColumn[]
}

export async function parseCSVFile(file: File): Promise<CSVParseResult> {
  const baseOptions = {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim(),
  }

  const parseWithOptions = (options: Papa.ParseConfig) => new Promise<Papa.ParseResult<any>>((resolve, reject) => {
    Papa.parse(file, {
      ...options,
      complete: (results) => resolve(results),
      error: (error) => reject(error),
    })
  })

  const buildResult = (results: Papa.ParseResult<any>) => {
    const headers = results.meta.fields || []
    const rows = (results.data as any[]).filter(row => Object.keys(row || {}).length > 0)

    if (results.errors?.length) {
      console.warn(`CSV parse warnings for ${file.name}:`, results.errors)
    }

    if (headers.length === 0 || rows.length === 0) {
      const errorMessage = results.errors?.[0]?.message || `No rows found in ${file.name}`
      throw new Error(errorMessage)
    }

    const columns: CSVColumn[] = headers.map((name, index) => ({
      index,
      name,
      sampleValues: rows.slice(0, 5).map(row => row[name] || '').filter(Boolean),
    }))

    return { headers, rows, columns }
  }

  try {
    const results = await parseWithOptions({ ...baseOptions, worker: true })
    return buildResult(results)
  } catch (error) {
    console.warn(`Worker CSV parse failed for ${file.name}, retrying without worker.`, error)
    const results = await parseWithOptions({ ...baseOptions, worker: false })
    return buildResult(results)
  }
}

export interface ColumnMapping {
  date: string
  description: string
  amount: string
  merchant?: string
  status?: string
  transactionType?: string
}

const DATE_HEADERS = ['date', 'transaction date', 'posted date', 'trans date']
const DESCRIPTION_HEADERS = ['description', 'desc', 'merchant', 'payee', 'details']
const AMOUNT_HEADERS = ['amount', 'amt', 'value', 'transaction amount']
const MERCHANT_HEADERS = ['merchant', 'payee', 'sub-description', 'subdescription']
const STATUS_HEADERS = ['status', 'transaction status']
const TYPE_HEADERS = ['type', 'transaction type', 'type of transaction', 'debit/credit']

export function detectColumnMapping(columns: CSVColumn[]): ColumnMapping {
  const mapping: Partial<ColumnMapping> = {}

  for (const col of columns) {
    const lower = col.name.toLowerCase()

    if (!mapping.date && DATE_HEADERS.some(h => lower.includes(h))) {
      mapping.date = col.name
    }

    if (!mapping.description && DESCRIPTION_HEADERS.some(h => lower === h)) {
      mapping.description = col.name
    }

    if (!mapping.amount && AMOUNT_HEADERS.some(h => lower.includes(h))) {
      mapping.amount = col.name
    }

    if (!mapping.merchant && MERCHANT_HEADERS.some(h => lower.includes(h))) {
      mapping.merchant = col.name
    }

    if (!mapping.status && STATUS_HEADERS.some(h => lower.includes(h))) {
      mapping.status = col.name
    }

    if (!mapping.transactionType && TYPE_HEADERS.some(h => lower.includes(h))) {
      mapping.transactionType = col.name
    }
  }

  // Fallback: if no description found, use second column if it exists
  if (!mapping.description && columns.length > 1) {
    mapping.description = columns[1].name
  }

  return mapping as ColumnMapping
}
