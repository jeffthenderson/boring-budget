import { getCurrentOrCreatePeriod } from '@/lib/actions/period'
import { getPreallocationSettings } from '@/lib/actions/user'
import { BudgetDashboard } from './components/BudgetDashboard'
import { TopNav } from './components/TopNav'

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
  const month = typeof monthParam === 'number' && Number.isFinite(monthParam) && monthParam >= 1 && monthParam <= 12
    ? monthParam
    : undefined

  const period = await getCurrentOrCreatePeriod(year, month)
  const settings = await getPreallocationSettings()

  return (
    <div className="min-h-screen max-w-6xl mx-auto p-4 md:p-8">
      <TopNav showBrand={false} />
      <header className="mb-8 border-b border-line pb-4">
        <h1 className="text-3xl font-semibold text-foreground mb-2">
          Boring Budget
        </h1>
        <p className="text-sm text-monday-3pm">
          Budget like nobody is watching. (They are not.)
        </p>
      </header>

      <BudgetDashboard period={period} settings={settings} />
    </div>
  )
}
