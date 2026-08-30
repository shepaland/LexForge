## Purpose

Search answers one question for a person holding a long list of notes: which of them mention
this word. The caller passes the notes and a query, and gets back the notes that match, in the
order they were written.

## ADDED Requirements

### Requirement: Substring search over note text

The system SHALL return every note whose text contains the query as a substring, ignoring
the case of both, and SHALL keep the order in which the notes were given.

#### Scenario: A query matching two notes out of three

- **WHEN** the notes are "buy milk", "call the bank" and "buy bread", and the query is "buy"
- **THEN** the answer is "buy milk" and "buy bread", in that order

#### Scenario: A query differing in case

- **WHEN** a note reads "Buy milk" and the query is "buy"
- **THEN** the note is in the answer

#### Scenario: A query matching nothing

- **WHEN** no note contains the query
- **THEN** the answer is an empty list

#### Scenario: An empty query

- **WHEN** the query is an empty string
- **THEN** the answer holds every note that was given
