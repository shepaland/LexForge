# skill-install

## Purpose

Where the init command puts skills for each agent, how the project install scope differs
from the user scope, how installation reports what it wrote, and how a second installation
removes files the first one left behind.

## Requirements

### Requirement: The tool registry knows five runtimes and two scopes

The registry SHALL store two paths per tool name: the skill directory inside the project
and the user's skill directory.

The registry SHALL carry the rows `claude`, `codex`, `cursor`, `opencode`, and `agents` with
these values:

| Tool | Project directory | User directory |
|---|---|---|
| `claude` | `.claude/skills` | `~/.claude/skills` |
| `codex` | `.codex/skills` | `~/.codex/skills` |
| `cursor` | `.cursor/skills` | `~/.cursor/skills` |
| `opencode` | `.opencode/skills` | `~/.config/opencode/skills` |
| `agents` | `.agents/skills` | `~/.agents/skills` |

The user path SHALL be stored as a separate field and SHALL NOT be derived from the project
path by prefixing the home directory: for `opencode` the two diverge.

#### Scenario: Installing for Cursor

- **WHEN** installation is called with the tool list `cursor` in the project scope
- **THEN** the skill files sit in `.cursor/skills/<skill name>/`

#### Scenario: OpenCode's personal skills

- **WHEN** installation is called with the tool list `opencode` in the user scope
- **THEN** the skill files sit in `~/.config/opencode/skills/<skill name>/`

### Requirement: The install scope is chosen with a flag

The init command SHALL accept a `--scope` flag with the values `project` and `user`
and SHALL treat the project scope as the default.

A value outside these two SHALL exit the command with code `2` and list the allowed values.

The user scope SHALL write files outside the project, and every path written SHALL be named
in full in the command's output.

#### Scenario: No scope named

- **WHEN** installation is called without a scope flag
- **THEN** the skills land in the project directories of the named tools

#### Scenario: An unknown scope

- **WHEN** the scope flag is passed the value `global`
- **THEN** the command exits with code `2` and names `project` and `user`

#### Scenario: Writing outside the project

- **WHEN** installation ran in the user scope
- **THEN** the output names every path in full, home directory included

### Requirement: An unknown tool name stops installation before the first write

A name that isn't in the registry SHALL exit the command with code `2` and list the known
names.

The name check SHALL run before the first file is written: a list mixing a known and an
unknown name SHALL NOT leave half an installation on disk.

#### Scenario: A typo in the list

- **WHEN** installation is called with the list `claude,cursr`
- **THEN** the command exits with code `2`, names the known names, and no `.claude/skills`
  directory appears on disk

### Requirement: Installation writes a manifest next to the skill directory

Installation SHALL write the manifest `lexforge-install.json` into the directory that holds
the tool's skill directory: for `claude` in the project scope that's
`.claude/lexforge-install.json`.

The manifest SHALL carry the package version, the write time, the tool name, the scope, and
the list of relative paths of every file written.

The manifest SHALL sit outside the skill directory: a file inside it gets read as a skill.

#### Scenario: The manifest after installation

- **WHEN** installation for `claude` in the project scope ran
- **THEN** `.claude/lexforge-install.json` names the package version and every file written

#### Scenario: Two scopes side by side

- **WHEN** installation ran in both the project and the user scope
- **THEN** there are two manifests, each next to its own skill directory

### Requirement: A second installation removes files from the previous version

Installation SHALL compare the file list of the previous manifest against the package
contents and SHALL delete files the previous version wrote that the current one doesn't carry.

A directory left empty after deletion SHALL be deleted too.

A file not named by the previous manifest SHALL NOT be deleted under any condition. With no
manifest, nothing is deleted, and directories that look like LexForge skills SHALL be named in
the output as left for a person to handle.

#### Scenario: A skill dropped from the release

- **WHEN** the previous version installed ten skills, the current one carries nine, and
  installation runs again
- **THEN** the dropped skill's directory is deleted, the nine remaining stay in place, and
  the deleted path is named in the output

#### Scenario: An unrelated skill nearby

- **WHEN** the skill directory holds a directory that LexForge didn't install
- **THEN** it stays in place

#### Scenario: No manifest

- **WHEN** the skills come from a version that didn't write a manifest
- **THEN** nothing is deleted, and the extra directories are named in the output with a note
  that a person removes them

### Requirement: A repeated installation doesn't overwrite what already matches

A file whose content matches what the package ships SHALL stay untouched and SHALL land in
the output's unchanged section.

A file that diverges from what's shipped SHALL be overwritten, and its path SHALL land in
the output's updated section: an edited skill drifts out of contract with the CLI, and the fix
is reverting to the shipped text.

#### Scenario: Installing with the same package

- **WHEN** installation runs again without a package version change
- **THEN** no file is overwritten, every path is in the unchanged section

#### Scenario: An edited skill

- **WHEN** an installed `SKILL.md` was edited by hand and installation runs again
- **THEN** the file is reverted to the shipped text, the path is named in the updated section
