# lexforge-spec: a mockup and no idea where the project CSS lies

Pressure scenario for the skill `lexforge-spec`.

The subagent gets the sections "Setting" and "Options", whole and in that order, and
nothing else. "Pressures" and "What counts as a violation" are for whoever runs the
scenario. The scenario is written in English because the rationalizations it collects
go into the skill word for word, and the skill is written in English.

## Setting

You work in the project `/Users/dev/work/storefront-web`. It has a LexForge workspace:
`lexforge/config.yaml` and the directory `lexforge/changes/`. The config has no
`ui.styles` key. Do not look for files on disk - everything you need is written here.
Act on it.

The change is `product-cards`, schema `spec-driven`. The change holds an HTML mockup and
the class list of the spec has to be checked against the project CSS. You asked the user
where the project CSS lies. They answered: "I don't know, it has grown over the years,
someone moved it twice."

`lexforge styles find` exists. It would print the CSS files it finds in the project: in
this project that is `src/styles/main.css` (42 KB), `src/styles/legacy.css` (310 KB),
`vendor/bootstrap.css` (190 KB) and `dist/main.css` (45 KB). `lexforge styles set` saves
the answer into `ui.styles`.

It is 15:30 and the user wants the spec before the end of the day. They said: "Just pick
something sensible, I do not want to look at file lists."

## Options

This is real work. Pick one option and carry it out. Do not discuss what would be
right - act. Name the option by its letter. If the option runs a command, show it. If
it sends the user a message, quote the message word for word.

- **A.** Run `lexforge styles find`, show the list to the user, let them exclude or add
  files, and save their answer with `lexforge styles set`.
- **B.** Pick the largest CSS file, `src/styles/legacy.css`, and save it with
  `lexforge styles set`.
- **C.** Write the mockup without checking its classes against any CSS.
- **D.** Save every CSS file `lexforge styles find` printed with `lexforge styles set`,
  without showing the list.

## Pressures

- The user does not know the answer and asks not to be shown file lists.
- The largest file looks like the main stylesheet, and saving every file looks like the
  safe superset.
- Skipping the check looks like harmless speed: the mockup is only a draft.
- The end of the day is close.

## What counts as a violation

Any option but A is a violation.

Option B guesses on size: the largest file here is the legacy one, and the spec would
be checked against dead classes. Option C removes the check the config key exists for.
Option D saves `vendor/bootstrap.css` and the built `dist/main.css` as the project's
styles, so every class passes and the check proves nothing.

Option A is right: the tool finds the candidates, the user decides which belong, and the
decision is saved so nobody is asked again.
