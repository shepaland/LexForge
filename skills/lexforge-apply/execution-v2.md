# Workflow 2: one behavioural cycle

Read the workflow pin from `lexforge status --change <name> --tool <runtime> --json`.
A change without a pin is workflow 1: retain its agreed plan and legacy gates. Never
migrate it merely because a newer skill is installed. An explicitly requested migration
uses `lexforge workflow migrate --change <name> --to 2`; it validates the sidecar and
preserves tasks and old evidence. New changes pin workflow 2 and schema version 1.

## Context and unit of work

Use `lexforge context --change <name> --task <id> --json`. This reads monolithic or
section-file plans and returns the entire mapped cycle, linked requirements and design
headings, file/symbol scope, commands, base, current evidence and unresolved findings.
Do not pass the full plan or design to an executor. Read source symbols/ranges as needed.
Missing/ambiguous links fail; `--max-bytes` refuses oversize output without dropping
criteria. Expand a discovered dependency by reading its linked source or requesting its
own task context. Update the relevant source/sidecar before continuing changed scope.

`execution-plan.json` maps original IDs to one behavioural result. Test writing, RED,
implementation and GREEN are states of that cycle, not fresh agents or separate reviews.
Keep every original ID and acceptance criterion. Sections express scheduling dependencies;
groups associate related tasks. Neither a group nor an entire section automatically
becomes one cycle. Map only tasks that deliver the same observable behaviour together.

Pure file moves retain the existing exemption: `"mode": "move"` is permitted only when
every mapped task explicitly declares `(move)`. They require regression GREEN and the
same independent review and closure gates, without an invented RED. Other cycles use
the default `"mode": "behavior"`.

The session dispatches one executor per cycle and one independent reviewer at GREEN.
An executor starts no agents, edits no task checkboxes and commits nothing. The session
owns dispatch and closure. Keep the assigned model gate. Disjoint cycles may be planned
in parallel; commands serialize state mutations, and conservative whole-tree freshness
can require GREEN again if another writer changed the tree. Never overlap file writers.

## Execute and reuse evidence

1. Before edits, `lexforge cycle start --change <name> --cycle <id> --executor <identity>`.
   This captures the actual baseline, including existing uncommitted work. Declare all
   outputs, additions/deletions/rename endpoints and test files. Unexpected files block
   the cycle; account for them before proceeding.
2. Write the test, then `lexforge cycle run --change <name> --cycle <id> --phase red`.
   The command comes from the sidecar. RED needs exit 1 and the declared complete assertion
   line, not text embedded in a source line or a build/launch error. Configure the runner
   to emit the exact assertion diagnostic and exit 1. Inspect the saved failure and verify
   it is the expected missing behaviour; a matching string alone is not semantic proof.
3. Implement only that behaviour, then run the same command with `--phase green`.
   The CLI checks test versions, material input files, declared environment, runtime,
   revision and contract, and retains full logs and immutable source snapshots.
4. Reuse only evidence `context` reports as valid. Changing agents does not invalidate
   it and does not require replaying RED. Changed material inputs invalidate it. Historical
   closed evidence remains accessible but does not claim the current tree is tested.

Declare all material dependencies in `inputs` (lockfiles, runner configuration, fixture
files, toolchain/version files, ignored inputs) and relevant environment variable names
in `environment`. Values are hashed, not written as environment dumps. External services
need a reproducible version/fixture input; if that cannot be established, rerun the check.

Full logs live under the change's `execution/` directory. Commands return a bounded tail,
exit status and log path. Inspect relevant error ranges. Use the five-field report from
[context.md](context.md); keep detailed history in `execution/<cycle>/journal.md`.

## Review and close

At GREEN, send [reviewer-prompt.md](reviewer-prompt.md) for the whole cycle: every task ID,
all criteria, linked sources, `review_patch`, before/after snapshots and log links. The
patch starts at this cycle's baseline, so earlier uncommitted edits are not reviewed again.
The reviewer checks all original criteria against tests, verifies the RED cause, and
checks that material inputs and specialist controls are complete. Authorization,
cryptography, tenant isolation and migrations require the corresponding named control
and review by an agent competent in that area. A missing reviewer leaves the cycle open.

Save the independent JSON report and register it with
`lexforge cycle review --change <name> --cycle <id> --file <project-relative-report.json>`.
It names reviewer identity, verdict, accepted criterion IDs, completed controls and
findings. The CLI refuses the executor identity, missing criteria/controls and stale
GREEN. Identity declarations support traceability; the session must actually dispatch an
independent reviewer. A JSON file does not itself prove independent judgement.

Fix critical/important findings, rerun GREEN and obtain a new review. Every run keeps the
old evidence but invalidates the previous verdict. Preserve minor findings in the defect
ledger. `lexforge cycle close --change <name> --cycle <id>` requires current GREEN,
complete independent approval and no unresolved critical/important findings. Only then
may the session tick all mapped task IDs. Run the configured whole-suite evidence at the
wave boundary and retain all existing verify/archive gates and file limits.

## Resume or changed contract

`lexforge resume --change <name> --json` recomputes state from primary records; it never
trusts chat history or a cached completion claim. Closure also saves `continuation.json`
with completed IDs, revision, evidence, findings, next step and dependencies.

If requirements, commands or scope change, update only the affected context, then use
`lexforge cycle restart --change <name> --cycle <id> --executor <identity>`. It archives
the prior state, retains the original review baseline without renumbering tasks, opens a new attempt, and earns
new evidence and review. Adding scope requires a proven baseline: an already reserved
unchanged file or an absent new file. Unknown existing paths are refused; plan their work
before editing rather than absorbing unreviewed bytes. Record the reason in the journal. Do not claim the prior attempt
covers new criteria. Interrupted cycles remain open. Remove a leftover execution lock
only after establishing that its owning process has stopped.

## Sidecar and review formats

The sidecar is `lexforge/changes/<name>/execution-plan.json`. For example, an existing
plan whose tasks 1.1 and 1.2 both reference the greeting requirement can use:

```json
{
  "version": 1,
  "cycles": [{
    "id": "greeting",
    "tasks": ["1.1", "1.2"],
    "dependsOn": [],
    "files": [
      {"path": "src/greeting.ts", "symbols": ["greet"]},
      {"path": "tests/greeting.test.ts", "symbols": []}
    ],
    "testFiles": ["tests/greeting.test.ts"],
    "inputs": ["package-lock.json", "vitest.config.ts"],
    "environment": ["NODE_ENV"],
    "command": "npx vitest run tests/greeting.test.ts",
    "expectedFailure": "AssertionError: expected 'old' to be 'hello'",
    "design": [{"path": "lexforge/changes/add-greeting/design.md", "heading": "Greeting"}],
    "acceptance": [{"id": "AC1", "task": "1.2", "description": "greet returns hello"}],
    "controls": []
  }]
}
```

All paths are workspace-relative regular files; symlink paths are refused. `dependsOn`
contains cycle IDs and must preserve the Markdown section dependencies. Every production
task needs an acceptance entry; list all criteria even if one test covers several. The
schema uses exact JSON fields and rejects typos. If design was explicitly skipped, use
`"design": []`; otherwise name every decision applicable to the cycle. Controls are
`authorization`, `cryptography`, `tenant-isolation`, `migrations` as applicable.

An independent review report for that example:

```json
{
  "reviewer": "review-agent-2",
  "verdict": "approved",
  "acceptance": ["AC1"],
  "controls": [],
  "findings": []
}
```

For requested changes use `"verdict": "changes-requested"` and findings with `id`,
`level` (`critical`, `important`, `minor`), `message` including a file/line reference,
and `resolved`. Approval must name every acceptance ID and required control. These are
claims to verify through the linked review, tests and sources, not substitutes for them.
