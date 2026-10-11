# PHP rules

Rules for PHP code. Each rule blocks a cycle when its sign shows in the diff.

### PHP-01

- **Rule:** SQL takes values through prepared statements. A variable placed in the query text opens it to injection.
- **Sign:** A variable interpolated or concatenated into the string passed to `query`, `mysqli_query` or `exec`.
- **Applies to:** `**/*.php`
- **Source:** OWASP SQL Injection Prevention Cheat Sheet

### PHP-02

- **Rule:** Tokens and hashes are compared with `hash_equals`. The `==` operator is not constant-time and coerces types.
- **Sign:** `==`, `===` or `strcmp` between request input and a token or signature.
- **Applies to:** `**/*.php`
- **Source:** PHP Manual, hash_equals

### PHP-03

- **Rule:** Input is never passed to `unserialize`. Use `json_decode`.
- **Sign:** `unserialize` called on a request value, a cookie or a stored field a user can write.
- **Applies to:** `**/*.php`
- **Source:** OWASP Deserialization Cheat Sheet

### PHP-04

- **Rule:** Output that carries user data is escaped for its context, with `htmlspecialchars` for HTML.
- **Sign:** `echo` or `print` of `$_GET`, `$_POST`, `$_REQUEST` or a stored user field without `htmlspecialchars`.
- **Applies to:** `**/*.php`
- **Source:** OWASP Cross Site Scripting Prevention Cheat Sheet

### PHP-05

- **Rule:** Each file opts into strict types. Without it PHP converts scalar arguments silently.
- **Sign:** A new PHP file whose first statement is not `declare(strict_types=1);`.
- **Applies to:** `**/*.php`
- **Source:** PHP Manual, Strict typing
