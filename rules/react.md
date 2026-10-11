# React rules

Rules for React code. Each rule blocks a cycle when its sign shows in the diff.

### REACT-01

- **Rule:** An effect that starts a subscription or timer returns a cleanup, and lists every value it reads in its dependencies.
- **Sign:** A `useEffect` with `addEventListener`, `setInterval` or `subscribe` and no returned cleanup; a prop or state value read in the effect and absent from the dependency array.
- **Applies to:** `**/*.{tsx,jsx}`
- **Source:** React docs, synchronizing with effects

### REACT-02

- **Rule:** Each item of a rendered list has a stable key taken from the data. The index is not a key on a list that reorders, inserts or deletes.
- **Sign:** A `.map` returning elements with no `key`; `key={index}` on a list the user can sort, filter or edit.
- **Applies to:** `**/*.{tsx,jsx}`
- **Source:** React docs, rendering lists

### REACT-03

- **Rule:** A value from outside the component is not passed to `dangerouslySetInnerHTML` unless a sanitizer cleaned it.
- **Sign:** `dangerouslySetInnerHTML` fed by a prop, a response field or user input with no sanitizer call.
- **Applies to:** `**/*.{tsx,jsx}`
- **Source:** OWASP XSS Prevention Cheat Sheet

### REACT-04

- **Rule:** The component reads the prop, derives the value during render, or takes a key to reset. State is not a copy of a prop kept in step by an effect.
- **Sign:** `useState(props.x)` together with a `useEffect` that calls the setter when `props.x` changes.
- **Applies to:** `**/*.{tsx,jsx}`
- **Source:** React docs, You Might Not Need an Effect

### REACT-05

- **Rule:** A request started in an effect is aborted or ignored when the effect runs again or the component unmounts, so a late response cannot overwrite a newer one.
- **Sign:** A `fetch` inside `useEffect` with no `AbortController` and no ignore flag cleared in the cleanup.
- **Applies to:** `**/*.{tsx,jsx}`
- **Source:** React docs, You Might Not Need an Effect
