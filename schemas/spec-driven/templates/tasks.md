<!-- Delete every comment and every angle placeholder before you hand this in. -->

# <change name> - implementation plan

**Goal:** <one sentence>

**Spec:** <path to the change directory>

<!-- tasks.md is an index. Each heading below links to a file one path
     segment below it, holding that section's own "Depends on:" line and
     its tasks, numbered and labelled the same way this comment is:

     Depends on: none

     - [ ] 1.1 [A] <task: the file it touches and the check that proves it works>
           -> <capability>#<requirement name>
     - [ ] 1.2 [A] <write the failing test>
     - [ ] 1.3 [A] <run the test and watch it fail>
     - [ ] 1.4 [A] <write the implementation>
     - [ ] 1.5 [A] <run the test and watch it pass> -->

<!-- A task that carries out a requirement of a delta spec ends with a line
     "-> <capability>#<requirement name>", the name copied from the heading
     "### Requirement:" word for word. -->

<!-- The bracket right after the number is a group label, one to eight
     letters, digits or hyphens - "[A]", "[store]". Every task carries
     exactly one. Tasks sharing a label may run in one agent; a task with
     no label, or with two, is a finding the plan gate catches on its own.
     A TDD triple - the failing test, watching it fail, the implementation -
     names the same file in all three tasks, so all three keep the same
     label: two groups of one section may not name the same file, and
     splitting the triple across labels would trip that rule. -->

## 1. <section name>

`tasks/01-<section name, kebab-case>.md`

## 2. <next section name>

`tasks/02-<next section name, kebab-case>.md`
