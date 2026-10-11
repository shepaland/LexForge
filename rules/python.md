# Python rules

Rules for Python code. Each rule blocks a cycle when its sign shows in the diff.

### PY-01

- **Rule:** A default argument value is immutable. A list, dict or set default is built once and shared by every call.
- **Sign:** A function signature with `=[]`, `={}` or `=set()` as a default value.
- **Applies to:** `**/*.py`
- **Source:** Python documentation, Defining Functions, Default Argument Values

### PY-02

- **Rule:** Catch the narrowest exception the code can handle. A handler that swallows everything hides real failures.
- **Sign:** A bare `except` or `except Exception` whose body is only `pass`.
- **Applies to:** `**/*.py`
- **Source:** PEP 8, Programming Recommendations

### PY-03

- **Rule:** SQL takes values as parameters of `execute`. Formatting the query text with user data opens it to injection.
- **Sign:** An f-string, `%` formatting, `.format` or `+` building the string passed to `execute` or `executemany`.
- **Applies to:** `**/*.py`
- **Source:** OWASP SQL Injection Prevention Cheat Sheet

### PY-04

- **Rule:** Input is never deserialized with a loader that runs code. Use JSON, or `yaml.safe_load`.
- **Sign:** `pickle.loads`, `yaml.load` without `SafeLoader`, or `eval` and `exec` applied to input or a stored value.
- **Applies to:** `**/*.py`
- **Source:** OWASP Deserialization Cheat Sheet

### PY-05

- **Rule:** Every outbound HTTP call sets a timeout. Without one a stalled peer holds the worker forever.
- **Sign:** A `requests.get`, `requests.post`, `httpx.get` or `httpx.post` call with no `timeout=` argument.
- **Applies to:** `**/*.py`
- **Source:** Requests documentation, Timeouts
