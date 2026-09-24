# TODO

Nothing open here. The planned work (roles, modules, discounts, patient files, and later
leads/inbox) is tracked in `docs/ROADMAP.md`.

## Activity log — keep it complete

Every clinic-data mutation writes `activity_log` (closed 2026-09-24, roadmap step D). When
adding a server action that changes clinic data, log it with `logActivity`, and add the
action name to `describeActivity` (`src/lib/activity-log.ts`) and to a category in
`src/lib/activity-categories.ts`. Personal display preferences (hide earnings, celebration
sound) are deliberately not logged.
