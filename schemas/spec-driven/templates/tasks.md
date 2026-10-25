<!-- Delete every comment and every angle placeholder before you hand this in. -->

# <change name> - implementation plan

**Goal:** <one sentence>

**Spec:** <path to the change directory>

<!-- tasks.md is an index. Each heading below links to a file one path
     segment below it, holding that section's own "Depends on:" line and
     its tasks, numbered and written the same way this comment is:

     Depends on: none

     - [ ] 1.1 <what the task does, in a sentence or two>
           -> <capability>#<requirement name>
           Files: `<path the task writes>`, `<test file the task writes>`
           Test: `<test file>`
           Command: `<the one command that runs the test>`
           Depends on: <number of an earlier task, if it needs one>
           Controls: <authorization, cryptography, tenant-isolation or migrations, if the task touches one> -->

<!-- One task is one behaviour with its own test: the test is written and
     watched to fail first, then the implementation makes it pass, all inside
     the one task. Files lists every file the task writes. Test names the test
     file and Command the one command that runs it. A task that only carries
     code between files declares it with (move) right after its number and
     needs no Test. Depends on names earlier tasks by number; two tasks that
     write one file need an order between them. Controls is optional. -->

<!-- Keep requirements, acceptance checks, scope and links in each task. Decisions,
     questions, promises, permissions and rulings go into the change journal with
     `lexforge journal add`, never into the plan. -->

<!-- A task that carries out a requirement of a delta spec ends with a line
     "-> <capability>#<requirement name>", the name copied from the heading
     "### Requirement:" word for word. -->

## 1. <section name>

`tasks/01-<section name, kebab-case>.md`

## 2. <next section name>

`tasks/02-<next section name, kebab-case>.md`
