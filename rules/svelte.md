# Svelte rules

Rules for Svelte code. Each rule blocks a cycle when its sign shows in the diff.

### SVELTE-01

- **Rule:** A value from outside the component is not rendered with the `{@html}` tag unless a sanitizer cleaned it.
- **Sign:** `{@html value}` where the value comes from a prop, a response field or user input with no sanitizer call.
- **Applies to:** `**/*.svelte`
- **Source:** Svelte docs, {@html}

### SVELTE-02

- **Rule:** An `{#each}` block over data that changes has a key expression, so Svelte keeps each item's state.
- **Sign:** An `{#each items as item}` block with no `(item.id)` key over a list the user can reorder, insert into or delete from.
- **Applies to:** `**/*.svelte`
- **Source:** Svelte docs, {#each}

### SVELTE-03

- **Rule:** A store is read in a component with the `$` prefix. A manual `subscribe` is unsubscribed on destroy.
- **Sign:** `store.subscribe(` in `<script>` and the unsubscribe function it returns is never called in `onDestroy`.
- **Applies to:** `**/*.svelte`
- **Source:** Svelte docs, stores

### SVELTE-04

- **Rule:** A click handler sits on a native interactive element. On any other element it comes with a `role`, a `tabindex` and a keyboard handler.
- **Sign:** `on:click` or `onclick` on a `div` or `span` missing any of `role`, `tabindex` or a key handler.
- **Applies to:** `**/*.svelte`
- **Source:** Svelte docs, a11y-click-events-have-key-events
