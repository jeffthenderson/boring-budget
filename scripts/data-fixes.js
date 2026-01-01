const crypto = require('crypto')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const ACCOUNT_LAST4_TO_INVERT = '9084'

function normalizeDescription(description) {
  return String(description || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
}

function buildCompositeDescription(description, subDescription) {
  const base = String(description || '').trim()
  const sub = String(subDescription || '').trim()
  if (!base) return sub
  if (!sub) return base
  return `${base} ${sub}`
}

function computeHashKey(accountId, periodId, date, normalizedAmount, normalizedDescription) {
  const dateISO = date.toISOString().split('T')[0]
  const amountCents = Math.round(normalizedAmount * 100)
  const data = `${accountId}|${periodId}|${dateISO}|${amountCents}|${normalizedDescription}`
  return crypto.createHash('sha256').update(data).digest('hex')
}

function chunkArray(items, size) {
  if (size <= 0) return [items]
  const chunks = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

async function flipAccountAmounts(account) {
  if (account.invertAmounts) {
    console.log(`Account ${account.id} already set to invert amounts. Skipping flip.`)
    return
  }

  console.log(`Updating account ${account.id} (...${ACCOUNT_LAST4_TO_INVERT}) to invert amounts`)
  await prisma.account.update({
    where: { id: account.id },
    data: { invertAmounts: true },
  })

  const rawRows = await prisma.rawImportRow.findMany({
    where: { accountId: account.id },
    include: { batch: true },
  })

  if (rawRows.length > 0) {
    console.log(`Staging ${rawRows.length} raw import rows for hash recalculation...`)
    const tempUpdates = rawRows.map(row =>
      prisma.rawImportRow.update({
        where: { id: row.id },
        data: { hashKey: `temp-${row.id}` },
      })
    )
    for (const chunk of chunkArray(tempUpdates, 200)) {
      await prisma.$transaction(chunk)
    }

    const finalUpdates = rawRows.map(row => {
      const newNormalizedAmount = -row.normalizedAmount
      const newHashKey = computeHashKey(
        row.accountId,
        row.batch.periodId,
        row.parsedDate,
        newNormalizedAmount,
        row.normalizedDescription
      )
      return prisma.rawImportRow.update({
        where: { id: row.id },
        data: {
          normalizedAmount: newNormalizedAmount,
          hashKey: newHashKey,
        },
      })
    })

    for (const chunk of chunkArray(finalUpdates, 200)) {
      await prisma.$transaction(chunk)
    }
    console.log('Raw import rows updated.')
  }

  const transactions = await prisma.transaction.findMany({
    where: {
      source: 'import',
      importBatch: { accountId: account.id },
    },
    include: {
      importBatch: true,
    },
  })

  if (transactions.length > 0) {
    console.log(`Updating ${transactions.length} imported transactions...`)
    const updates = transactions.map(tx => {
      const newAmount = -tx.amount
      const normalizedDesc = normalizeDescription(
        buildCompositeDescription(tx.description, tx.subDescription)
      )
      const newHash = computeHashKey(
        account.id,
        tx.periodId,
        tx.date,
        newAmount,
        normalizedDesc
      )
      return prisma.transaction.update({
        where: { id: tx.id },
        data: {
          amount: newAmount,
          sourceImportHash: newHash,
        },
      })
    })

    for (const chunk of chunkArray(updates, 200)) {
      await prisma.$transaction(chunk)
    }
    console.log('Imported transactions updated.')
  }
}

async function backfillIgnoredImports() {
  console.log('Backfilling ignored import rows into transactions...')
  const ignoredRows = await prisma.rawImportRow.findMany({
    where: { status: 'ignored' },
    include: {
      batch: true,
    },
  })

  if (ignoredRows.length === 0) {
    console.log('No ignored raw rows found.')
    return
  }

  const existing = await prisma.transaction.findMany({
    where: {
      source: 'import',
      sourceImportHash: { in: ignoredRows.map(row => row.hashKey) },
    },
    select: { sourceImportHash: true },
  })
  const existingHashes = new Set(existing.map(row => row.sourceImportHash))

  const toCreate = ignoredRows.filter(row => !existingHashes.has(row.hashKey))
  if (toCreate.length === 0) {
    console.log('All ignored rows already have transactions.')
    return
  }

  const createData = toCreate.map(row => ({
    periodId: row.batch.periodId,
    date: row.parsedDate,
    description: row.parsedDescription,
    subDescription: row.parsedSubDescription || undefined,
    amount: row.normalizedAmount,
    category: 'Uncategorized',
    status: 'posted',
    source: 'import',
    importBatchId: row.batchId,
    externalId: row.externalId,
    sourceImportHash: row.hashKey,
    isRecurringInstance: false,
    isIgnored: true,
  }))

  for (const chunk of chunkArray(createData, 200)) {
    await prisma.transaction.createMany({ data: chunk })
  }

  console.log(`Created ${toCreate.length} ignored transactions.`)
}

async function migrateIncomeItems() {
  console.log('Migrating IncomeItems to Income transactions...')
  const items = await prisma.incomeItem.findMany()
  if (items.length === 0) {
    console.log('No IncomeItems found.')
    return
  }

  let createdCount = 0
  for (const item of items) {
    const amount = -Math.abs(item.amount)
    const existing = await prisma.transaction.findFirst({
      where: {
        periodId: item.periodId,
        category: 'Income',
        amount,
        description: item.source,
        date: item.date,
      },
    })

    if (!existing) {
      await prisma.transaction.create({
        data: {
          periodId: item.periodId,
          date: item.date,
          description: item.source,
          amount,
          category: 'Income',
          status: 'projected',
          source: 'income',
          isRecurringInstance: false,
        },
      })
      createdCount += 1
    }
  }

  await prisma.incomeItem.deleteMany({})
  console.log(`Migrated ${createdCount} IncomeItems and cleared IncomeItem table.`)
}

async function main() {
  const account = await prisma.account.findFirst({
    where: { last4: ACCOUNT_LAST4_TO_INVERT },
  })

  if (account) {
    await flipAccountAmounts(account)
  } else {
    console.log(`No account found with last4 ${ACCOUNT_LAST4_TO_INVERT}. Skipping invert.`)
  }

  await backfillIgnoredImports()
  await migrateIncomeItems()
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
