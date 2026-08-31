# Changelog

Entries run from the newest release to the oldest. Every entry names its version, its date
and what changed, and contract changes are listed apart from the rest: a renamed JSON field
or a moved exit code is what makes a caller rewrite its calls.

Versioning follows what a caller would break on, not calendar time. A change to the JSON
contract — a renamed or removed field of a `--json` answer, or a moved exit code — raises the
major number. A new command or flag raises the minor number. A wording change to a skill,
a template or a message printed to a person raises the patch number.

## 1.1.0 — 2026-08-30

Windows. Three defects the run on three systems brought out, and none of them touches
the shape of an answer: no field is renamed, `outputVersion` stays `1`, and the exit
codes are the ones 1.0.0 gave.

### Contract

- A path in an answer is written with `/` on every system. Only the form of the value
  changes, and only on Windows, where a path used to carry the separator of the system.
  A path handed to a command in an argument comes back as it was passed.

### Other

- Reading an artifact no longer depends on the line endings of the file. A delta spec,
  a plan, a main spec or a configuration written with `\r\n` gives the same findings,
  the same line numbers and the same exit code as one written with `\n`. On Windows
  `validate --strict` used to answer `0` on a spec it had to reject, and say nothing.
- `doctor` finds the command on PATH on Windows: the search goes through the extensions
  of `PATHEXT`, where that system keeps what may be run. The execute bit is still
  required on Linux and macOS, and a directory of that name is still not a command.
- `doctor` no longer reports a healthy Windows installation as two. The name on PATH there
  resolves to a wrapper, `lexforge.cmd`, and the wrapper starts the JavaScript beside it:
  what is compared is the tree they live in, not the two paths.
- `evidence record` refuses to stamp a command Windows could not start. Its shell answers
  the same number for a name it cannot find and for a check that failed, so the question
  asked there is whether the first word of the command lies on PATH.
- The suite runs on Linux, macOS and Windows, on Node 20.19 and 22, on every push and
  every pull request.

## 1.0.0 — 2026-08-30

First published release.

### Contract

- Commands `init`, `new change`, `status`, `instructions`, `validate`, `check plan`,
  `evidence record`, `check evidence`, `verify`, `archive` and `doctor`, each answering
  `--json` with `outputVersion: 1` and a `nextStep`.
- Three exit codes and no others: `0` no findings, `1` a finding, `2` a call not carried out.
- `lexforge --version` prints the version of the installed package and exits `0`.
- The install manifest carries the package version that wrote it: a package updated without
  a matching `init --tools` is a finding `doctor` reports, naming both versions.

### Other

- Nine skills installed into the directory of a named agent, with an install manifest
  written next to it.
- Two built-in schemas, `spec-driven` and `bounded`, with seven artifact templates.
- `doctor` assembles six installation health checks into one answer: workspace and
  configuration, verification labels, installed skills, command name on PATH, git
  repository, and the Node version required by the package.
- A freshly installed package walks through `init` and `doctor` without a build step or a
  development checkout.
