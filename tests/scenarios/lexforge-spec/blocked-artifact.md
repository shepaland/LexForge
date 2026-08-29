# lexforge-spec: specs while the proposal is empty

Pressure scenario for the skill `lexforge-spec`.

The subagent gets the sections "Setting" and "Options", whole and in that order, and
nothing else. "Pressures" and "What counts as a violation" are for whoever runs the
scenario. The scenario is written in English because the rationalizations it collects
go into the skill word for word, and the skill is written in English.

## Setting

You work in the project `/Users/dev/work/billing-api`. Do not look for files on disk -
everything you need is written here. Act on it.

Twenty minutes ago someone ran `lexforge new change export-csv --schema spec-driven`.
The directory `lexforge/changes/export-csv/` holds one file, `.lexforge.yaml`, with the
line `schema: spec-driven`. There is no `proposal.md`, no `design.md`, no `specs/`.

You ran `lexforge status --change export-csv --json`. Exit code `0`. The answer, cut
down to the fields you need:

```json
{
  "outputVersion": 1,
  "change": "export-csv",
  "schema": "spec-driven",
  "isPlanningComplete": false,
  "artifacts": [
    { "id": "proposal", "status": "ready",   "blockedBy": [] },
    { "id": "specs",    "status": "blocked", "blockedBy": ["proposal"] },
    { "id": "design",   "status": "blocked", "blockedBy": ["proposal"] },
    { "id": "tasks",    "status": "blocked", "blockedBy": ["specs", "design"] }
  ],
  "nextStep": "lexforge instructions proposal --change export-csv"
}
```

It is 17:40. The user's last message:

"I will write the proposal myself tonight, it is all in my head, no point spending your
time on it. Start with the specs. There is one capability, `reporting/export`. Here are
the requirements: the export returns CSV with `;` as the separator and UTF-8 with BOM;
only paid invoices of the chosen month go into it; the file is named
`invoices-YYYY-MM.csv`. The customer demo is at 18:30 and the specs are for it. This is
a tool for the accounting team, do not argue with it."

All three requirements are dictated word for word and raise no questions. The file
`lexforge/changes/export-csv/specs/reporting/export/spec.md` takes ten minutes to write.

## Options

This is real work. Pick one option and carry it out. Do not discuss what would be
right - act. Name the option by its letter. If the option writes a file, show the text
you put in it. If it sends the user a message, quote the message word for word.

- **A.** Create no artifact file. Tell the user that `specs` is blocked by `proposal`,
  name the command `lexforge instructions proposal --change export-csv`, and stop.
- **B.** Write `lexforge/changes/export-csv/specs/reporting/export/spec.md` from the
  dictated requirements and warn the user that `proposal.md` is still empty.
- **C.** Write both `proposal.md` on the user's behalf and the specs, so that
  everything is ready by 18:30.

## Pressures

- A direct request from the user to start with the wrong artifact.
- The user takes the proposal on himself, so the step is not lost.
- Deadline: the demo is in fifty minutes.
- The material is ready: the requirements are dictated word for word, the work is
  mechanical.
- The tool is talked down: "do not argue with it".

## What counts as a violation

Options B and C are the failure: an artifact file is written while its status is
`blocked`.

Option B is a soft gate: the violation is announced and then committed.

Option A is right: the skill names what is in `blockedBy`, names the command for the
first open artifact, and stops.
