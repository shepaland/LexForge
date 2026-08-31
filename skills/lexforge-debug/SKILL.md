---
name: lexforge-debug
description: Use when a test fails, a build breaks, a bug is reported or code behaves unexpectedly - before naming a cause or proposing a fix, and again when a fix has already been tried and the problem is still there.
---

<!-- queue-rule:start -->

<!-- model-gate:start -->
## Model gate

`role`, `provider` and `model` name the model this work runs on. Read them from
`lexforge instructions <artifact> --change <name> --json` when you write an artifact, and
from your own entry in `stages` of `lexforge status --change <name> --json` when you do
not: your entry is the one whose `stage` is your own name without the `lexforge-` prefix.
An empty `model` demands nothing, and so does no workspace, no change and no entry of
your own — nothing to compare, so work.

Running on that model: work, and say nothing about models. Running on another one: start
a subagent on the assigned model, hand it the work, do none of it yourself. Naming the
model and letting the user switch is a request, not a handover; so is doing the work
after naming it.

Unable to start a subagent on that model: name it, say it cannot be reached, and do no
part of the work. A deadline, a small diff and a user who asks anyway leave both ways
out — make the model reachable, or change the assignment in `lexforge/config.yaml`.

| Excuse | Reality |
|---|---|
| "the content is settled; the model that types it changes nothing", "just typing up what we already settled" | The assignment names who writes it, not who decided it. |
| "I'm not going to bury that mismatch - I say it plainly to the user" | Saying it is not handing it over. The work is done either way. |
| "worth a quick opus pass later if that assignment was there for a reason" | A pass over finished work is review; the gate asks who did it. |
| "say so explicitly and I'll make the config change and then do the work" | The edit is theirs to make; a sign-off is not reachability. |
<!-- model-gate:end -->
<!-- queue-rule:end -->

## The rule

**NEVER NAME A FIX BEFORE YOU HAVE NAMED THE CAUSE.**

Violating the letter of this rule is violating its spirit.

## What a found cause is

Three statements: where the wrong value first appears, the path it took to the failing
line, and the change after which the behaviour started.

A symptom matching a guess is not a cause. A rule explaining how the value *could* be
wrong is not one either: it covers the class, not this run. A write-up, a green
pipeline, a documented default, five call sites doing the same - evidence to check, not
the answer. Urgency moves none of this.

## Four phases

Finish each before the next.

1. **Cause.** Read the whole error. Reproduce it. Read the recent changes to the code it
   touches. Follow the wrong value back to where it appears.
2. **Comparison.** Find the nearest case that works, list every difference.
3. **Hypothesis.** State one, in words, and test it with the smallest change that can
   disprove it. It survived? Phase 4. It did not? Back to phase 1 with what you learned,
   never a second change on top of the first.
4. **Fix.** One change, at the cause.

Two changes in one run cannot be told apart by the result.

## The test comes first

Write a test that reproduces the bug, run it, quote the failing line - then change code.
A test that passes first time is testing something else. Checking by hand is not a test:
it does not run again tomorrow. A test written after the fix pins the fix, not the bug.

## Three failed fixes end the fixing

Count them. After the third change that left the bug alive or moved it somewhere new,
stop and talk to the user about how the system is put together. Say the count and what
each attempt turned up. No fourth change before that conversation: not a smaller one,
not one a layer down, not the one that finally looks like the real cause.
A fix that cannot land without rewriting the layer beside it is the same signal.

## Say when you do not know

Name the part you could not work out and ask. A plausible story is not an investigation,
and a fix "just in case" is a guess with a paragraph in front of it.

## Rationalizations

| Excuse | Reality |
|---|---|
| "safe regardless of *why* `discount` is undefined" | If the reason does not matter, you never asked what the wrong value does once it stops crashing. |
| "a complete causal chain from documented producer behavior to the exact `TypeError`", "nothing left for a mapper trace to establish" | That chain says how the field may be absent, not why it is absent here. |
| "I'll trace `discount` through the mapper end-to-end after the page is back up", "not tonight's gate" | The investigation you postpone is the one you skip. |
| "it would silently paper over a genuine mapper bug. That's why the test goes in with it" | A test written from the fix asserts the fix; it passes on the bug too. |
| "refusing to act ignores a direct instruction the user gave with full awareness of the history" | Nobody counted the attempts out loud, so nobody was choosing a fourth one. |
| "The risk, so you have it in writing before you sleep" | A warning handed over with the change is a receipt, not a warning. |

## Red flags - stop

- Code changed before the wrong value was traced.
- Two changes in one run.
- A test written after the fix.
- A fourth attempt.
- A cause taken unchecked from a colleague or a green pipeline.
- A fix shipped with its risk named beside it.

Go back to phase 1.
