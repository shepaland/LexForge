## Why

A notes file grows past the point where reading the whole list is useful. Today `listNotes`
is the only way to find anything: the person scrolls and matches by eye. Every note added
after the first few dozen makes that worse, and nothing in the library helps.

## What Changes

- A search over notes by a substring of their text, case-insensitive.
- The result keeps the order the notes were written in.

Out of scope: ranking, fuzzy matching and any storage format change.

## Capabilities

### New Capabilities

- `search`: find notes whose text contains a given substring.

## Impact

`src/notes.js` gains one exported function. No existing function changes, and no caller
of `addNote` or `listNotes` has to be touched.
