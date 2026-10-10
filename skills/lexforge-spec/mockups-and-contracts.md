# Mockups, classes and interaction contracts

Read this when a requirement changes a screen, or when it describes an exchange between
two or more components.

## A requirement that changes a screen

Offer the user two routes and wait for the choice:

- A visual editor. It gives an HTML file with a separate CSS file.
- An ASCII mockup in a `mockup` block of the spec.

Do not pick a route yourself. Write the `Mockup:` line after the answer.

## The project CSS

With an HTML mockup and no `ui.styles` key in `lexforge/config.yaml`, ask the user where
the project CSS lies. Wait for the answer.

On "I don't know", or a request to search, run `lexforge styles find` and show the list.
Let the user exclude or add files. Then save the final list with
`lexforge styles set <path>...`. Write nothing into the spec until it is saved.

## New and changed classes

Before a class enters the class list as `new` or `changed`, name the class and its purpose
to the user and wait. Write the line only after a yes. The line has the form
`` - `CLASS` new: PURPOSE ``. On a no, the class stays out of the list: ask which existing
class the mockup should use instead.

## An exchange between components

For a requirement with two or more participants, write all three:

1. The `Interaction:` line, with every participant named.
2. A sequence diagram in a fenced block tagged `sequence`. Label every arrow with a
   message name.
3. The contract table straight after the diagram, one row per field, with a `Length` for
   every `string` and `array` field. Leave `Length` empty for other types.

Keep the prose short. Cut words, never the diagram, the table or a limit. A missing limit
is a question to the user, not a blank cell.

## Excuses

| Excuse | Reality |
|---|---|
| "I trust your taste on the UI" | The user handed you the work, not the answer. Name the class and its purpose, then wait. |
| "The user asked me not to wait" | A closed gate stays closed under a deadline. Ask one short question. |
| "Pick something sensible" | The user chose the work, not the files. Run `lexforge styles find`, show the list, wait. |
| "The user doesn't want to read file lists" | Show a short numbered list with a suggestion. The user answers in seconds. |
| "I kept the prose to one sentence" | Short prose is fine. The diagram and the table with every `Length` stay. |
