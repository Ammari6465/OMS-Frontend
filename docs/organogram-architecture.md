# Organogram architecture

The Organogram route is a thin page composed of `OrganogramToolbar`, `OrganogramCanvas`, `EmployeeNode`, and `OrganogramDetailsDrawer`. `OrganogramStore` owns remote state, filters, search position, selection, collapsed branches, zoom/pan, edit mode, conflicts, connection state, and safe query parameters. API, SSE, export, and pure hierarchy construction live in separate services/utilities.

## Two explicit hierarchies

- Employee view is a reporting-line chart. Its parent edge is `staff.manager_id`; changing it uses the dedicated manager PATCH endpoint.
- Position view is an establishment chart. Its parent edge is `positions.reports_to_position_id`; vacancies are position nodes in their proper reporting branch.

These relationships are not inferred from one another. Filling a position does not silently rewrite an employee's manager, and reparenting an employee does not mutate the position hierarchy.

## Security and privacy

The chart fetches one minimal company-scoped payload and never receives contact fields. The drawer makes a separate authorized details request. Company scope is enforced server-side for reads, edits, details, and SSE. Browser filtering is presentation only and is never treated as authorization.

## Performance and resilience

`buildHierarchy` creates node, ancestor, descendant, and report-count maps once per payload in linear time. A 1,000-node fixture is covered by tests. Cycles and missing parents become renderable roots with warnings. Search uses the preloaded maps, real-time bursts are debounced, and rapid drawer selections ignore outdated responses.

## Exports

PNG export renders the current sanitized DOM through an SVG foreign object into a canvas. CSV exports the complete loaded hierarchy with quoted fields. PDF is provided through the browser's print/PDF pipeline and never uses `document.write`.

## Verified responsive captures

- [Desktop after](screenshots/organogram-after-desktop.png) (1440 × 900)
- [Mobile after](screenshots/organogram-after-mobile.png) (390 × 844)

No reproducible baseline screenshot was stored before the refactor, so the repository contains verified after-captures only rather than presenting a reconstructed image as evidence.
