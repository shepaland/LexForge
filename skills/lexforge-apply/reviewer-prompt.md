# Reviewer brief

Fill this in and send it to a general-purpose subagent after every task, before that
task's own checkbox is marked. The sender is the session that read the plan, or an
executor dispatched for a section where an executor of this runtime can start a
reviewer of its own; otherwise the dispatching skill sends it once that executor's task
comes back. Where the runtime can reach no agent at all, there is no sender: the task
stops at its review, unmarked, rather than being sent anywhere. Everything the reviewer
knows about the work comes from this text: the subagent starts with no history of your
session.

## What goes in

| Slot | Where it comes from |
|---|---|
| `[TASK]` | the task line from `tasks.md`, word for word, with its `-> capability#requirement` reference |
| `[REQUIREMENTS]` | every requirement named by that reference, copied from the change's delta specs |
| `[DECISIONS]` | the decisions of `design.md` that touch this task |
| `[BASE_SHA]` | the commit the task started from |
| `[HEAD_SHA]` | the current commit, or the literal `WORKTREE` when the work is not committed |
| `[FILES]` | the paths this task itself names, one per line |
| `[COMMAND]` | the command that confirms the task, and the output of its last run |
| `[PROJECT_RULES]` | `context` and `rules` from `lexforge/config.yaml` |

Uncommitted work is the normal case under a wave: the executor commits nothing, so
`[HEAD_SHA]` is usually `WORKTREE`, not a second commit. Either way `[FILES]` scopes
the diff to this task's own paths - not because a wider look at a neighbour's work
would be unwelcome, but because there is no commit range that could hold it.

## What stays out

The history of your session. Your reasoning about why the code looks as it does.
Anything the user said about the deadline or the size of the work. Other tasks of the
plan, and other sections of the wave - `[FILES]` keeps them out of the diff, not just
out of the words around it. Answers from earlier reviews.

A reviewer who reads your reasoning grades your reasoning. A reviewer who reads
"they need this by five" starts weighing a deadline nobody gave them. A reviewer who
reads the last three reviews learns the tone and starts calling a second finding of the
same kind a nitpick. If the reviewer asks for the session history, send the
requirements, the decisions and the commit range again instead.

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

Base: [BASE_SHA]
Head: [HEAD_SHA]
Files: [FILES]

    Head is a commit:  git diff --stat [BASE_SHA]..[HEAD_SHA] -- [FILES]
                        git diff [BASE_SHA]..[HEAD_SHA] -- [FILES]
    Head is WORKTREE:  git diff --stat -- [FILES]
                        git diff -- [FILES]

Anything else that changed, committed or not, belongs to another task or another
section of the same wave - out of scope here.

## How the task was confirmed

Command: [COMMAND]

Output of the last run:

[OUTPUT]

## Project rules

[PROJECT_RULES]

## How you work

Read only. Do not edit the working tree, do not stage anything, do not move `HEAD` or
any branch. Inspect with `git show`, `git diff` and `git log`. If you need another
revision checked out, use `git worktree add` into a temporary directory.

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
came back with no specific finding.

CRITICAL and IMPORTANT are closed before the checkbox. MINOR is fixed now or recorded
with:

    lexforge defect record --change <name> --level minor --file <path> --line <number> --summary "<text>"

`--file` and `--line` come from the finding's own `file:line`, and `--level` is always
`minor` here - CRITICAL and IMPORTANT never reach the ledger unfixed, and a wrong level
turns a nitpick into a blocking entry. If a finding is wrong, answer it with the
requirement quoted, the test, or the line of code that disproves it - never with silence
and never with a fix you do not believe in.
