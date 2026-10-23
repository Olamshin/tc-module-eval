# F001–F007 evaluator design

Status: design proposal, version 2, awaiting the user's review; not implemented. Q1–Q9 were
decided on 2026-10-23 (see [Decisions](#decisions)). Based on `origin/master` at `53eed3a` (S012 #66
and S014 #65 merged; S011 and S013 in progress elsewhere). All real-world numbers were collected on
2026-10-23 and will drift.

Changes in version 2: Q1–Q9 recorded as decisions, all as recommended. A small PR fixing
`classifyModuleKind` (Q7) now comes first in the implementation order. Q6 is made concrete: when
agent review is enabled without `--criterion-agent-criteria`, F001, F003 and F006 run; F004 and
F007 run only when runtime evidence was collected; F002 runs only when listed.

The Frontend criteria from the [master list](https://gist.github.com/okolawole-ebsco/f54f7617b61680f2ad346896e807a796)
apply to UI modules and shared UI libraries alike. `src/evaluators/javascript/frontend-evaluator.ts`
is a stub, so all seven fall back to `not_implemented` today.

| ID | Criterion | Deterministic part | Judgment part (agent review on top) | Proposed short rule |
| --- | --- | --- | --- | --- |
| F001 | Every consumed API is declared in `okapiInterfaces` / `optionalOkapiInterfaces` | Extract request paths from production code, map them to interfaces through a handler index, compare with `package.json` | Request sites the extractor cannot resolve; confirming candidate violations | Fail when a resolved request path maps to exactly one interface that is not declared. Pass when every request site resolves to a declared interface. Otherwise manual. |
| F002 | If provided, E2E tests use a supported technology | Detect E2E frameworks in the repository | Whether browser tests found are E2E, and which runner CI uses | `not_applicable` when no E2E tests are in the repository; pass for Cypress; fail for a conclusively unlisted E2E framework; manual otherwise. |
| F003 | i18n via react-intl and an `en.json` with English texts | react-intl present, `en.json` exists and is valid, literal message ids exist in `en.json` | Hard-coded user-visible strings, missing ids, dynamic ids | Fail without react-intl or `en.json`; manual on missing ids or hard-coded text candidates; pass otherwise. |
| F004 | WCAG 2.1 AA as measured by current axe DevTools | Static accessibility signals only | Accessibility review of components; optional axe-core results from a running UI | Always manual. Agent review and optional runtime axe results tell the reviewer where to look. |
| F005 | Uses the Stripes version on the OST page | S007's Stripes finding against the committed Trillium policy | None | Same outcome as S007's Stripes row: pass, fail, or manual. |
| F006 | Follows FOLIO UI layouts, patterns and norms | Pattern signals (Paneset, forms with `navigationCheck`, confirmation modals, raw HTML controls) | Most of the criterion, against a pinned snapshot of the UX guidelines | Always manual. The agent review is the main value. |
| F007 | Works in the latest Chrome | Browser-specific code signals | Compatibility review; optional console and render evidence from a running UI | Always manual. |

## Current state the design builds on

- `FrontendEvaluator` extends `CatalogSectionEvaluator('Frontend', 'javascript')` with no handlers.
  The pattern to copy is `SharedEvaluator`: one handler per criterion, an `EvaluationRun` per
  evaluation, artifacts cached with `getOrCreateArtifact`, and optional agent review through
  `reviewCriterionWithAgent`.
- S007 already evaluates Stripes for UI modules (`frontend-first-party-frameworks`, "Stripes 10.1
  or greater", normative) from `package.json` and `yarn.lock` (artifact `s007TechnologyEvidence`).
- S008 already reads UI declarations from `stripes.okapiInterfaces` and
  `stripes.optionalOkapiInterfaces` (`collectS008Declarations`) and holds a checked-in catalog of
  the R1-2026-GA platform (174 providers, 526 provided interfaces). The catalog keeps interface
  ids and versions only, not handler paths.
- S010 recognizes Stripes request helpers only as an "unsupported pattern" diagnostic and lists
  declared interfaces as dependencies; it extracts no request paths.
- S012 added `manifest-parsers.ts` (`parsePackageJson`, `parseYarnLockfile`, `yarnLockVersion`),
  `build-test-evidence.ts`, `policySections`, and the exported S007 version comparison.
  S014 added `remote-evidence.ts` (opt-in `--allow-remote-lookups`) and `platform-applications.ts`.
- Agent review (`docs/agent-review.md`): read-only OpenCode over a committed-source snapshot,
  repository browsing by default, advice never changes status, every assessment must cite
  repository files, malformed or uncited responses are rejected whole. S006 and S010 add a
  `.criterion-agent/<ID>/response-shape.json` example and name the exact fields in the prompt;
  both reject `likely_sufficient` alongside unresolved obligations.

## Findings that shape the design

### F1. Real modules use interfaces they do not declare, and the evidence is concrete

A prototype extracted request paths from production code (stripes-connect manifest `path:` values
and `ky` calls with string or template literals) and matched them against the handler
`pathPattern`s of every module descriptor in the 41 applications of platform-lsp `snapshot`
(2,766 non-system handler patterns from FAR, `full=true`, 2.3 MB in total). Most-specific match
wins.

| Repository (HEAD) | Declared | Detected in use | Used but not declared | Unresolved request sites |
| --- | --- | --- | --- | --- |
| ui-checkin (`9e100db`) | 8 | 10 | `patron-action-session`, `service-points`, `staff-slips-storage` | 0 |
| ui-users (`31d7f0f`) | 26 | 33 | 13, e.g. `service-points`, `loan-anonymization`, `patron-block-limits` | 5 (4 dynamic templates, 1 unmatched path) |
| ui-inventory (`4bb29ce`) | 63 | 54 | 12, e.g. `bound-with-parts-storage`, `inventory-move`, `subject-types` | 4 dynamic templates |
| ui-agreements (`802a80e`) | 5 | 1 | none | 32 (24 path constants, 8 dynamic templates): requests go through `useOkapiKy`/`useQuery` with imported endpoint names |
| ui-inventory-import (`741dca3`) | 1 | 1 | none | 0 |
| stripes-smart-components (`970244f`) | 7 | 9 | `circulation`, `custom-fields`, `loan-policy-storage`, `location-units`, `locations` | 2 dynamic templates |
| stripes-components (`77a0014`) | 0 | 0 | none | 0 |

Spot checks confirm the hits are real: ui-checkin's `src/Scan.js:266` requests
`staff-slips-storage/staff-slips`, `:272` `service-points` and `:294`
`circulation/end-patron-action-session`, and none of those interfaces is in its `package.json`.
"Declared but not detected" is common (ui-inventory: 21) and is not a violation: requests made
inside shared libraries or with dynamic paths do not appear as literals in the module.

Consequences: a literal-path extractor plus a handler index finds real F001 violations; it needs
same-file and one-hop imported constant resolution to cover hook-based modules like ui-agreements;
and anything it cannot resolve needs judgment.

### F2. The S008 catalog can carry the handler index offline

FAR application descriptors with `full=true` include every module descriptor's `provides[].handlers`
(app-platform-minimal 188 KB, app-platform-complete 414 KB). The S008 acquisition tool already
fetches `full=true`, but `config/s008-catalog-official.json` keeps only interface ids and versions.
Recording `handlers: [{ methods, pathPattern }]` per provided interface at acquisition time gives
F001 an offline index for R1-2026-GA without changing S008's results. New interfaces that are
only on `snapshot` would then show as "path not in the catalog".

### F3. i18n is in place everywhere, but literal message ids are missing from `en.json`

All six UI repositories have `translations/<namespace>/en.json` and 38 locale files, and use
`FormattedMessage`, `useIntl` or `intl.formatMessage`. A prototype comparing literal ids in
production code with `en.json`:

| Repository | `en.json` keys | Literal ids missing from `en.json` | Hard-coded text candidates (production) |
| --- | --- | --- | --- |
| ui-checkin | 126 | 1: `ui-checkin.statusModal.cancel` (`CheckinNoteModal.js:60`) | 0 |
| ui-users | 1,379 | 3 | 1 real: `aria-label="Lost items search"` (`Search.js:30`) |
| ui-agreements | 916 | 2 (one is `platform.urlCustomization..deleteFailed`) | 0 |
| ui-inventory | 961 | 0 | 1, inside a JSX comment (false positive) |
| ui-inventory-import | 155 | 4 × `accordion.devinfo` | 0 |
| stripes-smart-components | 287 | 0 | 3, e.g. "Remove this address" |
| stripes-components | 950 | 0 | 3 in `lib/` (e.g. `aria-label="Search field select"`), 57 more in `guides/` examples |

The `ui-checkin.statusModal.cancel` id is not in `en.json` (the file has `back`, `confirm`,
`close`), so the cancel button shows the raw id unless a caller passes `cancelLabel`. Many `en.json`
keys are referenced only through computed ids, so "unused keys" says nothing. Hard-coded text
detection mixes real defects with comments, so it needs judgment.

### F4. The repository alone cannot measure WCAG, layout norms or Chrome behaviour

F004 names axe DevTools as the measure, F006 is about how screens behave, and F007 about running
in Chrome. None of that is in the source. A single UI module cannot run on its own: `stripes serve`
needs a platform build and a backend, so without a reference environment it renders only the login
page. What the source does give:

- axe-based tests exist in some repositories (ui-inventory 25 files, stripes-components 48,
  stripes-smart-components 15, ui-checkin and ui-users 1, ui-agreements and ui-inventory-import 0);
- `@folio/eslint-config-stripes` 10.0.0 enables the `jsx-a11y` plugin (through oxlint), and some code
  disables its rules (ui-users 3, ui-inventory 2, stripes-components 7; mostly
  `click-events-have-key-events` and `no-static-element-interactions`);
- forms built with `stripesFinalForm` mostly set `navigationCheck: true`, the Stripes way of
  confirming before unsaved changes are lost (ui-users: 18 form files, 11 `true`, 2 `false`,
  5 not set; ui-inventory: 1 of 9 not set; stripes-smart-components: 2 `false`, 2 not set).

### F5. axe-core runs headless in the orb against a FOLIO reference environment

`axe-core` 4.14.0 injected into the orb's headless Chrome for Testing ran WCAG 2.0/2.1 A and AA
rules against the public Eureka snapshot (`folio-etesting-snapshot-diku.ci.folio.org`, which
redirects to its Keycloak login): 2 violations (`color-contrast` ×2 nodes, `html-has-lang`),
18 passes. Module pages need a logged-in session, so credentials have to be supplied.
The environment runs whatever version is deployed there, not the evaluated commit. The orb's
Chrome for Testing is 156.0.8078.47, which equals the current Stable in
`googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json`.

### F6. The UX guidelines live in stripes-components and can be pinned

`ux.folio.org/docs/all-guidelines/` is the stripes-components Storybook. Its source is
`guides/ux-guidelines/**.mdx` (66 files: layout, forms, feedback, actions, navigation, data
display, interface) plus `guides/patterns` and `guides/accessibility`, 183 KB in total. The
confirmation-modal pattern (`feedback/ConfirmationModalPattern.mdx`) and
`actions/ConfirmationLanguageGuidelines.mdx` cover the gist's "confirm that you'll lose the
state" example. A pinned copy can be supplied to the agent the way S007 supplies its policy.

### F7. F005 is already decided by S007

S007's Stripes rows on 2026-10-23: ui-users `^10.1.0` resolved to `10.1.1099000000000233` from
`yarn.lock` (compliant); ui-agreements and ui-inventory `^10.1.0` (compliant); ui-inventory-import
`^10.0.0` resolved to `10.1.5` (compliant); ui-checkin `^10.0.0` with no `yarn.lock` (manual: the
range also allows 10.0.x, below "10.1 or greater"). Stripes' own constituent libraries
(stripes-components, stripes-smart-components, …) do not depend on `@folio/stripes`; they are
part of it.

### F8. Stripes libraries are classified as UI modules

`classifyModuleKind` checks for a `stripes` object in `package.json` before its library allowlist,
so stripes-components and stripes-smart-components (both on the allowlist) come out as
`ui-module` ("Stripes metadata found in package.json"); stripes-testing comes out as `library`.
F001–F007 apply to libraries anyway, but S004, S005, S008, S010 and S014 treat libraries as
`not_applicable`, so this is an existing bug outside F001–F007. Decided (Q7): fix it first, in
its own PR (PR 0).

### F9. E2E tests live in stripes-testing, not in module repositories

None of the five ui-* repositories has Cypress, Playwright or other E2E tooling; they depend on
`@folio/stripes-testing` for interactors in Jest tests. stripes-components and
stripes-smart-components run browser tests with Karma and BigTest (`karma.conf.js`,
`@bigtest/interactor`). stripes-testing holds the Cypress suites (`cypress/e2e/checkin`,
`cypress/e2e/agreements`, …). The OST frontend section lists Cypress 12 as "pending verification"
(`strength: provisional`).

### F10. Agent reviews take one to three minutes and cost about two cents each

Two S010 reviews on 2026-10-23 with `openrouter/deepseek/deepseek-v4-flash`
(prompt $0.091, completion $0.182 per million tokens), timeout 420,000 ms:

| Module | Files in snapshot | OpenCode run | Tool calls | Outcome |
| --- | --- | --- | --- | --- |
| ui-checkin | 136 | 158 s | 31 | accepted, `needs_reviewer_judgment` |
| ui-users | 1,001 | 72 s | 27 | rejected: an assessment had invalid `failureBounds` |

Both together cost $0.046 (account usage 5.009 → 5.055 of a $10 limit). Run time does not track
repository size; a rejected review costs the same as an accepted one.

## Cross-cutting design

### Every F00x report has three layers; agent review only adds

Each criterion's result is built in this order, and nothing in a lower layer is removed when a
higher one is present:

1. **Deterministic evidence and status.** What the code checked, with file and line references,
   and the status it decided. Agent advice never changes this status.
2. **Manual checklist.** A short, plain-English list of what a reviewer should check, each item
   with a stable ID (`F006-C3`) and starting points from layer 1 ("start with
   `src/settings/FeeFineForm.js`, which sets `navigationCheck: false`"). The checklist is always
   shown, whatever the status, except for `pass` and `not_applicable` results whose checklist would
   be empty.
3. **Agent findings**, only when agent review ran and its response was accepted. Each assessment
   is attached to the checklist item it addresses. The report shows, per item, whether the agent
   covered it and what it found; items the agent did not cover are labelled "not covered by the
   agent review".

When agent review is disabled, unavailable, rejected or not applicable, layers 1 and 2 are shown
unchanged, followed by the existing note ("Agent review: Not run: agent review is disabled or
unconfigured" or "Unavailable: …"). This keeps a review-free report complete and makes the agent
review purely additive.

Rendered layout, plain text:

```text
F006 manual: The module uses Stripes layout components throughout, but 7 of 18 forms do not ask
before discarding unsaved changes. A reviewer must check the layouts and patterns below.

What the tool found:
  - Layout: Paneset in 16 files; Pane/PaneHeader used by every route component
  - Forms: 18 forms built with stripesFinalForm; navigationCheck true in 11, false in 2, not set in 5
  - …

Checklist for the reviewer:
  F006-C1 Each screen uses Paneset/Pane with the search, results and detail panes in the
          standard order. Start with: src/routes/UserSearchContainer.js
  F006-C3 Forms ask before discarding unsaved changes. Start with: src/settings/X.js (false),
          src/components/Y.js (not set)
  …

Agent review (advisory; the status is unchanged):
  - Overall: needs reviewer judgment (confidence: medium)
  - F006-C1 Looks fine: … (src/routes/UserSearchContainer.js, src/views/UserSearch/UserSearch.js)
  - F006-C3 Problem found: FeeFineForm discards edits on Cancel without a prompt … (src/settings/…)
  - F006-C5 Not covered by the agent review
  - Reviewer actions: …
```

The HTML report shows the same three blocks; each checklist row gets an agent badge (Problem found,
Looks fine, Could not tell, Not covered) and the agent's text under it.

### Checklist model

A small shared module, `src/utils/frontend-checklist.ts`, defines
`{ id, title, startingPoints: [{ path, line?, note }], obligations: string[] }` and renders
layer 2. Each criterion owns a fixed list of items with stable IDs (`F001-C1` …); an item is
included when it applies to the repository, and its starting points come from layer 1. IDs never
change meaning once released; a new check takes the next number.

### Agent review contract for F00x criteria

Agent review runs only when the deterministic status is `manual`, as today. It uses
`runCriterionAgentReview()` with repository browsing (the shared default).

Which F criteria run (decided, Q6). Today, enabling agent review without
`--criterion-agent-criteria` lets every agent-capable criterion run, and listing criteria narrows
that. The F criteria add two conditions on top:

| Criterion | Agent review enabled, no criteria list | Listed in `--criterion-agent-criteria` |
| --- | --- | --- |
| F001, F003, F006 | runs | runs |
| F004, F007 | runs only with runtime evidence | runs only with runtime evidence |
| F002 | does not run | runs |
| F005 | no agent review | no agent review |

When a condition stops a review, the report gives the reason in the existing note, for example
"Agent review: Not run: F004 agent review needs runtime evidence (--ui-runtime-url)" or "Not run:
F002 agent review runs only when listed in --criterion-agent-criteria". Layers 1 and 2 are shown
as usual.

Starting material, under `.criterion-agent/<ID>/`:

- `checklist.json`: the layer-2 items with IDs, titles, starting points and **review obligations**;
- `evidence-summary.json`: the deterministic findings (complete JSON, not truncated);
- `response-shape.json`: a complete, valid example response for this criterion (the S006 fix);
- criterion reference material: the pinned UX guidelines for F006, the FOLIO accessibility primer
  and axe guide for F004, the matched handler patterns for F001's candidates;
- optional runtime evidence for F004, F006 and F007 (see below).

Obligations. Each checklist item yields one obligation (`F006-C3`), or one per subject when the
item lists subjects (`F001-C2:interface:service-points`, `F003-C2:src/x.js:30`). The prompt
requires exactly one assessment per obligation, with the obligation ID in `technologyId`. At most
40 obligations are supplied per review; the rest stay in the checklist with "not given to the agent
(limit of 40)".

Assessment fields and meaning, using the existing types unchanged:

| Field | Values for F00x |
| --- | --- |
| `technologyId` | the obligation ID |
| `type` | `aligned_fact` (the item is satisfied), `substantive_concern` (a problem was found), `evidence_gap` (the agent could not establish it), `analyzer_limitation` (a deterministic finding is wrong, e.g. a false positive), `policy_question` (the guideline or policy is unclear) |
| `coverageDisposition` | `investigated`, `immaterial`, `unresolved` |
| `summary` | one or two sentences with file and line |
| `evidenceReferences` | repository paths that exist in `repository-files.json` |

The prompt names these fields exactly, says "see response-shape.json", and says which types
the report renders as Problem found, Looks fine and Could not tell.

Semantic validation (all-or-nothing, as today). The response is rejected when:

1. an obligation has no assessment, has more than one, or an assessment names an unknown ID;
2. an assessment or reviewer action cites no file from `repository-files.json`; generated
   `.criterion-agent/` files alone do not count, except that runtime items (F004-C1, F006-C7,
   F007-C1) may cite the supplied runtime evidence files;
3. `recommendation` is `likely_sufficient` while any assessment is `substantive_concern` or
   `evidence_gap`, or any `coverageDisposition` is `unresolved`;
4. `recommendation` is `likely_insufficient` without at least one cited `substantive_concern`;
5. an `aligned_fact` has `coverageDisposition: unresolved`, or an `evidence_gap` has `investigated`;
6. an `analyzer_limitation` targets an obligation with no deterministic finding;
7. a runtime item is assessed `aligned_fact` without runtime evidence supplied (the agent cannot
   claim that a page renders or passes axe from source alone). This matters for F006-C7, since
   F006 also reviews without runtime evidence; F004 and F007 reviews always have it;
8. criterion-specific rules listed under each criterion.

`likely_sufficient` therefore means "every item checked and nothing wrong", never "nothing found".

### Keeping reviews focused, fast and cheap

- **Browse scope.** Add an optional `browseInclude` predicate to the request, applied in
  `prepareRepositoryBrowsing` on top of the existing exclusions. F00x reviews include `src/`,
  `lib/`, root `index.js`/`*.js`, `package.json`, the CSS next to components, and per criterion:
  `translations/<namespace>/en.json` for F003 (not the 37 other locales), `test/` and `cypress/`
  for F002 and F004 (axe tests). Stories, `guides/`, CHANGELOG and other locales are left out.
  The scope is listed in the prompt and in the report.
- **One review per criterion**, sequential like today; the obligation cap keeps prompts bounded.
- **Timeout.** Recommend `--criterion-agent-timeout-ms 420000` for UI modules; the 120,000 ms default
  is close to what ui-checkin needed (158 s).
- **Cost and time per review** (from F10): about $0.02–0.05 and 1–4 minutes with
  deepseek-v4-flash. A full UI evaluation with all six agent-capable criteria is about
  $0.10–0.30 and 8–20 minutes. With $4.95 of the $10 OpenRouter limit left, that is roughly
  15–45 full UI evaluations. With the Q6 default (F001, F003 and F006; F004 and F007 only with
  runtime evidence) a module costs about $0.06–0.15 and 3–12 minutes without runtime evidence,
  roughly 30–80 modules on the remaining budget.
- A rejected response is reported as unavailable with the reason; the evaluator does not retry.

### Optional runtime UI evidence (F004, F006, F007)

A running UI makes F004 and F007 reviews much better, so it is an optional input, never a
requirement and never a status source. Decided (Q5): it is built in the F004 PR. Without it, F004
and F007 still report layers 1 and 2; only their agent review is skipped (Q6).

- New flag `--ui-runtime-url <origin>` plus credentials in `FOLIO_UI_USERNAME`,
  `FOLIO_UI_PASSWORD` (and `FOLIO_UI_TENANT` when needed). Without them nothing runs.
- `src/utils/ui-runtime-probe.ts` drives headless Chrome (`playwright-core` with a Chrome path from
  `--ui-runtime-chrome` or Chrome for Testing). It logs in, then visits only the module's
  `stripes.route`, `stripes.home` and, for `actsAs: settings`, `/settings<route>`, at most 6 pages,
  without clicking or submitting anything, so shared environments are not changed.
- On each page it records: axe-core 4.x results for tags `wcag2a`, `wcag2aa`, `wcag21a`,
  `wcag21aa`; console errors; failed network requests; a 1280×800 screenshot; the Chrome version;
  and the module version shown in `/settings/about`.
- Results go to the agent as `.criterion-agent/F004/axe-results.json`, `F007/console.json`,
  `runtime/screenshots/*.png`, and appear in layer 1 as "Runtime evidence (informational)", with
  the deployed version next to the evaluated `package.json` version.
- Credentials are sent only to the given origin and its Keycloak redirect, never stored in reports.
  This is separate from `--allow-remote-lookups`, which covers JSON reads from fixed hosts.

## F001 Consumed APIs declared in package.json

### Deterministic part

Evidence (safe mode, no network): committed production sources (`src/`, `lib/`, excluding tests,
stories and mocks), `package.json`, and the S008 catalog extended with handler patterns (F2).

Request sites recognized:

- stripes-connect manifest entries with `type: 'okapi'` and their `path`, `records`, and
  `PUT`/`POST`/`DELETE` `path` overrides;
- `useOkapiKy()` / `ky` calls (`ky(...)`, `ky.get|post|put|patch|delete(...)`, `ky.extend`
  prefixes), and `fetch` calls built on `stripes.okapi.url`;
- path arguments that are string or template literals, or identifiers bound to a string constant
  in the same file or one relative import away.

Path normalization: stripes-connect tokens (`%{}`, `!{}`, `?{}`, `:{}`) and `${}` become one path
segment; the query string is dropped. Each path is matched against the handler index; the most
specific `pathPattern` wins, system interfaces (`_tenant` etc.) never count, and a tie between two
interfaces is ambiguous. Declared interfaces come from `collectS008Declarations` (UI branch).

Rules:

- `fail`: a resolved request site maps to exactly one interface that is in neither
  `okapiInterfaces` nor `optionalOkapiInterfaces` (Q1). Libraries are held to the same rule.
- `pass`: every request site resolved, and every mapped interface is declared.
- `manual`: some request sites are dynamic or unresolved; a path matches no handler in the catalog
  (possibly an interface newer than the catalog); a match is ambiguous; the catalog failed to load;
  or the source scan was incomplete. A proven violation still fails.

Declared-but-not-detected interfaces are listed for information and never change the status.

### Checklist

- **F001-C1** Each undeclared interface listed under "Used but not declared" is really called
  and should be added to `okapiInterfaces` (always required) or `optionalOkapiInterfaces` (guarded
  by `stripes.hasInterface`).
- **F001-C2** For each request the tool could not resolve, find the path it calls and confirm its
  interface is declared. Starting points: file and line of each site.
- **F001-C3** For each path not found in the catalog, identify the interface that provides it.
- **F001-C4** Requests made through hooks or helpers from shared libraries are covered by a
  declaration in this module.

### Agent review

Asked to: resolve each unresolved site by following constants and hooks, confirm or reject each
undeclared candidate (dead code, test helper, guarded call), and check library-hook requests.
Obligations: `F001-C1:interface:<id>`, `F001-C2:<path>:<line>`, `F001-C3:<path>`,
`F001-C4`. Starting material also has the handler patterns of every candidate interface.
Criterion rules: a `substantive_concern` on `F001-C1`/`C2` must name the interface id; an
`analyzer_limitation` on `F001-C1` must explain why the call is not real.

### Report

```text
F001 fail: The module calls 3 interfaces it does not declare in package.json: service-points,
staff-slips-storage and patron-action-session.

Used but not declared:
  - service-points: src/Scan.js:272 requests service-points?limit=${MAX_RECORDS}
  - staff-slips-storage: src/Scan.js:266 requests staff-slips-storage/staff-slips
  - patron-action-session: src/Scan.js:294 requests circulation/end-patron-action-session
Declared and used: circulation, inventory, users, feesfines, …
Declared but not seen in this module's code (not a problem): loan-policy-storage
Interface paths from the official catalog (R1-2026.27)

What to do: Add each interface to "okapiInterfaces", or to "optionalOkapiInterfaces" when the
code checks stripes.hasInterface first.

Checklist for the reviewer:
  F001-C1 Confirm each undeclared interface is really called …
Agent review: Not run: agent review is disabled or unconfigured
```

## F002 End-to-end tests in a supported technology

### Deterministic part

Evidence: `package.json` dependencies, `cypress.config.*`, `cypress/`, `playwright.config.*`,
`wdio.conf.*`, `nightwatch.conf.*`, `.testcaferc*`, `karma.conf.*`, `test/bigtest`, `test/e2e`,
and workflow steps that run them (from the S012 build-test evidence). Policy: the `s013`-consumer
`frontend-integration-testing` section (Cypress, provisional).

- `not_applicable`: no E2E tooling or tests in the repository ("not provided"; E2E tests in
  stripes-testing are Cypress by construction).
- `pass`: the only E2E framework is Cypress (Q3).
- `fail`: an E2E framework conclusively outside the policy (Playwright, WebdriverIO, Nightwatch,
  TestCafe, Puppeteer-driven suites).
- `manual`: Karma/BigTest or other browser tests whose kind is unclear; several frameworks; or
  unreadable evidence.

### Checklist

- **F002-C1** The browser tests found are end-to-end tests of the module, not component tests.
- **F002-C2** CI runs them with the framework found.

### Agent review

Only in the manual case, and only when F002 is listed in `--criterion-agent-criteria` (Q6).
Asked to classify each suite as E2E or component test and to say which
runner CI uses. Obligations `F002-C1:<suite path>`, `F002-C2`. Usually short (stripes-components:
Karma + BigTest).

### Report

`F002 not applicable: The repository has no end-to-end tests. FOLIO's end-to-end tests for UI
modules live in stripes-testing and use Cypress.` For stripes-components: `F002 manual: The
repository runs browser tests with Karma and BigTest. A reviewer must decide whether they are
end-to-end tests; BigTest is not on the supported-technologies page.` plus checklist and agent
layers.

## F003 Internationalization with react-intl and en.json

### Deterministic part

Evidence (safe mode): `package.json`, `translations/<namespace>/en.json` (namespace from the
package name, e.g. `ui-checkin`, `stripes-components`), production sources.

Checks: react-intl in `dependencies` or `peerDependencies` and imported somewhere; `en.json`
exists, is valid JSON, and is a flat map of non-empty strings; every literal message id in the
module's namespace (`<FormattedMessage id="…">`, `formatMessage({ id: '…' })`, `translate(…)`)
is a key of `en.json`; ICU syntax of each value parses (`@formatjs/icu-messageformat-parser`).
Hard-coded text candidates: JSX text nodes and `aria-label`, `label`, `placeholder`, `title`
string attributes with two or more words, outside comments, tests and stories.

- `fail`: react-intl is not used, or there is no `en.json`, or `en.json` is not valid JSON.
- `manual`: literal ids missing from `en.json` (Q4); hard-coded text candidates; ICU syntax errors;
  incomplete scan.
- `pass`: none of the above. Computed ids are listed as "not checked" and do not block a pass.

### Checklist

- **F003-C1** Each listed id is added to `en.json`, or the code passes a fallback text.
- **F003-C2** Each hard-coded text candidate is user-visible and should be translated.
- **F003-C3** Computed message ids (template ids) resolve to keys that exist in `en.json`.
- **F003-C4** Values with ICU syntax errors are fixed.

### Agent review

Asked to check each missing id (is there a `defaultMessage` or a `cancelLabel`-style override?),
each hard-coded candidate (visible text or comment?), and computed id families. Obligations
`F003-C1:<id>`, `F003-C2:<path>:<line>`, `F003-C3`. Browse scope adds only the module's own
`en.json`.

### Report

```text
F003 manual: The module uses react-intl and has an English translation file, but 1 message id it
uses is missing from en.json.
  - react-intl ^7.1.5; translations/ui-checkin/en.json, 126 texts
  - Missing from en.json: ui-checkin.statusModal.cancel (src/components/CheckinNoteModal/CheckinNoteModal.js:60)
  - Hard-coded text: none found
Checklist for the reviewer: F003-C1 …
```

## F004 WCAG 2.1 AA accessibility

### Deterministic part

The repository cannot show WCAG conformance, so the status is always `manual`. Layer 1 lists:
axe-based tests (count and files), whether the module extends `@folio/eslint-config-stripes`
(which enables `jsx-a11y`), `jsx-a11y` rules disabled in code, `<img>` without `alt`, click
handlers on non-interactive elements, hard-coded `aria-label` text (shared with F003), and, when
supplied, runtime axe-core results per page with rule, impact and node count.

### Checklist

- **F004-C1** With axe DevTools (current major version) on each main screen, there are no WCAG 2.1
  AA violations caused by the module. Start with: the routes in `package.json`, and the runtime
  results when present.
- **F004-C2** Interactive elements have accessible names and keyboard support; each disabled
  `jsx-a11y` rule is justified.
- **F004-C3** Images and icons have text alternatives; status is not shown by color alone.
- **F004-C4** Modals and panes manage focus (focus moves in and returns on close).
- **F004-C5** Accessibility tests (axe) cover the main components.

### Agent review

Asked to review components against the checklist from source, and, when runtime results are
supplied, to map each axe violation to the component that renders it and separate module
problems from platform ones (stripes-core navigation, Keycloak login). Starting material adds
`guides/accessibility/*.mdx` from the pinned stripes-components snapshot. Obligations
`F004-C1:<page>:<rule>` (runtime only), `F004-C2:<path>:<line>`, `F004-C3` … `F004-C5`.
Runs only when runtime evidence was collected (Q6), so `F004-C1` always has axe results to
assess.

### Report

`F004 manual: Accessibility must be measured with axe DevTools on the running module; the
repository alone cannot show WCAG 2.1 AA conformance.` followed by the static signals, the
optional runtime results (`/checkin: color-contrast (serious, 2 elements), …`), the checklist and
the agent layer.

## F005 Stripes version

### Deterministic part

F005 is S007's Stripes row, reported on its own: it reads the `s007TechnologyEvidence` artifact
and evaluates only the `stripes` entry with `policySections(policy, 's007', 'frontend')` and the
exported S007 comparison. S007 is unchanged, the committed Trillium policy stays, and both
criteria always agree.

- `pass`: Stripes resolves, or every version the declared range allows is, "10.1 or greater".
- `fail`: every allowed version is below 10.1.
- `manual`: the range allows both (ui-checkin `^10.0.0` without `yarn.lock`); conflicting
  declarations; no `@folio/stripes` dependency in a UI module; a Stripes constituent library
  (Q8); policy not loaded.

### Checklist

- **F005-C1** The module works with Stripes 10.1 or later (raise the lower bound to `^10.1.0`).
- **F005-C2** For a Stripes constituent library, this release is part of, or compatible with,
  Stripes 10.1 or later.

No agent review: nothing in the repository can settle it.

### Report

`F005 manual: package.json allows Stripes ^10.0.0, which includes 10.0 versions below the
required 10.1, and there is no yarn.lock to show the version used. (Same finding as S007.)`

## F006 UI layouts, patterns and norms

### Deterministic part

Signals only; the status is always `manual`. Layer 1 lists: Stripes layout components used
(`Paneset`, `Pane`, `PaneHeader`, `PaneFooter`, `Layer`, `SearchAndSort`/filter panes), forms
built with `stripesFinalForm`/`stripesForm` and their `navigationCheck` value (true, false, not
set), `ConfirmationModal` use for delete and discard actions, raw HTML controls (`<button>`,
`<input>`, `<select>`, `<table>`) where Stripes components exist, hex colors in CSS instead of
Stripes variables, and the app's `route`, `home`, `actsAs` and settings pages.

### Checklist

- **F006-C1** Screens use the standard pane layout (search/filter, results, detail, edit layer).
- **F006-C2** Search and filter screens follow the SearchAndSort and filter-pane patterns.
- **F006-C3** Forms ask before discarding unsaved changes (`navigationCheck`, confirmation
  modal). Starting points: forms with `false` or not set.
- **F006-C4** Destructive actions ask for confirmation with standard wording.
- **F006-C5** Actions, buttons and menus follow the action-menu and button guidelines.
- **F006-C6** Stripes components are used instead of raw HTML controls; colors use Stripes
  variables.
- **F006-C7** State is kept when navigating between apps and back (search, filters, selection).
  Runtime evidence helps.
- **F006-C8** Settings pages follow the settings layout.

### Agent review

This is where F006 gets its value. Asked to review each checklist item against the pinned
guideline snapshot and the code, citing both. Starting material: the guideline files relevant to
the items (layout, forms/FormSubmission, feedback/ConfirmationModalPattern,
actions/ConfirmationLanguageGuidelines, navigation, about 60 KB of the 183 KB) from
stripes-components at a recorded commit (`config/f006-ux-guidelines/`, refreshed by maintainers
like the S012 workflow table); screenshots when supplied. Obligations: `F006-C1` … `F006-C8`,
and `F006-C3:<form path>` per form starting point. Criterion rule: a `substantive_concern` must
name the guideline file it is measured against.

### Report

As in the cross-cutting example: the headline counts the signals, the checklist lists all eight
items with starting points, and the agent layer marks each item.

## F007 Works in the latest Chrome

### Deterministic part

Status always `manual`. Layer 1 lists browser-specific code (user-agent sniffing,
`navigator.vendor`, vendor-prefixed APIs), APIs Chrome has removed or deprecated, a
`browserslist` override, polyfills, and, with runtime evidence, the Chrome version used, console
errors and failed requests per page.

### Checklist

- **F007-C1** The module's main screens load and work in the current Chrome without console
  errors. Runtime evidence helps.
- **F007-C2** No code path depends on another browser or a removed Chrome API.

### Agent review

Runs only when runtime evidence was collected (Q6). Asked to explain each console error from
source and to review flagged browser-specific code.

### Report

`F007 manual: Whether the module works in the latest Chrome must be checked in the browser.`
With runtime evidence: `Loaded /checkin and /settings/checkin in Chrome 156.0.8078.47 (current
Stable): no console errors, 1 failed request …`.

## Overlap with S007, S008 and S010

| Criterion | Overlap | Decision |
| --- | --- | --- |
| F005 ↔ S007 | Same Stripes rule and evidence | F005 reuses S007's artifact and comparison; results always agree; S007 unchanged |
| F001 ↔ S008 | S008: declared interfaces are acceptable. F001: used interfaces are declared | F001 reuses S008's UI declaration reader and catalog (extended with handlers); S008 unchanged |
| F001 ↔ S010 | S010 lists declared interfaces as dependencies and flags request helpers | F001's request-site inventory becomes an artifact (`uiRequestSites`) that S010 can use later; S010 unchanged now |
| F003 ↔ F004 | Hard-coded `aria-label` text is both an i18n and an accessibility issue | Detected once, listed in both |

## Testing

### Offline (CI)

- Small fixture repositories under `src/__tests__/fixtures/frontend/` for each rule, with inputs
  chosen to catch plausible mistakes:
  - F001: a manifest path with `%{}` tokens; `ky.get(CONSTANT)` from a relative import; a path
    whose two candidate patterns differ only in specificity (`/circulation/loans/{id}` vs
    `/circulation/end-patron-action-session`); a system interface path; a declared optional
    interface; a request in a test file (ignored).
  - F003: a key missing from `en.json` vs one present; text inside a JSX comment (ignored); an ICU
    error; a computed id (not checked, still passes).
  - F005: `^10.0.0` with and without a lockfile resolving 10.1.5; a constituent library.
  - F002: Cypress only; Playwright; Karma + BigTest.
  - F006/F004/F007: signal extraction (`navigationCheck` false vs missing; disabled `jsx-a11y`).
- Agent review through the existing fake adapter: one accepted response per criterion, plus
  rejections for each validation rule (missing obligation, uncited assessment,
  `likely_sufficient` with an `evidence_gap`, runtime `aligned_fact` without runtime evidence).
- Agent selection (Q6): with agent review enabled and no criteria list, F001 runs, F002 does not,
  and F004 without runtime evidence does not; each skip shows its reason.
- Report tests: the three layers appear with review disabled, accepted and rejected; checklist
  items not covered by the agent are labelled.
- Runtime probe: a loopback HTML page with known axe violations and a console error; no network.
- S007, S008 and S010 tests pass unchanged after the reuse.

### Against real modules (manual, before each PR merges)

Expected results with today's code, from the probes above:

| Repository | F001 | F002 | F003 | F004 | F005 | F006 | F007 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ui-checkin | fail (3 undeclared) | n/a | manual (1 missing id) | manual | manual (`^10.0.0`, no lockfile) | manual | manual |
| ui-users | fail (13) | n/a | manual (3 ids, 1 aria-label) | manual | pass | manual | manual |
| ui-inventory | fail (12) | n/a | pass (comment excluded) | manual | pass | manual | manual |
| ui-agreements | manual (constants), possibly fail after resolution | n/a | manual (2 ids) | manual | pass | manual | manual |
| ui-inventory-import | pass | n/a | manual (4 ids) | manual | pass (10.1.5) | manual | manual |
| stripes-smart-components | fail (5) | manual (Karma/BigTest) | manual (3 candidates) | manual | manual (constituent) | manual | manual |
| stripes-components | pass (no requests) | manual (Karma/BigTest) | manual (34 candidates) | manual | manual (constituent) | manual | manual |

Also run F001, F003 and F006 with agent review on ui-checkin and ui-users and record time, cost,
acceptance, and which checklist items the agent covered; run F004/F007 once with runtime evidence
against the Eureka snapshot when credentials are available.

## Implementation order (one PR per criterion, after a classification fix)

0. **`classifyModuleKind` fix** (Q7), small and on its own: check the explicit library allowlist
   before the UI markers in `src/utils/module-kind.ts`, so allowlisted Stripes libraries with a
   `stripes` object (stripes-components, stripes-smart-components and stripes-core today) are
   `library`. `ui-*` names are not on the allowlist, so UI modules are
   unaffected. One regression test in `module-kind.test.ts` with a `stripes` object and an
   allowlisted name. Expected result changes: S004, S005, S008, S010 and S014 become
   `not_applicable` for those libraries; real-module checks on stripes-components and ui-users
   confirm it. F001–F007 apply to both kinds, so the later PRs do not depend on it.
1. **F005**: wire `FrontendEvaluator` handlers, the shared checklist model and three-layer report
   rendering (without agent), F005 on S007's artifact. Smallest, and it settles the report shape.
2. **F003**: i18n checks; first agent consumer, so it adds the F00x agent contract
   (obligations from checklist items, `browseInclude`, response-shape, semantic validation,
   checklist-linked rendering).
3. **F001**: handler patterns in the S008 catalog (schema, acquisition, regenerated official
   catalog with an unchanged S008 result), the request-site extractor, F001 rules and agent.
4. **F002**: E2E detection and rules; small.
5. **F006**: signals, pinned UX-guideline snapshot, agent review.
6. **F004**: static signals, the optional runtime probe (`--ui-runtime-url`), agent review.
7. **F007**: signals and agent review, reusing the runtime probe.

Each PR updates `criteria-definitions.ts` (drops the `not_implemented` default),
`docs/criterion-notes.md`, `docs/agent-review.md` when it adds agent review, the README criteria
list, and the HTML short-name table.

## Decisions

All decided on 2026-10-23, each as recommended. Q1, Q3, Q5, Q6 and Q7 were answered by the user;
the defaults for Q2, Q4, Q8 and Q9 stand.

- **Q1. An unambiguous undeclared interface fails F001**, with file and line, for modules and
  libraries alike. Four of the seven sampled repositories fail today.
- **Q2. F001's handler index comes from the checked-in S008 catalog**, extended with handler
  patterns (offline, R1-2026-GA). Reading `snapshot` from FAR under `--allow-remote-lookups` is a
  possible later addition (R1).
- **Q3. Cypress passes F002** with a note that the policy marks it provisional ("Cypress 12.0,
  pending verification").
- **Q4. Message ids missing from `en.json` make F003 manual**, with the list; they do not fail it.
- **Q5. The optional runtime probe is built** in the F004 PR (`--ui-runtime-url` plus
  credentials), as agent input only.
- **Q6. Agent review by default for F001, F003 and F006**; for F004 and F007 only when runtime
  evidence was collected; F002 only when listed in `--criterion-agent-criteria`. See "Which F
  criteria run".
- **Q7. `classifyModuleKind` is fixed first**, as its own small PR (PR 0).
- **Q8. Stripes constituent libraries are manual for F005**, with checklist item F005-C2.
- **Q9. The evaluator vendors a pinned snapshot of the stripes-components UX guidelines**, about
  60 KB under `config/f006-ux-guidelines/` with its commit.

## Risks

| | Risk | How we notice | What we do |
| --- | --- | --- | --- |
| R1 | The handler index is a GA release; new interfaces look unknown | "Path not in the catalog" rows | Manual, never fail; a FAR `snapshot` read under `--allow-remote-lookups` could be added later |
| R2 | Constant resolution misses hook-heavy modules (ui-agreements) | Many unresolved sites | Manual plus agent F001-C2; extend resolution later |
| R3 | Agent reviews time out or are rejected on large modules | Unavailable note in the report | Obligation cap, browse scope, 420 s timeout; layers 1 and 2 still stand |
| R4 | OpenRouter budget runs out | Provider error | Default to three agent criteria; costs measured per PR |
| R5 | Runtime evidence reflects the deployed version, not the evaluated commit | Version shown next to `package.json` version | Informational only; never changes status |
| R6 | Runtime probe touches shared environments | Probe logs | Read-only navigation, no clicks or submissions, at most 6 pages |
| R7 | The UX guideline snapshot goes stale | Recorded commit and date in reports | Maintainer refresh, like the S012 workflow table |

## Out of scope

- Running module tests or lint (oxlint/jsx-a11y) in the first version.
- Searching stripes-testing for a module's Cypress suites (not required by F002).
- Certifying WCAG conformance or UX compliance; agent advice never changes status.
- Changing S007, S008 or S010 behaviour.
