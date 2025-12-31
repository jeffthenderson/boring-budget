import { getCurrentOrCreatePeriod } from '@/lib/actions/period'
import { getPreallocationSettings } from '@/lib/actions/user'
import { BudgetDashboard } from './components/BudgetDashboard'
import Link from 'next/link'

export default async function Home({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined } | Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams)
  const yearRaw = resolvedSearchParams?.year
  const monthRaw = resolvedSearchParams?.month
  const yearValue = Array.isArray(yearRaw) ? yearRaw[0] : yearRaw
  const monthValue = Array.isArray(monthRaw) ? monthRaw[0] : monthRaw
  const yearParam = yearValue ? Number.parseInt(yearValue, 10) : undefined
  const monthParam = monthValue ? Number.parseInt(monthValue, 10) : undefined
  const year = Number.isFinite(yearParam) ? yearParam : undefined
  const month = Number.isFinite(monthParam) && monthParam >= 1 && monthParam <= 12
    ? monthParam
    : undefined

  const period = await getCurrentOrCreatePeriod(year, month)
  const settings = await getPreallocationSettings()

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8 border-b-4 border-dark pb-4">
        <h1 className="text-2xl uppercase tracking-widest font-medium text-dark mb-2">
          Boring Budget
        </h1>
        <p className="text-sm text-monday-3pm">
          Budget like nobody's watching. (They're not.)
        </p>
        <nav className="mt-4 flex gap-4 text-sm">
          <Link href="/" className="text-dark hover:underline">BUDGET</Link>
          <Link href="/recurring" className="text-dark hover:underline">RECURRING</Link>
          <Link href="/accounts" className="text-dark hover:underline">ACCOUNTS</Link>
          <Link href="/settings" className="text-dark hover:underline">SETTINGS</Link>
          <Link href="/admin" className="text-dark hover:underline">ADMIN</Link>
        </nav>
      </header>

      <BudgetDashboard period={period} settings={settings} />
    </div>
  )
}
