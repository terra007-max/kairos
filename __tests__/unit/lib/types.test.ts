import { describe, it, expect } from 'vitest'
import { formatDuration, formatMoney, calcEntryEarnings, type Project, type ProjectLevelRate } from '@/lib/types'

// ─── formatDuration ───────────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('formats zero seconds as 00:00:00', () => {
    expect(formatDuration(0)).toBe('00:00:00')
  })

  it('formats sub-minute seconds', () => {
    expect(formatDuration(45)).toBe('00:00:45')
  })

  it('formats exactly one minute', () => {
    expect(formatDuration(60)).toBe('00:01:00')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(90)).toBe('00:01:30')
  })

  it('formats exactly one hour', () => {
    expect(formatDuration(3600)).toBe('01:00:00')
  })

  it('formats hours, minutes and seconds', () => {
    expect(formatDuration(3661)).toBe('01:01:01')
  })

  it('formats 8 working hours', () => {
    expect(formatDuration(8 * 3600)).toBe('08:00:00')
  })

  it('pads single-digit values with leading zero', () => {
    expect(formatDuration(3723)).toBe('01:02:03')
  })

  it('handles values over 100 hours', () => {
    expect(formatDuration(100 * 3600)).toBe('100:00:00')
  })
})

// ─── formatMoney ─────────────────────────────────────────────────────────────

describe('formatMoney', () => {
  it('formats zero as EUR with de-AT locale', () => {
    const result = formatMoney(0)
    expect(result).toMatch(/0/)
    expect(result).toMatch(/€/)
  })

  it('formats a positive integer amount', () => {
    const result = formatMoney(1000)
    expect(result).toMatch(/1/)
    expect(result).toMatch(/000/)
    expect(result).toMatch(/€/)
  })

  it('formats decimal amounts', () => {
    const result = formatMoney(1234.56)
    expect(result).toMatch(/1/)
    expect(result).toMatch(/234/)
    expect(result).toMatch(/56/)
  })

  it('formats negative amounts', () => {
    const result = formatMoney(-500)
    expect(result).toMatch(/-/)
    expect(result).toMatch(/500/)
  })

  it('defaults to EUR currency', () => {
    const result = formatMoney(100)
    expect(result).toContain('€')
  })

  it('accepts a custom currency', () => {
    const result = formatMoney(100, 'USD')
    expect(result).toMatch(/\$|USD/)
  })
})

// ─── calcEntryEarnings ───────────────────────────────────────────────────────

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    user_id: 'user-1',
    client_id: null,
    name: 'Test Project',
    color: '#6366f1',
    hourly_rate: 100,
    status: 'active',
    notes: null,
    start_date: null,
    end_date: null,
    rounding_minutes: 0,
    budget_hours: null,
    budget_amount: null,
    manager_id: null,
    created_at: '2024-01-01',
    ...overrides,
  }
}

function makeRate(overrides: Partial<ProjectLevelRate> = {}): ProjectLevelRate {
  return {
    id: 'rate-1',
    project_id: 'proj-1',
    level_id: 'level-junior',
    hourly_rate: 80,
    rate_type: 'hourly',
    ...overrides,
  }
}

describe('calcEntryEarnings', () => {
  it('returns 0 when durationSec is 0', () => {
    expect(calcEntryEarnings(0, makeProject(), null)).toBe(0)
  })

  it('returns 0 when project is null', () => {
    expect(calcEntryEarnings(3600, null, null)).toBe(0)
  })

  it('returns 0 when project is undefined', () => {
    expect(calcEntryEarnings(3600, undefined, null)).toBe(0)
  })

  it('uses project hourly_rate when no level is provided', () => {
    // 1 hour at €100/h = €100
    expect(calcEntryEarnings(3600, makeProject({ hourly_rate: 100 }), null)).toBe(100)
  })

  it('calculates correctly for fractional hours', () => {
    // 30 minutes at €120/h = €60
    expect(calcEntryEarnings(1800, makeProject({ hourly_rate: 120 }), null)).toBe(60)
  })

  it('uses matching level rate when levelId matches', () => {
    const project = makeProject({
      hourly_rate: 100,
      level_rates: [makeRate({ level_id: 'level-junior', hourly_rate: 80 })],
    })
    // 1 hour at €80/h (level rate) = €80
    expect(calcEntryEarnings(3600, project, 'level-junior')).toBe(80)
  })

  it('falls back to project rate when levelId does not match any rate', () => {
    const project = makeProject({
      hourly_rate: 100,
      level_rates: [makeRate({ level_id: 'level-senior', hourly_rate: 150 })],
    })
    // level-junior not in rates → falls back to project hourly_rate €100
    expect(calcEntryEarnings(3600, project, 'level-junior')).toBe(100)
  })

  it('falls back to project rate when level_rates array is empty', () => {
    const project = makeProject({ hourly_rate: 90, level_rates: [] })
    expect(calcEntryEarnings(3600, project, 'level-junior')).toBe(90)
  })

  it('uses senior level rate when multiple rates exist', () => {
    const project = makeProject({
      hourly_rate: 100,
      level_rates: [
        makeRate({ level_id: 'level-junior', hourly_rate: 80 }),
        makeRate({ id: 'rate-2', level_id: 'level-senior', hourly_rate: 150 }),
      ],
    })
    expect(calcEntryEarnings(3600, project, 'level-senior')).toBe(150)
  })

  it('handles project with zero hourly_rate', () => {
    expect(calcEntryEarnings(3600, makeProject({ hourly_rate: 0 }), null)).toBe(0)
  })

  it('calculates 8 hours at €125/h correctly', () => {
    expect(calcEntryEarnings(8 * 3600, makeProject({ hourly_rate: 125 }), null)).toBe(1000)
  })
})
