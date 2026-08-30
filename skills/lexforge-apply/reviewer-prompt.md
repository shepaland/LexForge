# Reviewer brief

Fill this in and send it to a general-purpose subagent after every task, before the
checkbox. Everything the reviewer knows about the work comes from this text: the
subagent starts with no history of your session.

## What goes in

| Slot | Where it comes from |
|---|---|
| `[TASK]` | the task line from `tasks.md`, word for word, with its `-> capability#requirement` reference |
| `[REQUIREMENTS]` | every requirement named by that reference, copied from the change's delta specs |
| `[DECISIONS]` | the decisions of `design.md` that touch this task |
| `[BASE_SHA]` | the commit the task started from |
| `[HEAD_SHA]` | the current commit |
| `[COMMAND]` | the command that confirms the task, and the output of its last run |
| `[PROJECT_RULES]` | `context` and `rules` from `lexforge/config.yaml` |

## What stays out

The history of your session. Your reasoning about why the code looks as it does.
Anything the user said about the deadline or the size of the work. Answers from earlier
reviews. Other tasks of the plan.

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

    git diff --stat [BASE_SHA]..[HEAD_SHA]
    git diff [BASE_SHA]..[HEAD_SHA]

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

CRITICAL and IMPORTANT are closed before the checkbox. MINOR is fixed now or written
into `tasks.md` as a numbered task naming its own file. If a finding is wrong, answer it
with the requirement quoted, the test, or the line of code that disproves it - never
with silence and never with a fix you do not believe in.
