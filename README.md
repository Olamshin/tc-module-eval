# FOLIO Module Evaluator

A CLI for evaluating FOLIO modules against technical council criteria.

Copyright (C) 2025-2027 The Open Library Foundation

This software is distributed under the terms of the Apache License,
Version 2.0. See the file "[LICENSE](LICENSE)" for more information.

## Overview

`folio-eval` clones a module repository, checks it against the
[FOLIO module acceptance criteria](https://github.com/folio-org/tech-council/blob/master/MODULE_ACCEPTANCE_CRITERIA.MD),
and writes an HTML and a JSON report. Each criterion passes, fails, or is left to a reviewer
with a checklist.

**⚠️ WARNING**: Some options run the evaluated repository's build commands and code. Run untrusted
repositories only in an isolated environment, such as the devcontainer in `.devcontainer/` or a CI
runner. See [Security](docs/security.md).

## Quick Start

Requires Node.js 24 or later and Yarn 1.22 or later.

```bash
yarn install
yarn build
yarn global add .   # optional: puts folio-eval on the PATH; otherwise use node dist/cli.js

# Evaluate a repository
folio-eval evaluate https://github.com/folio-org/mod-search

# Evaluate specific criteria only, with a custom output directory
folio-eval evaluate <repo-url> --criteria S001,S002,B005 --output ./my-reports

# Allow the build commands some criteria need (trusted repositories only)
folio-eval evaluate <repo-url> --allow-local-commands

# Read SonarCloud, platform-lsp and FAR for S011, S013 and S014
folio-eval evaluate <repo-url> --allow-remote-lookups
```

To run the evaluator from GitHub Actions instead, see [GitHub Actions](docs/github-actions.md).

## Development

```bash
yarn test:unit --runInBand   # unit tests
yarn build                   # type-check and compile
yarn jest --runInBand        # full suite, including network tests; run it in an isolated environment
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, architecture and CLI options.

## Documentation

- [Usage](docs/usage.md): CLI examples, remote lookups, the backend runtime harness and agent review
- [GitHub Actions](docs/github-actions.md): the reusable workflow and the web interface
- [Security](docs/security.md): what the evaluator runs and what reports contain
- [Criteria Overview](docs/criteria.md) and [Criterion Notes](docs/criterion-notes.md): what each criterion checks
- [Agent Review Configuration](docs/agent-review.md): optional OpenCode review of manual and failed results
- [License List Management](LICENSE_LIST_MANAGEMENT.md): how the license policy files are maintained

## License

Apache-2.0 License
