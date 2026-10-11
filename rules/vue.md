# Vue rules

Rules for Vue code. Each rule blocks a cycle when its sign shows in the diff.

### VUE-01

- **Rule:** A value from outside the component is not bound with `v-html` unless a sanitizer cleaned it.
- **Sign:** `v-html` bound to a prop, a response field or user input with no sanitizer call.
- **Applies to:** `**/*.vue`
- **Source:** Vue docs, security: HTML injection

### VUE-02

- **Rule:** Each `v-for` item has a `key` that is unique and stable.
- **Sign:** A `v-for` with no `:key`, or `:key` set to the loop index on a list that reorders.
- **Applies to:** `**/*.vue`
- **Source:** Vue docs, list rendering: maintaining state with key

### VUE-03

- **Rule:** A component does not change its own props. It emits an event, or copies the value into local state.
- **Sign:** An assignment or `push` on a prop in `<script>` or in a template handler.
- **Applies to:** `**/*.vue`
- **Source:** Vue docs, props: one-way data flow

### VUE-04

- **Rule:** `v-if` and `v-for` are not on the same element. The filter goes into a computed property, or `v-if` moves to a wrapper.
- **Sign:** One element with both `v-for` and `v-if`.
- **Applies to:** `**/*.vue`
- **Source:** Vue style guide, avoid v-if with v-for

### VUE-05

- **Rule:** A listener or timer added in `onMounted` is removed in `onUnmounted`.
- **Sign:** `addEventListener` or `setInterval` in `onMounted` with no matching `removeEventListener` or `clearInterval` in `onUnmounted`.
- **Applies to:** `**/*.vue`
- **Source:** Vue docs, lifecycle hooks
