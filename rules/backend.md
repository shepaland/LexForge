# Backend rules

Rules for server-side code. Each rule blocks a cycle when its sign shows in the diff.

### BE-01

- **Rule:** Validate input at the system boundary (HTTP, queue, file, CLI) against a schema before use: type, length, range, format. A failed check returns 4xx naming the field.
- **Sign:** A handler reads `body`, `query`, `params` or a message and passes it on without a schema.
- **Applies to:** `**/*.{ts,js,mjs,cjs,py,java,kt,go,cs,php,rb,rs,sql}`
- **Source:** OWASP ASVS V5

### BE-02

- **Rule:** Database queries are parameterized. External data never reaches SQL, a shell command, a file path or a template through string concatenation.
- **Sign:** A variable concatenated or interpolated into a query string, `exec` call or path.
- **Applies to:** `**/*.{ts,js,mjs,cjs,py,java,kt,go,cs,php,rb,rs,sql}`
- **Source:** OWASP Top 10 A03

### BE-03

- **Rule:** Access to a resource is checked on the server on every request, including that the object belongs to the user.
- **Sign:** A lookup by `id` from the request with no condition on owner or role.
- **Applies to:** `**/*.{ts,js,mjs,cjs,py,java,kt,go,cs,php,rb,rs,sql}`
- **Source:** OWASP Top 10 A01

### BE-04

- **Rule:** Secrets come from the environment or a secret store. They do not appear in code, test fixtures or logs.
- **Sign:** A string that looks like a key, token or password; an authorization header written to a log.
- **Applies to:** `**/*.{ts,js,mjs,cjs,py,java,kt,go,cs,php,rb,rs,sql}`
- **Source:** 12-Factor III, OWASP ASVS V6

### BE-05

- **Rule:** An error is handled or rethrown. An empty `catch`, or a `catch` that only logs and carries on, is not allowed. The client never receives a stack trace.
- **Sign:** An empty or log-only `catch`; `err.stack` in a response.
- **Applies to:** `**/*.{ts,js,mjs,cjs,py,java,kt,go,cs,php,rb,rs,sql}`
- **Source:** -

### BE-06

- **Rule:** Every call to an external system (HTTP, database, queue) has a timeout. A retry is allowed only for an idempotent operation, with a capped attempt count and growing delay.
- **Sign:** A client with no timeout; a retry loop with no limit or around a non-idempotent operation.
- **Applies to:** `**/*.{ts,js,mjs,cjs,py,java,kt,go,cs,php,rb,rs,sql}`
- **Source:** Google SRE Book, ch. 22

### BE-07

- **Rule:** An operation a client or queue can repeat (payment, order creation, message handler) is idempotent: an idempotency key or a check of the current state.
- **Sign:** A message handler creates a record without checking that it already exists.
- **Applies to:** `**/*.{ts,js,mjs,cjs,py,java,kt,go,cs,php,rb,rs,sql}`
- **Source:** Stripe API, idempotent requests

### BE-08

- **Rule:** Changes to related records run in one transaction. No network call to another system happens inside a transaction.
- **Sign:** Several writes with no transaction; an HTTP call between `begin` and `commit`.
- **Applies to:** `**/*.{ts,js,mjs,cjs,py,java,kt,go,cs,php,rb,rs,sql}`
- **Source:** -

### BE-09

- **Rule:** A schema migration stays compatible with the code version running now: a column the current code reads is not dropped or renamed in the same release (expand/contract).
- **Sign:** `DROP COLUMN` or `RENAME` in a migration next to code that still reads the field.
- **Applies to:** `**/*.{ts,js,mjs,cjs,py,java,kt,go,cs,php,rb,rs,sql}`
- **Source:** Martin Fowler, ParallelChange

### BE-10

- **Rule:** A public API does not break silently. Removing a field, changing a type or adding a required field goes through a new version or a compatibility period.
- **Sign:** A change to a response or request schema with no version.
- **Applies to:** `**/*.{ts,js,mjs,cjs,py,java,kt,go,cs,php,rb,rs,sql}`
- **Source:** Semantic Versioning 2.0

### BE-11

- **Rule:** No database query runs inside a loop (N+1). A list is paginated and has an upper limit.
- **Sign:** An `await` on a query inside `for` or `map`; a select with no `limit`.
- **Applies to:** `**/*.{ts,js,mjs,cjs,py,java,kt,go,cs,php,rb,rs,sql}`
- **Source:** -

### BE-12

- **Rule:** Logs are structured and carry a request ID. Personal data and tokens are not written to logs.
- **Sign:** A plain-string `console.log`; an email, phone number or token in a log message.
- **Applies to:** `**/*.{ts,js,mjs,cjs,py,java,kt,go,cs,php,rb,rs,sql}`
- **Source:** OWASP Logging Cheat Sheet

### BE-13

- **Rule:** A domain rule is tested without starting an HTTP server or a database. The transport handler parses the request and calls the rule.
- **Sign:** A new business condition inside an HTTP handler or an SQL query.
- **Applies to:** `**/*.{ts,js,mjs,cjs,py,java,kt,go,cs,php,rb,rs,sql}`
- **Source:** Hexagonal Architecture, A. Cockburn
