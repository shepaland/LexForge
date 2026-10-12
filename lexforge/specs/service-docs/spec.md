# service-docs

## Purpose

Makes the documentation of a service follow from whether it holds state. The owner answers three
questions, the type follows from the answers, and the document carries the sections that type
needs. The executor and the reviewer read the service's state, scaling and failure behaviour
from one file.

## Requirements

### Requirement: A service requirement points at a service document

A requirement whose body holds a line `Service: <service>` SHALL be called a service requirement,
with the service name in kebab-case. Under `validate --strict`, the change SHALL hold
`services/<service>/service.md`, or the project SHALL hold `lexforge/services/<service>/service.md`.
When the change holds the file, the change file SHALL be the one checked. A missing document
SHALL be a finding that names the requirement, the service and the line of `Service:`.

#### Scenario: A new service without a document

- **WHEN** a delta spec holds `Service: notifications` and neither the change nor the project
  holds `service.md` for it
- **THEN** `validate --strict` exits `1` with a finding naming `notifications`

#### Scenario: An existing service the change does not redocument

- **WHEN** the project holds `lexforge/services/orders/service.md` and the change holds no
  document for `orders`
- **THEN** the project document is checked

### Requirement: The document classifies the service by three answers

`service.md` SHALL open with `# Service: <service>` and a `## Classification` section holding a
table of three rows with the answers `yes` or `no` to the questions "Owns data that outlives a
request", "Another instance resumes interrupted work" and "Instances coordinate with each
other", and a line `Type: stateful` or `Type: stateless`. The type SHALL be `stateful` when at
least one answer is `yes` and `stateless` when all three are `no`. A missing answer, an answer
other than `yes` or `no`, or a type that does not follow SHALL be a finding.

#### Scenario: A type that contradicts the answers

- **WHEN** the first answer is `yes` and the document says `Type: stateless`
- **THEN** `validate --strict` exits `1` with a finding naming the service and the type

#### Scenario: An undecided answer

- **WHEN** the second answer reads `not sure`
- **THEN** `validate --strict` exits `1` with a finding naming the question

### Requirement: The document carries the sections of its type

Every `service.md` SHALL carry the sections `Boundary`, `Dependencies`, `Health checks`,
`Shutdown`, `Configuration` and `Observability`. A stateful service SHALL also carry
`State storage`, `Restart and failure`, `Scaling`, `Backup and restore`, `Consistency`,
`Concurrency`, `Replication and failover`, `Retention`, `Live migrations` and `Warm-up`. A
stateless service SHALL also carry `No state between requests`, `Request and session data`,
`Horizontal scaling`, `Idempotency`, `Cache`, `Retries and deduplication`, `Limits` and
`Autoscaling`. No section SHALL be empty; a section that does not apply SHALL say why in one
line. A missing section, an empty one, or a section of the other type SHALL be a finding.

#### Scenario: A stateless service with a backup section

- **WHEN** a document of type `stateless` carries `## Backup and restore`
- **THEN** `validate --strict` exits `1` with a finding naming the section

#### Scenario: A section that does not apply

- **WHEN** a stateless service has no cache and its `## Cache` section reads "No cache: every
  request reads the orders API"
- **THEN** no finding is raised for that section

### Requirement: A service that owns data names its stores

When the first answer is `yes`, the `## Classification` section SHALL hold a line
`Stores: <store>[, <store>...]`, and every store named SHALL be listed in `data_stores` and SHALL
have a schema in the change or under `lexforge/data/<store>/`. A missing line, an unknown store
or a store without a schema SHALL be a finding.

#### Scenario: A stateful service without stores

- **WHEN** the first answer is `yes` and the section has no `Stores:` line
- **THEN** `validate --strict` exits `1` with a finding naming the service and `Stores:`
