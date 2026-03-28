import { describe, it, expect } from 'vitest'

// ─── PM Authorization logic (extracted from /api/timesheets/review) ───────────
// Tests the pure decision logic for whether a PM can review a given timesheet.

interface ProjectMember { project_id: string; user_id: string; workspace_id: string }
interface Project       { id: string; manager_id: string | null; workspace_id: string; deleted_at: string | null }

function canPMReviewTimesheet(
  callerId: string,
  timesheetUserId: string,
  workspaceId: string,
  projects: Project[],
  projectMembers: ProjectMember[],
): boolean {
  // Get projects managed by the caller in this workspace
  const managedIds = projects
    .filter(p => p.manager_id === callerId && p.workspace_id === workspaceId && !p.deleted_at)
    .map(p => p.id)

  if (managedIds.length === 0) return false

  // Check if timesheet user is a member of any managed project
  return projectMembers.some(
    pm => pm.user_id === timesheetUserId && managedIds.includes(pm.project_id) && pm.workspace_id === workspaceId,
  )
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

const WS = 'ws-1'
const PM_ID = 'pm-user-1'
const MEMBER_ID = 'member-user-1'
const OTHER_USER = 'other-user-2'

const projects: Project[] = [
  { id: 'proj-alpha', manager_id: PM_ID, workspace_id: WS, deleted_at: null },
  { id: 'proj-beta',  manager_id: 'other-pm', workspace_id: WS, deleted_at: null },
]

const projectMembers: ProjectMember[] = [
  { project_id: 'proj-alpha', user_id: MEMBER_ID, workspace_id: WS },
  { project_id: 'proj-beta',  user_id: OTHER_USER, workspace_id: WS },
]

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('canPMReviewTimesheet — authorization', () => {
  it('allows PM to review timesheet of their project member', () => {
    expect(canPMReviewTimesheet(PM_ID, MEMBER_ID, WS, projects, projectMembers)).toBe(true)
  })

  it('denies PM from reviewing timesheet of a member on another PM\'s project', () => {
    expect(canPMReviewTimesheet(PM_ID, OTHER_USER, WS, projects, projectMembers)).toBe(false)
  })

  it('denies when PM manages no projects', () => {
    const noProjects: Project[] = []
    expect(canPMReviewTimesheet(PM_ID, MEMBER_ID, WS, noProjects, projectMembers)).toBe(false)
  })

  it('denies when user is not a member of any of the PM\'s projects', () => {
    const nonMember = 'non-member-99'
    expect(canPMReviewTimesheet(PM_ID, nonMember, WS, projects, projectMembers)).toBe(false)
  })

  it('denies when project is soft-deleted', () => {
    const deletedProjects: Project[] = [
      { id: 'proj-alpha', manager_id: PM_ID, workspace_id: WS, deleted_at: '2024-01-01T00:00:00Z' },
    ]
    expect(canPMReviewTimesheet(PM_ID, MEMBER_ID, WS, deletedProjects, projectMembers)).toBe(false)
  })

  it('denies when checking across different workspace', () => {
    const otherWs = 'ws-other'
    // Member is in ws-1, checking against ws-other
    expect(canPMReviewTimesheet(PM_ID, MEMBER_ID, otherWs, projects, projectMembers)).toBe(false)
  })

  it('allows when member is on multiple projects and one belongs to PM', () => {
    const members: ProjectMember[] = [
      { project_id: 'proj-beta',  user_id: MEMBER_ID, workspace_id: WS }, // not PM's
      { project_id: 'proj-alpha', user_id: MEMBER_ID, workspace_id: WS }, // PM's
    ]
    expect(canPMReviewTimesheet(PM_ID, MEMBER_ID, WS, projects, members)).toBe(true)
  })

  it('denies when PM tries to review their own timesheet (implicit - PM is not in their own project_members)', () => {
    // PM is not listed as a project_member of their own project
    expect(canPMReviewTimesheet(PM_ID, PM_ID, WS, projects, projectMembers)).toBe(false)
  })
})

// ─── Timesheet status transitions ────────────────────────────────────────────

type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

function isValidReviewAction(currentStatus: TimesheetStatus, action: 'approved' | 'rejected'): boolean {
  // Only submitted timesheets can be reviewed
  return currentStatus === 'submitted'
}

function isValidSubmitAction(currentStatus: TimesheetStatus): boolean {
  return currentStatus === 'draft' || currentStatus === 'rejected'
}

function isValidWithdrawAction(currentStatus: TimesheetStatus): boolean {
  return currentStatus === 'submitted'
}

describe('Timesheet status transitions', () => {
  it('allows approving a submitted timesheet', () => {
    expect(isValidReviewAction('submitted', 'approved')).toBe(true)
  })

  it('allows rejecting a submitted timesheet', () => {
    expect(isValidReviewAction('submitted', 'rejected')).toBe(true)
  })

  it('disallows reviewing a draft timesheet', () => {
    expect(isValidReviewAction('draft', 'approved')).toBe(false)
  })

  it('disallows re-approving an already approved timesheet', () => {
    expect(isValidReviewAction('approved', 'approved')).toBe(false)
  })

  it('allows submitting a draft timesheet', () => {
    expect(isValidSubmitAction('draft')).toBe(true)
  })

  it('allows re-submitting a rejected timesheet', () => {
    expect(isValidSubmitAction('rejected')).toBe(true)
  })

  it('disallows submitting an already submitted timesheet', () => {
    expect(isValidSubmitAction('submitted')).toBe(false)
  })

  it('allows withdrawing a submitted timesheet', () => {
    expect(isValidWithdrawAction('submitted')).toBe(true)
  })

  it('disallows withdrawing a draft timesheet', () => {
    expect(isValidWithdrawAction('draft')).toBe(false)
  })
})
