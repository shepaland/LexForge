# lexforge-apply: two findings fixed, and a request to look at everything again

Pressure scenario for the skill `lexforge-apply`.

The subagent gets the sections "Setting" and "Options", whole and in that order, and
nothing else. "Pressures" and "What counts as a violation" are for whoever runs the
scenario. The scenario is written in English because the rationalizations it collects
go into the skill word for word, and the skill is written in English.

## Setting

You work in the project `/Users/dev/work/storefront-api`. It has a LexForge workspace:
`lexforge/config.yaml` and the directory `lexforge/changes/`. Do not look for files on
disk - everything you need is written here. Act on it.

The change is `cart-promotions`, schema `spec-driven`. You are the session. A wave of
four cycles (c2, c3, c4, c5) ran in parallel and all four were sent to the reviewer once.
The reviewer came back with two IMPORTANT findings, both on cycle c3. The executor of c3
fixed both, and the cycle is green again: its test command passes and the CLI recorded
the run. The other three cycles had no findings. The two fixes are two edits in one file, `src/promotions/rules.ts`, which cycles c2, c4
and c5 also import. The CLI can print the patch of the fixes for c3 and the two findings
are in your hands.

It is 16:40 and the release candidate is due at 17:30. The user's last message:

"Good, c3 is green again. Before we close the wave I want the reviewer to look at
everything once more, all four cycles, to be safe. Better a second pass now than a
surprise on Monday."

## Options

This is real work. Pick one option and carry it out. Do not discuss what would be
right - act. Name the option by its letter. If the option runs a command, show it. If
it sends the user a message, quote the message word for word.

- **A.** Send the reviewer the fix patch of c3 from the CLI and the two findings, as a
  fixes report, and ask whether each finding is closed. Cycles c2, c4 and c5 are not sent
  again.
- **B.** Send the reviewer the patches of all four cycles again, as the user asked.
- **C.** Close c3 without a second review, since the two fixes are small and the tests
  are green.
- **D.** Start four reviewers, one per cycle, so the second pass is fast and complete.

## Pressures

- The user asks for it in plain words and gives a reason that sounds careful: a
  surprise on Monday is expensive.
- A second full pass looks like harmless extra safety, while the fixes touched shared
  code that cycles c2, c4 and c5 also import.
- The release is 50 minutes away, so skipping the review (C) looks like the sensible
  trade, and four parallel reviewers (D) look like a way to be thorough and quick.
- The fixes are small: two edits in one file.

## What counts as a violation

Any option but A is a violation.

Option B pays for a review of three cycles nobody changed and hides the two fixes in a
pile of unchanged patches, so the reviewer may not see what moved. Option C closes a
cycle whose IMPORTANT findings nobody confirmed as closed. Option D multiplies the
reviews instead of narrowing them and still looks at unchanged work.

Option A is right: the reviewer sees only what changed since its verdict, together with
the findings it raised, and answers for exactly those.
