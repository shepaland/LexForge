# Reviewer brief

For workflow 2, every use of “task” below means the full behavioural cycle with all
original task IDs and acceptance criteria. Review once after GREEN. Validate declared
material inputs and the actual RED assertion; ensure authorization, cryptography, tenant
isolation and migration work receives its required specialist control. Return the JSON
report described in [execution-v2.md](execution-v2.md), alongside file/line findings.

Fill this in and send it to a general-purpose subagent after every task, before that
task's own checkbox is marked. The sender is the session that read the plan: an
executor starts no agent of any kind, so it never sends this brief itself. Where the
runtime can reach no agent at all, there is no sender: the task stops at its review,
unmarked, rather than being sent anywhere. Everything the reviewer knows about the work
comes from this text: the subagent starts with no history of your session.

## What goes in

| Slot | Where it comes from |
|---|---|
| `[TASK]` | the task line from its section file (or legacy `tasks.md`), word for word, with its `-> capability#requirement` reference |
| `[REQUIREMENTS]` | every requirement named by that reference, copied from the change's delta specs |
| `[DECISIONS]` | the decisions of `design.md` that touch this task |
| `[CYCLE_PATCH]` | patch between this cycle’s before/after snapshots; see [context.md](context.md) |
| `[SNAPSHOTS]` | paths to the manifest and immutable before/after files |
| `[FILES]` | the paths this task itself names, one per line |
| `[COMMAND]` | exact command, exit code and summary of its last run |
| `[LOG]` | full log path, with relevant error excerpts supplied below |
| `[PROJECT_RULES]` | `context` and `rules` from `lexforge/config.yaml` |

The cycle starts from the actual file contents before its first edit, including earlier
uncommitted work. `[CYCLE_PATCH]` contains only this cycle's changes to `[FILES]`, including
new and deleted files. Missing snapshots block review. A path-scoped working-tree diff
still accumulates earlier cycles touching those paths and is not a cycle patch.

## What stays out

The history of your session. Your reasoning about why the code looks as it does.
Anything the user said about the deadline or the size of the work. Other tasks of the
plan, and other sections of the wave - `[FILES]` keeps them out of the diff, not just
out of the words around it. Answers from earlier reviews.

A reviewer who reads your reasoning grades your reasoning. A reviewer who reads
"they need this by five" starts weighing a deadline nobody gave them. A reviewer who
reads the last three reviews learns the tone and starts calling a second finding of the
same kind a nitpick. If the reviewer asks for the session history, send the
requirements, the decisions and the cycle patch and snapshots again instead.

## The brief

```
You are reviewing one task of a LexForge change against the requirements it claims to
implement. You have no history of the session that produced it and you do not need one.

## The task

[TASK]

## The requirements it has to satisfy

[REQUIREMENTS]

## Design decisions that bind it

[DECISIONS]

## The diff

Patch: [CYCLE_PATCH]
Snapshots and manifest: [SNAPSHOTS]
Files: [FILES]

Read the patch by file and hunk. Resolve line references against the after snapshot;
use the before snapshot for deletions. The snapshot manifest maps paths to the project.
Earlier changes in the same file are baseline context, outside this cycle's diff.
For fix rounds, inspect the fix patch and the resulting full cycle against its original
baseline. Use snapshot content when the live tree has moved on.

## How the task was confirmed

Command: [COMMAND]

Exit code, counts and relevant excerpts:

[OUTPUT]

Full log: [LOG]

## Project rules

[PROJECT_RULES]

## How you work

Read only. Do not edit the working tree, do not stage anything, do not move `HEAD` or
any branch. Inspect with `git show`, `git diff` and `git log`. If you need another
revision checked out, use `git worktree add` into a temporary directory.

Run no test, no build, no script of the change: under a wave a neighbour is writing into
the same tree, so a run you start yourself measures a state nobody owns, and its failure
would come back as this task's failure. Read the diff handed to you and the output of the
run the executor already performed: its summary and relevant excerpts first; open the
linked full log only where needed to resolve a question.

Do all of this yourself. Do not dispatch subagents: not to split the diff, not for a
second opinion. A verdict from an agent you spawned counts for nothing here.

## What to check

- Does the diff do what the requirements say, all of it and nothing besides?
- Does it break any decision listed above?
- Is there a test that fails without the implementation, and does it assert the
  behaviour of the requirement rather than the shape of the code?
- Parameters, flags and branches the requirements do not ask for.
- Error paths, boundary values, and the cases the requirement's scenarios name.
- Anything the project rules forbid.

Judge severity honestly. Not everything is CRITICAL, and a real defect called MINOR
costs as much as a nitpick called CRITICAL.

## Answer in this form

### Strengths
What the diff does well. Be specific; name files and lines.

### Findings

#### CRITICAL
Wrong behaviour, data loss, a requirement not met, a decision broken.

#### IMPORTANT
A gap that will cost work later: a missing test, an unhandled error path, a design
problem.

#### MINOR
Naming, duplication, comments, small simplifications.

Every finding carries: `file:line`, what is wrong, why it matters, and how to fix it if
that is not obvious.

### Verdict

Ready to close the task: yes / no / with fixes.

One or two sentences of reasoning.

## Do not

Do not answer "looks good" without naming files and lines - an answer with no file
reference will be sent back to you. Do not raise a nitpick to CRITICAL. Do not comment
on code you did not read. Do not leave the verdict out.
```

## Reading the answer

An answer with no `file:line` anywhere is empty: send the brief again and say the review
came back with no specific finding. A verdict resting on the reviewer's own run is sent
back the same way: say the review ran the project itself and ask for one that reads the
diff and the handed-over output instead.

CRITICAL and IMPORTANT are closed before the checkbox. MINOR is fixed now or recorded
with:

    lexforge defect record --change <name> --level minor --file <path> --line <number> --summary "<text>"

`--file` and `--line` come from the finding's own `file:line`, and `--level` is always
`minor` here - CRITICAL and IMPORTANT never reach the ledger unfixed, and a wrong level
turns a nitpick into a blocking entry. If a finding is wrong, answer it with the
requirement quoted, the test, or the line of code that disproves it - never with silence
and never with a fix you do not believe in.
