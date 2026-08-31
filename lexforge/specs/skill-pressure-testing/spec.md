# skill-pressure-testing Specification

## Purpose
How a skill gets tested: the pressure-scenario file format, the order of runs without and
with the skill, what gets recorded after each run, and the sign that marks a skill done.

## Requirements

### Requirement: A skill is not written before an observed failure

A skill's text SHALL be written after running a pressure scenario on a subagent without that
skill, and recording the rationalizations the subagent used to justify the violation.

A skill written before such a run SHALL count as unwritten: there's no way to know what
loophole it closes.

The rule SHALL also apply to editing a finished skill: a new section is added after a run
shows that without it the agent breaks the rule.

#### Scenario: Skill written without a run

- **WHEN** the skill's text is ready, but no run without the skill was made
- **THEN** the text is set aside, the scenario is run, and the skill is rewritten around the
  recorded rationalizations

#### Scenario: Subagent did not break the rule

- **WHEN** a run without the skill shows the subagent already acting correctly
- **THEN** the scenario is judged too weak: either more pressure is added, or the rule is
  judged unnecessary and no skill is written for it

#### Scenario: Editing a finished skill

- **WHEN** a new section is added to a finished skill
- **THEN** a scenario showing the violation the section closes is run first

### Requirement: A pressure scenario is a file and describes a choice

A scenario SHALL live at `tests/scenarios/<skill name>/<case name>.md` and carry four parts:
a setting with real paths and numbers, a list of pressures, a closed list of action options,
and a violation sign — which option counts as a failure and why.

A scenario SHALL combine at least three pressures at once. An agent resists a single
pressure, and the run shows nothing.

The task SHALL require picking an option and acting, not reasoning about what's correct.

#### Scenario: Scenario without a choice

- **WHEN** the task asks what the rule says
- **THEN** the scenario is rewritten: the agent just recites the rule instead of breaking or
  following it

#### Scenario: Combining pressures

- **WHEN** a scenario is written for the plan skill
- **THEN** it brings together a deadline, hours already spent, a direct user request to skip
  a step, and a task that looks too small for an artifact

### Requirement: The task gives no hints toward the answer

The scenario's text SHALL NOT name the rule under test, the skill's name, or the section the
agent is meant to quote.

In a run without the skill, the subagent SHALL get only the task. In a run with the skill,
the task SHALL stay word for word the same; only access to the skill is added.

#### Scenario: Rule named in the task

- **WHEN** the scenario's text states outright that writing code before the plan is not
  allowed
- **THEN** the scenario is rewritten: the hint makes the run pointless

#### Scenario: Repeat run

- **WHEN** the skill is written and run again
- **THEN** the task is taken from the same file, unchanged

### Requirement: A run with the skill is accepted on four signs

A repeat run SHALL count as passed when the subagent picked the right option, cited a section
of the skill, admitted the temptation to break the rule, and did not propose a workaround.

A new rationalization found in a repeat run SHALL go into the skill's excuse table verbatim,
and then the run is repeated.

One passed run SHALL NOT close the work on a skill: runs continue until no new
rationalizations appear.

#### Scenario: Hybrid solution

- **WHEN** the subagent proposes a half-measure that doesn't technically break the rule
- **THEN** the run counts as failed, the loophole is closed with an explicit ban, and the run
  is repeated

#### Scenario: Agent argues with the rule

- **WHEN** the subagent follows the rule but calls it excessive and suggests relaxing it
- **THEN** its argument goes into the excuse table, the skill is edited, and the run is
  repeated

#### Scenario: No new rationalizations

- **WHEN** the latest run produces no wording that isn't already in the table
- **THEN** the skill counts as done for this scenario

### Requirement: Every skill is checked by several cases

Each of the five planning skills SHALL have at least two scenario files, and each of them
SHALL pass a repeat run.

The stage SHALL NOT count as closed while even one scenario has not passed.

#### Scenario: Skill without scenarios

- **WHEN** a skill has not one file under `tests/scenarios/`
- **THEN** the skill counts as untested, and the stage does not close

#### Scenario: Report on the runs

- **WHEN** the stage is declared finished
- **THEN** the report names, for each skill, its scenarios and the outcome of each one's last
  run
