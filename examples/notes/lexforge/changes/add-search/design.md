## Context

`src/notes.js` is a pure module: every function takes the notes array and returns a new value,
and nothing is stored between calls. Tests run on `node --test` with no dependencies. Search has
to fit that shape, or the module stops being testable without a fixture.

## Goals / Non-Goals

**Goals:**

- Find notes by a substring of their text, ignoring case.
- Keep the order the notes were written in.

**Non-Goals:**

- Ranking the results by relevance.
- Fuzzy matching and typo tolerance.
- Any change to how notes are stored.

## Decisions

### Decision 1. A pure function beside the existing two

**Choice.** `searchNotes(notes, query)` returns a new array, exported from `src/notes.js`.

**Why.** `addNote` and `listNotes` already take the array as the first argument and return a new
value. A caller composes them without holding any state, and search that broke that shape would
be the only function in the module needing a setup step.

**Alternative.** A `NoteSearch` class holding an index. Turned down: an index pays off on
thousands of notes, and this library is read into memory in full on every call anyway.

### Decision 2. Case folded on both sides with `toLowerCase`

**Choice.** Both the note text and the query go through `toLowerCase` before `includes`.

**Why.** The person typing "buy" means the note that starts a sentence with "Buy". Node's
`localeCompare` and `Intl` would handle locale-specific folding, but the module has no locale to
read and no dependency to carry one.

**Alternative.** `String.prototype.localeCompare` with `sensitivity: "base"`. Turned down: it
compares whole strings, and the requirement is a substring match.

## Risks / Trade-offs

- **Linear scan on every call.** O(n) per search -> acceptable while the whole list already lives
  in memory; an index becomes worth it only once the notes stop fitting there.
- **Case folding is not locale-aware.** Turkish dotless i folds wrong -> named here, and left for
  the change that gives the library a locale.

## Migration Plan

One added export. No caller changes, nothing to migrate, and rolling back is removing the
function and its tests.

## Open Questions

None. Both decisions above are settled by the shape of the existing module.
