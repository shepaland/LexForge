# Go rules

Rules for Go code. Each rule blocks a cycle when its sign shows in the diff.

### GO-01

- **Rule:** Every returned error is checked. A dropped error lets the code carry on with a value that was never produced.
- **Sign:** `_` in place of an `error` result, or a call whose `error` result is not assigned.
- **Applies to:** `**/*.go`
- **Source:** Effective Go, Errors

### GO-02

- **Rule:** An HTTP client and an outbound request carry a timeout or a context. The default client waits forever.
- **Sign:** `http.Get`, `http.DefaultClient` or `http.Client{}` with no `Timeout`, or `http.NewRequest` with no context.
- **Applies to:** `**/*.go`
- **Source:** Go documentation, net/http Client

### GO-03

- **Rule:** Every goroutine has a way to stop: a context, a closed channel or a WaitGroup that the caller waits on.
- **Sign:** A `go func()` or `go name()` whose body loops or blocks and takes no context, done channel or `WaitGroup`.
- **Applies to:** `**/*.go`
- **Source:** Go Blog, Go Concurrency Patterns: Pipelines and cancellation

### GO-04

- **Rule:** SQL takes values as placeholders. Building the query text with formatting opens it to injection.
- **Sign:** `fmt.Sprintf` or string concatenation producing the query passed to `Query`, `QueryRow` or `Exec`.
- **Applies to:** `**/*.go`
- **Source:** OWASP SQL Injection Prevention Cheat Sheet

### GO-05

- **Rule:** Wrap an error with `%w` so callers can inspect it. The client gets a short message, not the internal error text.
- **Sign:** `fmt.Errorf` with `%v` or `%s` for an error, or `err.Error()` written into an HTTP response.
- **Applies to:** `**/*.go`
- **Source:** Go Blog, Working with Errors in Go 1.13
