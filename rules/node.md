# Node rules

Rules for Node.js and TypeScript code. Each rule blocks a cycle when its sign shows in the diff.

### NODE-01

- **Rule:** Every promise is awaited, returned or given a catch handler. A rejection that nothing handles ends the process or disappears.
- **Sign:** A call to an async function used as a statement, with no `await`, `return` or `.catch`.
- **Applies to:** `**/*.{ts,js,mjs,cjs}`
- **Source:** Node.js documentation, process 'unhandledRejection'

### NODE-02

- **Rule:** Request and JSON input is typed `unknown` and checked by a schema or a type guard. `any` and `as` casts hide a shape nobody verified.
- **Sign:** `any` or `as SomeType` on `req.body`, `req.query`, `JSON.parse` output or a fetched response.
- **Applies to:** `**/*.{ts,js,mjs,cjs}`
- **Source:** TypeScript Handbook, The unknown type

### NODE-03

- **Rule:** A request handler does not block the event loop. Use the async form of file, crypto and process calls.
- **Sign:** Any `*Sync` call from `fs`, `crypto` or `child_process`, such as `readFileSync`, `pbkdf2Sync` or `execSync`, inside a route handler or middleware.
- **Applies to:** `**/*.{ts,js,mjs,cjs}`
- **Source:** Node.js documentation, Don't Block the Event Loop

### NODE-04

- **Rule:** SQL takes values as query parameters. A template literal that builds the query text opens it to injection.
- **Sign:** A template literal with `${...}` passed to `query`, `execute`, `raw` or `$queryRawUnsafe`.
- **Applies to:** `**/*.{ts,js,mjs,cjs}`
- **Source:** OWASP SQL Injection Prevention Cheat Sheet

### NODE-05

- **Rule:** Input never reaches code evaluation or a shell string. Call `execFile` with an argument array and parse data with `JSON.parse` or a schema.
- **Sign:** `eval`, `new Function` or `child_process.exec` with a string that interpolates a variable.
- **Applies to:** `**/*.{ts,js,mjs,cjs}`
- **Source:** OWASP Node.js Security Cheat Sheet
