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
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        const headers = results.meta.fields || []
        const rows = results.data as any[]

        // Extract sample values for column detection
        const columns: CSVColumn[] = headers.map((name, index) => ({
          index,
          name,
          sampleValues: rows.slice(0, 5).map(row => row[name] || '').filter(Boolean)
        }))

        resolve({ headers, rows, columns })
      },
      error: (error) => {
        reject(error)
      }
    })
  })
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
