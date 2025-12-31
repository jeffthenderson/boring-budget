export interface MonthlySchedule {
  type: 'monthly'
  dayOfMonth: number
  nearestBusinessDay?: boolean
}

export interface WeeklySchedule {
  type: 'weekly'
  weekday: number // 0 = Sunday, 6 = Saturday
}

export interface BiweeklySchedule {
  type: 'biweekly'
  anchorDate: string // ISO date
  weekday: number
}

export interface TwiceMonthlySchedule {
  type: 'twice_monthly'
  firstDay: number
  secondDay: number
  nearestBusinessDay?: boolean
}

export type SchedulingRule =
  | MonthlySchedule
  | WeeklySchedule
  | BiweeklySchedule
  | TwiceMonthlySchedule

export function parseSchedulingRule(json: string): SchedulingRule {
  return JSON.parse(json) as SchedulingRule
}

export function serializeSchedulingRule(rule: SchedulingRule): string {
  return JSON.stringify(rule)
}

export function getProjectedDates(
  rule: SchedulingRule,
  year: number,
  month: number
): Date[] {
  const dates: Date[] = []

  switch (rule.type) {
    case 'monthly': {
      const daysInMonth = new Date(year, month, 0).getDate()
      const day = Math.min(rule.dayOfMonth, daysInMonth)
      let date = new Date(year, month - 1, day)

      if (rule.nearestBusinessDay) {
        date = getNearestBusinessDay(date)
      }

      dates.push(date)
      break
    }

    case 'weekly': {
      let date = new Date(year, month - 1, 1)
      const lastDay = new Date(year, month, 0)

      while (date <= lastDay) {
        if (date.getDay() === rule.weekday) {
          dates.push(new Date(date))
        }
        date.setDate(date.getDate() + 1)
      }
      break
    }

    case 'biweekly': {
      const anchor = new Date(rule.anchorDate)
      let date = new Date(year, month - 1, 1)
      const lastDay = new Date(year, month, 0)

      while (date <= lastDay) {
        const daysDiff = Math.floor((date.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24))
        if (daysDiff >= 0 && daysDiff % 14 === 0 && date.getDay() === rule.weekday) {
          dates.push(new Date(date))
        }
        date.setDate(date.getDate() + 1)
      }
      break
    }

    case 'twice_monthly': {
      const daysInMonth = new Date(year, month, 0).getDate()

      let firstDate = new Date(year, month - 1, Math.min(rule.firstDay, daysInMonth))
      if (rule.nearestBusinessDay) {
        firstDate = getNearestBusinessDay(firstDate)
      }
      dates.push(firstDate)

      let secondDate = new Date(year, month - 1, Math.min(rule.secondDay, daysInMonth))
      if (rule.nearestBusinessDay) {
        secondDate = getNearestBusinessDay(secondDate)
      }
      dates.push(secondDate)

      break
    }
  }

  return dates
}

function getNearestBusinessDay(date: Date): Date {
  const day = date.getDay()
  const result = new Date(date)

  if (day === 0) { // Sunday -> Friday
    result.setDate(date.getDate() - 2)
  } else if (day === 6) { // Saturday -> Friday
    result.setDate(date.getDate() - 1)
  }

  return result
}
