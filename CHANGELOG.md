# Changelog

Entries run from the newest release to the oldest. Every entry names its version, its date
and what changed, and contract changes are listed apart from the rest: a renamed JSON field
or a moved exit code is what makes a caller rewrite its calls.

Versioning follows what a caller would break on, not calendar time. A change to the JSON
contract — a renamed or removed field of a `--json` answer, or a moved exit code — raises the
major number. A new command or flag raises the minor number. A wording change to a skill,
a template or a message printed to a person raises the patch number.

## 1.3.0 — 2026-09-05

Model sets per runtime, and the roles removed. Agents of different vendors work in one
repository, each resolving its own model out of one `lexforge/config.yaml`, and every skill
carries the model it wants when the project names none. The three roles are gone: the choice
they held moved into the skills, where it needs no setting up per project.

### Contract

- `instructions` and `status --change` take `--tool <name>`, the runtime the call comes from.
  A call that names none resolves against the top level of the `models` section, as before.
- The `role` field is removed from the `instructions` answer, from every entry of `stages`
  and from every artifact of `status --change`. `provider` and `model` stay where they were.
- The `models` section takes `tools`, one entry per runtime, each naming a provider and a
  model. An entry decides alone: the top-level `default` is not read for a runtime that has
  one. The section no longer takes `analysis`, `development` or `review`; a key left over
  from them is ignored, and no command refuses because of it.

### Other

- `lexforge init --tools claude,codex` writes a `tools` entry for each named runtime that has
  a vendor of its own and no top-level `default`. `cursor`, `opencode` and `agents` front
  several vendors and get no entry.
- Every skill opens with a model block: the model it runs on, one line per provider of the
  shipped catalogue. The planning skills and the completion check name the strong model of a
  provider, the implementation and debugging skills the middle one, and archival names none.
  A model named by the project replaces what the block names.
- Upgrading means upgrading the package and reinstalling the skills together, with one
  `lexforge init --tools <list>`: a skill of this version calls an option the previous CLI
  does not know.

## 1.2.0 — 2026-08-31

Model assignment. A project names which model each stage of a change runs on, and the
skills hand the work to that model instead of writing it themselves. Nothing is renamed
and nothing is removed: `outputVersion` stays `1`, the exit codes are the ones 1.1.0
gave, and a project without the new section behaves exactly as before.

### Contract

- `instructions` answers with three more fields: `role`, `provider` and `model` of the
  requested artifact. A project with no assignment gets the role filled and the other two
  empty.
- `status --change` answers with `stages`: one entry per stage of the pipeline, including
  the four that write no artifact, each with `stage`, `role`, `provider` and `model`.
  Archival comes back with all three empty, because it carries no role.
- Every artifact of `status --change` carries `role` and `model` beside its status.

### Other

- `lexforge/config.yaml` reads a `models` section: a `default` naming a provider and a
  model, optional overrides for the roles `analysis`, `development` and `review`, and a
  `providers` catalogue. A role left out falls back to the `default`; an incomplete
  section is not refused, and a role that is not a mapping of a provider and a model is,
  with exit code `2` naming the role.
- `lexforge init` writes that section into a new project and seeds the catalogue from the
  list shipped with the installed version. An existing `config.yaml` is left byte for
  byte as it was, the missing section included.
- Names are never checked against the catalogue: a model released after the installation
  is passed through exactly as the config wrote it.
- The nine skills carry one model gate, word for word the same in all of them: work in
  silence when the model matches, hand the work to a subagent on the assigned model when
  it does not, and stop without writing when that model cannot be reached.
- `README.md` and `README.ru.md` carry the section on the assignment: the three roles,
  the block to paste, what a project installed earlier does, and which runtime the
  handover is confirmed in.

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
