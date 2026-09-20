# LexForge

[![lexforge on npm](https://img.shields.io/npm/v/lexforge.svg)](https://www.npmjs.com/package/lexforge)
[![CI](https://github.com/shepaland/LexForge/actions/workflows/ci.yml/badge.svg)](https://github.com/shepaland/LexForge/actions/workflows/ci.yml)
[![license MIT](https://img.shields.io/npm/l/lexforge.svg)](LICENSE)

**English** · [Русский](README.ru.md)

A spec-driven pipeline for coding agents, with gates the agent cannot skip. Nine skills carry
a change from the request to the archived spec, and `lexforge verify` answers with an exit code
whether the work is done: a completion claim with no fresh command output behind it does not pass.

![The agent says the change is done; `lexforge verify` answers exit 1 until the checks have actually been run](https://raw.githubusercontent.com/shepaland/LexForge/main/docs/media/verify.gif)

The agent has written the code and ticked every box. `verify` answers `1`: the ledger holds no
stamp for either check. `evidence record` runs the command itself and writes the stamp, and only
then does `verify` answer `0`. That change is kept in [`examples/notes`](examples/notes).

LexForge is built out of two systems: the artifacts and the machine-checkable shape of requirements
come from **OpenSpec**, the gates and behavioural rules for the agent from **superpowers**.

## Quick start

```bash
npm install -g lexforge       # the skills call the command by this name on PATH
lexforge init --tools claude  # agents · claude · codex · cursor · opencode
lexforge doctor               # six conditions, each named with or without a finding
```

Then ask the agent for work in the usual words — "add X", "fix Y". The `lexforge` skill names the
class of work and the pipeline starts from there; the steps in full are in
[First run](#first-run).

## What's new in 1.3.0

Agents of different vendors work in one repository, and every skill carries the model it
wants.

- The `models` section of `lexforge/config.yaml` holds an entry per runtime. A stage
  resolves against the entry of the runtime the call comes from, and that entry decides
  alone, so a Codex agent never lands on a Claude model because a Claude agent works here
  too.
- `lexforge instructions` and `lexforge status` take `--tool <name>`. The runtime is named
  by the caller: LexForge reads no environment variable and infers nothing.
- Every skill opens with a model block - the model it runs on, one line per provider. The
  planning skills and the completion check name the strong model of a provider, the
  implementation and debugging skills the middle one, archival names none. A model named by
  the project replaces the block.
- The three roles are gone, and with them the `role` field of the answers. A role key left
  in a `config.yaml` is ignored, and no command refuses because of it.
- Upgrading means upgrading the package and reinstalling the skills together, with one
  `lexforge init --tools <list>`: a skill of this version calls an option 1.2.0 does not
  know. Details in [Model assignment](#model-assignment).

## What's new in 1.4.0

`lexforge-apply` runs independent sections of a plan at the same time, and a defect ledger
holds what a review finds without stopping the work on every one of them.

- Each section heading of `tasks.md` carries a `Depends on:` line — `none`, or the numbers of
  the sections it needs closed first. The sections whose dependencies are closed form one
  wave, and `lexforge-apply` hands each of them to its own executor. A section that is ready
  alone runs task by task in the same session.
- `check plan` gains seven rules about a plan's sections: a missing line, a value it cannot
  read, a repeated line, a repeated section number, an unknown dependency, a cycle, and one
  file named by two sections that become ready at the same moment.
- `lexforge defect record`, `lexforge defect close` and `lexforge defect list` keep the ledger
  at `lexforge/defects.json`. A review records what it finds at one of three levels,
  `critical`, `important` or `minor`, without stopping to fix it on the spot.
- The ledger sits beside `lexforge/config.yaml`, is committed with the repository, and stays
  there when a change moves into the archive. An entry outlives the change it was found in.
- An open `critical` or `important` entry against the change blocks `verify` and `archive` the
  way a stale stamp already does. An open `minor` blocks nothing: it is named in the report,
  recorded in the ledger, and the change archives with it open. Both commands answer with a
  fourth count on `summary`, `openDefects`.
- Two pauses are gone. A skill that meets `workspace-not-found` runs
  `lexforge init --tools <your runtime>` at the project root itself and carries on. A planning
  skill that finishes an artifact runs the next step the command named, and stops at the
  boundary of planning, where `isPlanningComplete` turns `true`.

A `tasks.md` written before this release carries no `Depends on:` line, so `check plan`
reports one finding per section until it is added. `npm install lexforge@1.4.0` and
`lexforge init --tools <list>` bring the package and the skills current; the lines themselves
are added to the plan by hand.

## What's new in 1.5.0

An executor handed a section starts no agent at all, and a ticked task rests on a failing run
the command itself performed and recorded.

- An executor starts no agent of any type. The session that holds the plan starts every agent
  of the implementation stage. The ban reads the effect: an agent that continues the executor's
  own work instead of looking at it is forbidden whatever the runtime calls its type. The rule
  came out of a subagent that inherited a session's context, wrote eleven tasks on its own, and
  a report that called that work somebody else's.
- `lexforge evidence red --change <name> --task <id> --command <cmd>` runs the command itself
  and writes one record per task id into `red-runs.json`. No flag accepts a ready-made failing
  line, an exit code or an output tail. A run that comes back green exits `1` and writes
  nothing; a command the shell could not start exits `2` with `red-run-command-failed`.
- `verify` counts a fifth dimension and answers with a fifth number on `summary`,
  `unrecordedTasks`. The rule `task-no-red-record` names a ticked task whose first named file
  lies outside `tests/` and outside the change directory and that carries no red record. The
  age of the change buys no exemption.
- A commit, a branch or edits in the tree the executor did not make are called unaccounted,
  with their paths, the commit and the branch written out, and work stops on them. Attributing
  them to a foreign session, a parallel editor, another user or a tool running in the
  background is refused: that is a claim about a person made with no evidence.
- `tasks.md` is an index. It carries the title, the goal, the spec and one link per section,
  and a section's `Depends on:` line and tasks live in a file one path segment below it. The
  rule `section-tasks-inline` refuses a plan that keeps its tasks inside `tasks.md`, and the
  one that links a file and leaves tasks behind the link as well.
- Every task line carries a group label in square brackets after its number, such as
  `- [ ] 1.1 [A]`: letters, digits and hyphens, eight characters at most. The independent
  groups of one section go to different agents at the same time, and `check plan` refuses a
  section whose two groups name the same file. The rules are `task-missing-group-label`,
  `section-group-coverage-mismatch` and `section-group-shared-file`.
- A task whose whole work is carrying code between files without changing behaviour carries
  `(move)` after its group label and owes no red record: a move has no run to watch fail. A
  task that adds a branch, a field or a rule never carries it.
- An agent of the implementation stage works inside a budget of 300,000 tokens and reads large
  files by line ranges. A section that does not fit the budget is handed over in parts, down to
  one agent per task.
- A `.ts` file under `src/` or `tests/` ran to 330 lines at most in this release, held by
  `tests/e2e/line-limit.test.ts`. Eighteen files past that line were split by subject; the
  longest had been 1766 lines. The limit is 400 lines now and `file_limit` carries it: see
  "Line limit".

A plan written before this release keeps its sections inside `tasks.md` and carries no labels,
so `check plan` reports one finding per section and one per task until the plan is rewritten.
`npm install lexforge@1.5.0` and `lexforge init --tools <list>` bring the package and the
skills current; the index, the section files and the labels are added by hand. Tasks ticked
before this release carry no red record, and `verify` names every one of them: record the run
for each, declare the task a move where that is what it was, or clear the checkbox.

## What's new in 1.6.0

A code file has a length a change may not take it past, and the answer to a file already over
it is chosen by the owner before the plan is written, not by the agent while it types.

- `file_limit` in `lexforge/config.yaml` carries the number and the covered files: `lines`,
  400 when the key is absent, and `include`, 24 source and test extensions by default. A
  project's `include` replaces that list rather than adding to it, and a `!` pattern such as
  `!src/generated/**` leaves generated code out of the count. `lexforge init` writes the
  section commented out into a new config; an existing one is not rewritten.
- `long_files: refactor` or `long_files: keep` in a change's `.lexforge.yaml` records which
  path the change takes for files already over the limit. Any other value is refused with
  exit `2` and an error naming the field and the two values.
- `lexforge-plan` counts the files its tasks will name before it writes `tasks.md`, shows
  every one over the limit with its count, and asks which path the change takes. It never
  chooses the path itself, and a user who hands the choice back is asked again.
- `check plan` gains two rules. `long-file-without-path` names a long file the plan names
  while `long_files` is unset, with the count, the limit and both values. On the `refactor`
  path, `long-file-not-split-first` names a long file whose first task is not marked `(move)`.
- `verify` counts a sixth dimension and answers with a sixth number on `summary`,
  `filesOverLimit`. The rule `file-over-line-limit` names every covered file the change
  touched that breaks the rule of its path: the file, its count at the start of the change,
  its count now and the limit. The start count comes from the commit that brought the change
  directory in, so a file's own growth is what is judged. A file the change deleted is not
  reported, and with no `long_files` on record the `refactor` rule applies.
- An executor makes no edit that takes a covered file from within the limit to over it: the
  code goes into a new file instead. On `keep`, a file already over the limit gains no line,
  and wiring a new file into it is paid for by moving a block of at least as many lines out.
  Where no such block exists, the change goes back for re-planning on `refactor`.

A change in flight when the project upgrades is judged by the new `verify`; if it touched a
long file and records no path, it is judged as `refactor`, and adding `long_files` to its
`.lexforge.yaml` is the way on. A workspace needs no migration: a `config.yaml` with no
`file_limit` section runs on 400 lines and the default list. `npm install lexforge@1.6.0`
and `lexforge init --tools <list>` bring the package and the skills current.

## Supported platforms

| What | Value |
| --- | --- |
| Operating system | Linux, macOS and Windows — the suite runs on all three in CI |
| Node.js | 20.19.0 or newer, the version from `engines`; CI covers 20.19 and 22 |
| Agent runtime | `agents`, `claude`, `codex`, `cursor`, `opencode` |
| git | a repository with at least one commit; without it `evidence record`, `check evidence`, `verify` and `archive` answer `2`. `lexforge init` needs none |

Windows is a first-class target, not a best effort: a file is read whatever line ending it carries,
paths come back in answers with `/`, `doctor` looks the command name up through `PATHEXT`, and one
healthy installation is counted as one.

## What the merge buys you

Each donor solves half the problem and breaks without the other. OpenSpec describes the steps but
does nothing to stop an agent from walking around them; superpowers keeps the agent disciplined,
but once the branch is merged nothing is left that anyone will read later.

| Taken from | What LexForge does with it |
| --- | --- |
| OpenSpec: the order `proposal → specs → design → tasks` | the schema fixes it, `status` shows the queue, a `blocked` artifact is not written |
| OpenSpec: requirements a program can check | `### Requirement:` with `WHEN`/`THEN` scenarios, checked by `validate --strict` |
| OpenSpec: specs that stay in the repository | the delta is merged on `archive`, the change moves to `lexforge/changes/archive/` |
| superpowers: the class of work named before design | the `lexforge` skill picks the schema: spike, `bounded`, `spec-driven` |
| superpowers: TDD and subagent review | `lexforge-apply` runs both inside every task |
| superpowers: no completion claim without fresh output | `evidence record` runs the command and stamps the commit and the tree |

Neither donor had the rest. Placeholder-free plans, requirement coverage and stamp freshness are
checked by a command instead of by persuasion, and no command has a flag that turns a rule off. The
skills share state through `lexforge status --change <name> --json`, so none of them guesses what
is already done. Two duplications are cut: the design lives only in the change directory, and
`tasks.md` serves as the plan.

## How it works

```
request: "build X", "add Y", "fix Z"
    │
    ▼
skill: lexforge — names the class of work  ──►  spike: answer only, no change
    │  bounded · spec-driven
    ▼
lexforge new change <name>
    │
    ▼
PLANNING — project code is not touched. Every skill first calls
lexforge status --change <name> --json and works only on status `ready`;
on `blocked` it names what is missing and stops.
    lexforge-propose ──► proposal.md          one question at a time
    lexforge-spec    ──► specs/<cap>/spec.md  validate --strict → 0
    lexforge-design  ──► design.md            agreed section by section
    lexforge-plan    ──► tasks.md             check plan → 0
    │
    ▼  isPlanningComplete = true
IMPLEMENTATION — lexforge-apply, one task at a time
    failing test ──► implementation ──► subagent review ──► evidence record
    task grew past the spec → stop and ask the user
    │
    ▼
lexforge-verify · lexforge verify --change <name>
    CRITICAL found → back to lexforge-apply
    zero CRITICAL  → lexforge archive <change>
                     delta  → lexforge/specs/<capability>/spec.md
                     change → lexforge/changes/archive/<date>-<name>/

off the pipeline: lexforge-debug — failing test, broken build, unexpected
behaviour; it works without a LexForge workspace too.
```

## Artifacts, gates, archive

Every change lives in `lexforge/changes/<name>/`: `proposal.md`, the delta specs, `design.md` and
`tasks.md`, in the order the schema fixes.

The gates work out the state of the work themselves. `check plan` looks for work the plan has not
written down: placeholders, references to a neighbouring task, a delta requirement no task covers,
a section whose `Depends on:` line is missing, repeated or names nothing readable, a task with no
group label, two groups of one section naming the same file, and a plan that keeps its sections
inside `tasks.md` instead of linking a file for each. `evidence red` runs the command of one task
and records the failing run against that task id, and `verify` names every ticked task that writes
production code without such a record. `evidence
record` runs the verification command the project declared and stamps it with the exit code, the
commit and a fingerprint of the tree. `check evidence` compares the stamps against the code on
disk, so an edit after a run leaves a stamp stale. `verify` collects these checks, but only reads
stamps: a fresh one has to be taken before it is called.

`verify` and `archive` also read the project's defect ledger, `lexforge/defects.json`: an open
`critical` or `important` entry recorded against the change blocks both, the same way a stale
stamp does, and an open `minor` entry never blocks. `lexforge defect record --change <name>
--level <level> --file <path> --line <n> --summary <text>` adds an entry, `lexforge defect close
<id>` marks one fixed, and `lexforge defect list` reads the ledger back, narrowed by `--change`
and `--open`. The ledger holds every entry ever recorded, open or closed, and an entry outlives
the change it was found in.

`archive` merges the delta into `lexforge/specs/<capability>/spec.md` and moves the change
directory to `lexforge/changes/archive/<date>-<name>/`. The repository keeps the specs of the
shipped behaviour, plus the whole change with the stamps of its runs.

## Installation

A global install from [npm](https://www.npmjs.com/package/lexforge) puts the command on `PATH`,
which is how the skills call it. A project install pins the version and is called through `npx`:

```bash
npm install --save-dev lexforge && npx lexforge --version
```

The two ways are not equivalent. `doctor` looks for the name `lexforge` on `PATH`: with
a `devDependencies`-only install it reports `path-not-resolved`, and with both installs at once
`path-multiple-installs`, because the call reaches a package other than the one answering.

The skills are installed by `lexforge init --tools <list>`, names separated by commas.
`--scope project` (the default) puts them in the project, `--scope user` in the home directory, and
`--language <code>` names the language the project writes its artifacts in. Every runtime keeps its
skills in its own place:

| Runtime | Project directory | User directory |
| --- | --- | --- |
| `agents` | `.agents/skills` | `~/.agents/skills` |
| `claude` | `.claude/skills` | `~/.claude/skills` |
| `codex` | `.codex/skills` | `~/.codex/skills` |
| `cursor` | `.cursor/skills` | `~/.cursor/skills` |
| `opencode` | `.opencode/skills` | `~/.config/opencode/skills` |

The name `agents` is the shared directory that several agents read.

## First run

### 1. Set up the workspace and install the skills

```bash
lexforge init --tools claude
```

It prints what it created: `lexforge/config.yaml`, `lexforge/specs/`, `lexforge/changes/archive/`
and nine skill directories. Without `--tools` it installs no skills and lists the runtimes whose
directories already exist — the choice stays with a human.

### 2. Check the installation

```bash
lexforge doctor
```

```
OK    Workspace and configuration
OK    Verification labels
OK    Installed skills
OK    Command name on PATH
OK    Git repository
OK    Node version
Next step: installation is healthy. Ask your agent to start work, for example: lexforge new change <name>
```

Right after installation it gives two findings and exit code `1`: `init` creates no git repository
and fills in no `verification` section, and the gates need both. The repository comes from
`git init` and a first commit; the labels are added to `lexforge/config.yaml`:

```yaml
verification:
  tests: npm test
  lint: npm run lint
```

A label name is lowercase letters and hyphens, and `evidence record --label tests` runs its command
from the workspace root. From here the commands are called by the agent.

## Model assignment

The stages of a change reward different models: cutting a proposal is not grinding through
`tasks.md`. Every skill opens with a model block - the model it wants, one line per
provider - and reads that line when the project names none - so a repository works from the first run on whichever
agent opens it. The planning skills and the completion check name the strong model of a
provider, the implementation and debugging skills the middle one, and archival names none.

What the project says wins. The `models` section of `lexforge/config.yaml` holds one entry
per runtime, and a stage resolves against the entry of the runtime the call comes from:

```yaml
models:
  tools:
    claude:
      provider: anthropic
      model: claude-opus-5
    codex:
      provider: openai
      model: gpt-5.6-sol
  providers:
    anthropic:
      - claude-opus-5
      - claude-sonnet-5
```

An entry decides alone: the top level is not read for a runtime that has one, so two agents
of different vendors work in one repository without either reaching for the other's model. A
runtime with no entry takes the top-level `default`, and a project that names neither leaves
every skill on the model of its own model block.

`lexforge init --tools claude,codex` writes an entry for each named runtime that has a vendor
of its own - `claude` for Anthropic, `codex` for OpenAI - and no `default`. `cursor`,
`opencode` and `agents` front several vendors, so their models are yours to name.

The catalogue `providers` is seeded from the list that ships with the version installed, and
it is yours from then on: add a provider or a model name by editing the file, and it counts as
known to this project without waiting for a release. Nothing is checked against it, so a model
released after your installation works the day it ships.

The runtime is named by the caller, never guessed:
`lexforge instructions <artifact> --change <name> --tool codex --json` and
`lexforge status --change <name> --tool codex --json` answer with the provider and the model
of that runtime. LexForge reads no environment variable. A call that names no runtime is a
call whose runtime is unknown, and it resolves against the top level of the section. A skill
running on another model hands the work to a subagent started on the assigned one; a skill
that cannot reach that model stops and says so.

### A project installed before this version

Nothing changes until you ask for it. `lexforge init` leaves an existing `config.yaml`
untouched, the missing `models` section included, and a project without the section gets an
empty assignment: no command refuses, and every skill stays on the model of its own block. A
key left over from the roles this release removed is ignored, and no command refuses because
of it. Switching the section on is one edit - paste the block above into
`lexforge/config.yaml` and fill in the names you use.

### The handover in each runtime

The gate names no runtime, because the same nine skills install into five of them. Whether a
skill can start a subagent on a named model is the runtime's own business.

| Runtime | Model selection for a subagent |
|---|---|
| `claude` | Confirmed: a subagent is started on a named model, and the handover works as described. |
| `agents`, `codex`, `cursor`, `opencode` | Not confirmed here. Until a run shows otherwise, leave that runtime without an entry in the `models` section: its agents then stay on the model their skills name, and no handover is asked for. |

## The nine skills

The agent picks a skill by the `description` line in its `SKILL.md`. Planning is carried by five.

| Skill | Fires when | Result |
| --- | --- | --- |
| `lexforge` | Building, adding or fixing something no change covers | The class of work named, a change created with the right schema |
| `lexforge-propose` | A proposal is asked for, or `proposal` is `ready` | `proposal.md`: the reason, the approach, the boundaries |
| `lexforge-spec` | Requirements are asked for, or `validate` finds a defect | Delta specs per capability with `WHEN`/`THEN` scenarios |
| `lexforge-design` | Decisions are asked for, on the `spec-driven` schema | `design.md`, agreed one section at a time |
| `lexforge-plan` | A plan is asked for, or `validate` finds a defect in it | `tasks.md`, each task naming a file and a verification command |

There is no "warn and write the file anyway" branch: a deadline, the size of the edit and a request
to skip an artifact do not open a closed gate.

| Skill | Fires when | Result |
| --- | --- | --- |
| `lexforge-apply` | The artifacts are done, implementation is asked for | Tasks closed one at a time: failing test, implementation, subagent review, stamp |
| `lexforge-verify` | Implementation is finished, before archiving | A report on four dimensions; one `CRITICAL` finding stops archiving |
| `lexforge-archive` | The report has no `CRITICAL` findings | The delta in `lexforge/specs/`, the change in the archive, a question about the branch |
| `lexforge-debug` | A test fails, a build breaks, code behaves unexpectedly | The cause named, a failing test for the bug, one edit at that point |

The implementation skills read `isPlanningComplete`: while a single artifact is neither written nor
skipped, work does not start. `lexforge-debug` carries no such block, because a bug also happens
where there is no LexForge workspace.

An edit to an installed skill does not survive: `doctor` compares the file byte for byte with what
the package ships, and the next `init` restores it. Project rules go into the `context` and `rules`
sections of `lexforge/config.yaml`, from where they reach `lexforge instructions`.

## Commands and exit codes

| Command, after `lexforge` | What it does |
| --- | --- |
| `init` | Sets up the `lexforge/` workspace and installs the skills; `--tools`, `--scope`, `--language` |
| `doctor` | Checks whether the local installation is healthy |
| `new change <name>` | Creates the change directory with `.lexforge.yaml`; `--schema` overrides the project default |
| `status` | Shows the artifact statuses of one change, or lists the active changes |
| `instructions <artifact> --change <name>` | Serves the template, the context, the rules and the instruction |
| `validate <change>` | Checks the artifacts and requirements; `--strict` adds completeness checks |
| `check plan --change <name>` | Looks for work the plan has not written down |
| `check evidence --change <name>` | Compares the stamps against the code on disk; `--require` narrows the labels |
| `evidence record --change <name> --label <label>` | Runs the command of one label and records a stamp |
| `evidence red --change <name> --task <id> --command <cmd>` | Runs the command of one task and records the failing run |
| `verify --change <name>` | Checks a change before the work is called finished |
| `archive <change>` | Merges the delta into the specs and moves the change to the archive |
| `defect record --change <name>` | Records a defect against a change; `--level`, `--file`, `--line`, `--summary` |
| `defect close <id>` | Marks a recorded defect as fixed |
| `defect list` | Lists recorded defects; `--change` and `--open` narrow the list |

Every command accepts `--json`: a single JSON document goes to standard output and nothing else,
the lines for humans go to standard error. The wording of the human output changes between
versions; the JSON field names and the exit codes do not.

| Code | When |
| --- | --- |
| `0` | The command ran and found nothing |
| `1` | The command ran and found a violation: an unmet dependency, a requirement without a scenario, a leftover placeholder |
| `2` | The command cannot run: an unknown argument, a missing change, no workspace, no git repository |

Code `1` reports a problem in the project, code `2` a wrong call, and there are no other codes.
`doctor` has one exception: a missing workspace is a finding for it, so it answers `1`, not `2`.

## What to commit

| Path | Where |
| --- | --- |
| `lexforge/config.yaml` | Repository: the schema, the context, the rules and the labels are needed by the whole team |
| `lexforge/specs/` | Repository: the specs describe the shipped behaviour |
| `lexforge/changes/<name>/` with `evidence.json` | Repository: a stamp is tied to a commit, and review shows what it was taken on |
| `lexforge/changes/archive/` | Repository: closed changes with their artifacts and stamps |
| `lexforge/defects.json` | Repository: an entry outlives the change it was found in, and review needs to see what still stands |
| The runtime skill directories and `lexforge-install.json` | Locally: `lexforge init` brings them back on another machine |

`evidence.json` changes on every run, so two people working on the same change in parallel will get
a merge conflict on it.

## Line limit

Every source and test file a change touches keeps to a line count: 400 lines by default, `wc -l`
counting, a file at exactly 400 within it. The set of files covered is `file_limit.include` in
`lexforge/config.yaml` — 24 source and test extensions out of the box (`**/*.ts`, `**/*.py`,
`**/*.vue`, and so on); a project's own `include` replaces that list rather than adding to it.
Markdown, JSON, YAML and lock files sit outside it by default. Generated or vendored code is left
out with a negated pattern in `include`, for example `!src/generated/**`. Both the count and the
covered set change with `file_limit.lines` and `file_limit.include` in `lexforge/config.yaml`.

Before `lexforge-plan` writes `tasks.md`, it counts the files the tasks will name and shows every
one over the limit. It asks one question about each: `refactor` it back under the limit, or `keep`
it as is. The answer goes into the change's `.lexforge.yaml` as `long_files: refactor` or
`long_files: keep`.

`lexforge check plan` refuses a plan that names a long file with no `long_files` answer on record.
On `refactor`, it also refuses a plan whose first task naming that file is not marked `(move)` — the
split has to come before the rest of the work on that file.

`lexforge verify` checks every covered file the change touched against the rule its path recorded:
on `refactor` every touched file ends within the limit; on `keep` a file that was within the limit
still ends within it, and a file already over it gains no line. A new file ends within the limit
on either path.

## Limits

`check plan` looks for placeholders with regular expressions, so a phrase like "add error handling"
in the author's own words will not match. The set grows as findings come in.

A stamp is tied to the commit and a fingerprint of the working tree. An edit after a run leaves it
stale, but the reverse does not hold: a stamp does not say the coverage is sufficient.

Whether the implementation follows `design.md` is not computed by a machine. If the agent departs
from the design, only the `lexforge-verify` skill will catch it — that is, the same agent.

## License

MIT, © shepaland.
