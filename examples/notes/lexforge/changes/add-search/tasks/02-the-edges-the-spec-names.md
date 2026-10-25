Depends on: section 1

- [x] 2.1 Add tests for the case-differing query, the query matching nothing and the empty query,
      watch them fail, then make them pass without touching the test that already passes.
      -> search#Substring search over note text
      Files: `src/notes.js`, `test/notes.test.js`
      Test: `test/notes.test.js`
      Command: `npm test`
      Depends on: 1.1
