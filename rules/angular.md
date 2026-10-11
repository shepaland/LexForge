# Angular rules

Rules for Angular code. Each rule blocks a cycle when its sign shows in the diff.

### NG-01

- **Rule:** A subscription is closed when the component or service is destroyed: `takeUntilDestroyed`, an explicit `unsubscribe`, or the `async` pipe.
- **Sign:** A `.subscribe(` on a store select, a Subject, `interval` or router events with none of `takeUntilDestroyed`, `unsubscribe` or the `async` pipe.
- **Applies to:** `**/*.component.ts`, `**/*.component.html`, `**/*.directive.ts`, `**/*.service.ts`, `**/*.pipe.ts`
- **Source:** Angular docs, takeUntilDestroyed

### NG-02

- **Rule:** A value from outside is not passed to a `bypassSecurityTrust` method. Angular sanitizes it unless the code opts out.
- **Sign:** `bypassSecurityTrustHtml`, `bypassSecurityTrustUrl`, `bypassSecurityTrustResourceUrl`, `bypassSecurityTrustScript` or `bypassSecurityTrustStyle` on an input, a route parameter or a response field.
- **Applies to:** `**/*.component.ts`, `**/*.component.html`, `**/*.directive.ts`, `**/*.service.ts`, `**/*.pipe.ts`
- **Source:** Angular docs, security: trusting safe values

### NG-03

- **Rule:** A repeated block identifies its items, so Angular reuses the DOM when the list changes.
- **Sign:** `*ngFor` with no `trackBy`; an `@for` block with no `track` expression.
- **Applies to:** `**/*.component.ts`, `**/*.component.html`
- **Source:** Angular docs, control flow: @for

### NG-04

- **Rule:** An input of a component or directive is not typed `any`. The type `any` hides a wrong value from the compiler.
- **Sign:** `@Input()` or `input()` typed with an explicit `any`.
- **Applies to:** `**/*.component.ts`, `**/*.directive.ts`
- **Source:** Angular docs, component inputs

### NG-05

- **Rule:** HTML is not written through `ElementRef.nativeElement`. Angular templates and bindings sanitize it.
- **Sign:** `nativeElement.innerHTML =` or `outerHTML =` assigned anything but a string literal.
- **Applies to:** `**/*.component.ts`, `**/*.directive.ts`
- **Source:** Angular docs, security: preventing cross-site scripting
