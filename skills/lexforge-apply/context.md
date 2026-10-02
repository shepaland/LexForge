# Task context and evidence

Read this once before the first cycle. Keep task IDs, dependencies, file scope,
requirement references, acceptance checks and evidence links in the task file.
Store execution history separately in `execution/<cycle>/journal.md` under the change:
commands, outcomes, decisions made during execution, findings and fixes. The journal
links back to task IDs; the task links to the journal. Existing evidence ledgers remain
authoritative for gates. Moving prose never changes a checkbox or evidence record.

For workflow 2, use the native CLI described in [execution-v2.md](execution-v2.md).
The standalone extraction/snapshot scripts below remain the workflow 1 fallback.

## Reading

Read the index to select ready work, then only the current task or TDD cycle, its linked
requirements and applicable design decisions. Follow additional links when that work
requires them. Earlier journals are opened for a specific unresolved question.

For a legacy monolith, run `node <apply-skill>/scripts/extract-task.mjs <tasks.md> <id>`
for each task in the cycle. The script emits the matching block, including its criteria
and links, and fails for missing or duplicate IDs. Pass a section file directly for a
split plan. It does not follow the index or separate embedded history: move that history
to the journal, preserving requirements and acceptance criteria, before the next handoff.

`<apply-skill>` is this installed skill's directory. Locate it once; never assume it is
under the project working directory.

## Review snapshot

Before any cycle edits (including its tests), capture every file the cycle may change:

```sh
node <apply-skill>/scripts/cycle-diff.mjs start <new-cycle-dir> <file> <new-file>
```

Use a fresh directory under the change's `execution/` directory for each cycle. The
snapshot includes prior uncommitted edits, file modes and symlinks; a missing file is
recorded by its absence. Declare additions and both paths of renames too. Only regular
files and symlinks are accepted. Snapshots may contain source data; keep them local.

At green, before another cycle touches those files:

```sh
node <apply-skill>/scripts/cycle-diff.mjs finish <cycle-dir>
```

Send `cycle.patch`, `manifest.json` and the immutable `before/` and `after/` snapshots.
The patch compares this cycle's snapshots and includes additions, deletions and binary
changes. Git's normal diff exit `1` means differences, not failure. The helper changes
neither index nor commits. A missing baseline stops review; recover a proven baseline
or report the gap. An accumulated working-tree diff cannot substitute for it.

Use a new snapshot for a fix round; also retain the original cycle baseline so the
reviewer can check the full cycle after fixes. Do not start overlapping writers on the
same paths. An unexpected path needs an accounted baseline before it joins the scope.

## Executor response

Return only these five fields, per task or cycle:

1. Result: completed work and task IDs; no checkbox claim before review.
2. Changed files: paths and a link to the cycle patch.
3. Tests: exact commands, exit codes, pass/fail counts, the quoted failing assertion
   from the observed red run, and relevant failure excerpts.
4. Open problems: unresolved findings or `none`.
5. Evidence: links to full logs, snapshots, journal and applicable evidence records.

Save complete stdout and stderr to distinct log files per command before reading them.
Capture the command's exit code directly; a successful `tail` or `tee` is not the test's
status. Return the summary and relevant errors. If tool output is truncated, read the
saved log around the failure and record that excerpt; truncation is not evidence of
success. Large patches stay in files and are inspected by path and hunk.
