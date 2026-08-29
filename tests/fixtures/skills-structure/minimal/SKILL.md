---
name: minimal
description: Use when a structure check needs a skill that breaks no rule - the baseline fixture
---

Read the state of the change first: `lexforge status --change <name> --json`.

Write the artifact the schema asks for, then check it with
`lexforge validate <name> --strict`.

Next step: `lexforge instructions specs --change <name>`.
