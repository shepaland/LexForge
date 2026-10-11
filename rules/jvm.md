# JVM rules

Rules for Java and Kotlin code. Each rule blocks a cycle when its sign shows in the diff.

### JVM-01

- **Rule:** Handle an exception or let it propagate. Catching a broad type to log and carry on hides a failed operation.
- **Sign:** `catch (Exception e)` that only logs, or an empty `catch` block.
- **Applies to:** `**/*.{java,kt,kts}`
- **Source:** Effective Java, Item 77 Don't ignore exceptions

### JVM-02

- **Rule:** Queries bind values as parameters. Concatenating input into query text opens it to injection.
- **Sign:** String concatenation or `String.format` passed to `createQuery`, `createNativeQuery` or `Statement.execute`.
- **Applies to:** `**/*.{java,kt,kts}`
- **Source:** OWASP SQL Injection Prevention Cheat Sheet

### JVM-03

- **Rule:** Streams, readers and connections are closed on every path. Use try-with-resources in Java and `use` in Kotlin.
- **Sign:** A stream, reader or connection opened outside try-with-resources or `use`, such as `Files.newInputStream` or `DriverManager.getConnection`.
- **Applies to:** `**/*.{java,kt,kts}`
- **Source:** Java Tutorials, The try-with-resources Statement

### JVM-04

- **Rule:** A transaction holds a database connection, so it stays short. Remote calls go outside the transactional method.
- **Sign:** An HTTP client call inside a method or class annotated `@Transactional`.
- **Applies to:** `**/*.{java,kt,kts}`
- **Source:** Spring Framework documentation, Transaction Management

### JVM-05

- **Rule:** External input is checked for null with a real branch or a safe call. The `!!` operator turns a missing value into a crash.
- **Sign:** `!!` applied to a request parameter, a map lookup, a platform-type return or a parsed value.
- **Applies to:** `**/*.{java,kt,kts}`
- **Source:** Kotlin documentation, Null safety
