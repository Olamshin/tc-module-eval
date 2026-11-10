# Usage

Read [Security](security.md) before evaluating a repository: some options run its build and code.

## Command Line Interface

```bash
# Evaluate a repository
folio-eval evaluate https://github.com/folio-org/mod-search

# Evaluate specific criteria only
folio-eval evaluate <repo-url> --criteria S001,S002,B005

# Custom output directory or format
folio-eval evaluate <repo-url> --output ./my-reports --json-only

# Measure a UI module's pages on a test environment with axe-core (F004)
FOLIO_UI_USERNAME=<test user> FOLIO_UI_PASSWORD=<password> folio-eval evaluate https://github.com/folio-org/ui-users \
  --criteria F004 --ui-runtime-url https://folio-etesting-snapshot-diku.ci.folio.org \
  --ui-runtime-login-origin https://folio-etesting-snapshot-keycloak.ci.folio.org --ui-runtime-chrome /path/to/chrome

# Build and run a trusted backend module in Docker (root-equivalent; use a disposable host)
folio-eval evaluate https://github.com/folio-org/mod-notes --allow-local-commands --allow-runtime-checks

# List supported languages
folio-eval list-languages
```

For all CLI options, see [CONTRIBUTING.md](../CONTRIBUTING.md#cli-options).

## Remote Lookups

Evaluation is offline by default, apart from the optional runtime UI probe of F004 and F007 and the image pulls and dependency downloads of the optional backend runtime harness. S011 (SonarQube findings) and S013 (test coverage) need to read
SonarCloud, and S014 (assigned to exactly one application on the FOLIO LSP platform) needs to read
`folio-org/platform-lsp` and FAR, so all three are `manual` unless you opt in. B009 (API tests) also
reads `folio-org/folio-integration-tests` when you do:

```bash
folio-eval evaluate https://github.com/folio-org/mod-search --allow-remote-lookups
```

`--platform-ref` picks the
platform-lsp branch, tag or commit (default `snapshot`). Remote reads are read-only, allowlisted and
bounded, and each one is recorded in the report. An optional `SONAR_TOKEN` is sent to SonarCloud only;
S011 reads SonarCloud's own project settings only when that token can administer the project. See
[Criterion Notes](criterion-notes.md#remote-lookups).

## Backend Runtime Harness

With `--allow-runtime-checks` and `--allow-local-commands`, the evaluator builds a backend module in a
pinned Maven or Gradle container, builds its image with the repository's `Dockerfile`, and runs it with
PostgreSQL and Kafka as needed on an internal Docker network without internet or host access and
without published ports. A probe container calls `GET /admin/health`, initializes two tenants with
reference data, and calls the module's GET endpoints. B014 is decided by the health check's answer.
B003 (GET statuses), B008 (tenant initialization and record counts), B010 (schemas and the tables in
`public`) and B013 (whether a record created in one tenant is visible in the other) show informational
evidence that never changes their status. Every container, network, volume and image is labelled with the
run and removed afterwards, also on Ctrl-C. It needs a reachable Docker daemon. See
[Criterion Notes](criterion-notes.md#backend-runtime-harness).

## Agent Review

Some criteria can optionally add advisory OpenCode review to manual and failed results; for a fail, the agent explains each failure in plain words. See [Agent Review Configuration](agent-review.md) for provider setup, CLI flags, supported criteria, and GitHub Actions notes.

## Refresh the S008 Interface Catalog

Maintainers acquire a review bundle for an exact Platform LSP baseline with `yarn acquire:s008-catalog`. It never modifies the checked-in S008 catalog or acceptance ledger. See [S008 Interface Acceptance](s008-interface-acceptance.md#catalog-refresh) for the command, its output and the review procedure.
