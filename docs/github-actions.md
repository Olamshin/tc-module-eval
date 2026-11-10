# GitHub Actions

## Integrate with Your FOLIO Module Repository

To run evaluations from your FOLIO module repository, add this workflow file at `.github/workflows/tc-evaluation.yml`:

```yaml
name: TC Module Evaluation

on:
  workflow_dispatch:
    inputs:
      ref:
        description: 'Git ref to evaluate (defaults to current ref)'
        required: false
        type: string
      output_format:
        description: 'Report format'
        required: false
        type: choice
        options:
          - both
          - json-only
          - html-only
        default: 'both'
      criteria_filter:
        description: 'Comma-separated criterion IDs (e.g., S001,S002,B005). Leave empty for all.'
        required: false
        type: string
      java_version:
        description: 'Java version'
        required: false
        type: string
        default: '21'
      node_version:
        description: 'Node.js version'
        required: false
        type: string
        default: '24'

jobs:
  evaluate:
    permissions:
      contents: read
    uses: folio-org/tc-module-eval/.github/workflows/evaluate.yml@master
    with:
      ref: ${{ inputs.ref }}
      output_format: ${{ inputs.output_format }}
      criteria_filter: ${{ inputs.criteria_filter }}
      java_version: ${{ inputs.java_version }}
      node_version: ${{ inputs.node_version }}
```

This creates a workflow you can trigger manually from the Actions tab. Reports are uploaded as artifacts.

### Inputs

All inputs are optional:

| Input | Description | Default |
|-------|-------------|---------|
| `ref` | Git ref to evaluate | Triggering ref (PR head or push ref) |
| `output_format` | Report format: `both`, `json-only`, or `html-only` | `both` |
| `criteria_filter` | Comma-separated criterion IDs to evaluate (e.g., `S001,S002,B005`) | All criteria |
| `java_version` | Java version for Maven/Gradle builds | `21` |
| `node_version` | Node.js version for npm builds | `24` |
| `evaluator_ref` | tc-module-eval branch/tag to use | `master` |
| `allow_remote_lookups` | Allow read-only lookups of SonarCloud, platform-lsp and FAR, needed for S011, S013 and S014 (the job's read-only `GITHUB_TOKEN` is then sent to api.github.com only) | `false` |
| `platform_ref` | platform-lsp branch, tag or commit S014 reads | `snapshot` |
| `existing_module` | Evaluate an existing module rather than a new one (passes `--existing-module`) | `false` |

### Outputs

The workflow provides these outputs for use in downstream jobs:

| Output | Description |
|--------|-------------|
| `report_artifact` | Name of the uploaded artifact containing reports |
| `passed` | Number of passed criteria |
| `failed` | Number of failed criteria |
| `manual` | Number of criteria requiring manual review |

**Note:** The `passed`, `failed`, and `manual` outputs are parsed from the JSON report. If `output_format` is `html-only`, these values will be 0.

### Examples

**Evaluate Specific Criteria:**

```yaml
jobs:
  evaluate:
    permissions:
      contents: read
    uses: folio-org/tc-module-eval/.github/workflows/evaluate.yml@master
    with:
      criteria_filter: 'S001,S002,S003,B005'
```

**Use Evaluation Results in Downstream Job:**

```yaml
jobs:
  evaluate:
    permissions:
      contents: read
    uses: folio-org/tc-module-eval/.github/workflows/evaluate.yml@master

  report:
    permissions: {}
    needs: evaluate
    runs-on: ubuntu-latest
    steps:
      - name: Check results
        env:
          PASSED: ${{ needs.evaluate.outputs.passed }}
          FAILED: ${{ needs.evaluate.outputs.failed }}
          MANUAL: ${{ needs.evaluate.outputs.manual }}
        run: |
          echo "Passed: $PASSED"
          echo "Failed: $FAILED"
          echo "Manual: $MANUAL"

      - name: Fail if any criteria failed
        if: needs.evaluate.outputs.failed != '0'
        run: exit 1
```

### Versioning

- Use `@master` for the latest version
- Use a specific commit SHA for pinned versions (e.g., `@abc1234`)

## Web Interface

To evaluate any repository without adding a workflow to it:

1. In this tc-module-eval project, go to [Actions > Evaluate Remote Repository](https://github.com/folio-org/tc-module-eval/actions/workflows/evaluate-remote.yml).

1. Click Run Workflow, enter the GitHub URL of the module to evaluate, and click Run Workflow. To check S011, S013 and S014, and folio-integration-tests for B009, also tick remote lookups.

1. Wait for the workflow to complete, then download the reports from Artifacts.
