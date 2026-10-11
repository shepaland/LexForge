# engineering-rules-guide

## Purpose

A guide in Russian explains to the person installing LexForge how the engineering rules
are built and how a project fills in its own. Someone who reads only the guide can add,
override and switch off a rule.

## Requirements

### Requirement: A Russian guide explains the rules and how to fill them in

The repository SHALL hold a guide in Russian under `docs/` that covers: the rule format
and its four fields; how to write a `Sign` a reviewer can see in a diff; how to override a
shipped rule; how to add a `P` rule; how to switch a rule off with a reason; how to name
the project's stacks; and editing rule text by the `no-ai-slop-rus` rules. `README.md`
and `README.ru.md` SHALL link to the guide.

#### Scenario: A reader follows the guide alone

- **WHEN** an agent that sees only the guide is asked to add a project rule for
  `src/billing/**` and to switch off `FE-14`
- **THEN** it writes `lexforge/rules/<file>.md` and the `engineering.disabled` entry, and
  `lexforge validate <change> --strict` raises no finding on them

#### Scenario: The READMEs point to the guide

- **WHEN** a reader opens `README.md` or `README.ru.md`
- **THEN** each holds a link to the guide
