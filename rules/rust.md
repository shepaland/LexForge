# Rust rules

Rules for Rust code. Each rule blocks a cycle when its sign shows in the diff.

### RS-01

- **Rule:** Input and I/O errors are returned or handled. `unwrap` and `expect` turn a bad input into a panic.
- **Sign:** `.unwrap()` or `.expect(...)` on parsing, file, network or request results outside tests and `main`.
- **Applies to:** `**/*.rs`
- **Source:** The Rust Programming Language, Recoverable Errors with Result

### RS-02

- **Rule:** Each `unsafe` block carries a comment that states why its invariants hold.
- **Sign:** An `unsafe` block or `unsafe impl` with no `// SAFETY:` comment directly above it.
- **Applies to:** `**/*.rs`
- **Source:** Clippy lint `undocumented_unsafe_blocks`

### RS-03

- **Rule:** An async function does not block its thread. Use the async form of file access and timers.
- **Sign:** `std::fs` calls or `std::thread::sleep` inside an `async fn` or an `async` block.
- **Applies to:** `**/*.rs`
- **Source:** Tokio documentation, Bridging with sync code

### RS-04

- **Rule:** SQL takes values as bind parameters. Building the query with `format!` opens it to injection.
- **Sign:** `format!` output passed to `query`, `query_as`, `execute` or `prepare`.
- **Applies to:** `**/*.rs`
- **Source:** OWASP SQL Injection Prevention Cheat Sheet

### RS-05

- **Rule:** Library code returns an error for any failure the caller can handle. Only a broken invariant justifies `panic!`.
- **Sign:** `panic!`, `unreachable!` or `todo!` on an error path in a library crate.
- **Applies to:** `**/*.rs`
- **Source:** The Rust Programming Language, To panic! or Not to panic!
