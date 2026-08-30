# Changelog

Entries run from the newest release to the oldest. Every entry names its version, its date
and what changed, and contract changes are listed apart from the rest: a renamed JSON field
or a moved exit code is what makes a caller rewrite its calls.

Versioning follows what a caller would break on, not calendar time. A change to the JSON
contract — a renamed or removed field of a `--json` answer, or a moved exit code — raises the
major number. A new command or flag raises the minor number. A wording change to a skill,
a template or a message printed to a person raises the patch number.

## 1.0.0 — 2026-08-30

First published release.

### Contract

- Command `doctor`, answering `--json` with `outputVersion: 1` and a `nextStep`, joins the
  ten commands already carrying the same contract.
- `lexforge --version` prints the version of the installed package and exits `0`.
- The install manifest carries the package version that wrote it: a package updated without
  a matching `init --tools` is a finding `doctor` reports, naming both versions.

### Other

- `doctor` assembles six installation health checks into one answer: workspace and
  configuration, verification labels, installed skills, command name on PATH, git
  repository, and the Node version required by the package.
- A freshly installed package walks through `init` and `doctor` without a build step or a
  development checkout.

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
