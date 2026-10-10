# ui-mockups

## Purpose

A requirement that changes a screen carries an agreed mockup, and the mockup is held to the
styles the project already has. A new or changed CSS class reaches the spec only with the
user's consent, written next to the mockup where `validate` can read it.

## Requirements

### Requirement: A UI requirement names its mockup

A requirement whose body holds a line `Mockup: <target>` SHALL be called a UI requirement.
The target SHALL be either the anchor of a fenced block tagged `mockup` in the same spec,
holding an ASCII mockup, or a path to an HTML file under
`specs/<capability>/mockups/` of the change.

Under `validate --strict`, a target that does not resolve SHALL be a finding naming the
requirement, the target and the line.

#### Scenario: An ASCII mockup

- **WHEN** a requirement holds `Mockup: #login-screen` and the spec has a `mockup` block
  under that anchor
- **THEN** the requirement raises no mockup finding

#### Scenario: A mockup path that does not exist

- **WHEN** a requirement holds `Mockup: mockups/login.html` and the file is absent
- **THEN** `validate --strict` reports the missing file with the requirement and the line

### Requirement: An HTML mockup comes with its own CSS file

An HTML mockup SHALL link exactly one CSS file of its own, kept in the same `mockups/`
directory. Inline `style` elements and `style` attributes SHALL be findings.

#### Scenario: Styles inside the HTML

- **WHEN** `mockups/login.html` holds a `style` element
- **THEN** `validate --strict` reports it and names the file and the line

#### Scenario: No CSS file

- **WHEN** `mockups/login.html` links no CSS file in `mockups/`
- **THEN** `validate --strict` reports the mockup as having no CSS of its own

### Requirement: An HTML mockup uses the project's classes

Every class used in an HTML mockup SHALL be declared in a CSS file named by `ui.styles`
in `lexforge/config.yaml`, or SHALL be listed in the spec's class list with the mark
`new`.

A selector in the mockup's CSS that targets a class declared in the project CSS SHALL be
listed with the mark `changed`.

The class list SHALL follow a line `Classes:` in the body of the UI requirement, one line
per class in the form `` - `CLASS` new|changed: PURPOSE ``, where `CLASS` is the class name and
`PURPOSE` one line on why it is needed.

Each class outside these rules SHALL be a finding naming the class, the file and the line.

#### Scenario: A class nobody agreed to

- **WHEN** the mockup uses `card--compact`, the project CSS does not declare it and the
  class list does not name it
- **THEN** `validate --strict` reports `card--compact` with the file and the line

#### Scenario: An agreed new class

- **WHEN** the class list holds `` - `card--compact` new: dense rows in the history panel ``
- **THEN** the class raises no finding

#### Scenario: A project class redefined silently

- **WHEN** the mockup's CSS sets a rule on `.btn`, the project declares `.btn`, and the
  class list does not name `btn` as `changed`
- **THEN** `validate --strict` reports `btn` as a changed class without consent

### Requirement: The project CSS is named in the config

When a change holds an HTML mockup and `lexforge/config.yaml` has no `ui.styles` key,
`validate --strict` SHALL refuse with a finding that names the key `ui.styles`.

`lexforge styles find` SHALL list every CSS file of the project outside `node_modules`,
`dist`, `build`, `.git` and `lexforge/`, one path per line, and with `--json` as an array.

`lexforge styles set <path>...` SHALL write the given paths to `ui.styles`, replacing the
previous list, and SHALL refuse a path that is not an existing CSS file.

#### Scenario: A mockup in a project with no styles key

- **WHEN** a change holds `mockups/login.html` and the config has no `ui.styles`
- **THEN** `validate --strict` exits `1` naming `ui.styles`

#### Scenario: The user does not know where the CSS is

- **WHEN** the agent runs `lexforge styles find` in a project holding
  `src/styles/app.css` and `node_modules/lib/x.css`
- **THEN** the output lists `src/styles/app.css` and does not list the file under
  `node_modules`

#### Scenario: Saving the chosen files

- **WHEN** the user keeps `src/styles/app.css` and the agent runs
  `lexforge styles set src/styles/app.css`
- **THEN** `lexforge/config.yaml` holds `ui.styles` with that one path

### Requirement: Mockups move into the main specs on archive

When a change is archived, every file under `specs/<capability>/mockups/` of the change
SHALL be copied to `lexforge/specs/<capability>/mockups/`, replacing a file with the same
name.

#### Scenario: Archiving a change with a mockup

- **WHEN** a change holding `specs/web/mockups/login.html` and `login.css` is archived
- **THEN** both files exist under `lexforge/specs/web/mockups/`
