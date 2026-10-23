# B001–B016 evaluator design

Status: design proposal, version 3. Q1–Q17 are decided (see [Decisions](#decisions)); the oracle
review is folded in (see [Review changes](#review-changes)). Not implemented. Based on
`origin/master` at `0069e91`: S011, S012, S013 and S014 merged; PR 0 `classifyModuleKind` merged
as #69; F001–F007 approved but not yet implemented. All real-world numbers were collected on
2026-10-23 and will drift.

The Backend criteria from the [master list](https://gist.github.com/okolawole-ebsco/f54f7617b61680f2ad346896e807a796)
"apply to modules, shared backend libraries, and edge modules". `src/evaluators/java/backend-evaluator.ts`
is a stub (`CatalogSectionEvaluator('Backend', 'java')` with no handlers), so all sixteen fall back
to `not_implemented`. Their entries in `src/criteria-definitions.ts` carry placeholder reasons that
do not match the criteria (B001 "API design and RESTful principles", B016 "Integration testing");
each PR replaces its entry.

| ID | Criterion | Deterministic part | Judgment part (agent review on top) | Proposed short rule |
| --- | --- | --- | --- | --- |
| B001 | Compliant Module Descriptor in the repository | Find the committed descriptor template, substitute build placeholders, validate against the Okapi schema S002 already uses | None | Fail when a backend or edge module's template is invalid; manual when no template is found (the repository is then `ambiguous`); pass when it validates. |
| B002 | Consumed APIs declared in `requires` / `optional` | Extract outbound request paths, map them to interfaces with the F001 handler index, compare with the committed template's declarations | Unresolved calls; whether a candidate call is reachable | Pass when every resolved call is declared; manual otherwise (Q3); not applicable to libraries. |
| B003 | Executable implementations of every `provides` endpoint | Spec method and path plus an implementing class found by a pinned naming rule (RMB/Spring), router literals (Vert.x, edge), Grails URL mappings | Handlers the inventory cannot match | Pass when every handler matches; fail only when the spec lacks a handler and no route literal serves it; manual otherwise. |
| B004 | Environment variables follow the FOLIO policy (5 sub-checks) | ENV_VARS.md or README table (the only documentation, Q2) with default, required/optional and description for every used variable; required/default consistency; names and prefixes; fail-fast evidence | Startup behaviour and startup logging; undocumented-variable candidates | Fail on an undocumented variable, a table missing a required column, a defaulted variable marked required, or a malformed name (Q1, Q2, Q8, Q12); pass only with fail-fast evidence and no logging signals; manual otherwise. |
| B005 | Interfaces in `provides` follow naming conventions | Interface ids and versions in `provides` (placeholders resolved from build properties); implemented routes not provided | None | Fail on an id with dots or underscores or a version that is not major.minor; manual on uppercase ids, unresolved placeholders, implemented-but-not-provided routes. |
| B006 | All API endpoints documented in OpenAPI (RMB may keep RAML for existing modules) | Find OpenAPI/RAML specs, resolve `$ref`s, match every handler path and method | None | Pass when every handler is documented in OpenAPI (or RAML for an existing RMB module, Q1); fail on undocumented handlers or no spec; manual when references cannot be resolved. |
| B007 | Endpoints protected with appropriate permissions | `permissionsRequired` on every handler, `*.all` use, permission names, definitions in `permissionSets` | Whether permissions fit the endpoints and module permissions are complete | Fail on a handler that requires a `*.all` permission or an undefined permission; manual otherwise (Q7). |
| B008 | Reference data where applicable | Reference-data sources (RMB `ref-data`/`reference-data` folders and `TenantRefAPI` load paths, Liquibase inserts, Grails defaults) matched to vocabulary-like endpoints | Whether each controlled vocabulary has a value | Pass when every vocabulary-like endpoint has shipped reference data; manual otherwise; not applicable without storage. |
| B009 | If provided, API tests in a supported technology | API test suites in the repository; with lookups, `.feature` files in a folio-integration-tests folder named after the module | Whether found suites are API tests | Not applicable when none are found; pass for Karate only (Q9); fail for an unlisted framework; manual when lookups are off (Q14) or suites are unclear. |
| B010 | Data segregated by tenant at the storage layer | Positive storage evidence, its tenant-schema mechanism; red flags (no-tenant clients, `public` tables) | Most of the criterion | Not applicable without storage; otherwise always manual. Runtime harness gives schema evidence (Q5). |
| B011 | No access to other modules' DB schemas (FQM excepted) | Tenant-qualified references to other modules' schemas in comment-stripped SQL and code | Whether a reference is reachable, a migration, or FQM | Fail on a reference in production code or an every-install script; manual in migrations (Q11) and for runtime-built names; pass when none. |
| B012 | Non-interface dependencies declared in README.md | Infrastructure (shared with B016) matched against README with S003-style name matching and synonyms | External services, other modules' Kafka topics (Q17) | Fail when a definite infrastructure dependency is not named; manual for uncertain ones; pass otherwise. |
| B013 | Tenant content selected by `x-okapi-tenant` | Tenant resolution mechanism per framework; red flags | Most of the criterion | Always manual. Runtime harness gives cross-tenant evidence from a created record (Q5). |
| B014 | `GET /admin/health` returns 200 | Framework mechanism (RMB built-in, Spring/Grails actuator at `/admin`, Vert.x/edge routes) | None | Pass when the mechanism is found; manual otherwise. With the runtime harness, a 200 passes and anything else is manual with the response attached. |
| B015 | High availability | Red-flag signals (sessions, local file writes, in-memory state, per-instance schedulers) | Most of the criterion | Always manual. |
| B016 | Only OST-listed infrastructure | Infrastructure client dependencies and configuration, against the committed policy's `infrastructure` section | Optional or selectable backends | Fail on a required unlisted infrastructure dependency; manual for optional ones (Q10); pass otherwise. |

## Current state the design builds on

- `BackendEvaluator` extends `CatalogSectionEvaluator('Backend', 'java')`. `JavaEvaluator.canEvaluate`
  accepts `pom.xml`, a Gradle project or Java sources, so Grails (`service/build.gradle`) and edge
  modules reach it.
- **S002** (`artifacts/module-descriptor-artifact.ts`, `module-descriptor-validator.ts`) generates
  the descriptor with Maven `process-resources` or Gradle `processResources`, which is blocked in
  safe mode, and validates it with Ajv against the vendored Okapi schema
  (`src/schemas/okapi/module-descriptor`). That schema includes top-level `env` and an
  `EnvEntry.required` field.
- **S008** (`s008-interface-declarations.ts`) reads backend `requires` / `optional` with `fs` from
  the working tree, preferring S002's generated descriptor when local commands ran
  (lines 30–32), and rejects placeholder ids and versions. Its `collectBackend` is private; the
  public entry point is `collectS008Declarations(repo, 'backend-module')`.
- **S010** (`s010-evidence.ts`) is not reusable for B004 or B012 as it stands:
  - `collectEnvDeclarations` (line 491) is private;
  - it reads `launch?.env ?? descriptor.env`, one list or the other (line 497);
  - it walks every `ModuleDescriptor*.json`;
  - it keeps only names matching `EXTERNAL_CONFIG_PATTERN` (line 32, filtered at 503), so
    `JAVA_OPTIONS`, `SYSTEM_USER_*` and `*_ENABLED` never appear.

  Its "external hosts" are JavaScript `fetch` literals only. For Java, a dependency id is the file
  name of any class using `WebClient|HttpClient|RestTemplate|KafkaTemplate|S3Client`, which are
  mostly Okapi interface clients.
- **S003** (`license-compliance.ts`) has a private `isDocumentedInReadme(dependency, readme)` that
  matches dependency names in README text, case-insensitively, with lookarounds that act as word
  boundaries (lines 74–83).
- **S007/S012 policy sharing** (`s007-policy.ts`): the committed Trillium policy has these
  sections:
  - `infrastructure` (`consumer: "future"`): PostgreSQL 16, OpenSearch 3, Elasticsearch 8,
    Kafka 4.2 (normative), MinIO-compatible S3 (advisory, alias `s3`);
  - `fast-moving-infrastructure`: FOLIO Kong and Keycloak;
  - `backend-integration-testing` (`consumer: "s013"`): Karate and cucumber-reporting
    (provisional). S013 on master reads it through `policySections(policy, 's013', area)`
    (`s013-evaluator.ts:233`).

  The consumer enum in `officially-supported-technologies.schema.json` (line 148) and
  `s007-officially-supported-technologies.ts` (line 8) is `s007|s012|s013|future`.
- **Remote lookups** (`remote-evidence.ts`, `--allow-remote-lookups`): `api.github.com` allows only
  `/repos/folio-org/(platform-lsp|app-*)` (lines 47–52). A folio-integration-tests lookup needs a
  transport change (B009 PR).
- **Module kind** (`module-kind.ts`, after #69): `classifyModuleKind` checks for a
  `ModuleDescriptor*.json` first (line 24, `hasBackendModuleMarker` at line 40) and returns
  `backend-module` when it finds one. Only then does it check the library allowlist (lines 6–15)
  and the Stripes `actsAs` marker, then UI markers, and otherwise returns `ambiguous`. The
  allowlist does not include `edge-common` or `edge-common-spring`. A library that ships a
  descriptor would be classified as a module; none of the sampled libraries does.
- **Agent review selection** (`criterion-agent-review.ts:87-89`, and line 129 for the adapter):
  an empty `enabledCriteria` runs every agent-capable criterion; a `--criterion-agent-criteria`
  list narrows the whole run, S criteria included. The report's skip regex
  (`report-html-template.ts:141`) only knows `S\d+`. S011 is agent-capable on master
  (`AGENT_REVIEW_CRITERIA`, line 115), so S-criteria reviews number up to six.
- **Catalog languages:** every B entry has `languages: ['java']` (`criteria-definitions.ts:178-331`),
  so only `JavaEvaluator` repositories reach `BackendEvaluator`.
- **F001–F007 design (approved, version 5)** adds what this design reuses: the structured checklist
  and three-layer report (`criterionDetails.checklist`, an F/B branch in `reportDetailLines`), the
  agent contract (short per-run obligation IDs, required dispositions, S006-style validation,
  `discovered:` IDs, `browseInclude`, `notRunReason`, 420 s default timeout, cap of 25, 48 KB
  evidence summary, `generatedEvidencePaths`), and `config/f001-handler-index.json` built from the
  R1-2026-GA FAR pins.

## Findings that shape the design

Sample (HEAD on 2026-10-23): mod-search `187df60` and mod-notes `76dd22f` (Spring Boot,
folio-spring-base), mod-users `81dc3f4`, mod-circulation-storage `e30d3e0` and
mod-inventory-storage `084ae69` (RMB), mod-circulation `c0ec79a` (Vert.x), mod-agreements
`2f6bd14` (Grails), edge-patron `5c5c428` (edge), folio-spring-base `fde3420` (library).

### E1. Every template validates against the Okapi schema, so B001 is mostly about presence

All eight descriptor templates (`descriptors/ModuleDescriptor-template.json`; mod-agreements:
`service/src/main/okapi/ModuleDescriptor-template.json`) are valid JSON and pass the repo's own
Okapi schema validator, both raw and with `${…}` / `@…@` placeholders substituted. The schema is
permissive; descriptor content quality is covered by B004, B005 and B007. folio-spring-base has no
descriptor.

### E2. No module documents environment variables the way the policy requires

The [Environment Variables policy](https://folio-org.atlassian.net/wiki/x/NYCgTg) (section 3) asks
for every variable in the descriptor's top-level `env` with name, default (`value`, may be empty),
`required` and `description`, and an `ENV_VARS.md` or README table. Decision Q2 (B): only
`ENV_VARS.md` or a README table counts as documentation for B004; descriptor env lists are inputs,
not documentation.

| Module | Variables (`launchDescriptor.env`) | Top-level `env` | `ENV_VARS.md` | In a README table | README table columns | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| mod-search | 75 | 0 | no | 68 of 75 | Name, Default value, Description | Missing: `DB_CHARSET`, `DB_MAXPOOLSIZE`, `DB_QUERYTIMEOUT`, `INSTANCE_CHILDREN_INDEX_BATCH_SIZE`, `JAVA_OPTIONS`, 2 `KAFKA_CONSUMER_EVENTS_*`; 28 more names read in `application.yml` placeholders |
| mod-notes | 20 | 0 | no | 0 (prose only) | | 11 more read in config, e.g. `DB_CONNECTION_TIMEOUT` |
| mod-users | 18 | 0 | no | 0 | | S3 variables use `AWS_*`; the policy says `S3_` |
| mod-circulation-storage | 13 | 0 | no | 0 | | |
| mod-circulation | 12 | 0 | no | 9 of 12 | Variable name, Default value | Missing: `JAVA_OPTIONS`, `REPLICATION_FACTOR`, `SCHEDULED_ANONYMIZATION_NUMBER_OF_LOANS_TO_CHECK` |
| mod-agreements | 7 | 0 | no | 1 of 7 | Variable, Description, Options, Default | Groovy `${CONST}` strings look like variables (false positives) |
| edge-patron | 3 | 0 | no | 2 of 3 | Property, Default, Description | Secure-store settings are Java system properties (`secure_store`) |
| mod-inventory-storage | 49 | 0 | no | 0 (bullet list) | | |

"In a README table" counts descriptor variable names that appear in a Markdown table row. No
module has `ENV_VARS.md`, and no table has a required/optional column. Every name is `[A-Z0-9_]`.
Read literally, sub-check 1 fails all eight modules. Policy section 7.2 says existing modules are
"encouraged" to comply; section 5.2 makes it a must for new modules.

### E3. Interface naming is mostly clean; permission naming is not

- Interface ids: only mod-users' `users.settings` breaks the hyphen-separated rule
  ([naming conventions](https://dev.folio.org/guidelines/naming-conventions/#interfaces)). All
  versions are major.minor (mod-agreements' template uses a placeholder). Ids often differ from
  their first path segment (mod-circulation: 12 of 18), which the guide calls "normally the same".
- Permissions: no handler requires a `*.all` permission, and every required permission is defined
  in `permissionSets`. mod-circulation uses two of its own `*.all` sets as module permissions.
  mod-agreements has 2 handlers without `permissionsRequired` (`/erm/sas/publicLookup`,
  `/dashboard/definitions`) and 25 camelCase permission names (`erm.admin.action.loadPackage.execute`).
  Many legacy names do not start with the module prefix (mod-users: see below, e.g.
  `addresstypes.collection.get`). The [Permission Naming Guidelines](https://folio-org.atlassian.net/wiki/x/BgDtY)
  allow `*.all` for broad permissions; the gist says to avoid them.

  Counting method: permission names were counted from `permissionSets[].permissionName`
  (definitions) and from distinct `handlers[].permissionsRequired[]` values (requirements).
  mod-users: 38 of 55 distinct required permissions and 39 of 60 defined names lack the `users`
  prefix. mod-agreements: 25 defined names contain a lower-to-upper case change (camelCase).

### E4. Handler paths are mostly documented, with real gaps

A prototype matched non-system handler paths with OpenAPI `paths` or the RAML resource tree:

| Module | Spec | Handler paths | Documented | Not found |
| --- | --- | --- | --- | --- |
| mod-search | OpenAPI | 40 | 40 | 0 |
| mod-notes | OpenAPI | 6 | 6 | 0 |
| mod-users | RAML | 27 | 21 | 6: `/custom-fields…` come from the folio-custom-fields library's RAML |
| mod-circulation-storage | RAML | 42 | 42 | 0 |
| mod-circulation | RAML | 45 | 42 | 3 real: `check-out-by-barcode-dry-run`, `items-by-instance`, `print-events-entry` (implemented in Java, absent from RAML) |
| mod-agreements | OpenAPI | 109 | 83 | 26 by a top-level scan; its spec splits paths across `$ref` files |
| mod-inventory-storage | RAML | 113 | 113 | 0 |

### E5. Outbound-call extraction finds few calls with literals alone

Matching string-literal paths in client code against 2,987 handler entries (2,806 unique method and
path pairs) from the 41 platform-lsp
`snapshot` applications resolved only part of each module's declared dependencies (mod-search 3 of
14, mod-circulation 23 of 39). Spring modules split the path between a class-level
`@HttpExchange("consortia")` and method annotations, so both levels must be combined. The one
undeclared candidate in eight modules is mod-circulation's `configuration` client
(`Clients.java:781`, `/configurations/entries`), whose accessor `configurationStorageClient()` is
never called: dead code.

### E6. Tenant segregation follows the framework

RMB modules get per-tenant schemas through `PostgresClient`/`PgUtil` with the tenant id; Spring
modules through folio-spring-base's `FolioExecutionContext` and Liquibase per tenant; Grails
through `MultiTenant` domain classes and `Tenants.withId`. Edge modules have no storage.
mod-circulation-storage reads another module's schema in an upgrade migration:
`templates/db_scripts/migrate_circulation_settings.sql:26` selects from
`${myuniversity}_mod_configuration.config_data` (moving settings out of the retired
mod-configuration), and lines 49 and 64 read `${myuniversity}_mod_settings.settings`. Its
`schema.json` entry runs it only with `"fromModuleVersion": "17.5.0"` (lines 679–683). It also
ships `fqm-config.toml`, the FQM entity-type mechanism the gist exempts.

A naive pattern also hits comments: mod-inventory-storage's
`mod-inventory-storage-server/src/main/resources/templates/db_scripts/change_function_owner.sql:8`
has `-- WHERE  n.nspname = 'diku_mod_kb_ebsco_java';`, and that script runs on every install
(`schema.json:909-911`, no `fromModuleVersion`).

mod-circulation declares `domain-models-runtime` (`pom.xml:155-159`) but uses it only for
`LogHelper`; it has no storage. A framework dependency is therefore not storage evidence.

### E7. Health endpoints come from the framework

RMB's `RestVerticle` serves `/admin/health`; mod-search, mod-notes (Spring) and mod-agreements
(Grails) expose Spring Boot actuator with `base-path: /admin` and `health` included;
mod-circulation registers `HealthResource` ("/admin/health"); edge-patron routes it in
`MainVerticle.java:86`. mod-notes also exposes `env` at `/admin/env`.

### E8. Infrastructure and README declarations

| Module | Infrastructure detected | Named in README |
| --- | --- | --- |
| mod-search | PostgreSQL, Kafka, OpenSearch/Elasticsearch, S3 | all |
| mod-notes | PostgreSQL, Kafka | all |
| mod-users | PostgreSQL (RMB), Kafka, S3 | S3/MinIO only |
| mod-circulation-storage | PostgreSQL, Kafka | all (`README.MD`) |
| mod-circulation | Kafka | Kafka |
| mod-agreements | PostgreSQL, Kafka, S3 | PostgreSQL, S3 |
| edge-patron | AWS SSM and HashiCorp Vault (selectable secure stores, default `Ephemeral`) | Vault, SSM |
| mod-inventory-storage | PostgreSQL, Kafka, S3 | all (`README.MD`) |

AWS SSM and Vault are not on the OST infrastructure list. Two repositories use `README.MD`.

### E9. Reference data comes in three forms

RMB: `loadReference` in `TenantRefAPI` plus `ref-data/` or `reference-data/` folders (mod-users 10
files in versioned folders such as `addresstypes-15.4.0` and `groups-17.3.0`;
mod-circulation-storage 16 files under `reference-data/`, 14 of them records;
mod-inventory-storage 624). mod-users' vocabularies (`/addresstypes`, `/groups`) do not match a
`*-types` path pattern, so vocabularies must come from the folder names and load paths. Spring: Liquibase inserts
(mod-notes' default note type "General note", mod-search's browse config). Grails: refdata defaults
in domain classes. mod-circulation and edge-patron have no storage.

### E10. API tests live in folio-integration-tests

No sampled repository contains Karate, Cucumber or Postman suites. folio-integration-tests has 66
top-level folders, including mod-search, mod-notes, mod-users, mod-circulation-storage,
mod-circulation and edge-patron. mod-agreements' tests are in an `erm` folder, so matching by
module name misses them. A folder name alone does not prove the tests are Karate.

### E11. HA signals are common and mostly benign

In-memory caches (Caffeine/`@Cacheable`/`ConcurrentHashMap`) appear in 8 of 9 repositories,
per-instance schedulers (`@Scheduled`, `setPeriodic`) in 6, local file writes in
mod-inventory-storage (`BulkProcessingErrorFileWriter.java:38`), and no sticky sessions. Whether
these break HA is a judgment call.

### E12. A Docker runtime check is realistic for simple modules

With the orb's Docker daemon started (Docker 29.9.2, 4 CPUs, 7 GB RAM):

- **Published image:** `folioorg/mod-notes:latest` (8.0.0) with `postgres:16-alpine` returned 200
  on `/admin/health` 9 s after `docker run`, without Kafka.
- **Two tenants:** `POST /_/tenant` with `loadReference=true` for two tenants created
  `tenanta_mod_notes` and `tenantb_mod_notes` and loaded "General note" in both. A note type
  created with `X-Okapi-Tenant: tenanta` was listed only in tenant A.
- **Evaluated commit:** `mvn package -DskipTests` took 135 s, `docker build` 7 s, and the image was
  healthy 10 s later (8.1.0-SNAPSHOT).

Modules that need OpenSearch and Kafka to start (mod-search) need more memory and time. Building
executes repository code, so it belongs under `--allow-local-commands`. The Docker socket in this
orb is `root:docker 0660`; whoever can use it has root-equivalent access to the host.

## Cross-cutting design

### Shared backend evidence

One cached artifact, `backendEvidence` (`src/utils/backend-evidence.ts`), read from committed
blobs (`readCommittedSource`, 2,000 files, default byte limits; mod-inventory-storage has 1,524
files).

**Include filter.** With the default limits (`committed-source.ts:34-41`: 256 KB per file, 8 MB in
total), binary and oversized files are material diagnostics that would mark every sampled module
incomplete (mod-search's PNG diagrams, mod-users' 2.1 MB test JPEG, mod-agreements' 7.9 MB in
total). `backendEvidence` therefore reads only:

- `**/src/main/**` sources and resources;
- descriptor templates;
- `ramls/`, OpenAPI files and `templates/db_scripts/`;
- build files (`pom.xml`, `build.gradle*`, `gradle.properties`, `settings.gradle*`);
- `README*`, `ENV_VARS.md`, `Dockerfile`;
- reference-data folder listings.

Binary or oversized files outside these paths are non-material. `**` paths cover multi-module
layouts (mod-inventory-storage's `mod-inventory-storage-server/`, folio-spring-base's modules,
mod-agreements' `service/`).

It holds:

- **descriptor:** the committed template (same candidate paths as S008), parsed after resolving
  `${name}` placeholders from `gradle.properties` and `pom.xml` `<properties>` (and
  `${project.version}`/`${artifactId}`), then replacing the rest with neutral strings that are
  flagged as unresolved. It contains provides, handlers, permission sets, both env lists
  (top-level `env` and `launchDescriptor.env`, kept separate), and requires/optional. All
  B criteria use this one template. S008 can read S002's generated descriptor instead, so a B002
  report notes when S008's declarations differ.
- **framework:** detected from main-class and source evidence, not from dependencies alone:
  - RMB: `RestVerticle` as the main verticle, or `templates/db_scripts/schema.json`;
  - Spring Boot with folio-spring-base;
  - plain Vert.x;
  - Grails (`grails-app/`);
  - edge (an `edge-common*` dependency and an `edge-` artifactId);
  - library (from `classifyModuleKind`).
- **storage:** needs positive evidence: `templates/db_scripts/schema.json`, `PostgresClient` or
  `PgUtil` use, a Liquibase changelog, a JPA or JDBC datasource configuration, or Grails domain
  classes with a datasource. A `domain-models-runtime` dependency alone is not storage
  (mod-circulation).
- **API specs:** OpenAPI files (`openapi:` key) with `$ref` resolution inside the snapshot; RAML
  resource trees (excluding `raml-util`).
- **routes:** route inventory (B003, B005).
- **outbound calls:** request paths per call site (B002).
- **infrastructure:** client libraries, configuration keys and env prefixes (B012, B016).
- **env reads:** names read through `System.getenv`, `@Value`, and `${NAME:default}` placeholders
  in `application*.yml|properties` (B004).

B004 gets its own env collector here. It reads both lists, every name, from the selected template,
and S010 keeps its own collector unchanged. S010's Java external-service list is not reused,
because it lists client classes, not services. S008's public
`collectS008Declarations(repo, 'backend-module')` is used only to compare with B002's declared set.

### Applicability (Q4)

Classification builds on `classifyModuleKind` as merged in #69, which checks for a descriptor
before the library allowlist:

1. `backend-module` from `classifyModuleKind` (a descriptor was found). The B layer splits it:
   an `edge-` artifactId plus an `edge-common*` dependency makes an edge module (edge-patron);
   anything else is a backend module.
2. `library` from `classifyModuleKind` (allowlist, no descriptor). The B001 PR adds
   `edge-common` and `edge-common-spring` to `EXPLICIT_LIBRARY_NAMES`, so they are libraries
   rather than ambiguous. Because the descriptor check runs first, a shared library would only be
   misclassified if it shipped a descriptor; none of the sampled ones does.
3. `ambiguous` from `classifyModuleKind`, for a Java repository: an edge module when it has the
   edge artifactId and dependency (so B001 can fail it for having no template); otherwise
   ambiguous.

Clone basenames are timestamps, so the directory name is never used.

| Criterion | Backend module | Edge module | Backend library | Ambiguous |
| --- | --- | --- | --- | --- |
| B001 | yes | yes | n/a (no descriptor) | manual: "no descriptor found; a module must have one, a library need not" |
| B005, B007 | yes | only if `provides` is non-empty | n/a | manual (no descriptor) |
| B002 | yes | yes | n/a (gist) | manual (no descriptor) |
| B003, B006 | yes | yes (its own routes) | n/a (no endpoints) | manual (no descriptor) |
| B004 | yes | yes | names, startup behaviour and logging only | as a library |
| B008, B010, B011 | yes, with storage evidence | n/a (no storage) | B010, B011 yes with storage evidence (folio-spring-base) | yes, with storage evidence |
| B009, B013, B014 | yes | yes | n/a | manual |
| B012, B015, B016 | yes | yes | yes | yes |

### Existing-module evaluations (Q1)

The gist gives B006 an existing-module exception, and the env-variable policy distinguishes new
modules (must comply) from existing ones (encouraged). A new flag, `--existing-module`, records the
evaluation kind (default: new). It changes B004 sub-check 1 gaps (a missing or incomplete
ENV_VARS.md or README table) from fail to manual, allows RAML for RMB modules in B006, and turns
B005 naming violations into manual (Q13; B007 naming is manual in both modes). It does not relax
B004 C3: policy section 5.1 says existing modules MUST add `S3_` names alongside `AWS_` ones.
Reports state the mode.

### Three-layer report and checklist

As in the F001–F007 design: layer 1 deterministic evidence and status, layer 2 the plain-English
checklist with stable item IDs (`B004-C3`) and starting points, layer 3 the agent's findings
attached to checklist items when a review ran and was accepted. Without a review, layers 1 and 2
plus the existing "Agent review: Not applied: …" note. Agent advice never changes the status. The
structured checklist, report branch (`[SF]\d+` becomes `[SFB]\d+`; B IDs join
`AGENT_REVIEW_CRITERIA`) and labels come from the F PRs.

### Agent review for B criteria

The F001–F007 contract applies, with two backend changes (a 600 s timeout and grouped, ordered
obligations, below):
- obligations come from checklist items that are not reviewer-only, with short per-run IDs
  mapped to subjects;
- `coverageDisposition` is required;
- S006-style citation and subject-path rules apply;
- `discovered:` IDs are allowed where noted;
- `likely_sufficient` is rejected with any concern, gap, unresolved item or withheld obligation;
- `needs_reviewer_judgment` requires a reviewer action;
- cap of 25 obligations and a 48 KB evidence summary;
- `notRunReason` for skips.

**Agent-capable:** B002, B003, B004, B007, B008, B010, B011, B012, B013, B015. B001, B005, B006,
B009, B014 and B016 have no judgment part worth a model call; their manual cases go to the
reviewer's checklist.

**Default set (Q6):** agent review runs, when the criterion is manual, for the judgment-heavy six:
B004, B007, B010, B011, B013, B015. B002, B003, B008 and B012 carry a new per-criterion
`optInOnly` flag in the agent-review registry. They run only when named in
`--criterion-agent-criteria`, and otherwise report the `notRunReason` "agent review for B002 runs
only when listed in --criterion-agent-criteria". The skip regex at `report-html-template.ts:141`
becomes `[SFB]\d+`.

A list keeps today's meaning: it replaces the defaults for the whole run, S criteria included
(Q16). To add B002 to a default run, the user lists the defaults too. `--help` and
`docs/agent-review.md` say so.

**Browse scope (`browseInclude`):** `**/src/main/java|groovy|kotlin/**`, `**/src/main/resources/**`
except reference and sample data, `descriptors/`, `**/ramls/**` (not `raml-util`),
`**/grails-app/**`, `README*`, `ENV_VARS.md`, `**/pom.xml`, `**/build.gradle*`, `Dockerfile`,
`docker-compose*`. Per criterion: `**/templates/db_scripts/**` and Liquibase changelogs for
B010/B011; reference-data folder listings (not contents) for B008. Tests and generated sources are
excluded.

**Obligation ordering under the cap of 25:** subjects with a deterministic flag come first
(failing, then manual), then the rest by path.
- B007 groups handlers by interface, so one obligation covers an interface's handlers.
  mod-inventory-storage's 248 handlers become about 40 interface obligations; the first 25 are
  reviewed and the rest are withheld.
- B004 groups by variable.
- B011 groups by reference.
- B015 groups by flagged site.

Subjects are files or descriptor pointers (`descriptor#/provides/3`), so the subject-path
citation rule still means something when every subject is in the descriptor.

**Cost and time:** no backend review has been measured. Backend repositories are bigger than UI
ones (ui-checkin 136 files; here up to 1,524). The working estimate is $0.03–0.08 and 2–6 minutes
per review. The default six cost about $0.20–0.50 per module, plus up to six S-criteria reviews
(S011 is agent-capable on master, up to about $0.30). A full backend evaluation with agent review
is therefore roughly $0.25–0.80 and 18–60 minutes; the worst case at the timeout is 12 reviews of
7–10 minutes each.

The backend default timeout is 600 s, longer than F's 420 s, until measurements say otherwise. The
first agent PR (B007) measures three modules (mod-notes, mod-users, mod-inventory-storage) before
the default set is fixed. Every agent PR repeats the measurement and blocks the merge above one
rejection in three.

### Runtime harness (Q5, optional, a later PR)

A runtime check is realistic (E12) but not needed for any criterion to work. It is proposed as a
separate PR after the static ones, behind `--allow-runtime-checks`. That flag requires
`--allow-local-commands` and a reachable Docker daemon.

**Trust (Q15).** Docker access is root-equivalent on the evaluating host, and the harness builds and
runs repository code. Use it only for trusted repositories, on a disposable host (an orb). A
dedicated rootless Docker context is recommended in the docs but not required. The PR updates
`docs/criterion-notes.md:34` and the `--allow-local-commands` help text (`cli.ts:29`), which today
say only builds run, to name the runtime harness.

**Isolation rules:**

- **Build:** the module is built inside a pinned build container (Maven or Gradle image by
  digest), with a copy of the clone, no host mounts or host environment, and its own network for
  dependency downloads. The image is built with `docker build` from the repository's `Dockerfile`.
- **Network:** infrastructure, the module, the probe and an `X-Okapi-Url` stub run on a
  `docker network create --internal` network: no egress, no published ports. The probe is a
  container on that network. The evaluator reads only the probe's JSON output.
- **Images:** infrastructure, probe and stub images are pinned by digest in a committed config
  (`postgres:16`, Kafka 4.x, OpenSearch 3, MinIO).
- **Configuration from the repository:** only env name/value pairs from the selected template's
  env lists, plus infrastructure hosts. The template's `dockerArgs`, `dockerImage`, `dockerCMD` and
  `dockerPull` are never used (edge-patron's template carries `HostConfig.PortBindings`).
- **Container limits:** `--cap-drop ALL`, `--security-opt no-new-privileges`, `--pids-limit 512`,
  `--cpus 2`, `--memory 2g` for the module (infrastructure sized per image). No `--privileged`,
  host mounts or host network.
- **Budget:** 10 minutes in total for start-up and probes after the build. The build has its own
  15-minute limit.
- **Cleanup:** every container, volume, network and image carries a `tc-module-eval.run=<runId>`
  label. In `finally` and on SIGINT/SIGTERM, the harness runs `docker rm -fv`, removes the network
  and image, and runs `docker builder prune --filter label=…`. Concurrent runs use different run
  IDs.

**Steps:**

1. Build the module and its image as above.
2. Start the detected infrastructure.
3. Run the module with the env pairs, infrastructure hosts and `X-Okapi-Url` pointing at the stub,
   which answers 404, so no other FOLIO module is needed.
4. Wait for `/admin/health` (or a listening port) up to the budget.
5. `POST /_/tenant` for two synthetic tenants with `loadReference=true`.
6. Collect, as layer-1 "Runtime evidence":
   - B014: the `GET /admin/health` status and body;
   - B010: tenant schemas and any tables in `public`;
   - B008: record counts of vocabulary-like collections after reference-data loading;
   - B013: for one collection endpoint with POST and GET, whether a record created in tenant A is
     visible in tenant B. Reference data is not used: RMB reference records have fixed UUIDs, so
     both tenants show identical records. Without a usable POST endpoint, B013 gets no runtime
     evidence;
   - B003: for each GET handler without path parameters, that the status is not 404 or 405.

**What runtime evidence decides:** only B014. A 200 passes. Anything else (including a 503 from a
health check that aggregates dependencies the harness did not start, such as mod-agreements'
datasource health) is manual with the response attached. A failed start leaves the static
result. Everything else is evidence for the reviewer and the agent and never changes those
statuses.

An optional runtime URL against a deployment (like F004's probe) is not proposed: `/admin/health`
and `/_/tenant` are not routed through Kong, and B013 needs writes.

## B001 Compliant Module Descriptor

**Evidence (safe mode):** committed templates from `backendEvidence`; with
`--allow-local-commands`, also S002's generated descriptor (reported, not re-decided).

**Rules:** `not_applicable` for libraries. `fail`: an edge module (recognized by its artifactId and
dependency) has no descriptor template; a template is not valid JSON after placeholder
substitution; schema errors. `manual`: an `ambiguous` repository (no descriptor and not a known
library: "a module must have one, a library need not"); several candidate templates; placeholders
in non-string positions. `pass`: one template that validates. No agent review.

A backend module without a descriptor cannot occur, because `classifyModuleKind` returns
`backend-module` only when it finds one. The `ambiguous` case is that situation.

**Checklist:** B001-C1 (reviewer only) The descriptor template is the one the build uses.

**Report:** `B001 pass: descriptors/ModuleDescriptor-template.json matches the Okapi ModuleDescriptor
schema (checked with build placeholders such as ${artifactId} replaced). S002 checks the descriptor
the build produces.`

## B002 Consumed APIs declared in requires or optional

**Evidence (safe mode):** outbound call sites; the F001 handler index (`config/f001-handler-index.json`,
built in the F001 PR); `requires`/`optional` from `backendEvidence`'s committed template, the same
template the other B criteria use. When S008 read a different descriptor (S002's generated one)
and its declared set differs, the report says so.

**Call sites:** RMB/Vert.x literal paths passed to Okapi HTTP clients (`OkapiHttpClient`,
`CollectionResourceClient`, `WebClient`); Spring `@HttpExchange`/`@FeignClient` class-level
prefixes combined with `@GetExchange`/`@GetMapping`-style method paths; Grails `okapiClient`
calls; edge-common `OkapiClient`. Constants are resolved within the file or one import.

**Rules:** `not_applicable` for libraries. `pass`: every call site resolves to a declared interface
(or the module's own). `manual`: an undeclared candidate (Q3), unresolved or dynamic paths, paths
not in the index, ambiguous matches. Declared-but-unseen interfaces are informational.

**Checklist:** B002-C1 Each undeclared candidate is reachable and its interface is declared;
B002-C2 Each unresolved call goes to a declared interface; B002-C3 (reviewer only) Calls made
through shared libraries (folio-spring-base clients) are declared.

**Agent (when listed):** follows each candidate to a caller (mod-circulation's
`configurationStorageClient()` has none) and resolves dynamic paths; may report
`discovered:interface:<n>`.

**Report:** `B002 manual: mod-circulation builds a client for /configurations/entries
(configuration interface), which its descriptor does not require. Clients.java:781. Check whether
the client is used.`

## B003 Executable implementations of all provided endpoints

**Evidence (safe mode):** handlers from the template; route inventory. Generated RMB
`org.folio.rest.jaxrs.resource.*` and Spring `*Api` interfaces are build output and are not
committed, so the inventory pairs the spec with a pinned naming rule:

- RMB: a RAML resource maps to the interface name RMB generates from it (`/loan-storage/loans` →
  `LoanStorage`), and a committed class `implements` that name;
- Spring: an OpenAPI tag or file maps to the `*Api` interface name the openapi-generator
  configuration in `pom.xml` produces, and a committed class implements it; also
  `@RequestMapping`-family annotations;
- Vert.x and edge: router and `RouteRegistration` path literals;
- Grails: `UrlMappings.groovy`.

Paths use `**/src/main/**`, so multi-module layouts (mod-inventory-storage-server) are covered.

**Rules:**
- `pass`: every non-system handler method and path is in the spec and an implementing class was
  found for its interface name, or it matches a route literal.
- `fail`: a handler is in neither the spec nor any route literal, and the framework is RMB or
  Spring, where every route comes from the spec.
- `manual`: anything else:
  - an implementing class that cannot be found by the naming rule;
  - wildcard patterns (`/groups*`);
  - library-provided endpoints (mod-users' custom fields);
  - system interfaces handled by the framework.

**Checklist:** B003-C1 Each unmatched handler has an implementation that serves its methods.

**Agent (when listed):** finds the implementation of each unmatched handler. **Runtime (Q5):** GET
smoke statuses as evidence.

**Report (illustrative):** `B003 pass: All 248 handlers in the descriptor match RAML resources,
and each generated resource interface has an implementing class.`

## B004 Environment variables follow the FOLIO policy

Five sub-checks, each a checklist group.

| Sub-check | Deterministic part | Fails when (new-module mode) |
| --- | --- | --- |
| C1 Documented with required fields | Every variable the module uses appears in `ENV_VARS.md` or a README table (Q2, Q12), and the table gives a default (may be empty), required or optional, and a description for it. "Uses" means named in either descriptor env list, read in code (`System.getenv`, `@Value`), or a `${NAME:…}` placeholder in the module's own `application*.yml` | no `ENV_VARS.md` or README table naming the variables (4 of 8 sampled modules), a used variable missing from it (mod-search: 7 of 75), or a table without a default, required/optional or description column (all 4 modules with tables lack required/optional) |
| C2 Required vs optional | Required/optional from the documentation; defaults from the documentation, a top-level `env[].value`, or a code default | a variable documented as required has a non-empty default |
| C3 Naming | `^[A-Z0-9_]+$`; category prefixes `DB_`, `KAFKA_`, `S3_` (not `AWS_`), `ELASTICSEARCH_`, `SYSTEM_USER_`, `*_ENABLED` | a name breaks the format, or uses `AWS_` without an `S3_` equivalent (also in existing-module mode, section 5.1) |
| C4 Startup behaviour | Fail-fast evidence for required variables from the B004 collector (the same "clear fail-fast" patterns S010 uses, applied to every name) | never by itself |
| C5 No secrets in startup logs | log statements near config loading that print secret-like names; environment dumps | never by itself |

Documentation location (Q2, B, decided): only `ENV_VARS.md` or a README table counts as
documentation. A README table is a Markdown table whose rows name the variable, under any
heading, in `README.md` or `README.MD`. Prose and bullet lists (mod-notes, mod-inventory-storage)
do not count. Columns are recognised by header words: default (`Default`, `Default value`),
required or optional (`Required`, `Optional`, `Mandatory`), and description (`Description`).

Neither descriptor env list counts as documentation. `launchDescriptor.env` and top-level `env`
are only inputs that say which variables the module uses. B004 does not require a top-level `env`,
although the policy also asks for one; the report says so in one line.

Only a top-level `env[].value` counts as a default. A `launchDescriptor.env[].value` is a deployment
value (mod-users sets `KAFKA_HOST` to `10.0.2.15` and `DB_PASSWORD` to `folio_admin`), not a
default. Framework variables (RMB `DB_*`, folio-spring-base defaults) count as used by the module
only when the module's descriptor or own config names them.

**Rules:** `fail` as in the table (Q8, Q12; in `--existing-module` mode C1 gaps are manual, C3
still fails).
`pass`: C1–C3 clean, every required variable has fail-fast evidence, and no C5 signals. Otherwise
`manual`.

**Checklist:** B004-C1 … B004-C5 as above, with starting points (entries, files and lines).

**Agent (default):** for C4, whether each required variable fails fast with a clear message; for
C5, whether startup logs print secret values; for C1, whether candidate names (non-Spring reads,
Groovy strings) are real environment variables (`discovered:env:<n>` for others).

**Report:**

```text
B004 fail: The module uses 18 environment variables, but none is documented in ENV_VARS.md or a
README table. 5 S3 variables use the AWS_ prefix instead of S3_.
  - C1 Documentation: no ENV_VARS.md; README.md has no table naming the variables. The 18 names
    come from launchDescriptor.env in descriptors/ModuleDescriptor-template.json, which does not
    count as documentation.
  - C2 Required vs optional: cannot be checked without documentation
  - C3 Naming: AWS_URL, AWS_REGION, AWS_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (policy: S3_ prefix; existing modules add S3_ names alongside); AWS_SDK is a flag, not a credential
  - C4 Startup behaviour: no fail-fast evidence found
  - C5 Startup logging: no signals found
Checklist for the reviewer: B004-C4 Each required variable stops startup with a clear message when missing …
```

For mod-search, C1 reads: `README.md documents 68 of the 75 environment variables in a table
(Name, Default value, Description), but the table does not say which are required. Not in the
table: DB_CHARSET, DB_MAXPOOLSIZE, DB_QUERYTIMEOUT, INSTANCE_CHILDREN_INDEX_BATCH_SIZE,
JAVA_OPTIONS, KAFKA_CONSUMER_EVENTS_MAX_POLL_INTERVAL_MS, KAFKA_CONSUMER_EVENTS_MAX_POLL_RECORDS.`

## B005 Provided interfaces follow naming conventions

**Evidence (safe mode):** `provides` ids and versions, with placeholders resolved from build
properties (mod-agreements' `"version": "${okapiInterfaceVersion}"` resolves to `7.5` from
`service/gradle.properties:74`); the route inventory from PR 3 (B003).

**Rules:** `not_applicable` for libraries, and for edge modules with empty `provides`.
- `fail`: a non-system id containing a dot or underscore (the
  [guide](https://dev.folio.org/guidelines/naming-conventions/#interfaces) asks for hyphen-separated
  strings), or a resolved version that is not major.minor. In `--existing-module` mode these are
  manual (Q13).
- `manual`: ids with uppercase letters (the guide does not say lowercase); placeholders that
  cannot be resolved; implemented routes that no interface provides.
- `pass` otherwise.

Ids that differ from their path's first segment are listed as information only.

**Checklist:** B005-C1 Each implemented route meant for other modules is in `provides`.

**Report:** `B005 fail: The interface "users.settings" uses a dot; interface names are words joined
by hyphens.`

## B006 API endpoints documented in OpenAPI

**Evidence (safe mode):** OpenAPI and RAML specs with `$ref` resolution inside the snapshot;
handler methods and paths; for edge modules, their router routes.

**Rules:** `pass`: every handler path and method is in an OpenAPI spec, or in RAML for an RMB
module in `--existing-module` mode (Q1). `fail`: no spec; a handler absent from every spec in the
repository; RAML in new-module mode. `manual`: unresolvable `$ref`s, or paths that come from a
library's spec (mod-users' custom fields). No agent review.

**Checklist:** B006-C1 (reviewer only) Each handler listed as coming from a library is documented
in that library's published spec.

**Report:** `B006 fail: 3 endpoints in the module descriptor are not documented in the RAML API
specs: /circulation/check-out-by-barcode-dry-run, /circulation/items-by-instance,
/circulation/print-events-entry. (Existing-module evaluation: RMB modules may keep RAML.)`

## B007 Endpoints protected with appropriate permissions

**Evidence (safe mode):** handlers, `permissionsRequired`, `modulePermissions`, `permissionSets`.

**Rules:** `not_applicable` for libraries, and edge modules with empty `provides`. `fail`: a handler
requires a `*.all` permission, or a permission not defined in `permissionSets`. `manual`: handlers
without `permissionsRequired` (mod-agreements' public lookup), `*.all` in `modulePermissions`
(mod-circulation), naming deviations (prefix, camelCase, action verb; Q7), and always the
appropriateness question. `pass` is not possible without review of appropriateness, so B007 is
`manual` whenever it does not fail.

**Checklist:** B007-C1 Each permission fits what its endpoint does (read vs write, item vs
collection); B007-C2 Each endpoint without a permission is meant to be public; B007-C3 Module
permissions cover every interface the handler calls, without `*.all`; B007-C4 Permission names
follow the guidelines (listed deviations).

**Agent (default):** C1–C3 with the handler's implementation; obligations grouped by interface.
The agent finds outbound calls itself by browsing, since B002's extractor lands later (PR 12).

**Report:** `B007 manual: Every endpoint requires a defined permission and none requires a *.all
permission. 2 endpoints have no permission (/erm/sas/publicLookup, /dashboard/definitions) and 25
permission names use camelCase. A reviewer must judge whether the permissions fit the endpoints.`

## B008 Reference data where applicable

**Evidence (safe mode):** reference-data sources (E9); vocabulary-like endpoints from two
sources:
- collection GET+POST paths named like `*-types`, `*-statuses`, `*-reasons`, `*-categories`, or
  Grails refdata domains;
- endpoints whose path matches a reference-data folder name (version suffixes such as `-15.4.0`
  stripped) or a `TenantRefAPI` load path. For mod-users, `addresstypes-15.4.0` matches
  `/addresstypes` and `groups-17.3.0` matches `/groups`.

**Rules:** `not_applicable` without storage evidence (edge, mod-circulation). `pass`: every
vocabulary-like endpoint has shipped reference data loaded at tenant initialization. `manual`
otherwise, including modules with no vocabulary-like endpoint (the agent decides applicability).

**Checklist:** B008-C1 Each controlled vocabulary the module needs at least one value for has
one after tenant initialization.

**Agent (when listed):** decides applicability and coverage. **Runtime (Q5):** record counts after
`loadReference`.

**Report (illustrative):** `B008 pass: Reference data for address types and the module's other
vocabularies is loaded at tenant initialization from ref-data/ (loadReference).`

## B009 API tests in a supported technology

**Evidence:** Karate `.feature` files, Postman/Newman collections, Bruno, Insomnia and similar in
the repository (JUnit `*IT` classes are S013's concern). With `--allow-remote-lookups`, two GETs to
folio-integration-tests:
- the top-level listing (`/repos/folio-org/folio-integration-tests/contents/`);
- for a folder named after the module, its recursive tree (`/git/trees/<sha>?recursive=1`),
  looking for `.feature` files and `karate-config.js`.

The B009 PR adds these two paths to the `api.github.com` allowlist in `remote-evidence.ts`, with a
transport test that other folio-integration-tests paths stay blocked. The policy entry is read by
section id `backend-integration-testing`. Its consumer stays `s013`, and B009 reads it without
changing S013.

**Rules (Q9):**
- `not_applicable`: no API tests in the repository, and with lookups on, no folio-integration-tests
  folder named after the module. The note says the search is by folder name, so tests under
  another name (mod-agreements' `erm/`) are not seen.
- `pass`: the tests found are Karate (`.feature` files with Karate syntax, or `karate-config.js`),
  with a note that the policy marks Karate provisional.
- `fail`: API tests in an unlisted framework (Postman, Bruno, Insomnia collections).
- `manual`: lookups off and no tests in the repository: "folio-integration-tests not checked; run
  with --allow-remote-lookups" (Q14). Also manual: a folder without `.feature` files, or unclear
  suites.

No agent review.

**Report (illustrative):** `B009 pass: folio-integration-tests has Karate feature files in
mod-users/. (Karate is listed as provisional on the supported-technologies page.)`

## B010 Data segregated by tenant at the storage layer

**Evidence (safe mode):** persistence framework and tenant mechanism (E6); red flags: RMB
`PostgresClient.getInstance(vertx)` without a tenant, Spring `DataSource`/`JdbcTemplate` use
outside folio-spring-base's tenant context, writes to `public` tables, Grails domain classes not
`MultiTenant`.

**Rules:** `not_applicable` without storage. Always `manual` otherwise.

**Checklist:** B010-C1 Every table the module writes is in a per-tenant schema; B010-C2 Each red
flag stores no tenant data in a shared place; B010-C3 Caches and files keyed by tenant
(shared with B015).

**Agent (default):** reviews the persistence layer and each red flag. **Runtime (Q5):** schemas
per tenant and tables in `public`.

**Report:** `B010 manual: The module stores data with RMB's PostgresClient, which keeps each
tenant in its own schema; no shared-schema use was found. A reviewer must confirm.`

## B011 No access to other modules' DB schemas (FQM excepted)

**Evidence (safe mode):** SQL, Liquibase changelogs and Java/Groovy/Kotlin strings, after
stripping comments (`--`, `/* */`, `//`). A match needs a tenant placeholder or a tenant
concatenation before `_mod_<x>`, where `<x>` is not the module itself:
- `${myuniversity}_mod_<x>`, `${tenant}_mod_<x>`, `{tenant}_mod_<x>`;
- `tenantId + "_mod_<x>"` and `String.format("%s_mod_<x>", …)`.

A literal tenant such as `diku_mod_…` does not count (mod-inventory-storage's commented-out
`'diku_mod_kb_ebsco_java'`). FQM configuration (`fqm-config.toml`) and mod-fqm-manager are exempt.

**Migration, per framework:**
- RMB: a script in `schema.json` `scripts` with `fromModuleVersion` (runs once when upgrading
  from an older version);
- Spring: a Liquibase changeset (runs once per tenant);
- Grails: a database-migration changelog.

An RMB script without `fromModuleVersion` runs on every install and is not a migration.

**Rules:** `not_applicable` without storage evidence.
- `fail`: a reference in production code or in an RMB script that runs on every install.
- `manual`: references inside migrations (Q11; mod-circulation-storage's
  `migrate_circulation_settings.sql`, which reads `mod_configuration` and `mod_settings`);
  schema names built at runtime that the pattern cannot resolve.
- `pass`: none found.

**Checklist:** B011-C1 Each reference is unreachable, FQM, or an accepted one-time migration.

**Agent (default):** classifies each reference and searches for dynamically built schema names
(`discovered:schema:<n>`).

**Report:** `B011 manual: An upgrade script reads other modules' schemas:
migrate_circulation_settings.sql:26 selects from ${myuniversity}_mod_configuration.config_data,
and lines 49 and 64 read ${myuniversity}_mod_settings.settings. It runs only when upgrading from
version 17.5.0 or earlier (schema.json). A reviewer must decide whether this one-time migration is
acceptable.`

## B012 Non-interface dependencies declared in README.md

**Evidence (safe mode):** infrastructure from `backendEvidence`:
- PostgreSQL from storage evidence, not from the RMB dependency;
- Kafka from clients and folio-kafka-wrapper;
- OpenSearch/Elasticsearch;
- S3/MinIO;
- others from B016.

`README.md` is matched case-insensitively (`README.MD` counts) with S003's `isDocumentedInReadme`,
exported and extended with synonyms: Postgres/PostgreSQL, OpenSearch/Elasticsearch, S3/MinIO, and
AWS SSM/Parameter Store/`AwsSsm`. edge-patron's README names SSM only as `` `AwsSsm` ``, which the
word-boundary matcher misses without the synonym.

External services that are not infrastructure (SMTP, third-party APIs) are not detected
deterministically. S010's Java dependency list names client classes, mostly Okapi interface
clients, so it is not used. These services are checklist and agent items.

**Rules:** `fail`: a definite infrastructure dependency is not named (mod-users: PostgreSQL and
Kafka; mod-agreements: Kafka). `manual`: optional infrastructure not named. `pass`: every detected
infrastructure dependency is named; the checklist still lists C1 and C2 for the reviewer.

**Checklist:** B012-C1 Each external service the module calls (outside FOLIO interfaces and
listed infrastructure) is named in the README; B012-C2 Kafka topics the module consumes from or
produces for other modules are named in the README (Q17).

**Agent (when listed):** finds external services and cross-module Kafka topics (mod-search consumes
inventory events) and checks the README for each (`discovered:service:<n>`,
`discovered:topic:<n>`).

**Report:** `B012 fail: README.md does not mention PostgreSQL or Kafka, which the module uses
(RMB storage; folio-kafka-wrapper in pom.xml).`

## B013 Tenant content selected by x-okapi-tenant

**Evidence (safe mode):** tenant resolution per framework (RMB `okapiHeaders`/`TenantTool`,
folio-spring-base `FolioExecutionContext`, Grails `OkapiTenantResolver`, edge API-key tenant
mapping); red flags: tenant ids from configuration, static fields holding a tenant, caches without
tenant keys.

**Rules:** Always `manual` (edge modules included: they map an API key to a tenant and pass it on).

**Checklist:** B013-C1 Every request reads the tenant from `X-Okapi-Tenant`; B013-C2 No tenant comes
from configuration or shared state; B013-C3 Asynchronous work (Kafka consumers, timers) carries
the tenant.

**Agent (default):** reviews request handling, consumers and timers. **Runtime (Q5):** the
two-tenant visibility check with a record created in tenant A (E12); no runtime evidence when the
module has no usable POST endpoint.

**Report:** `B013 manual: Requests use folio-spring-base's FolioExecutionContext, which reads
X-Okapi-Tenant. A reviewer must confirm that Kafka consumers and scheduled jobs set the tenant.`

## B014 GET /admin/health returns 200

**Evidence (safe mode):** RMB `RestVerticle` main verticle; Spring Boot actuator with health
exposed and `base-path: /admin`; a `/admin/health` route literal (Vert.x, edge).

**Rules:** `not_applicable` for libraries. `pass`: one of the mechanisms is found. `manual`: none
found, or actuator settings that move or disable health. With the runtime harness, a 200 passes;
any other status, or no response, is manual with the response attached (never fail: the harness
does not start every dependency a health check may aggregate). No agent review.

The static pass is evidence that the framework serves the endpoint, not that it returns 200. The
report says so ("found the mechanism; not called").

**Report:** `B014 pass: Spring Boot actuator serves health at /admin (management.endpoints.web.base-path
in application.yml). The endpoint was found in configuration, not called.`

## B015 High availability

**Evidence (safe mode):** red flags (E11): HTTP sessions or sticky routing, local file writes
outside temp files cleaned in the same request, in-memory state that must be shared (caches
without TTL used as source of truth, local maps), per-instance schedulers without a lock, Vert.x
local maps.

**Rules:** Always `manual`.

**Checklist:** B015-C1 No session affinity; B015-C2 No data kept only on local disk; B015-C3
In-memory state is a cache that can be rebuilt; B015-C4 Scheduled work runs once across instances
or is safe to repeat.

**Agent (default):** reviews each flagged site.

**Report:** `B015 manual: No sticky sessions found. 2 local file writes, 5 in-memory caches and 1
scheduled job may hold state on one instance. A reviewer must check them.`

## B016 Only OST-listed infrastructure

**Evidence (safe mode):** client libraries in production dependencies (PostgreSQL driver or RMB,
Kafka, OpenSearch/Elasticsearch clients, AWS SDK S3 or folio-s3-client, Redis, MongoDB, RabbitMQ,
ActiveMQ, Cassandra, Solr, Hazelcast client, AWS SSM/SQS/SNS, Vault), configuration keys and env
prefixes; the committed policy's `infrastructure` and `fast-moving-infrastructure` sections. The
B016 PR adds `b016` to the consumer enum (`officially-supported-technologies.schema.json:148`,
`s007-officially-supported-technologies.ts:8`) and sets both sections' consumer from `future` to
`b016`, with the policy validator tests. Embedded libraries (Caffeine, embedded Hazelcast) are not
infrastructure.

**Rules:**
- `pass`: every detected infrastructure is listed. Advisory entries count as listed (MinIO and
  S3, alias `s3`), with a note that the entry is advisory.
- `fail`: a required unlisted infrastructure dependency (a direct production dependency used
  unconditionally).
- `manual`: optional or selectable backends (edge-common's Vault and AWS SSM; Q10).

Transitive dependencies are not visible in safe mode (no dependency resolution), so the report
says "direct dependencies only". Server versions are not checked (the module does not pin them).
No agent review.

**Report:** `B016 manual: The module can store secrets in HashiCorp Vault or AWS SSM, which are not
on the supported-technologies list (default: Ephemeral). Supported: none other used.`

## Overlap with S and F criteria

| Criterion | Overlap | Decision |
| --- | --- | --- |
| B001 ↔ S002 | S002: the build produces a valid descriptor (needs local commands). B001: the repository includes one | B001 validates the committed template statically; reports S002's generated result when present |
| B002 ↔ S008, F001 | S008 accepts declared interfaces; F001 is the UI twin | Read declarations from `backendEvidence`'s template; note S008 differences; reuse F001's handler index |
| B004 ↔ S010, S006 | S010 reads a filtered env list and fail-fast; S006 finds secrets in files | Own B004 collector (both lists, every name); S010 unchanged; S006 stays about committed secrets |
| B005, B007 ↔ S008 | Same descriptor | Same parsed template from `backendEvidence` |
| B009 ↔ S013, F002 | S013: unit tests and runners; F002 the UI twin | API suites only; same provisional handling as F002 |
| B012 ↔ S003, S004, S010 | S003 README matching; S004 installation docs; S010 client classes | Export S003's matcher; S010's Java list is not reused (client classes, not services) |
| B015 ↔ S010 | S010 is about dependency failure, B015 about instance state | Separate; shared signals listed once |
| B016 ↔ S007, S012 | S007 frameworks, S012 build tools | Same policy file, `infrastructure` section |

## Testing

### Offline

Fixture repositories per framework (RMB, Spring, Vert.x, Grails, edge, library), each with inputs
that catch plausible mistakes:

- Shared evidence and applicability:
  - a Vert.x module with `domain-models-runtime` but no `schema.json`, `PostgresClient` or
    datasource (mod-circulation's shape): not storage, not RMB;
  - an `edge-common` library (library, not edge);
  - a Java repository with no descriptor (ambiguous: B001 manual);
  - a multi-module layout (`*-server/src/main/java`);
  - a large binary under `src/test/` (non-material, evidence complete).
- B001: a template with `${artifactId}` (valid after substitution); a template with a placeholder
  in a number position (manual); an edge module without a template (fail).
- B002: Spring class-level `@HttpExchange("users")` with a method `@GetExchange("/{id}")`; an RMB
  literal; a client constructed but never used.
- B003: an RMB RAML resource whose derived interface has no implementing class (manual); a handler
  absent from the spec in a Spring module (fail); a wildcard handler.
- B004:
  - variables only in `launchDescriptor.env` and top-level `env`, with no ENV_VARS.md or README
    table (fail: descriptors are not documentation);
  - a README table that names every variable but has no required/optional column (fail);
  - the same variables in a bullet list (fail: only tables count);
  - an ENV_VARS.md table with every column (C1 clean);
  - a variable documented as required with a default in the table or a top-level `env.value`
    (fail);
  - a variable documented as required with only a `launchDescriptor` value (not a default; no
    fail);
  - `AWS_URL` with and without `S3_URL`, in both modes;
  - a non-matching name such as `JAVA_OPTIONS` (collected; S010 would drop it);
  - a Spring placeholder missing from the descriptor;
  - a Groovy `${CONST}` string (not a variable).
- B005: `users.settings` (fail); `Users-Settings` (manual); a version `${okapiInterfaceVersion}`
  resolved from `gradle.properties` (pass) and unresolvable (manual).
- B007: a handler requiring `x.all`; an undefined permission; a public handler.
- B006: a `$ref`'d OpenAPI path; a RAML-only RMB module in both modes.
- B008: versioned `ref-data/groups-1.0.0` matched to `/groups`.
- B009: a fake transport returning a folder with and without `.feature` files; lookups off
  (manual); a blocked path outside the allowlist.
- B011: a `${myuniversity}_mod_other` reference in a migration (manual), in an every-install RMB
  script (fail) and in Java (fail); the same name in an SQL comment and with a literal tenant
  (ignored).
- B012/B016: README.MD; `AwsSsm`; Vault optional vs Redis required; MinIO advisory.
- Agent: fake-adapter accepted and rejected responses per criterion, as in F001–F007.
- Runtime harness: a stub image that serves `/admin/health` (200, then 503) and `/_/tenant`, run
  only in CI jobs that start Docker. The tests check that every labelled resource is gone after a
  normal run and after SIGINT, that the template's `dockerArgs` are ignored, and that the module
  container cannot reach the internet.

### Against real modules (safe mode, new-module mode, today's code)

| Module | B001 | B002 | B003 | B004 | B005 | B006 | B007 | B008 | B009* | B010 | B011 | B012 | B013 | B014 | B015 | B016 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mod-search | pass | manual | pass? | fail | pass | pass | manual | manual | pass | manual | pass | pass | manual | pass | manual | pass |
| mod-notes | pass | pass? | pass? | fail | pass | pass | manual | pass | pass | manual | pass | pass | manual | pass | manual | pass |
| mod-users | pass | pass? | manual | fail | fail | fail (RAML) | manual | pass | pass | manual | pass | fail | manual | pass | manual | pass |
| mod-circulation-storage | pass | pass? | pass? | fail | pass | fail (RAML) | manual | pass? | pass | manual | manual | pass | manual | pass | manual | pass |
| mod-circulation | pass | manual | pass? | fail | pass | fail | manual | n/a | pass | n/a | n/a | pass | manual | pass | manual | pass |
| mod-agreements | pass | pass? | pass? | fail | pass | manual | manual | pass? | n/a | manual | pass | fail | manual | pass | manual | pass |
| edge-patron | pass | pass? | pass? | fail | n/a | fail (RAML) | n/a | n/a | pass | n/a | n/a | pass | manual | pass | manual | manual |
| mod-inventory-storage | pass | pass? | pass? | fail | pass | fail (RAML) | manual | pass | n/a | manual | pass | pass | manual | pass | manual | pass |
| folio-spring-base | n/a | n/a | n/a | manual | n/a | n/a | n/a | n/a | n/a | manual | pass | pass | n/a | n/a | manual | pass |

`?` marks results that depend on extractor coverage still to be measured in the PR. `*` B009 with
`--allow-remote-lookups`, and only if the folder has `.feature` files; manual without lookups
(Q14). mod-agreements is n/a because its tests are in `erm/`, not a folder named after it.

Version 2 rules behind specific cells:
- mod-circulation: B008, B010 and B011 are n/a and B012 passes because `domain-models-runtime` is
  not storage evidence. B003 is "pass?" because it is plain Vert.x: handlers match route literals
  (the 3 RAML gaps are registered in `CirculationVerticle.java:98`, `ItemsByInstanceResource.java:27`
  and `PrintEventsResource.java:45`).
- mod-agreements: B005 passes because `${okapiInterfaceVersion}` resolves to 7.5.
- mod-users: B008 passes via the `addresstypes` and `groups` folders.
- edge-patron: B012 passes via the `AwsSsm` synonym.
- mod-inventory-storage: B011 passes because comments are stripped and literal tenants ignored.

In `--existing-module` mode:
- B004 becomes manual for every module except mod-users, which still fails C3 (`AWS_` names
  without `S3_` equivalents, required by section 5.1).
- mod-users' B005 becomes manual.
- B006 passes for mod-circulation-storage and mod-inventory-storage, stays manual for mod-users
  (library-provided custom-field endpoints) and fails for mod-circulation (3 undocumented
  endpoints). edge-patron's RAML is not covered by the RMB exception.

## Implementation order (one PR per criterion)

Prerequisites: PR 0 (`classifyModuleKind`) merged as #69; F PRs 1–2 for
the checklist, report branch and agent contract; F PR 3 for the handler index (B002 only).

1. **B001** with `backendEvidence`: include filter, descriptor template parsing with build-property
   placeholder resolution, framework, storage and edge detection, the `ambiguous` and
   `edge-common*` applicability rules, and the `--existing-module` flag.
2. **B006** (spec parsing with `$ref` resolution).
3. **B003** (route inventory with the pinned naming rule; reuses B006's specs).
4. **B005** (interface names; uses B003's route inventory).
5. **B007** (permissions; first agent PR: `optInOnly` registry flag, `[SFB]` skip regex, the 600 s
   backend timeout, interface-grouped obligations, and the three-module cost measurement that
   fixes the default set).
6. **B014** (framework health mechanisms).
7. **B016** (infrastructure detection; `b016` policy consumer).
8. **B012** (README; export S003's matcher; reuses B016).
9. **B004** (five sub-checks; its own env collector; agent review).
10. **B009** (API suites; folio-integration-tests allowlist change with a transport test).
11. **B002** (outbound calls; after F PR 3).
12. **B008** (reference data).
13. **B011** (schema references; agent review).
14. **B010** (agent review).
15. **B013** (agent review).
16. **B015** (agent review).
17. **Runtime harness** (Q5), if approved: the isolation rules above, the B014 decision, evidence
    for B003, B008, B010 and B013, and the `criterion-notes.md` and `--help` updates.

Each PR replaces its placeholder entry in `criteria-definitions.ts` and updates
`docs/criterion-notes.md`, `docs/agent-review.md` when it adds agent review, the README criteria
list and the HTML short-name table.

## Decisions

The user answered every question on 2026-10-23. All answers are the recommendation (A) except Q2.

| | Question | Decision |
| --- | --- | --- |
| Q1 | Add an `--existing-module` evaluation flag? | **A.** Yes, default new-module. It relaxes B004 C1 and B005 naming, and allows RAML in B006 for RMB modules. |
| Q2 | Does `launchDescriptor.env` count as documentation? | **B.** No. Only `ENV_VARS.md` or a README table counts. Descriptor env lists (`launchDescriptor.env` and top-level `env`) are inputs that say which variables exist, not documentation. |
| Q3 | Does an undeclared consumed interface fail B002? | **A.** No, manual. The only candidate in eight modules is dead code. |
| Q4 | Is the applicability table right for edge modules and libraries? | **A.** As proposed, including the ambiguous column. |
| Q5 | Build the Docker runtime harness? | **A.** Yes, as the last PR, behind `--allow-runtime-checks`; it decides only B014. |
| Q6 | Which B criteria get agent review by default? | **A.** B004, B007, B010, B011, B013 and B015 when manual; B002, B003, B008 and B012 only when listed. |
| Q7 | Do permission-naming deviations fail B007? | **A.** No, manual with the list. B007 fails only on a required `*.all` or undefined permission. |
| Q8 | Does B004 fail on documentation gaps? | **A.** Fail in new-module mode, manual in existing-module mode. |
| Q9 | Do folio-integration-tests suites count as provided for B009? | **A.** Yes, with `--allow-remote-lookups`; Karate passes with a provisional note. |
| Q10 | How does B016 treat optional unlisted backends? | **A.** Manual (edge-common's Vault and AWS SSM). |
| Q11 | Is reading another module's schema in a migration acceptable for B011? | **A.** Manual for migrations, fail elsewhere. |
| Q12 | Must B004 C1 find each variable in `ENV_VARS.md` or a README table? | **A.** Yes, and with Q2 (B) that is the only documentation B004 accepts. Missing or incomplete documentation fails in new-module mode and is manual in existing-module mode. |
| Q13 | Should `--existing-module` relax B005 naming? | **A.** Yes, manual: renaming an interface breaks its consumers. |
| Q14 | What is B009 with lookups off and no tests in the repository? | **A.** Manual, "folio-integration-tests not checked". |
| Q15 | What trust level does the runtime harness need? | **A.** `--allow-runtime-checks` plus `--allow-local-commands`, documented as root-equivalent; a rootless Docker context is recommended, not required. |
| Q16 | Does a `--criterion-agent-criteria` list add to the defaults or replace them? | **A.** Replace, as today. |
| Q17 | Do cross-module Kafka topics count as B012 dependencies? | **A.** Yes, as a checklist and agent item only; never a fail. |

**Reading of Q2 (B).** The question offered "top-level `env` only" as option B. The answer says
only `ENV_VARS.md` or a README table counts, so version 3 treats neither descriptor env list as
documentation, and does not require a top-level `env`. If a top-level `env` should also be
required, as policy section 3.1 asks, C1 gains one more fail condition.

## Risks

| | Risk | How we notice | What we do |
| --- | --- | --- | --- |
| R1 | Extractors (routes, calls, env reads) miss framework idioms | Many manual results; per-PR real-module table | Manual, never fail on incomplete inventories; framework fixtures |
| R2 | Agent reviews on large modules time out or are rejected | Unavailable notes; per-PR measurement | Browse scope, grouped obligations, cap 25, 600 s; layers 1 and 2 still stand |
| R3 | OpenRouter budget | Provider errors | Default six; `--criterion-agent-criteria` narrows |
| R4 | Strict readings fail every module (B004, B006) | Expected-results table | `--existing-module` (Q1); questions Q7, Q8 |
| R5 | The runtime harness executes repository code with root-equivalent Docker access | Only with explicit flags | Two flags; build in a container; internal network; digest-pinned images; no repository Docker settings; dropped capabilities and limits; labelled cleanup (Q15) |
| R6 | The handler index lags new interfaces | "Path not in the index" | Manual, never fail |
| R7 | Policy pages change (env variables, permission naming) | Recorded page dates in reports | Maintainer refresh of rule tables |

## Out of scope

- Running module unit tests (S013) or the Karate suites themselves.
- Checking infrastructure server versions.
- Deploy-time checks against a shared FOLIO environment.
- Changing S002, S008 or S010 results.
- Non-Java backends. Every B entry has `languages: ['java']`, so Go (on the OST list) and Node
  backends never reach `BackendEvaluator`. Supporting them means new catalog languages and
  evaluators.

## Version 3 changes

- **Decisions recorded.** Q1–Q17 replace the open questions (see [Decisions](#decisions)).
- **B004 C1 rewritten for Q2 (B) and Q12.**
  - Only `ENV_VARS.md` or a README table counts as documentation. Descriptor env lists say which
    variables exist; they are not documentation.
  - The table must give a default, required or optional, and a description for every variable
    the module uses.
  - C2 reads required/optional from that documentation.
  - E2 gains real documentation data: no sampled module has `ENV_VARS.md`, and 4 have README
    tables (mod-search 68 of 75 variables, mod-circulation 9 of 12, edge-patron 2 of 3,
    mod-agreements 1 of 7), none with a required/optional column.
  - The report examples, fixtures and the existing-module wording follow. Expected results are
    unchanged: B004 still fails all eight modules in new-module mode.
- **Rebased onto `origin/master` `0069e91`.**
  - PR 0 merged as #69. Its `classifyModuleKind` checks for a descriptor before the library
    allowlist, so the applicability section now builds on that order instead of "libraries
    first". `edge-common*` is still missing from the allowlist, and the B001 PR adds it.
  - S013 is merged and reads `backend-integration-testing` as the `s013` consumer.
  - Line references moved by #69–#74 are updated: `s008-interface-declarations.ts`,
    `license-compliance.ts`, `remote-evidence.ts`, `module-kind.ts`, `criterion-agent-review.ts`,
    `report-html-template.ts`, `committed-source.ts` and `criteria-definitions.ts`. No referenced
    function was removed by the dead-code cleanup (#71).

## Review changes

Version 2 folds in an oracle review of version 1 against the code at `a91d8cf`, the gist, both
Confluence policies, the F001–F007 design and the sampled clones. It found 23 problems: 5 high,
11 medium and 7 low.

| # | Severity | Finding | Change in version 2 |
| --- | --- | --- | --- |
| 1 | High | folio-integration-tests is not allowlisted in `remote-evidence.ts` | B009 PR adds two GET paths and a transport test |
| 2 | High | S010's env collector is private, filtered and reads one env list; its Java "external services" are client classes | Own B004 collector in `backendEvidence`; B012 uses infrastructure plus checklist/agent items |
| 3 | High | `domain-models-runtime` misclassifies mod-circulation as RMB with storage | RMB from `RestVerticle`/`schema.json`; storage needs positive evidence; mod-circulation fixture |
| 4 | High | Runtime-harness isolation underspecified (egress, published ports, `dockerArgs`, tags, limits, cleanup, root-equivalent Docker) | Isolation rules: build container, `--internal` network with probe container, digests, env pairs only, cap-drop and limits, labelled cleanup; doc updates; Q15 |
| 5 | High | B014 runtime "fail after healthy start" fails modules because of the harness | 200 passes; anything else manual with the response |
| 6 | Medium | Binaries and oversized files would make every module's evidence incomplete | Include filter; non-material outside it |
| 7 | Medium | "Run only when listed" contradicts today's list semantics | `optInOnly` flag, `notRunReason`, `[SFB]` regex; list replaces defaults (Q16) |
| 8 | Medium | PR order hides dependencies (B005 on B003, B007 on B002, storage detection) | New order: B001 (with storage), B006, B003, B005, B007…; B007 agent browses calls itself |
| 9 | Medium | B005 fails mod-agreements' `${okapiInterfaceVersion}` | Resolve from build properties; unresolved → manual |
| 10 | Medium | B011 matches a SQL comment in mod-inventory-storage; "migration" undefined | Strip comments; require tenant placeholder or concatenation; migration per framework; `mod_settings` reads added |
| 11 | Medium | B008 vocabulary patterns miss mod-users | Vocabularies also from reference-data folder names and load paths |
| 12 | Medium | B004 misses ENV_VARS.md; `launchDescriptor` values are not defaults; existing-mode note wrong; AWS count | C1 second location (Q12); top-level `value` only; note corrected; 5 `AWS_` plus `AWS_SDK` |
| 13 | Medium | No rule for `ambiguous`; `edge-common` would be an edge module | `ambiguous` column; libraries classified first; `edge-common*` allowlisted |
| 14 | Medium | B003 "complete inventory" impossible (generated interfaces not committed); multi-module paths | Spec plus pinned naming rule; fail only when a handler is in neither spec nor routes; `**/src/main/**` |
| 15 | Medium | Agent cost and time unmeasured and optimistic; no obligation ordering | Estimate 18–60 min; 600 s backend timeout; grouped, ordered obligations; measure in B007 PR |
| 16 | Medium | B012 ignores Kafka-topic dependencies; edge-patron's `AwsSsm` missed | B012-C2 checklist and agent item (Q17); `AwsSsm` synonym |
| 17 | Low | B009: lookups-off n/a conflates; folder ≠ Karate; S013 section consumer | Manual when lookups off (Q14); `.feature` check; consumer unchanged |
| 18 | Low | B016 policy consumer enum; advisory MinIO; transitive dependencies | `b016` consumer; advisory counts as listed with a note; "direct dependencies only" |
| 19 | Low | "Lowercase" is not in the naming guide | Dots and underscores fail; uppercase manual |
| 20 | Low | Numbers: camelCase 25, reference-data 16, handler entries vs unique pairs | Corrected, with the counting method stated |
| 21 | Low | Non-Java backends never get B results | Out of scope, stated |
| 22 | Low | B013 runtime fallback to reference data cannot show isolation | Created record only |
| 23 | Low | S008 can read a different descriptor than `backendEvidence` | B002 uses the committed template; notes S008 differences |

**Where version 2 is looser than the oracle suggested:**

- **Runtime harness trust (finding 4, Q15):** the oracle asked whether a dedicated rootless Docker
  context should be required. Version 2 recommends it but does not require it: the harness runs
  only under two explicit flags, on disposable orbs, and rootless Docker is not set up in orbs
  today. The isolation rules apply either way.
- **B009 folder matching (finding 17):** tests are looked up only in a folder named after the
  module. mod-agreements' `erm/` folder is missed and reported as n/a with a note, rather than
  maintaining an alias table.
- **B005 in existing-module mode (Q13):** naming violations become manual, although the gist's
  existing-module exception covers only B006.
- **B014 static pass:** the oracle did not ask to change it, but a pass on framework evidence
  alone is looser than the criterion's "returns 200". The report says the endpoint was not
  called.
