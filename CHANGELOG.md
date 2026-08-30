# Changelog

Entries run from the newest release to the oldest. Every entry names its version, its date
and what changed, and contract changes are listed apart from the rest: a renamed JSON field
or a moved exit code is what makes a caller rewrite its calls.

## 0.1.0 — 2026-08-30

First packaged build.

### Contract

- Commands `init`, `new change`, `status`, `instructions`, `validate`, `check plan`,
  `evidence record`, `check evidence`, `verify` and `archive`, each answering `--json`
  with `outputVersion: 1` and a `nextStep`.
- Three exit codes and no others: `0` no findings, `1` a finding, `2` a call not carried out.

### Other

- Nine skills installed into the directory of a named agent, with an install manifest
  written next to it.
- Two built-in schemas, `spec-driven` and `bounded`, with seven artifact templates.
