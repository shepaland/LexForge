# Frontend rules

Rules for browser-side code. Each rule blocks a cycle when its sign shows in the diff.

### FE-01

- **Rule:** An interactive element is native (`button`, `a`, `input`, `select`), or it has a role, an accessible name and keyboard control.
- **Sign:** A `div` or `span` with `onClick` and no `role`, `tabIndex` or key handler.
- **Applies to:** `**/*.{tsx,jsx,vue,svelte,html,css,scss}`, `**/*.component.ts`
- **Source:** WCAG 2.2: 2.1.1, 4.1.2

### FE-02

- **Rule:** A form field has an associated label. A field error is tied to the field and given as text, not by color alone.
- **Sign:** An `input` with no `label` or `aria-label`; an error with no `aria-describedby`; a red border with no text.
- **Applies to:** `**/*.{tsx,jsx,vue,svelte,html,css,scss}`, `**/*.component.ts`
- **Source:** WCAG 2.2: 1.3.1, 1.4.1, 3.3.1

### FE-03

- **Rule:** Text contrast is at least 4.5:1, or 3:1 for large text. Keyboard focus is visible.
- **Sign:** A new text and background color pair; `outline: none` with no replacement.
- **Applies to:** `**/*.{tsx,jsx,vue,svelte,html,css,scss}`, `**/*.component.ts`
- **Source:** WCAG 2.2: 1.4.3, 2.4.7

### FE-04

- **Rule:** External data is not inserted as HTML without a sanitizer.
- **Sign:** `innerHTML`, `dangerouslySetInnerHTML` or `v-html` with a variable.
- **Applies to:** `**/*.{tsx,jsx,vue,svelte,html,css,scss}`, `**/*.component.ts`
- **Source:** OWASP XSS Prevention Cheat Sheet

### FE-05

- **Rule:** The session token lives in an `httpOnly` cookie, not in `localStorage` or `sessionStorage`.
- **Sign:** A token written to browser storage.
- **Applies to:** `**/*.{tsx,jsx,vue,svelte,html,css,scss}`, `**/*.component.ts`
- **Source:** OWASP HTML5 Security Cheat Sheet

### FE-06

- **Rule:** A screen with asynchronous data shows loading, error and empty states. A request error reaches the user.
- **Sign:** A new request whose component has no error branch.
- **Applies to:** `**/*.{tsx,jsx,vue,svelte,html,css,scss}`, `**/*.component.ts`
- **Source:** -

### FE-07

- **Rule:** A derived value is computed from the source state, not kept as a separate copy.
- **Sign:** A `useState` or `ref` synchronized with other state by an effect.
- **Applies to:** `**/*.{tsx,jsx,vue,svelte,html,css,scss}`, `**/*.component.ts`
- **Source:** React docs, You Might Not Need an Effect

### FE-08

- **Rule:** Subscriptions, timers and listeners are removed on unmount. A response to a stale request (parameters changed, user left the page) is cancelled or ignored.
- **Sign:** An effect with no cleanup function; a `fetch` with no `AbortController` or freshness check.
- **Applies to:** `**/*.{tsx,jsx,vue,svelte,html,css,scss}`, `**/*.component.ts`
- **Source:** React docs, synchronizing with effects

### FE-09

- **Rule:** An image has `alt` and set dimensions or `aspect-ratio`. Images below the first screen load lazily.
- **Sign:** An `img` with no `alt`, `width` or `height`; a large image with no `loading="lazy"`.
- **Applies to:** `**/*.{tsx,jsx,vue,svelte,html,css,scss}`, `**/*.component.ts`
- **Source:** WCAG 2.2: 1.1.1; web.dev, CLS

### FE-10

- **Rule:** A new dependency is needed and its bundle size is counted. A heavy route or component loads on demand.
- **Sign:** A new package in `package.json` with no reason in the design; a static import of a heavy module.
- **Applies to:** `**/*.{tsx,jsx,vue,svelte,html,css,scss}`, `**/*.component.ts`
- **Source:** web.dev, reduce JavaScript payloads

### FE-11

- **Rule:** Client-side form validation adds to server validation and does not replace it (see BE-01).
- **Sign:** A limit exists only in the form, and the server accepts any value.
- **Applies to:** `**/*.{tsx,jsx,vue,svelte,html,css,scss}`, `**/*.component.ts`
- **Source:** OWASP ASVS V5

### FE-12

- **Rule:** Colors, spacing and fonts come from the project's tokens or variables.
- **Sign:** A literal `#hex` or `px` value in a component when the project has a token for it.
- **Applies to:** `**/*.{tsx,jsx,vue,svelte,html,css,scss}`, `**/*.component.ts`
- **Source:** -

### FE-13

- **Rule:** The layout works at 320 CSS pixels wide with no horizontal scrolling.
- **Sign:** A fixed width above 320px with no wrapping.
- **Applies to:** `**/*.{tsx,jsx,vue,svelte,html,css,scss}`, `**/*.component.ts`
- **Source:** WCAG 2.2: 1.4.10

### FE-14

- **Rule:** In a localized project, interface text goes through the dictionary, and dates and numbers are formatted with `Intl`.
- **Sign:** A literal interface string in markup; a hand-formatted date.
- **Applies to:** `**/*.{tsx,jsx,vue,svelte,html,css,scss}`, `**/*.component.ts`
- **Source:** -
