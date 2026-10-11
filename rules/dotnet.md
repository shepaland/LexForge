# .NET rules

Rules for C# code. Each rule blocks a cycle when its sign shows in the diff.

### NET-01

- **Rule:** Await a task. Blocking on `.Result` or `.Wait()` can deadlock and takes a thread for the whole wait.
- **Sign:** `.Result`, `.Wait()` or `.GetAwaiter().GetResult()` on a `Task` in application code.
- **Applies to:** `**/*.cs`
- **Source:** Microsoft Learn, Async/Await best practices

### NET-02

- **Rule:** An async method returns `Task`. An exception thrown from `async void` cannot be caught by the caller and ends the process.
- **Sign:** An `async void` method that is not an event handler.
- **Applies to:** `**/*.cs`
- **Source:** Microsoft Learn, Async/Await best practices

### NET-03

- **Rule:** SQL takes values as parameters. An interpolated string in a raw query opens it to injection.
- **Sign:** A `$"..."` string or a concatenation passed to `FromSqlRaw`, `ExecuteSqlRaw` or `SqlCommand`.
- **Applies to:** `**/*.cs`
- **Source:** Microsoft Learn, Entity Framework Core raw SQL queries

### NET-04

- **Rule:** Get an `HttpClient` from `IHttpClientFactory` or reuse one instance. A new client per request exhausts sockets.
- **Sign:** `new HttpClient()` inside a method that serves a request or runs in a loop.
- **Applies to:** `**/*.cs`
- **Source:** Microsoft Learn, Use IHttpClientFactory

### NET-05

- **Rule:** A catch block handles the error or rethrows it. An empty one hides the failure.
- **Sign:** A `catch` block with no statements, or one holding only a comment.
- **Applies to:** `**/*.cs`
- **Source:** Microsoft Learn, Exception handling best practices
