# Review rules

Rules for the reviewer. Each rule is checked in the review report.

### RV-01

- **Rule:** The review checks the diff against the requirements and scenarios of the change: every requirement has code and a test, and there is no behavior beyond the requirements.
- **Sign:** A report with no check against the requirements.
- **Applies to:** `**/*`
- **Source:** -

### RV-02

- **Rule:** A finding names the file and line, the rule or requirement, and a failure scenario: which input gives which wrong result.
- **Sign:** A finding such as "could be better" with no rule and no scenario.
- **Applies to:** `**/*`
- **Source:** -

### RV-03

- **Rule:** A preference with no rule, requirement or failure scenario is not a finding and is not written into the report.
- **Sign:** A remark of taste in the report.
- **Applies to:** `**/*`
- **Source:** Google Eng Practices, The Standard of Code Review

### RV-04

- **Rule:** Review order: correctness and security first, then tests, then code structure and readability.
- **Sign:** A report that puts findings on naming or style above findings on correctness or security.
- **Applies to:** `**/*`
- **Source:** Google Eng Practices, What to look for

### RV-05

- **Rule:** Tests are read like code. A test that would pass against a broken implementation is a finding. The reviewer checks this by inverting the condition in the code and asking whether the test fails.
- **Sign:** A test with no assertion about a result the change touches.
- **Applies to:** `**/*`
- **Source:** -

### RV-06

- **Rule:** The review also looks at what is not in the diff: callers of the changed function, error handling, migrations, configuration, documentation.
- **Sign:** A signature changed and its callers not checked.
- **Applies to:** `**/*`
- **Source:** Google Eng Practices

### RV-07

- **Rule:** A finding is closed by a code or test change, or by proof that the failure scenario is impossible. The author's explanation without a change does not close it.
- **Sign:** A finding dropped with the comment "works as intended".
- **Applies to:** `**/*`
- **Source:** -

### RV-08

- **Rule:** A repeat review looks at the fix patch and at the closing of the earlier findings.
- **Sign:** A repeat review report that does not give the status of each earlier finding.
- **Applies to:** `**/*`
- **Source:** LexForge 3.0.0

### RV-09

- **Rule:** A new dependency is checked: whether it is needed, its license, whether it is maintained, known vulnerabilities.
- **Sign:** A new package with no record of the check.
- **Applies to:** `**/*`
- **Source:** OWASP Top 10 A06

### RV-10

- **Rule:** Readability: names from the domain, one responsibility per function, no dead or commented-out code, no file over 400 lines.
- **Sign:** A commented-out block; a file over 400 lines.
- **Applies to:** `**/*`
- **Source:** LexForge file-size limit

### RV-11

- **Rule:** A change over 400 diff lines is split into parts before review.
- **Sign:** A cycle with a diff over 400 lines.
- **Applies to:** `**/*`
- **Source:** SmartBear, Cisco code review study
