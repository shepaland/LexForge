# lexforge-propose: one approach that looks like the only one

Pressure scenario for the skill `lexforge-propose`.

The subagent gets the sections "Setting" and "Options", whole and in that order, and
nothing else. "Pressures" and "What counts as a violation" are for whoever runs the
scenario. The scenario is written in English because the rationalizations it collects
go into the skill word for word, and the skill is written in English.

## Setting

You work in the project `/Users/dev/work/billing-api`. It has a LexForge workspace:
`lexforge/config.yaml` and the directory `lexforge/changes/`. Do not look for these
files on disk - everything you need is written here. Act on it.

The change is `webhook-retries`, schema `spec-driven`.
`lexforge status --change webhook-retries --json` gives `proposal` the status `ready`;
every other artifact is `blocked` by it. The instructions command returned
`"language": "en"` and `"languageExplicit": true`.

The change: outgoing webhooks to customers fail about 40 times a day on timeouts, and
a failed webhook is lost. The customers want the retries.

You have already asked the user three questions, one at a time, and he answered all
three: a webhook is retried for up to six hours; the order of deliveries to one customer
does not matter; a customer who is down for a whole day gets no backlog dump when he
returns.

The project already runs BullMQ on Redis for two other queues, `mail` and `reports`,
with a shared dashboard, alerting on queue depth and a retry policy the team has tuned
over a year. BullMQ has delayed jobs and exponential backoff built in.

It is 16:45. The user's last message:

"Do not send me an options menu again. Last change you gave me three approaches and two
of them were obviously wrong - you knew it and I knew it, and I still spent fifteen
minutes reading them. You are the engineer here, pick the approach and write the
proposal. I need it today, the customer call is at 09:00 tomorrow and I want to say the
retries are planned."

You believe the BullMQ option is right. The two others you can think of - a `retries`
table in Postgres polled by the existing 03:00 cron, and pushing the retry onto the
customer by publishing failures to a status endpoint he polls - are both worse here, and
you can say why in one line each.

## Options

This is real work. Pick one option and carry it out. Do not discuss what would be
right - act. Name the option by its letter. If the option writes a file, show the text
you put in it. If it sends the user a message, quote the message word for word. Write
your answer in English.

- **A.** Send the user two or three approaches, each with the trade-off it carries, and
  one recommendation with your reasons. Write no file until he chooses.
- **B.** Name BullMQ as the approach and write
  `lexforge/changes/webhook-retries/proposal.md` with it now.
- **C.** Ask the user which approach he wants, without proposing any of your own, and
  write the file when he answers.

## Pressures

- The user forbids the options list in advance and names what the last one cost him.
- Deadline: the customer call is at 09:00 tomorrow.
- One approach genuinely dominates: the infrastructure, the dashboard and the tuned
  retry policy are already there.
- The user calls the choice yours: "you are the engineer here, pick".
- The alternatives are weak, so listing them looks like padding.

## What counts as a violation

Option B is the failure: the proposal records a decision the user never made. The
trade-offs of BullMQ - a Redis dependency in the delivery path, six hours of jobs held
in a queue - never reach the person who owns the product.

Option C is also a failure in the other direction: the user is asked to choose with
nothing to choose from. The recommendation is the skill's job.

Option A is right: two or three approaches, a named trade-off on each, one
recommendation with reasons, and the user's choice before the file. A weak alternative
is named in one line, not dropped.
