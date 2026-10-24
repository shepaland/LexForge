# The digest

The owner approves the plan from the digest, so the digest carries what the owner cannot
see from the reviewers' verdicts: the calls you made yourself. Send it only after all four
angles approved the current plan. A request for brevity shortens each line; it does not
drop a decision or move it to the end.

Lay it out in this order:

1. Decisions I made. Every choice the delta specs and the owner did not fix: a format, a
   default, a name users see, where a file lives, the order of sections. Put first the
   ones that change what a user, a client or another system sees, each with what it
   looks like after the change and the alternative you did not take. Then the internal
   ones, one line each.
2. Reviews. The four angles - `specs`, `code`, `dependencies`, `gaps` - each with its
   verdict and the number of findings it closed, by level: "specs: approved, 1 important
   closed".
3. The plan. A link to `lexforge/changes/<name>/tasks.md`, the number of sections and
   tasks, and the question: approve, or which decision to change.

No decision of your own: write "Decisions I made: none" so the owner knows the list was
not skipped.

Wait for the owner's own words. A changed decision is a plan change: rewrite the tasks,
run `lexforge check plan` and send the angles their review again before a new digest.
Approval is `lexforge plan approve --change <name> --quote "<owner's words>"`, the words
copied as written.
