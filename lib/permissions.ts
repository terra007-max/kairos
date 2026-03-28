// ─────────────────────────────────────────────────────────────────────────────
// Kairos — Centralized permission system
//
// Single source of truth for what each role can do.
// Used by: components, middleware, workspace-context.
// DB-level enforcement mirrors this in supabase/rls-admin-no-record.sql.
// ─────────────────────────────────────────────────────────────────────────────

export type WorkspaceRole = 'admin' | 'partner' | 'project_manager' | 'member'

export type Permission =
  | 'record:time'       // use timer / log hours personally
  | 'submit:timesheet'  // submit own timesheet for review
  | 'review:all'        // review every member's timesheets
  | 'review:managed'    // review timesheets of managed-project members only
  | 'manage:invoices'   // create / view / send invoices
  | 'manage:team'       // add / remove / configure team members
  | 'manage:clients'    // create / edit / delete clients
  | 'manage:projects'   // create / edit / archive / delete projects
  | 'view:analytics'    // access analytics page

// ── Permission matrix ──────────────────────────────────────────────────────
const ROLE_PERMISSIONS: Record<WorkspaceRole, Permission[]> = {
  admin: [
    // Oversight & management only — no personal time recording
    'review:all',
    'manage:invoices',
    'manage:team',
    'manage:clients',
    'manage:projects',
    'view:analytics',
  ],
  partner: [
    'record:time',
    'submit:timesheet',
    'review:all',
    'manage:invoices',
    'view:analytics',
  ],
  project_manager: [
    'record:time',
    'submit:timesheet',
    'review:managed',
    'view:analytics',
  ],
  member: [
    'record:time',
    'submit:timesheet',
  ],
}

// Pre-build Sets for O(1) lookup
const PERMISSION_SETS = Object.fromEntries(
  (Object.entries(ROLE_PERMISSIONS) as [WorkspaceRole, Permission[]][])
    .map(([role, perms]) => [role, new Set<Permission>(perms)])
) as Record<WorkspaceRole, Set<Permission>>

/** Returns true if the given role has the requested permission. */
export function can(role: WorkspaceRole | undefined | null, permission: Permission): boolean {
  if (!role) return false
  return PERMISSION_SETS[role]?.has(permission) ?? false
}

// ── Route-level rules for middleware ──────────────────────────────────────
// If the user's role doesn't have the required permission, redirect to /dashboard.
export const ROUTE_RULES: { path: string; permission: Permission }[] = [
  { path: '/invoices',  permission: 'manage:invoices' },
  { path: '/analytics', permission: 'view:analytics'  },
]
