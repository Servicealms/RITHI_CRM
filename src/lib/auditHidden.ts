// THE SCREENS HIDDEN WHILE AUDIT MODE IS ON (the user, 2026-11-18: "Act on Non
// Auditable Backlog" -- the list is docs/NON_AUDITABLE_BACKLOG.md, NAR-014 to
// NAR-024 in validation.ts). ONE LIST, read by the menu, the global search, the
// Module Guide, the route guard (an open page returns home), My Workload and
// Roles & Permissions, so a screen hidden in one place is hidden in all.
//
// Hiding is a VIEW decision: nothing here changes what a role holds, and the
// screens come back as they were when Audit Mode is switched off.
//
// A plain module (no React, no Supabase) so check-ui can import it.

/** Exact routes, and every route below them (`/indoor` covers `/indoor/pdqc`). */
export const AUDIT_HIDDEN_PATHS: readonly string[] = [
  '/kpi',                      // NAR-014 KPI & Failure Analysis
  '/objective',                // NAR-015 Objective
  '/spare-insights',           // NAR-016 Spare Insights
  '/training',                 // NAR-017 Training
  '/product-database-2',       // NAR-018 Product Database 2.0
  '/indoor',                   // NAR-019 Indoor Service and everything under it
  '/indoor-dc-approvals',      //   its DC approvals queue
  '/indoor-pdt',               //   its print pages
  '/indoor-pdqc',
  '/indoor-register',
  '/indoor-dc',
  '/call-review',              // NAR-020 Call Review
  '/exports/unused',           // NAR-021 Not Consumed Against this Call
  '/feedback-without-report',  // NAR-022 Feedback Without a Report
  '/visit-date-check',         // NAR-023 Visit Date Check (+ Corrected dates)
  '/install-calls-unmapped',   // NAR-024 Machines Without an Installation Call
  '/version-history',          // NAR-027 Version History
  '/product-failure',          // NAR-029 Product Failure Analysis
];

/** THE VERSION SHOWN WHILE AUDIT MODE IS ON (NAR-027, the user, 2026-11-26:
 *  "When Audit mode is enabled, Set the Version to v3.0.0 and Hide Version
 *  History. Hide Build ID, ID, Built when Audit Mode is enabled"). Only what
 *  is SHOWN changes: the build itself, and the update check (which compares
 *  build ids, not this), are untouched. */
export const AUDIT_VERSION = '3.0.0';
/** The version a screen shows: AUDIT_VERSION in Audit Mode, else the build's. */
export const shownVersion = (auditOn: boolean, real: string): string => (auditOn ? AUDIT_VERSION : real);

/** True for a route on the list or below one: `/indoor` and `/indoor/pdqc`,
 *  `/indoor-dc/DC-1`; never `/indoorx`, never `/kpi-export`. */
export function isAuditHiddenPath(path: string): boolean {
  const p = (path.split(/[?#]/)[0] || '/').replace(/\/+$/, '') || '/';
  return AUDIT_HIDDEN_PATHS.some((h) => p === h || p.startsWith(`${h}/`));
}

/** Permission keys not shown on Roles & Permissions, User Master -> Access or
 *  My Profile while Audit Mode is on. The keys stay as stored. */
export const AUDIT_HIDDEN_KEYS: readonly string[] = [
  'review.auto',               // NAR-013
  'users.signature.view',      // NAR-025
  'users.signature.upload',    // NAR-025
  'visitdate.view', 'visitdate.check', 'visitdate.fix', // NAR-023
  'callreview.mark',           // NAR-020
  'pd2.rebuild',               // NAR-018
  'training.manage',           // NAR-017
  'objective.manage', 'objective.lock', // NAR-015
  // NAR-019 Indoor Service, Spare Recycling and the Pre-Delivery Quality Check
  'indoor.receive', 'indoor.work', 'indoor.qc', 'indoor.dispatch', 'indoor.condemn', 'indoor.verify', 'indoor.delete',
  'recycle.view', 'recycle.register', 'recycle.request', 'recycle.issue', 'recycle.close', 'recycle.delete',
  'pdqc.record',
];

/** A permission key hidden while Audit Mode is on: one on the list above, or
 *  the module key of a hidden screen (`mod:/kpi`, `mod:/exports/unused`). */
export function isAuditHiddenKey(key: string): boolean {
  if (AUDIT_HIDDEN_KEYS.includes(key)) return true;
  return key.startsWith('mod:') && isAuditHiddenPath(key.slice(4));
}
