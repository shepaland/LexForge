# Data stores and services

Read this when a requirement changes a store or introduces a service. A store is a database
the project owns.

## The data stores of the project

Run this step when `lexforge/config.yaml` has no `data_stores` key, before the first data
requirement.

1. Look in the repository for evidence of databases: images in compose files, driver
   dependencies, ORM providers, connection strings in example configs and migration folders.
2. Show the user each store you found, with its dialect and the file and line it came from.
   Wait for the user to confirm.
3. Save each confirmed store with `lexforge stores add <name> --dialect <dialect>`. The name is
   kebab-case, such as `main`. The dialect is a SQL dialect such as `postgresql`, `mysql`,
   `sqlite` or `transactsql`, or another kind such as `mongodb`.

Never write `data_stores` into `lexforge/config.yaml` by hand. Never save a found store before
the user says yes: a compose image may be a test database.

If you find no evidence, ask the user which stores the project uses and with which dialect.
Then run `lexforge stores add` for each answer.

After the last store is saved, write the requirement.

## A requirement that changes a store

This covers a requirement that creates, changes or removes a table, a field, a key or an index,
or moves stored data.

1. Write a `Data:` line naming the stores it affects, such as `Data: main`. Separate several
   stores with commas.
2. Write the schema, the up step and the down step of each store before you run
   `lexforge validate <name> --strict`. They go to `data/<store>/` in the change, as
   `schema`, `up` and `down`. The extension is `.sql` for a SQL dialect and `.md` for any
   other kind; for `.md`, follow the next section.
3. Run `lexforge validate <name> --strict` and fix every finding it shows.

The up step must take the project schema to the change schema. The down step must take the
change schema back to the project schema. The project schema is the one under
`lexforge/data/<store>/`; it is empty for a store that has none yet. `validate` names each
difference. Fix the step it names.

On the first change of a store, tell the user that the schema of the change must hold the
whole store: every table, including the ones this change leaves alone. Then write it.

## Markdown files for a store that is not SQL

Use this for a dialect such as `mongodb`. Every table needs a primary key, in SQL stores too.

`schema.md` holds one `## Table: <name>` section for each table of the whole store. Each section
has a field table and a key table:

```
## Table: returns

| Field | Type | Nullable | Default |
|---|---|---|---|
| id | string | no | |
| order_id | string | no | |

| Key | Fields |
|---|---|
| primary | id |
| foreign | order_id -> orders.id |
```

Nullable is `yes` or `no`. Key is `primary`, `unique`, `index` or `foreign`. A foreign key is
written `column -> table.column`.

`up.md` and `down.md` use the same heading with a mode at the end: `(create)`, `(alter)` or
`(drop)`, as in `## Table: <name> (create)`. A `(create)` section reads like one in `schema.md`. A `(drop)` section
needs no table. An `(alter)` section has a table with an `Action` column, and the action is
`add`, `change` or `drop`:

```
## Table: returns (alter)

| Action | Field | Type | Nullable | Default |
|---|---|---|---|---|
| add | reason | string | yes | |

| Action | Key | Fields |
|---|---|---|
| add | index | order_id |
```

A key cannot be changed. Drop it in one row and add it in another.

`up.md` and `down.md` each need a `## Data migration` section that is not empty. Write there
what happens to the stored data, or why none moves. Then run
`lexforge validate <name> --strict`.

## A new service

This covers a requirement that introduces a service.

Ask the user the three classification questions one per message, in this order:

1. Owns data that outlives a request. Ask: does the service own such data?
2. Another instance resumes interrupted work. Ask: must another instance resume work that
   stopped halfway?
3. Instances coordinate with each other. Ask: do the instances need to talk to each other?

The three names are the row names of the Classification table you write later.

Send the first question alone. Wait for the user's answer to each question before you send the
next. Never answer a question for the user, even when the code seems to say the answer.

On "I don't know", work through the question with the user until the answer is yes or no. Ask
what happens in a case the user can picture. For the second question: what happens to an
unfinished send when an instance stops? Write no answer until the user says yes or no.

After the third answer:

1. Write a `Service: <name>` line in the requirement. The name is kebab-case.
2. Write `services/<name>/service.md` in the change. It opens with `# Service: <name>`.
3. Under `## Classification`, write one table row per question, with the answer yes or no, and
   a `Type:` line. The type is stateful when any answer is yes. It is stateless when all three
   answers are no.
4. On a yes to the first question, add a `Stores:` line under `## Classification`, next to the
   `Type:` line, naming the stores the service owns. Each store it names must already be saved
   with `lexforge stores add`. Each must also have a schema in the change under `data/<store>/`
   or in `lexforge/data/<store>/`. If one is missing, go back to the stores step above.
5. Add a `##` section for each of these, and fill it: Boundary, Dependencies, Health checks,
   Shutdown, Configuration, Observability. A stateful service also takes State storage,
   Restart and failure, Scaling, Backup and restore, Consistency, Concurrency, Replication and
   failover, Retention, Live migrations and Warm-up. A stateless service takes No state between
   requests, Request and session data, Horizontal scaling, Idempotency, Cache, Retries and
   deduplication, Limits and Autoscaling.
6. Run `lexforge validate <name> --strict` and fix every finding it shows.
