import { describe, expect, it } from 'vitest'
import { formatCurrency, parseCurrency, roundCurrency } from '../currency'

describe('currency utils', () => {
  it('rounds using bankers rounding (half-even)', () => {
    expect(roundCurrency(1.005)).toBe(1)
    expect(roundCurrency(1.015)).toBe(1.02)
    expect(roundCurrency(2.675)).toBe(2.68)
  })

  it('parses currency strings and rounds to cents', () => {
    expect(parseCurrency('$1,234.567')).toBe(1234.57)
    expect(parseCurrency('abc')).toBe(0)
    expect(parseCurrency('-$1,000.125')).toBe(-1000.12)
  })

  it('formats currency with two decimals', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50')
  })
})
