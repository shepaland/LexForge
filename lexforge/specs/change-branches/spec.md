# change-branches

## Purpose

Every change is built on its own branch cut from the development branch, and its finished
work returns there. The development branch reaches `main` only when the user says so.

## Requirements

### Requirement: A new change gets a feature branch from dev

`lexforge new change <name>` SHALL create the branch `feature/<name>` from `dev` and switch
the working tree to it before it writes the change directory.

When the repository has no `dev` branch, the command SHALL create `dev` from `main` first
and SHALL say so in its output, in the JSON field `createdBranches` and in the human line.

When `feature/<name>` already exists, the command SHALL refuse with exit `2` and create
nothing.

#### Scenario: A repository with dev

- **WHEN** the user runs `lexforge new change add-login` on a clean tree where `dev` exists
- **THEN** the current branch is `feature/add-login`, its parent commit is the tip of
  `dev`, and the change directory exists

#### Scenario: A repository without dev

- **WHEN** the repository holds only `main` and the user runs `lexforge new change add-login`
- **THEN** `dev` is created from `main`, `feature/add-login` from `dev`, and the output
  names `dev` as created

#### Scenario: A branch with that name exists

- **WHEN** `feature/add-login` already exists
- **THEN** the command exits `2`, names the branch, and creates neither the branch nor the
  change directory

### Requirement: A new change refuses a tree it cannot branch from cleanly

`lexforge new change` SHALL refuse with exit `2` and create neither the change nor a branch
when the working tree has uncommitted changes, listing every changed path, or when the
workspace is not inside a git repository, naming that cause.

Files under `lexforge/changes/` SHALL NOT count as uncommitted changes for this check.

#### Scenario: Uncommitted work in the tree

- **WHEN** `src/app.ts` is modified and not committed
- **THEN** the command exits `2`, lists `src/app.ts`, and suggests to commit or stash it

#### Scenario: Not a git repository

- **WHEN** the workspace root lies outside any git repository
- **THEN** the command exits `2` with the error code `not-a-git-repository`

### Requirement: Archive merges the feature branch into dev

`lexforge archive <name>`, run on `feature/<name>`, SHALL commit the merged specs and the
moved change directory on that branch, switch to `dev` and merge with `--no-ff`. The
feature branch SHALL stay.

On a merge conflict, the command SHALL abort the merge, switch back to `feature/<name>`,
exit `1` and list the conflicting paths.

When archive runs on any branch other than `feature/<name>`, it SHALL archive without a
merge and SHALL say in its output that the change was not built on its feature branch.

#### Scenario: A clean merge

- **WHEN** `lexforge archive add-login` runs on `feature/add-login` and `dev` has no
  conflicting commits
- **THEN** `dev` holds a merge commit whose second parent is the tip of `feature/add-login`,
  and `feature/add-login` still exists

#### Scenario: A conflict

- **WHEN** `dev` changed `src/app.ts` in a way that conflicts with the feature branch
- **THEN** the merge is aborted, the current branch is `feature/add-login`, the tree is
  clean, the exit code is `1`, and the output lists `src/app.ts`

#### Scenario: A change started before branches

- **WHEN** `lexforge archive old-change` runs on `main`
- **THEN** the change is archived, no merge is made, and the output says the change had no
  feature branch

### Requirement: Dev reaches main only on the user's answer

After a merge into `dev`, the archive skill SHALL ask the user whether to merge `dev` into
`main`, SHALL wait for the answer, and SHALL NOT merge, push or delete any branch without
it.

#### Scenario: No answer yet

- **WHEN** the archive has merged into `dev` and the user has not answered
- **THEN** `main` is unchanged

#### Scenario: The user agrees

- **WHEN** the user answers yes
- **THEN** the skill merges `dev` into `main` and runs the configured checks on the result
