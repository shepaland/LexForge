# Testing rules

Rules for test files. Each rule blocks a cycle when its sign shows in the diff.

### TS-01

- **Rule:** Every behavior change comes with a test that failed before the change. A defect fix starts with a test that reproduces the defect.
- **Sign:** Behavior code with no test; a test with no recorded red run.
- **Applies to:** `**/*.{test,spec}.*`, `**/test_*.py`, `**/*_test.py`, `**/*_test.go`, `**/*Test.{java,kt}`, `**/*Tests.cs`, `**/*Test.php`, `**/*_{spec,test}.rb`, `**/tests/**/*.rs`
- **Source:** Kent Beck, TDD by Example

### TS-02

- **Rule:** A test checks observable behavior through the public interface. Only the system boundary is replaced: network, time, file system, external services.
- **Sign:** A mock of the project's own module; `toHaveBeenCalled` checked instead of the result.
- **Applies to:** `**/*.{test,spec}.*`, `**/test_*.py`, `**/*_test.py`, `**/*_test.go`, `**/*Test.{java,kt}`, `**/*Tests.cs`, `**/*Test.php`, `**/*_{spec,test}.rb`, `**/tests/**/*.rs`
- **Source:** Google Testing Blog, Test Behavior, Not Implementation

### TS-03

- **Rule:** A test is deterministic: no `sleep` for synchronization, no real clock, no unseeded randomness, no dependence on run order or on the external network.
- **Sign:** `setTimeout` or `sleep` in a test; `Date.now()` not replaced; a request to an external address.
- **Applies to:** `**/*.{test,spec}.*`, `**/test_*.py`, `**/*_test.py`, `**/*_test.go`, `**/*Test.{java,kt}`, `**/*Tests.cs`, `**/*Test.php`, `**/*_{spec,test}.rb`, `**/tests/**/*.rs`
- **Source:** Martin Fowler, Eradicating Non-Determinism in Tests

### TS-04

- **Rule:** One test checks one behavior. The test name states the condition and the expected result.
- **Sign:** A test with several unrelated scenarios; a name such as `works` or `test 1`.
- **Applies to:** `**/*.{test,spec}.*`, `**/test_*.py`, `**/*_test.py`, `**/*_test.go`, `**/*Test.{java,kt}`, `**/*Tests.cs`, `**/*Test.php`, `**/*_{spec,test}.rb`, `**/tests/**/*.rs`
- **Source:** -

### TS-05

- **Rule:** An assertion checks a concrete value. "Did not throw", `toBeTruthy` on an object and a snapshot of a whole component prove no behavior.
- **Sign:** `expect(x).toBeDefined()` as the only check; a new large snapshot.
- **Applies to:** `**/*.{test,spec}.*`, `**/test_*.py`, `**/*_test.py`, `**/*_test.go`, `**/*Test.{java,kt}`, `**/*Tests.cs`, `**/*Test.php`, `**/*_{spec,test}.rb`, `**/tests/**/*.rs`
- **Source:** -

### TS-06

- **Rule:** A new code branch is covered by edge cases: empty input, range limits, a failing dependency, a repeated call.
- **Sign:** An `if` or `catch` branch with no test that enters it.
- **Applies to:** `**/*.{test,spec}.*`, `**/test_*.py`, `**/*_test.py`, `**/*_test.go`, `**/*Test.{java,kt}`, `**/*Tests.cs`, `**/*Test.php`, `**/*_{spec,test}.rb`, `**/tests/**/*.rs`
- **Source:** -

### TS-07

- **Rule:** A test creates its own data and cleans it up. Shared mutable state between tests is not allowed.
- **Sign:** A test relies on data another test created; a global variable changed with no reset.
- **Applies to:** `**/*.{test,spec}.*`, `**/test_*.py`, `**/*_test.py`, `**/*_test.go`, `**/*Test.{java,kt}`, `**/*Tests.cs`, `**/*Test.php`, `**/*_{spec,test}.rb`, `**/tests/**/*.rs`
- **Source:** -

### TS-08

- **Rule:** The test level follows the risk. Logic gets unit tests. Database and HTTP code gets integration tests against the real dependency when a mock would hide its behavior. End-to-end tests cover key user paths only.
- **Sign:** A SQL query checked only against a driver mock; an end-to-end test for a validation branch.
- **Applies to:** `**/*.{test,spec}.*`, `**/test_*.py`, `**/*_test.py`, `**/*_test.go`, `**/*Test.{java,kt}`, `**/*Tests.cs`, `**/*Test.php`, `**/*_{spec,test}.rb`, `**/tests/**/*.rs`
- **Source:** Martin Fowler, Test Pyramid

### TS-09

- **Rule:** A frontend test finds an element by role and label. `data-testid` is used only when the element has neither, and CSS classes are not used.
- **Sign:** `querySelector('.btn')`; `getByTestId` on a button that has text.
- **Applies to:** `**/*.{test,spec}.*`, `**/test_*.py`, `**/*_test.py`, `**/*_test.go`, `**/*Test.{java,kt}`, `**/*Tests.cs`, `**/*Test.php`, `**/*_{spec,test}.rb`, `**/tests/**/*.rs`
- **Source:** Testing Library, guiding principles

### TS-10

- **Rule:** A test is not disabled or weakened to get a green run: no `skip`, `only`, `xit` or deleted assertions.
- **Sign:** `.skip` or `.only`; an assertion deleted together with a code change.
- **Applies to:** `**/*.{test,spec}.*`, `**/test_*.py`, `**/*_test.py`, `**/*_test.go`, `**/*Test.{java,kt}`, `**/*Tests.cs`, `**/*Test.php`, `**/*_{spec,test}.rb`, `**/tests/**/*.rs`
- **Source:** -

### TS-11

- **Rule:** A flaky test is a defect. It is fixed or recorded in the defect registry, and rerunning until green does not count as a run.
- **Sign:** `retry` in the test config; a rerun with no defect recorded.
- **Applies to:** `**/*.{test,spec}.*`, `**/test_*.py`, `**/*_test.py`, `**/*_test.go`, `**/*Test.{java,kt}`, `**/*Tests.cs`, `**/*Test.php`, `**/*_{spec,test}.rb`, `**/tests/**/*.rs`
- **Source:** Google Testing Blog, Flaky Tests at Google
