# add-search - implementation plan

**Goal:** find notes by a substring of their text, case-insensitive, in the order they were written.

**Spec:** lexforge/changes/add-search

## 1. Search over note text

- [x] 1.1 Write the failing test in `test/notes.test.js`: three notes, the query "buy", two of
      them in the answer in the order they were given.
      -> search#Substring search over note text
- [x] 1.2 Run `npm test` and watch that test fail on `searchNotes is not a function`.
- [x] 1.3 Write `searchNotes(notes, query)` in `src/notes.js`: fold both sides with
      `toLowerCase`, keep the notes whose text contains the query.
- [x] 1.4 Run `npm test` and watch every test pass.

## 2. The edges the spec names

- [x] 2.1 Add the failing tests for the case-differing query, the query matching nothing and the
      empty query, in `test/notes.test.js`.
      -> search#Substring search over note text
- [x] 2.2 Run `npm test` and watch the new tests fail.
- [x] 2.3 Make them pass without touching the two tests that already pass.
- [x] 2.4 Run `npm run lint` and `npm test`, both clean.
