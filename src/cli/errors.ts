/**
 * Thrown when a command cannot be carried out at all: unknown argument,
 * missing change, broken schema description, no workspace. Always exit code 2.
 */
export class UsageError extends Error {
  readonly code: string;
  readonly nextStep: string;

  constructor(code: string, message: string, nextStep = "") {
    super(message);
    this.name = "UsageError";
    this.code = code;
    this.nextStep = nextStep;
  }
}
