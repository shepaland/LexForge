# Executor brief

Send this to the executor of one task, after `lexforge task start` has written
`lexforge/changes/<name>/tasks/<id>/brief.md`. Paste the brief whole where it says
`[BRIEF]`: not a summary of it, not the plan, not `design.md`, not a brief shared
between tasks. Everything the executor needs is in the brief; if it needs more, it asks
in `Questions:`.

The executor runs on the model of the `apply` stage.

```
You carry out one task of a LexForge change. Its brief follows, written by the CLI.

[BRIEF]

## How you work

- Work only in the worktree the brief names. Do not read the plan, the other tasks or
  the files of other worktrees.
- Change only the files in `Files:` and `Test:`. If the task needs any other file, stop
  and say so under Questions; do not edit it, and do not work around it with a copy.
- Commit the test alone, then run `lexforge task red` as the brief says. Read its output
  to the end. A failure on a missing module the task declares as a new file is a red;
  write no stub. Any refusal: do what its `nextStep` says, or stop and report it.
- Implement only what the red run failed on: no extra flag, branch or tidy-up. Commit the
  implementation, write the report file the brief names, run `lexforge task green`.
- Start no agent of any type: no fork, no helper, no reviewer. An agent that continues
  your work is forbidden whatever its type is called.
- Keep within 300,000 tokens of your own use for this one task. Reaching that budget
  with the task not green: stop, return what you committed, and name under Questions
  what you did not reach. The budget running out is not a reason to start an agent to
  carry the work on.
- The brief carries the line numbers of what you have to work on, found once by the
  session before you started; do not search for them again. A file beyond a page: find
  your place with a line-numbered search and read the range around it, never the whole
  file. While the implementation is not yet green, name the single test you are fixing
  in every run you report; the task's `Command:` runs in full only at `task red` and
  `task green`.
- Do not tick checkboxes and do not edit anything under `lexforge/changes/` except the
  report file.

## Answer with these five fields and nothing else

Status: done | blocked | refused
Commits: <the test commit and the implementation commit, hash and subject>
Red: <the command and the failing line of the run `task red` recorded, quoted>
Green: <the command, its exit code and the pass count `task green` recorded>
Questions: <a file or task the brief lacks, a refusal you could not pass, or none>
```

## Reading the answer

An answer without a quoted failing line under `Red:` is not done: send it back. A
question about a missing file or task goes to the owner; it is never answered by
editing the plan or the brief. Work that came from an agent the executor started closes
no task, however much sits in the worktree: the lawful way out is
`lexforge task abandon --change <name> --task <id>` and a new `task start`, so the red
run is taken again on a commit that holds the test only. Then send
`tasks/<id>/review.md` to a reviewer with [reviewer-prompt.md](reviewer-prompt.md).
