# F001–F007 evaluator design

Status: design proposal, version 5, awaiting the user's review; not implemented. Q1–Q12 are all
decided (2026-10-23); version 4 folded in an Oracle review, and version 5 records the answers to
Q10–Q12.
Based on `origin/master` at `53eed3a` (S012 #66 and S014 #65 merged; S011 and S013 are on unmerged
branches). All real-world numbers were collected on 2026-10-23 and will drift.

The Frontend criteria from the [master list](https://gist.github.com/okolawole-ebsco/f54f7617b61680f2ad346896e807a796)
apply to UI modules and shared UI libraries alike ("Frontend criteria apply to both modules and
shared libraries"). `src/evaluators/javascript/frontend-evaluator.ts` is a stub, so all seven fall
back to `not_implemented` today.

| ID | Criterion | Deterministic part | Judgment part (agent review on top) | Proposed short rule |
| --- | --- | --- | --- | --- |
| F001 | Every consumed API is declared in `okapiInterfaces` / `optionalOkapiInterfaces` | Extract request paths from production code, map them to interfaces through an offline handler index, compare with `package.json` | Request sites the extractor cannot resolve | Fail when a resolved request path maps to exactly one interface that is not declared. Pass when every request site resolves to a declared interface. Otherwise manual. |
| F002 | If provided, E2E tests use a supported technology | Detect E2E frameworks in the repository and CI | Whether browser tests found are E2E, and which runner CI uses | `not_applicable` without E2E tests; pass for Cypress 12 or later; fail for a conclusively unlisted E2E framework; manual otherwise. |
| F003 | i18n via react-intl and an `en.json` with English texts | react-intl present, `en.json` valid, literal message ids present in `en.json` | Hard-coded user-visible strings, missing ids, computed ids | `not_applicable` when the package renders no UI (Q10); fail without react-intl or `en.json`; manual on missing ids or hard-coded text candidates; pass otherwise. |
| F004 | WCAG 2.1 AA as measured by current axe DevTools | Static accessibility signals | Component review against optional runtime axe results | `not_applicable` without rendered UI (Q10); otherwise always manual. |
| F005 | Uses the Stripes version on the OST page | S007's own Stripes finding, committed Trillium policy | None | Same outcome as S007's Stripes finding; manual for Stripes constituent libraries. |
| F006 | Follows FOLIO UI layouts, patterns and norms | Pattern signals and documentation links | Most of the criterion, against a pinned snapshot of the UX guidelines | `not_applicable` without rendered UI (Q10); otherwise always manual. The agent review is the main value. |
| F007 | Works in the latest Chrome | Browser-specific code signals | Explaining console errors from optional runtime evidence | `not_applicable` without rendered UI (Q10); otherwise always manual. |

## Changes in version 5

- **Q10 decided (A):** F003, F004, F006 and F007 are `not_applicable` for packages with no JSX in
  production code and no `translations/` directory.
- **Q11 decided (A):** PR 0 also classifies a `stripes` object whose `actsAs` is missing or holds
  only empty strings as a library.
- **Q12 decided:** runtime text goes to the model provider, unredacted beyond what already
  exists. The user: "i dont care about redaction. this is open source code." The best-effort
  redaction of patron names and console text is dropped, and so are the probe-specific removals of
  query strings and axe node HTML. Kept: size caps (for cost), the shared `redactSensitiveText`
  used for agent output (secrets and tokens), and the other probe safety rules (allowlisted
  routes, pinned login origin, no non-GET or third-party requests, budgets). The probe should
  point at a test or reference environment, because it reads a running instance, not the
  repository. Screenshots stay out because agent files are text only.

## Review changes (version 4)

An Oracle review of version 3 against `origin/master` found 18 issues, 6 of them blocking. Each is
addressed below; three are handled more loosely than the Oracle suggested (see the end of this
section).

Blocking, fixed:

1. **Report rendering.** The HTML report cannot show the three layers as version 3 wrote them:
   `report-html-template.ts:123` only recognizes `Agent review:` / `Agent review (advisory):`
   headers, `:170` always renders the structured review first, and badges come only from the
   structured review. The checklist is now structured data (`criterionDetails.checklist`), and an
   F00x branch in `reportDetailLines` joins assessments to checklist items. F001–F007 join
   `AGENT_REVIEW_CRITERIA`, the not-enabled regex becomes `[SF]\d+`, and the existing labels
   ("Supported by evidence", "Potential problem", "Needs verification") replace "Looks fine" and
   "Problem found".
2. **Handler index.** Regenerating `config/s008-catalog-official.json` would change S008: the
   importer drops handlers (`import-s008-catalog.ts:66-71`, schema `additionalProperties: false`),
   acquisition marks the result non-authoritative (`acquire-s008-catalog.ts:173`), the manual
   mod-circulation-bff entry would be lost, and the catalog digest in S008's details changes. F001
   now uses a separate `config/f001-handler-index.json` built from the same FAR pins. S008 is
   untouched. Q2's substance (offline, R1-2026-GA) stands.
3. **Libraries without UI.** "Fail without react-intl" would fail `@folio/stripes-connect`, which
   renders nothing. F003, F004, F006 and F007 are now `not_applicable` for packages with no
   rendered UI (Q10).
4. **Runtime probe safety.** The probe trusted repository-supplied routes and any login redirect,
   did not stop page-load writes, and would have sent screenshots and DOM snippets with patron
   data to the provider. It is now specified with a route allowlist, a pinned login origin,
   blocked non-GET API calls and third-party requests, redaction, no screenshots, a navigation
   record and budgets (see "Optional runtime UI evidence"; the redaction was dropped in version 5,
   Q12).
5. **Runtime citations.** The shared citation check only exempts S006 (`criterion-agent-review.ts:230-243`),
   and agent files are text only. A shared `generatedEvidencePaths` request option replaces the
   S006 special case in the F004 PR, and runtime evidence is text only.
6. **Validation contract.** `coverageDisposition` is optional in the shared type, so version 3's
   rules could be met by leaving it out; there was no path-citation rule, no reviewer-action rule,
   no way to report something the extractor missed, and several checklist items were phrased so
   that "satisfied" meant "problem confirmed". The contract now copies S006's rules, requires a
   disposition, allows `discovered:` IDs for F001 and F003, phrases every item as the desired
   state, drops the vacuous rule 6, and forbids `likely_sufficient` when the cap withheld anything.

Improvements, fixed:

7. F001's agent review only runs when F001 is manual, so it never sees fail candidates.
   Undeclared-interface items (F001-C1) are now reviewer-only; the agent covers unresolved sites,
   paths missing from the index and anything it discovers.
8. PR 0's effects: S010 has its own classifier (`s010-evidence.ts`) and is unaffected; S004, S005,
   S008 and S014 change. Basename checks never match real runs (`git.ts:28` clones into
   `<name>/<timestamp>`), so only package names count. F001 must call the UI declaration reader
   directly, because `collectS008Declarations` rejects libraries. Q11 (decided A) extends PR 0 to
   `stripes-acq-components` and similar packages.
9. F005 reuses S007's own finding, not just its comparison: the artifact producer and S007's
   observation evaluation are extracted from `SharedEvaluator`, so `--criteria F005` works alone.
10. F002 does its own E2E-runner detection (S012's build-test evidence has build tools only), picks
    the policy entry by section id, applies Cypress's 12.0 minimum, and adds CI files to the browse
    scope.
11. Timeouts and cost: ui-checkin's 158 s is over the 120 s default, so F00x reviews default to
    420 s when no timeout is given. Cost estimates now include the S criteria that also run, the
    cap drops to 25, and each PR measures time, cost and rejection rate on three modules.
12. F003's namespace comes from the `translations/` directory: ui-checkin's package is
    `@folio/checkin`, but its namespace is `ui-checkin`.
13. F006 gains item C9 for the gist's note that UI documentation links must be publicly
    accessible.
14. Source reading: committed blobs only, 2,000 files (ui-inventory has 1,116; the default is
    1,000), and import resolution inside the snapshot only.
15. Obligation IDs are short and per-run (`F003-C2#3`), mapped to their subject in
    `checklist.json`.
16. F001-C4 (library hooks) is reviewer-only: library source in `node_modules` is outside the
    agent's snapshot.
17. The expected-results table is marked as measured with the `snapshot` index and will be
    re-measured with the GA index in PR 3; the stripes-components F003 count is corrected to 3.
18. Skipped reviews get their real reason through a new `notRunReason`, and the evidence summary
    is capped at 48 KB like S010's.

Looser than the Oracle suggested:

- **Redaction was best-effort** in version 4. Superseded in version 5: the user dropped
  probe-specific redaction (Q12); only the shared secret and token redaction remains.
- **The test environment and account are documented, not enforced.** The evaluator cannot tell a
  test instance from a production one or inspect the account's permissions; the flag's help text
  and `docs/criterion-notes.md` say to point the probe at a test or reference environment with a
  test account.
- **Cypress passes F002 although S007 treats provisional entries as manual.** Q3 was decided this
  way; the F002 report states the difference.

## Current state the design builds on

- `FrontendEvaluator` extends `CatalogSectionEvaluator('Frontend', 'javascript')` with no handlers.
  It runs for libraries too (`JavaScriptEvaluator.canEvaluate` needs only a `package.json` with
  `@folio/*` or `react` dependencies). The pattern to copy is `SharedEvaluator`: one handler per
  criterion, an `EvaluationRun` per evaluation, artifacts cached with `getOrCreateArtifact`, and
  optional agent review through `reviewCriterionWithAgent`.
- S007 evaluates Stripes for UI modules (`frontend-first-party-frameworks`, "Stripes 10.1 or
  greater", normative) from `package.json` and `yarn.lock`. The artifact `s007TechnologyEvidence`
  is produced inside the private `SharedEvaluator.evaluateS007`, and the observation logic
  (conflicts, exceptions, provisional and remote-only cases) is in the private
  `evaluateObservation` in `s007-evaluator.ts`. `compareObservationToConstraint` and
  `policySections` are exported.
- S008 reads UI declarations from `stripes.okapiInterfaces` and `stripes.optionalOkapiInterfaces`
  (`collectFrontend`, reached through `collectS008Declarations`, which returns
  `module_kind_unsupported` for libraries). Its checked-in catalog covers R1-2026-GA (174
  providers, 526 provided interfaces) with interface ids and versions only.
- S010 has its own module classifier and recognizes Stripes request helpers only as an
  "unsupported pattern" diagnostic; it extracts no request paths.
- S012 added `manifest-parsers.ts` and `build-test-evidence.ts` (build tools only; S013 is to add
  test runners). S014 added `remote-evidence.ts` (opt-in `--allow-remote-lookups`, fixed hosts).
- Agent review (`docs/agent-review.md`): read-only OpenCode over a committed-source snapshot,
  repository browsing by default, text files only, 1 MiB workspace limit, advice never changes
  status, every assessment must cite snapshot files, malformed or uncited responses are rejected
  whole, no retries, 120 s default timeout per OpenCode command. Enabling review without
  `--criterion-agent-criteria` lets every agent-capable criterion run. S006 and S010 add a
  `response-shape.json`, name exact fields in the prompt, accept `discovered:` IDs, and reject
  `likely_sufficient` alongside unresolved obligations.

## Findings that shape the design

### F1. Real modules use interfaces they do not declare, and the evidence is concrete

A prototype extracted request paths from production code (stripes-connect manifest `path:` values
and `ky` calls with string or template literals) and matched them against the handler
`pathPattern`s of every module descriptor in the 41 applications of platform-lsp `snapshot`
(2,766 non-system handler patterns from FAR, `full=true`, 2.3 MB in total). Most-specific match
wins. F001 itself will use the GA index (35 applications), so PR 3 re-measures these numbers.

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
"Declared but not detected" is common (ui-inventory: 21) and is not a violation.

### F2. FAR carries the handler index, but the S008 catalog cannot hold it

FAR application descriptors with `full=true` include every module descriptor's
`provides[].handlers` (app-platform-minimal 188 KB, app-platform-complete 414 KB), and the S008
acquisition tool already fetches `full=true` (`acquire-s008-catalog.ts:212`). The importer keeps
only `{ id, version, interfaceType }`, the catalog schema forbids extra properties, and a refresh
marks the catalog non-authoritative and drops the hand-added mod-circulation-bff provider
(`docs/s008-interface-acceptance.md`). So F001 gets its own index file built from the same pins.

### F3. i18n is in place everywhere, but literal message ids are missing from `en.json`

All seven repositories have one `translations/<namespace>/en.json` plus 38 locale files and use
react-intl ^7.1.5. The namespace is the directory name, not the package name (ui-checkin's package
is `@folio/checkin`). A prototype comparing literal ids in production code with `en.json`:

| Repository | `en.json` keys | Literal ids missing from `en.json` | Hard-coded text candidates (production) |
| --- | --- | --- | --- |
| ui-checkin | 126 | 1: `ui-checkin.statusModal.cancel` (`CheckinNoteModal.js:60`) | 0 |
| ui-users | 1,379 | 3 | 1 real: `aria-label="Lost items search"` (`Search.js:30`) |
| ui-agreements | 916 | 2 (one is `platform.urlCustomization..deleteFailed`) | 0 |
| ui-inventory | 961 | 0 | 1, inside a JSX comment (false positive) |
| ui-inventory-import | 155 | 4 × `accordion.devinfo` | 0 |
| stripes-smart-components | 287 | 0 | 3, e.g. "Remove this address" |
| stripes-components | 950 | 0 | 3 in `lib/` (e.g. `aria-label="Search field select"`), 57 more in `guides/` examples |

`@folio/stripes-connect` has neither react-intl nor a `stripes` object and renders no text, so
i18n does not apply to it.

### F4. The repository alone cannot measure WCAG, layout norms or Chrome behaviour

A single UI module cannot run on its own: `stripes serve` needs a platform build and a backend.
Building or serving the evaluated commit would also execute repository code, which belongs under
`--allow-local-commands`. What the source does give:

- axe-based tests (ui-inventory 25 files, stripes-components 48, stripes-smart-components 15,
  ui-checkin and ui-users 1, ui-agreements and ui-inventory-import 0);
- `@folio/eslint-config-stripes` 10.0.0 enables `jsx-a11y` through oxlint, and some code disables
  its rules (ui-users 3, ui-inventory 2, stripes-components 7);
- `navigationCheck` on `stripesFinalForm` forms (ui-users: 18 forms, 11 `true`, 2 `false`,
  5 not set; ui-inventory: 1 of 9 not set; stripes-smart-components: 2 `false`, 2 not set).

### F5. axe-core runs headless in the orb against a FOLIO reference environment

`axe-core` 4.14.0 in the orb's headless Chrome for Testing 156.0.8078.47 ran WCAG 2.0/2.1 A and
AA rules against the public Eureka snapshot (`folio-etesting-snapshot-diku.ci.folio.org`, which
redirects to its Keycloak login): 2 violations (`color-contrast` ×2 nodes, `html-has-lang`),
18 passes. Module pages need a logged-in session, and the environment runs whatever version is
deployed there, not the evaluated commit.

### F6. The UX guidelines live in stripes-components and can be pinned

`ux.folio.org/docs/all-guidelines/` is built from stripes-components'
`guides/ux-guidelines/**.mdx` (66 files) plus `guides/patterns` and `guides/accessibility`, 183 KB
in total. `feedback/ConfirmationModalPattern.mdx` and
`actions/ConfirmationLanguageGuidelines.mdx` cover the gist's "confirm that you'll lose the
state" example.

### F7. F005 is already decided by S007

S007's Stripes rows on 2026-10-23: ui-users, ui-agreements and ui-inventory `^10.1.0`
(compliant); ui-inventory-import `^10.0.0` resolved to 10.1.5 (compliant); ui-checkin `^10.0.0`
with no `yarn.lock` (manual). Stripes' constituent libraries do not depend on `@folio/stripes`,
so S007 has no Stripes row for them.

### F8. Several Stripes libraries are classified as UI modules

`classifyModuleKind` checks UI markers (a `stripes` object) before its library allowlist, so
stripes-components, stripes-smart-components and stripes-core come out as `ui-module`.
`@folio/stripes-acq-components`, `stripes-erm-components` and `stripes-authority-components` are
not on the allowlist and have `"actsAs": [""]`. S004, S005, S008 and S014 treat libraries as
`not_applicable`; S010 uses its own classifier, which already says `library`.

### F9. E2E tests live in stripes-testing, not in module repositories

None of the five ui-* repositories has E2E tooling. stripes-components and
stripes-smart-components run browser tests with Karma and BigTest. stripes-testing holds the
Cypress suites. The OST frontend section lists "Cypress 12.0, pending verification"
(`strength: provisional`, minimum 12.0.0).

### F10. Agent reviews take one to three minutes and cost about two cents each

Two S010 reviews on 2026-10-23 with `openrouter/deepseek/deepseek-v4-flash`
(prompt $0.091, completion $0.182 per million tokens), timeout 420,000 ms:

| Module | Files in snapshot | OpenCode run | Tool calls | Outcome |
| --- | --- | --- | --- | --- |
| ui-checkin | 136 | 158 s | 31 | accepted, `needs_reviewer_judgment` |
| ui-users | 1,001 | 72 s | 27 | rejected: an assessment had invalid `failureBounds` |

Both together cost $0.046. ui-checkin's 158 s would have exceeded the 120 s default. A rejected
review costs the same as an accepted one, and two runs are too few to estimate a rejection rate.

## Cross-cutting design

### Applicability: packages that render no UI

F003, F004, F006 and F007 are `not_applicable` when production code (`src/`, `lib/`, root `*.js`)
contains no JSX and the repository has no `translations/` directory, for example stripes-connect
(Q10). The report says "This package renders no user interface". F001, F002 and F005 still apply.
The check is shared and lands in the F003 PR.

### Every F00x report has three layers; agent review only adds

1. **Deterministic evidence and status.** What the code checked, with file and line references,
   and the status it decided. Agent advice never changes this status.
2. **Manual checklist.** Plain-English items, each with a stable ID (`F006-C3`), phrased as the
   desired state, with starting points from layer 1. Shown whatever the status, except for `pass`
   and `not_applicable` results, where it would be empty.
3. **Agent findings**, only when agent review ran and its response was accepted, attached to the
   checklist items they address.

When agent review is disabled, skipped, unavailable or rejected, layers 1 and 2 are shown
unchanged, followed by the existing note in the existing text format:

```text
Agent review:
  - Not applied: F004 agent review needs runtime evidence (--ui-runtime-url).
```

Rendering, using existing code paths:

- The checklist is structured data, `criterionDetails.checklist =
  { items: [{ id, title, startingPoints: [{ path, line?, note }], reviewerOnly, obligations:
  [{ id, subject }] }] }`, built by `src/utils/frontend-checklist.ts`. The text details render it
  as "Checklist for the reviewer:".
- An F00x branch in `reportDetailLines` (`report-html-template.ts`) renders layer 1, then each
  checklist item with the agent's result for its obligations underneath, then the review's
  recommendation, summary and reviewer actions. The S-criteria path is unchanged.
- Per-item results reuse `ASSESSMENT_LABELS` from `agent-review-report.ts`: "Supported by
  evidence", "Potential problem", "Needs verification", "Automated check limitation", "TC
  interpretation needed". Obligation IDs are shown by subject name (from `obligations[].subject`),
  passed in like S006's `agentReviewSubjectNames`.
- An accepted response covers every obligation it was given (validation rule 1), so an item can
  only lack a result when it is reviewer-only ("Checked by the reviewer only") or withheld by the
  cap ("Not given to the agent (limit of 25)").
- F001–F007 join `AGENT_REVIEW_CRITERIA`, and the not-enabled regex at `:138` becomes `[SF]\d+`.

Plain text for ui-users F006 with an accepted review:

```text
F006 manual: The module uses Stripes layout components throughout, but 7 of 18 forms do not ask
before discarding unsaved changes. A reviewer must check the layouts and patterns below.

What the tool found:
  - Forms: 18 built with stripesFinalForm; navigationCheck true in 11, false in 2, not set in 5
  - …
Checklist for the reviewer:
  - F006-C1 Screens use the standard pane layout. Start with: src/routes/…
    - Agent: Supported by evidence — … (cited files)
  - F006-C3 Every form asks before discarding unsaved changes. Start with: 2 forms set to false, 5 not set
    - Agent, src/settings/…FeeFineForm.js: Potential problem — … (cited files)
  - F006-C7 State is kept when navigating between apps and back.
    - Checked by the reviewer only
Agent review (advisory):
  - Recommendation: Reviewer judgment needed
  - …
  - Advisory only; the criterion status is unchanged.
```

### Agent review contract for F00x criteria

Agent review runs only when the deterministic status is `manual`, as today, through
`runCriterionAgentReview()` with repository browsing.

**Which F criteria run (Q6).** Enabling agent review without `--criterion-agent-criteria` lets
every agent-capable criterion run, and a list narrows that. The F criteria add one condition:

| Criterion | Agent review enabled (when manual) |
| --- | --- |
| F001, F002, F003, F006 | runs |
| F004, F007 | runs only when runtime evidence was collected |
| F005 | no agent review |

A list cannot make F004 or F007 run without runtime evidence. A new `notRunReason` on the
optional review request gives the real reason in the note; today a skip always says "no candidate
evidence was available".

**Starting material** under `.criterion-agent/<ID>/`, text only:

- `checklist.json`: items, starting points and obligations with their subjects;
- `evidence-summary.json`: the deterministic findings, capped at 48 KB like S010's;
- `response-shape.json`: a complete, valid example response;
- reference material: the pinned UX guidelines for F006, stripes-components' accessibility guides
  for F004, and the handler patterns relevant to F001's unresolved sites;
- runtime evidence for F004 and F007 (text, size-capped, see below; Q12).

**Obligations.** Each non-reviewer-only item yields one obligation, or one per subject. IDs are
short and per-run: `F003-C1#1`, `F003-C1#2`, …, mapped to their subject (an id, a path and line,
a page) in `checklist.json`. The stable part is the item ID; across runs a subject is matched by
path plus content hash. At most 25 obligations per review: status-relevant subjects first (F001:
unresolved sites, then paths missing from the index; F003: missing ids, then hard-coded
candidates in path order), then item-level obligations. The rest are listed as "Not given to the
agent (limit of 25)".

**Assessment fields** (existing types; the prompt names them exactly and points to
`response-shape.json`):

| Field | Values for F00x |
| --- | --- |
| `technologyId` | an obligation ID, or `discovered:<kind>:<n>` for F001 (`interface`) and F003 (`text`, `id`) |
| `type` | `aligned_fact` (the item's desired state holds), `substantive_concern` (it does not), `evidence_gap` (could not establish it), `analyzer_limitation` (a deterministic finding is wrong, e.g. a false positive), `policy_question` (guideline or policy unclear) |
| `coverageDisposition` | required: `investigated`, `immaterial`, `unresolved` |
| `summary`, `evidenceReferences` | one or two sentences; snapshot paths |

**Semantic validation** (all-or-nothing, no retry). The response is rejected when:

1. an obligation has no assessment or more than one, or an assessment names an ID that is neither
   an obligation nor an allowed `discovered:` ID;
2. an assessment lacks `coverageDisposition` (required for F00x, as in S006);
3. the review, an assessment or a reviewer action cites no snapshot path; runtime evidence files
   count only for runtime obligations, through the new `generatedEvidencePaths` request option;
4. an `investigated` subject obligation does not cite its own subject path, or a subject outside
   the browse scope is anything but `unresolved` (S006's rules);
5. `recommendation` is `likely_sufficient` while any assessment is `substantive_concern`,
   `evidence_gap` or `policy_question`, any disposition is `unresolved`, any `discovered:`
   concern exists, or the cap withheld any obligation;
6. `recommendation` is `likely_insufficient` without a cited `substantive_concern`;
7. `recommendation` is `needs_reviewer_judgment` without a cited reviewer action;
8. an `aligned_fact` is `unresolved`, or an `evidence_gap` is `investigated`;
9. a `discovered:` assessment is anything but `substantive_concern` or `evidence_gap`;
10. a criterion-specific rule fails (listed per criterion).

`likely_sufficient` therefore means "every item given was checked and holds", never "nothing
found".

### Keeping reviews focused, fast and cheap

- **Browse scope.** A new optional `browseInclude` predicate, applied in
  `prepareRepositoryBrowsing` on top of the existing exclusions. F00x reviews include `src/`,
  `lib/`, root `*.js`, `package.json` and component CSS, plus per criterion: the module's own
  `en.json` (F003), `test/`, `cypress/`, `.github/workflows/`, `Jenkinsfile` and test-runner
  config files (F002, F004). Stories, `guides/`, CHANGELOG and other locales are left out. The
  scope is listed in the prompt and the report.
- **Source reading.** Committed blobs only (`readCommittedSource`), `maxFiles` 2,000 and the
  default byte limits; an incomplete scan makes the deterministic result manual. One-hop import
  resolution looks up paths in the snapshot map, never the filesystem, so traversal and symlinks
  cannot escape.
- **Timeout.** F00x reviews use 420,000 ms when `--criterion-agent-timeout-ms` is not given (a
  per-request default in the adapter); an explicit flag still wins.
- **Cost and time.** About $0.02–0.05 and 1–4 minutes per review (F10). With agent review enabled
  and no list, a UI module also runs S004, S005, S006, S007 and S010 when they are manual, so a
  full evaluation is up to nine reviews: about $0.15–0.45 and 10–35 minutes. F00x alone is about
  $0.06–0.20 per UI module. The remaining $4.95 covers roughly 11–30 full evaluations;
  `--criterion-agent-criteria` narrows it. F002 is `not_applicable` for the sampled ui-* modules,
  so it adds a review only for repositories with Karma/BigTest-style tests.
- **Measurement.** Each agent PR records time, cost and acceptance on three modules (ui-checkin,
  ui-users, and ui-inventory or stripes-smart-components) before merging; a rejection rate above
  one in three blocks the merge until the prompt or the cap is adjusted.

### Optional runtime UI evidence (F004, F007)

Built in the F004 PR (Q5). It is agent input only and never decides a status. It never builds or
serves the evaluated commit; it only visits an existing deployment. Because it reads a running
instance, not the repository, it should point at a test or reference environment (for example
the Eureka snapshot), never a production library system.

- **Flags.** `--ui-runtime-url <origin>` (the Stripes UI origin), `--ui-runtime-login-origin
  <origin>` (the identity provider, e.g. Keycloak), credentials in `FOLIO_UI_USERNAME` and
  `FOLIO_UI_PASSWORD`. Nothing runs without all of them. The documentation asks for a test or
  reference environment and a test account; the evaluator cannot verify either.
- **Navigation.** Only same-origin paths built from `stripes.route`, `stripes.home` and
  `/settings<route>`, each matching `^/[A-Za-z0-9-]+$`; anything else is skipped and reported. At
  most 6 pages, 30 s per page, 180 s in total.
- **Credentials.** Typed only into a page on the pinned login origin; any other host during
  login stops the probe. Never written to reports or agent files.
- **No writes.** Playwright request interception blocks every non-GET request except the login,
  token and refresh endpoints, and blocks all requests to origins other than the UI, the login
  origin and the API origin (taken from the UI's `stripes-config`, which must be same-site). No
  clicks or form submissions.
- **Recorded.** Each navigation and blocked request is recorded with URL, status and time, like
  `remoteEvidence`. `docs/criterion-notes.md`, which today calls remote lookups the evaluator's
  only network reads, is updated.
- **Collected per page:** axe-core 4.x results for `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`
  (rule id, impact, help text, and per node its target selector and HTML); console errors; failed
  requests; the Chrome version; the module version shown in `/settings/about`. No screenshots,
  because agent files are text only.
- **Size caps, for cost:** at most 10 nodes per rule with node HTML cut to 300 characters, 50
  console messages per page cut to 500 characters, 50 failed requests per page, and 48 KB of
  runtime evidence per criterion; anything cut is counted and marked as cut.
- **Secrets and tokens:** the text goes through the existing `redactSensitiveText` (bearer and
  Okapi tokens, JWTs, credential URLs and similar), the same redaction already applied to agent
  output. There is no other redaction (Q12).
- **Shown:** layer 1 shows counts per page and per rule, the first console messages, the Chrome
  version and the deployed module version next to the evaluated `package.json` version, labelled
  "Runtime evidence (informational)". It does not claim that the Chrome version is the current
  Stable release.
- **To the agent (Q12):** as `.criterion-agent/F004/axe-results.json` and
  `.criterion-agent/F007/console.json`, listed in `generatedEvidencePaths`.

## F001 Consumed APIs declared in package.json

### Deterministic part

Evidence (safe mode, no network): committed production sources, `package.json` read with the
exported `collectFrontend` (for UI modules and libraries alike), and
`config/f001-handler-index.json`.

**Handler index.** A new tool, `src/tools/build-f001-handler-index.ts`, reads the same FAR pins as
the S008 catalog (R1-2026-GA, `full=true`) and writes, per provider `moduleId` and
`descriptorHash`, each provided interface's handlers (`methods`, `pathPattern`). It verifies that
every provider in `config/s008-catalog-official.json` is present, including mod-circulation-bff
from app-requests-ecs-2.0.6, and records the platform version. S008's files and results are
untouched.

**Request sites recognized:** stripes-connect manifest entries with `type: 'okapi'` (`path`,
`records`, method-specific `path` overrides); `useOkapiKy()` / `ky` calls (`ky(...)`,
`ky.get|post|put|patch|delete(...)`, `ky.extend` prefixes); `fetch` built on `stripes.okapi.url`.
Path arguments may be string or template literals, or constants from the same file or one relative
import (resolved inside the snapshot).

**Matching:** stripes-connect tokens (`%{}`, `!{}`, `?{}`, `:{}`) and `${}` become one path
segment; the query string is dropped; the most specific `pathPattern` wins; system interfaces never
count; a tie between two interfaces is ambiguous.

Rules:

- `fail`: a resolved request site maps to exactly one interface declared in neither list (Q1),
  for modules and libraries alike.
- `pass`: every request site resolved, and every mapped interface is declared.
- `manual`: unresolved or dynamic sites, paths not in the index, ambiguous matches, an index that
  failed to load, or an incomplete scan. A proven violation still fails.

Declared-but-not-detected interfaces are listed for information only.

### Checklist

- **F001-C1** (reviewer only) Each interface under "Used but not declared" is declared in
  `okapiInterfaces`, or in `optionalOkapiInterfaces` when the code checks `stripes.hasInterface`.
- **F001-C2** Each unresolved request goes to an interface the module declares. Starting points:
  file and line of each site.
- **F001-C3** Each path not in the index belongs to an interface the module declares.
- **F001-C4** (reviewer only) Requests made through shared-library hooks go to declared
  interfaces. Starting points: the library hooks the module imports.

### Agent review

Runs only when F001 is manual, so it never sees fail candidates; those are confirmed by the
reviewer through F001-C1. Asked to resolve each unresolved site by following constants and hooks,
to identify the interface of each path not in the index, and to report any request the extractor
missed as `discovered:interface:<n>`. Starting material includes the handler patterns that share a
first path segment with each unresolved path. Criterion rule: a `substantive_concern` must name
the interface id it believes is undeclared.

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
Interface paths from the handler index for R1-2026-GA

What to do: Add each interface to "okapiInterfaces", or to "optionalOkapiInterfaces" when the
code checks stripes.hasInterface first.

Checklist for the reviewer:
  - F001-C1 Each interface under "Used but not declared" is declared …
Agent review:
  - Not applied: agent review runs only for manual results.
```

## F002 End-to-end tests in a supported technology

### Deterministic part

Evidence: `package.json` dependencies and scripts; `cypress.config.*`, `cypress/`,
`playwright.config.*`, `wdio.conf.*`, `nightwatch.conf.*`, `.testcaferc*`, `karma.conf.*`,
`test/bigtest`, `test/e2e`; and steps in `.github/workflows/*.yml` and `Jenkinsfile` that run them.
F002 does this detection itself; S012's build-test evidence covers build tools only. The policy
entry is selected by section id (`frontend-integration-testing`), not by consumer, so F002 does not
wait for S013.

- `not_applicable`: no E2E tooling or tests ("not provided"; the gist notes that E2E tests live in
  stripes-testing).
- `pass`: the only E2E framework is Cypress at 12.0 or later, from `yarn.lock` or a range whose
  every allowed version is at least 12.0 (Q3). The report notes that the OST page marks Cypress
  "pending verification", which S007 would treat as manual.
- `fail`: an E2E framework conclusively outside the policy (Playwright, WebdriverIO, Nightwatch,
  TestCafe, Puppeteer-driven suites).
- `manual`: Cypress below 12.0 or of unknown version; Karma/BigTest or other browser tests whose
  kind is unclear; several frameworks; unreadable evidence.

### Checklist

- **F002-C1** Each browser test suite found is a component test, or an end-to-end test in a
  supported framework.
- **F002-C2** CI runs end-to-end tests only with a supported framework.

### Agent review

Runs whenever F002 is manual (Q6). Asked to classify each suite and to say which runner CI uses.
Usually short (stripes-components: Karma + BigTest).

### Report

`F002 not applicable: The repository has no end-to-end tests. FOLIO's end-to-end tests for UI
modules live in stripes-testing.` For stripes-components: `F002 manual: The repository runs
browser tests with Karma and BigTest. A reviewer must decide whether they are end-to-end tests;
BigTest is not on the supported-technologies page.` plus checklist and agent layers.

## F003 Internationalization with react-intl and en.json

### Deterministic part

Evidence (safe mode): `package.json`, `translations/<namespace>/en.json`, production sources.

Namespace: the single directory under `translations/`. With several directories, the Stripes rule
picks one (`ui-` plus the package name without `@folio/` for apps, the bare name for `stripes-*`);
if that is still ambiguous, the result is manual.

Checks: react-intl in `dependencies` or `peerDependencies` and imported; `en.json` exists, is valid
JSON and a flat map of non-empty strings; every literal message id in the namespace
(`<FormattedMessage id="…">`, `formatMessage({ id: '…' })`, `translate(…)`) is a key; each value's
ICU syntax parses (`@formatjs/icu-messageformat-parser`). Hard-coded text candidates: JSX text and
`aria-label`, `label`, `placeholder`, `title` strings of two or more words, outside comments,
tests and stories.

- `not_applicable`: the package renders no UI (Q10).
- `fail`: react-intl is not used, or there is no `en.json`, or `en.json` is not valid JSON.
- `manual`: literal ids missing from `en.json` (Q4); hard-coded text candidates; ICU syntax errors;
  ambiguous namespace; incomplete scan.
- `pass`: none of the above. Computed ids are listed as "not checked" and do not block a pass.

### Checklist

- **F003-C1** Each listed id exists in `en.json`, or the code supplies English fallback text
  (`defaultMessage` or a label prop).
- **F003-C2** No user-visible text is hard-coded: each listed string is either not shown to users
  or comes from `en.json`.
- **F003-C3** Computed message ids resolve to keys in `en.json`.
- **F003-C4** Every `en.json` value has valid ICU syntax.

### Agent review

Asked to check each missing id for a fallback, each hard-coded candidate (visible text, or a
comment, test helper or developer-only string), and computed id families; and to report other
hard-coded text or missing ids as `discovered:text:<n>` or `discovered:id:<n>`. Browse scope adds
only the module's own `en.json`.

### Report

```text
F003 manual: The module uses react-intl and has an English translation file, but 1 message id it
uses is missing from en.json.
  - react-intl ^7.1.5; translations/ui-checkin/en.json, 126 texts
  - Missing from en.json: ui-checkin.statusModal.cancel (src/components/CheckinNoteModal/CheckinNoteModal.js:60)
  - Hard-coded text: none found
Checklist for the reviewer:
  - F003-C1 Each listed id exists in en.json, or the code supplies English fallback text …
```

For stripes-connect: `F003 not applicable: This package renders no user interface.`

## F004 WCAG 2.1 AA accessibility

### Deterministic part

`not_applicable` without rendered UI (Q10); otherwise always `manual`. Layer 1 lists axe-based
tests, whether the module extends `@folio/eslint-config-stripes` (which enables `jsx-a11y`),
`jsx-a11y` rules disabled in code, `<img>` without `alt`, click handlers on non-interactive
elements, hard-coded `aria-label` text (shared with F003), and, when collected, runtime axe results
per page with rule, impact and node count.

### Checklist

- **F004-C1** axe DevTools (current major version) finds no WCAG 2.1 AA violations caused by the
  module on its main screens. Start with: the module's routes, and runtime results when present.
- **F004-C2** Interactive elements have accessible names and keyboard support; each disabled
  `jsx-a11y` rule is justified.
- **F004-C3** Images and icons have text alternatives; status is not shown by color alone.
- **F004-C4** Modals and panes manage focus.
- **F004-C5** Accessibility tests (axe) cover the main components.

### Agent review

Runs only when runtime evidence was collected (Q6). Asked to map each axe violation to the
component that renders it, separate module problems from platform ones (stripes-core navigation,
the login page), and review C2–C5 from source. Obligations: one per page and rule for C1, one per
disabled rule for C2, and C3–C5.

### Report

`F004 manual: Accessibility must be measured with axe DevTools on the running module; the
repository alone cannot show WCAG 2.1 AA conformance.` followed by the static signals, the runtime
counts (`/checkin: color-contrast (serious, 2 elements), …`), the checklist and the agent layer.

## F005 Stripes version

### Deterministic part

F005 takes S007's own Stripes finding. The S007 evidence producer and its observation evaluation
are extracted from `SharedEvaluator.evaluateS007` / `s007-evaluator.ts` into a shared function
cached as an artifact, so `--criteria F005` works alone and both criteria read the same finding.
S007's output is unchanged, and the committed Trillium policy stays.

- `pass`, `fail` or `manual`: as S007's Stripes finding (for example ui-checkin `^10.0.0`
  without `yarn.lock` is manual).
- `manual`: a library without an `@folio/stripes` dependency, i.e. a Stripes constituent library
  (Q8, needs PR 0's classification); a UI module without `@folio/stripes`; the policy did not load.

### Checklist

- **F005-C1** The module works with Stripes 10.1 or later (lower bound `^10.1.0`).
- **F005-C2** For a Stripes constituent library: this release is part of, or compatible with,
  Stripes 10.1 or later.

No agent review: nothing in the repository can settle it.

### Report

`F005 manual: package.json allows Stripes ^10.0.0, which includes 10.0 versions below the
required 10.1, and there is no yarn.lock to show the version used. (Same finding as S007.)`

## F006 UI layouts, patterns and norms

### Deterministic part

`not_applicable` without rendered UI (Q10); otherwise always `manual`. Layer 1 lists Stripes layout
components used, forms and their `navigationCheck` value (true, false, not set),
`ConfirmationModal` use, raw HTML controls where Stripes components exist, hex colors in CSS, the
app's `route`, `home`, `actsAs` and settings pages, and external documentation links found in
`src/` and `en.json`.

### Checklist

- **F006-C1** Screens use the standard pane layout (search/filter, results, detail, edit layer).
- **F006-C2** Search and filter screens follow the SearchAndSort and filter-pane patterns.
- **F006-C3** Every form asks before discarding unsaved changes. Starting points: forms with
  `false` or not set.
- **F006-C4** Destructive actions ask for confirmation with standard wording.
- **F006-C5** Actions, buttons and menus follow the action-menu and button guidelines.
- **F006-C6** Stripes components and color variables are used instead of raw HTML controls and
  hard-coded colors.
- **F006-C7** (reviewer only) State is kept when navigating between apps and back, or the user is
  told it will be lost. This needs interaction, which the probe does not do.
- **F006-C8** Settings pages follow the settings layout.
- **F006-C9** (reviewer only) Each documentation link shown in the UI is publicly accessible.
  Starting points: the external URLs found. The evaluator does not fetch them.

### Agent review

The main source of value for F006. Asked to review C1–C6 and C8 against the pinned guidelines (Q9:
layout, forms, ConfirmationModalPattern, ConfirmationLanguageGuidelines, navigation, about 60 KB
from stripes-components at a recorded commit under `config/f006-ux-guidelines/`) and the code.
Obligations: C1, C2, C4, C5, C6, C8, plus one per form starting point for C3. Criterion rule: a
`substantive_concern` names the guideline file it is measured against.

### Report

As in the cross-cutting example: the headline counts the signals, the checklist lists all nine
items with starting points, and the agent layer marks each item it was given.

## F007 Works in the latest Chrome

### Deterministic part

`not_applicable` without rendered UI (Q10); otherwise always `manual`. Layer 1 lists browser-specific
code (user-agent sniffing, `navigator.vendor`, vendor-prefixed or removed APIs), a `browserslist`
override, polyfills, and, with runtime evidence, the Chrome version used, console error counts and
failed requests per page.

### Checklist

- **F007-C1** The module's main screens load in the latest Chrome without console errors caused
  by the module.
- **F007-C2** No code path depends on another browser or a removed Chrome API.

### Agent review

Runs only when runtime evidence was collected (Q6). Asked to explain each console error from
source and to review flagged browser-specific code.

### Report

`F007 manual: Whether the module works in the latest Chrome must be checked in the browser.` With
runtime evidence: `Loaded /checkin and /settings/checkin in Chrome 156.0.8078.47: no console
errors, 1 failed request …`.

## Overlap with S007, S008 and S010

| Criterion | Overlap | Decision |
| --- | --- | --- |
| F005 ↔ S007 | Same Stripes rule and evidence | F005 reads S007's own finding through an extracted shared function; S007 output unchanged |
| F001 ↔ S008 | S008: declared interfaces are acceptable. F001: used interfaces are declared | F001 reuses `collectFrontend` and the same FAR pins, in its own index file; S008 untouched |
| F001 ↔ S010 | S010 flags request helpers but extracts no paths | F001's request-site inventory becomes an artifact (`uiRequestSites`) S010 can use later; S010 unchanged |
| F003 ↔ F004 | Hard-coded `aria-label` text is both | Detected once, listed in both |

## Testing

### Offline (CI)

- Fixture repositories under `src/__tests__/fixtures/frontend/`, with inputs chosen to catch
  plausible mistakes:
  - F001: a manifest path with `%{}` tokens; `ky.get(CONSTANT)` from a relative import; an import
    that points outside the snapshot (not followed); two patterns that differ only in specificity
    (`/circulation/loans/{id}` vs `/circulation/end-patron-action-session`); a system interface; a
    declared optional interface; a request in a test file (ignored); a library fixture (still
    evaluated).
  - F003: an app whose package name differs from its translation namespace; a missing key next to a
    present one; text inside a JSX comment; an ICU error; a computed id; a package with no JSX
    and no `translations/` (not applicable).
  - F005: `^10.0.0` with and without a lockfile resolving 10.1.5; a constituent library; S007 and
    F005 on the same fixture give the same finding.
  - F002: Cypress 13; Cypress 10; Playwright; Karma + BigTest.
  - F006/F004/F007: signal extraction (`navigationCheck` false vs missing; disabled `jsx-a11y`).
- Agent review through the fake adapter: one accepted response per criterion, and one rejection per
  validation rule (missing disposition, uncited subject path, `likely_sufficient` with a withheld
  obligation, `needs_reviewer_judgment` without an action, …).
- Agent selection (Q6): with agent review enabled and no list, F001 and a manual F002 run; F004
  without runtime evidence does not and shows its reason, even when listed; F00x reviews get the
  420 s default unless a timeout is given.
- Report tests: the three layers with review disabled, accepted and rejected; reviewer-only and
  withheld items labelled; S-criteria rendering unchanged.
- Runtime probe: a loopback UI and login server with known axe violations and a console error,
  plus a route that is not allowed, a redirect to a third origin during login, and a page-load
  POST; the probe skips, stops and blocks them respectively.
- S007, S008 and S010 tests pass unchanged after the reuse.

### Against real modules (before each PR merges)

Expected results, measured with the `snapshot` handler index; PR 3 re-measures F001 with the GA
index:

| Repository | F001 | F002 | F003 | F004 | F005 | F006 | F007 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ui-checkin | fail (3 undeclared) | n/a | manual (1 missing id) | manual | manual (`^10.0.0`, no lockfile) | manual | manual |
| ui-users | fail (13) | n/a | manual (3 ids, 1 aria-label) | manual | pass | manual | manual |
| ui-inventory | fail (12) | n/a | pass (comment excluded) | manual | pass | manual | manual |
| ui-agreements | manual (constants), possibly fail after resolution | n/a | manual (2 ids) | manual | pass | manual | manual |
| ui-inventory-import | pass | n/a | manual (4 ids) | manual | pass (10.1.5) | manual | manual |
| stripes-smart-components | fail (5) | manual (Karma/BigTest) | manual (3 candidates) | manual | manual (constituent) | manual | manual |
| stripes-components | pass (no requests) | manual (Karma/BigTest) | manual (3 candidates) | manual | manual (constituent) | manual | manual |
| stripes-connect | to measure | to measure | n/a (no UI) | n/a | manual (constituent) | n/a | n/a |

Agent PRs also record time, cost and acceptance on three modules (see "Measurement"); the F004 PR
runs the probe once against the Eureka snapshot with a test account.

## Implementation order (PR 0, then one PR per criterion)

0. **`classifyModuleKind` fix** (Q7), small and on its own: check the explicit library allowlist
   before the UI markers in `src/utils/module-kind.ts`, by package name (basenames are timestamps
   in real runs). Also treat a `stripes` object whose `actsAs` is missing or holds only empty
   strings as `library` (Q11). Effects: S004, S005, S008 and S014 become `not_applicable` for
   stripes-components, stripes-smart-components, stripes-core, stripes-acq-components,
   stripes-erm-components, stripes-authority-components and similar; S010 is unaffected. Regression tests in `module-kind.test.ts`; real checks on
   stripes-components and ui-users. F005's constituent-library case depends on this PR.
1. **F005**: wire `FrontendEvaluator`; the shared checklist model; the F00x branch in
   `reportDetailLines` with `AGENT_REVIEW_CRITERIA` and the `[SF]\d+` regex; extract S007's
   evidence producer and observation evaluation into a shared function; F005 itself.
2. **F003**: the shared "renders no UI" applicability check; i18n checks; the F00x agent contract
   (obligations and short IDs, required dispositions, S006-style validation, `discovered:` IDs,
   `browseInclude`, `notRunReason`, the 420 s per-request default, 48 KB evidence summary, the
   cap).
3. **F001**: `build-f001-handler-index.ts` and `config/f001-handler-index.json`; export
   `collectFrontend`; the request-site extractor; F001 rules and agent review.
4. **F002**: E2E detection (including CI files) and rules.
5. **F006**: signals, documentation links, the pinned UX-guideline snapshot, agent review.
6. **F004**: static signals; the runtime probe with its safety rules; `generatedEvidencePaths` in
   the shared citation check (replacing the S006 special case); `docs/criterion-notes.md` update;
   agent review.
7. **F007**: signals and agent review, reusing the probe.

Each PR updates `criteria-definitions.ts`, `docs/criterion-notes.md`, `docs/agent-review.md` when
it adds agent review, the README criteria list and the HTML short-name table.

## Decisions

All decided on 2026-10-23. Q1, Q3, Q5, Q6, Q7 and Q10–Q12 were answered by the user; the
defaults for Q2, Q4, Q8 and Q9 stand.

- **Q1. An unambiguous undeclared interface fails F001**, with file and line, for modules and
  libraries alike.
- **Q2. F001's handler index is offline, built from the R1-2026-GA FAR pins.** Version 4 keeps it in
  its own file, `config/f001-handler-index.json`, because the S008 catalog cannot hold handlers
  without changing S008. Reading `snapshot` from FAR under `--allow-remote-lookups` is a possible
  later addition (R1).
- **Q3. Cypress passes F002** (12.0 or later), with a note that the policy marks it provisional.
- **Q4. Message ids missing from `en.json` make F003 manual**, with the list.
- **Q5. The optional runtime probe is built** in the F004 PR, as agent input only.
- **Q6. Agent review by default for F001, F002, F003 and F006** whenever they are manual; for F004
  and F007 only when runtime evidence was collected.
- **Q7. `classifyModuleKind` is fixed first**, as its own small PR (PR 0).
- **Q8. Stripes constituent libraries are manual for F005**, with checklist item F005-C2.
- **Q9. The evaluator vendors a pinned snapshot of the stripes-components UX guidelines**, about
  60 KB under `config/f006-ux-guidelines/` with its commit.
- **Q10. F003, F004, F006 and F007 are `not_applicable` for packages that render no UI**: no JSX in
  production code and no `translations/` directory, e.g. stripes-connect.
- **Q11. PR 0 also classifies a `stripes` object without a real `actsAs` as a library**: `actsAs`
  missing or only empty strings, e.g. stripes-acq-components, stripes-erm-components,
  stripes-authority-components. Their S004, S005, S008 and S014 results become `not_applicable`.
- **Q12. Runtime text goes to the model provider** without probe-specific redaction ("this is open
  source code"). Size caps and the shared secret and token redaction stay; the probe should point
  at a test or reference environment. No screenshots, since agent files are text only.

## Risks

| | Risk | How we notice | What we do |
| --- | --- | --- | --- |
| R1 | The handler index is a GA release; new interfaces look unknown | "Path not in the index" rows | Manual, never fail; a FAR `snapshot` read could be added later |
| R2 | Constant resolution misses hook-heavy modules (ui-agreements) | Many unresolved sites | Manual plus agent F001-C2 |
| R3 | Agent reviews time out or are rejected | Unavailable note; per-PR measurement | 420 s default, cap of 25, browse scope; merge blocked above one rejection in three; layers 1 and 2 still stand |
| R4 | OpenRouter budget runs out | Provider error | Estimates include S criteria; `--criterion-agent-criteria` narrows |
| R5 | Runtime evidence reflects the deployed version, not the commit | Deployed version shown next to `package.json` | Informational only |
| R6 | The probe changes a shared environment | Blocked-request record | Non-GET blocked except login, no clicks, route allowlist, budgets; documented for test or reference environments with a test account |
| R7 | The probe is pointed at a production instance, so its data reaches the provider | Origin shown in the report | Documented as test or reference environments only (Q12); shared secret and token redaction; size caps |
| R8 | The UX guideline snapshot goes stale | Recorded commit and date | Maintainer refresh |

## Out of scope

- Running module tests or lint in the first version.
- Building or serving the evaluated commit (that would need `--allow-local-commands`).
- Fetching documentation links (F006-C9) or searching stripes-testing for a module's suites.
- Certifying WCAG conformance or UX compliance; agent advice never changes status.
- Changing S007, S008 or S010 behaviour.
