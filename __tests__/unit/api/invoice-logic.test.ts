import { describe, it, expect } from 'vitest'
import { format, startOfWeek } from 'date-fns'

// ─── Helpers extracted from invoices/page.tsx for unit testing ────────────────
// These replicate the pure business logic without any React or Supabase deps.

type HoursSummary = {
  projectId: string
  projectName: string
  approvedHours: number
  pendingHours: number
  draftHours: number
  approvedRevenue: number
  rate: number
}

function classifyEntries(
  entries: any[],
  timesheets: { user_id: string; week_start: string; status: string }[],
): HoursSummary[] {
  const tsStatusMap: Record<string, string> = {}
  for (const ts of timesheets) {
    tsStatusMap[`${ts.user_id}:${ts.week_start}`] = ts.status
  }

  const projectMap: Record<string, HoursSummary> = {}
  for (const e of entries) {
    const pid = e.project_id
    if (!projectMap[pid]) {
      projectMap[pid] = {
        projectId: pid,
        projectName: e.project?.name || 'Unknown',
        approvedHours: 0,
        pendingHours: 0,
        draftHours: 0,
        approvedRevenue: 0,
        rate: e.project?.hourly_rate || 0,
      }
    }
    const weekStart = format(startOfWeek(new Date(e.start_time), { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const tsStatus = tsStatusMap[`${e.user_id}:${weekStart}`] || 'draft'
    const hours = (e.duration_sec || 0) / 3600

    if (tsStatus === 'approved') {
      projectMap[pid].approvedHours += hours
      projectMap[pid].approvedRevenue += hours * (e.hourly_rate || 0)
    } else if (tsStatus === 'submitted') {
      projectMap[pid].pendingHours += hours
    } else {
      projectMap[pid].draftHours += hours
    }
  }
  return Object.values(projectMap)
}

function buildInvoiceLines(approvedEntries: any[]) {
  const projectGroups: Record<string, { project: any; entries: any[] }> = {}
  for (const e of approvedEntries) {
    if (!projectGroups[e.project_id]) {
      projectGroups[e.project_id] = { project: e.project, entries: [] }
    }
    projectGroups[e.project_id].entries.push(e)
  }

  return Object.values(projectGroups).map(({ project, entries }) => {
    const totalSecs = entries.reduce((s: number, e: any) => s + (e.duration_sec || 0), 0)
    const totalAmount = entries.reduce(
      (s: number, e: any) => s + ((e.duration_sec || 0) / 3600) * (e.hourly_rate || 0),
      0,
    )
    const hours = totalSecs / 3600
    const blendedRate = hours > 0 ? totalAmount / hours : (project?.hourly_rate || 0)
    return {
      description: project.name,
      hours: Math.round(hours * 100) / 100,
      rate: Math.round(blendedRate * 100) / 100,
      amount: Math.round(totalAmount * 100) / 100,
    }
  })
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

const MONDAY = '2024-01-15' // a known Monday
const PROJECT = { id: 'p1', name: 'Alpha', hourly_rate: 100 }

function entry(overrides: any) {
  return {
    project_id: 'p1',
    project: PROJECT,
    user_id: 'u1',
    start_time: `${MONDAY}T09:00:00Z`,
    duration_sec: 3600,
    hourly_rate: 100,
    ...overrides,
  }
}

function timesheet(status: string, weekStart = MONDAY) {
  return { user_id: 'u1', week_start: weekStart, status }
}

// ─── classifyEntries tests ────────────────────────────────────────────────────

describe('classifyEntries — hours summary', () => {
  it('classifies approved timesheet entries as approved hours', () => {
    const [summary] = classifyEntries([entry({})], [timesheet('approved')])
    expect(summary.approvedHours).toBe(1)
    expect(summary.pendingHours).toBe(0)
    expect(summary.draftHours).toBe(0)
  })

  it('classifies submitted timesheet entries as pending hours', () => {
    const [summary] = classifyEntries([entry({})], [timesheet('submitted')])
    expect(summary.pendingHours).toBe(1)
    expect(summary.approvedHours).toBe(0)
  })

  it('classifies entries with no timesheet as draft hours', () => {
    const [summary] = classifyEntries([entry({})], [])
    expect(summary.draftHours).toBe(1)
    expect(summary.approvedHours).toBe(0)
  })

  it('classifies entries with draft timesheet as draft hours', () => {
    const [summary] = classifyEntries([entry({})], [timesheet('draft')])
    expect(summary.draftHours).toBe(1)
  })

  it('computes approved revenue using per-entry hourly_rate', () => {
    const [summary] = classifyEntries(
      [entry({ duration_sec: 3600, hourly_rate: 150 })],
      [timesheet('approved')],
    )
    expect(summary.approvedRevenue).toBe(150)
  })

  it('approved revenue uses entry rate, not project rate', () => {
    // entry rate 80 overrides project rate 100
    const [summary] = classifyEntries(
      [entry({ duration_sec: 3600, hourly_rate: 80 })],
      [timesheet('approved')],
    )
    expect(summary.approvedRevenue).toBe(80)
  })

  it('accumulates hours across multiple entries in the same project', () => {
    const entries = [
      entry({ duration_sec: 3600 }),
      entry({ duration_sec: 1800 }),
    ]
    const [summary] = classifyEntries(entries, [timesheet('approved')])
    expect(summary.approvedHours).toBeCloseTo(1.5)
  })

  it('splits correctly across approved and pending entries for the same project', () => {
    const entries = [
      entry({ user_id: 'u1', duration_sec: 3600, start_time: '2024-01-15T09:00:00Z' }),
      entry({ user_id: 'u2', duration_sec: 7200, start_time: '2024-01-15T09:00:00Z' }),
    ]
    const timesheets = [
      { user_id: 'u1', week_start: MONDAY, status: 'approved' },
      { user_id: 'u2', week_start: MONDAY, status: 'submitted' },
    ]
    const [summary] = classifyEntries(entries, timesheets)
    expect(summary.approvedHours).toBe(1)
    expect(summary.pendingHours).toBe(2)
  })

  it('returns separate summaries for different projects', () => {
    const proj2 = { id: 'p2', name: 'Beta', hourly_rate: 120 }
    const entries = [
      entry({ project_id: 'p1', project: PROJECT }),
      entry({ project_id: 'p2', project: proj2 }),
    ]
    const summaries = classifyEntries(entries, [timesheet('approved')])
    expect(summaries).toHaveLength(2)
  })
})

// ─── buildInvoiceLines tests ──────────────────────────────────────────────────

describe('buildInvoiceLines — invoice generation', () => {
  it('generates one line per project', () => {
    const proj2 = { id: 'p2', name: 'Beta', hourly_rate: 120 }
    const lines = buildInvoiceLines([
      entry({ project_id: 'p1', project: PROJECT }),
      entry({ project_id: 'p2', project: proj2, hourly_rate: 120 }),
    ])
    expect(lines).toHaveLength(2)
  })

  it('sums hours across entries of the same project', () => {
    const [line] = buildInvoiceLines([
      entry({ duration_sec: 3600 }),
      entry({ duration_sec: 3600 }),
    ])
    expect(line.hours).toBe(2)
  })

  it('calculates amount using per-entry hourly_rate', () => {
    // 1h at €80 + 1h at €120 = €200
    const [line] = buildInvoiceLines([
      entry({ duration_sec: 3600, hourly_rate: 80 }),
      entry({ duration_sec: 3600, hourly_rate: 120 }),
    ])
    expect(line.amount).toBe(200)
  })

  it('calculates blended rate as amount ÷ hours', () => {
    // 1h at €80 + 1h at €120 = 2h at €100 blended
    const [line] = buildInvoiceLines([
      entry({ duration_sec: 3600, hourly_rate: 80 }),
      entry({ duration_sec: 3600, hourly_rate: 120 }),
    ])
    expect(line.rate).toBe(100)
  })

  it('returns correct description as project name', () => {
    const [line] = buildInvoiceLines([entry({})])
    expect(line.description).toBe('Alpha')
  })

  it('rounds hours to 2 decimal places', () => {
    // 1h 20m = 4800s = 1.333...h → rounds to 1.33
    const [line] = buildInvoiceLines([entry({ duration_sec: 4800 })])
    expect(line.hours).toBe(1.33)
  })

  it('rounds amount to 2 decimal places', () => {
    // 1.333...h * €100 = €133.33
    const [line] = buildInvoiceLines([entry({ duration_sec: 4800, hourly_rate: 100 })])
    expect(line.amount).toBe(133.33)
  })

  it('returns empty array for empty input', () => {
    expect(buildInvoiceLines([])).toHaveLength(0)
  })
})

// ─── Cashflow KPI calculation ─────────────────────────────────────────────────

function calcCashflow(invoices: any[], today = new Date('2024-06-01')) {
  let billed = 0, paid = 0, open = 0, overdue = 0
  for (const inv of invoices) {
    const amount = Number(inv.subtotal) || 0
    if (inv.status === 'paid') {
      billed += amount; paid += amount
    } else if (inv.status === 'sent') {
      billed += amount
      if (new Date(inv.due_date) < today) overdue += amount
      else open += amount
    }
  }
  return { billed, paid, open, overdue }
}

describe('calcCashflow — analytics KPI', () => {
  it('counts paid invoices in billed and paid totals', () => {
    const { billed, paid } = calcCashflow([
      { status: 'paid', subtotal: 1000, due_date: '2024-05-01' },
    ])
    expect(billed).toBe(1000)
    expect(paid).toBe(1000)
  })

  it('counts sent invoices in billed but not in paid', () => {
    const { billed, paid } = calcCashflow([
      { status: 'sent', subtotal: 500, due_date: '2024-07-01' },
    ])
    expect(billed).toBe(500)
    expect(paid).toBe(0)
  })

  it('marks sent invoice as overdue when past due date', () => {
    const { overdue, open } = calcCashflow([
      { status: 'sent', subtotal: 300, due_date: '2024-05-01' }, // before today 2024-06-01
    ])
    expect(overdue).toBe(300)
    expect(open).toBe(0)
  })

  it('marks sent invoice as open when due date is in the future', () => {
    const { open, overdue } = calcCashflow([
      { status: 'sent', subtotal: 400, due_date: '2024-08-01' },
    ])
    expect(open).toBe(400)
    expect(overdue).toBe(0)
  })

  it('ignores draft invoices entirely', () => {
    const { billed, paid, open, overdue } = calcCashflow([
      { status: 'draft', subtotal: 999, due_date: '2024-08-01' },
    ])
    expect(billed).toBe(0)
    expect(paid).toBe(0)
    expect(open).toBe(0)
    expect(overdue).toBe(0)
  })

  it('sums correctly across mixed invoice statuses', () => {
    const invoices = [
      { status: 'paid', subtotal: 1000, due_date: '2024-04-01' },
      { status: 'sent', subtotal: 500, due_date: '2024-08-01' },  // open
      { status: 'sent', subtotal: 200, due_date: '2024-05-01' },  // overdue
      { status: 'draft', subtotal: 9999, due_date: '2024-07-01' },
    ]
    const cf = calcCashflow(invoices)
    expect(cf.billed).toBe(1700)
    expect(cf.paid).toBe(1000)
    expect(cf.open).toBe(500)
    expect(cf.overdue).toBe(200)
  })

  it('returns all zeros for empty invoice list', () => {
    const cf = calcCashflow([])
    expect(cf).toEqual({ billed: 0, paid: 0, open: 0, overdue: 0 })
  })
})
