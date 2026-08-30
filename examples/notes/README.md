# notes — a change that went through every gate

**English** · [Русский](README.ru.md)

A tiny library of notes, and one LexForge change on it: `add-search`. It is the change recorded
in [the demo](../../docs/media/verify.gif), kept here so the artifacts can be read rather than
watched.

```
lexforge/changes/add-search/
  proposal.md   why the change exists, what a user will see, what it touches
  specs/search/spec.md   one requirement, four scenarios on WHEN/THEN
  design.md     two decisions, each with the alternative that was turned down
  tasks.md      eight tasks, the ones carrying a requirement naming it
  evidence.json the stamps: the command, its exit code, the commit, the working tree
```

The code is `src/notes.js` and `test/notes.test.js`: `npm test` runs six tests, `npm run lint`
checks the file parses.

## Why `verify` will not answer 0 here

`evidence.json` holds the stamps of the run that was recorded. Their `head` and `worktreeDigest`
belong to that repository, not to your checkout, so `lexforge verify --change add-search` answers
`1` and calls the evidence not fresh. That is the point of the ledger: a stamp proves that a
command ran against a particular tree, and it stops proving anything the moment the tree changes.

To see it go green, record your own:

```bash
lexforge evidence record --change add-search --label tests
lexforge evidence record --change add-search --label lint
lexforge verify --change add-search
```
