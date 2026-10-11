# Ruby rules

Rules for Ruby and Rails code. Each rule blocks a cycle when its sign shows in the diff.

### RB-01

- **Rule:** Query conditions use placeholders or hash arguments. Interpolating input into SQL opens it to injection.
- **Sign:** `#{...}` inside a string passed to `where`, `find_by_sql`, `order` or `pluck`.
- **Applies to:** `**/*.{rb,erb}`
- **Source:** Rails Guides, Securing Rails Applications, SQL Injection

### RB-02

- **Rule:** Controllers permit named attributes through strong parameters. Mass assignment of everything lets a user set any field.
- **Sign:** `params.permit!`, or `create` and `update` called with raw `params`.
- **Applies to:** `**/*.{rb,erb}`
- **Source:** Rails Guides, Action Controller Overview, Strong Parameters

### RB-03

- **Rule:** Rescue the specific error and handle it. Rescuing `Exception` also catches interrupts, and a swallowed error hides the failure.
- **Sign:** `rescue Exception`, or a `rescue` block that is empty or only returns `nil`.
- **Applies to:** `**/*.{rb,erb}`
- **Source:** Ruby Style Guide, Exceptions

### RB-04

- **Rule:** Associations used in a loop are loaded up front with `includes`. Otherwise each item runs its own query.
- **Sign:** An association call inside `each`, `map` or a view loop over a relation with no `includes` or `preload`.
- **Applies to:** `**/*.{rb,erb}`
- **Source:** Rails Guides, Active Record Query Interface, Eager Loading

### RB-05

- **Rule:** User data is escaped by the template. `html_safe` and `raw` switch escaping off for that string.
- **Sign:** `html_safe`, `raw` or `<%==` applied to a param, a stored user field or a string built from one.
- **Applies to:** `**/*.{rb,erb}`
- **Source:** Rails Guides, Securing Rails Applications, Cross-Site Scripting
