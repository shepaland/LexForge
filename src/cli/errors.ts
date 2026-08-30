/**
 * Thrown when a command cannot be carried out at all: unknown argument,
 * missing change, broken schema description, no workspace. Always exit code 2.
 */
export class UsageError extends Error {
  readonly code: string;
  readonly nextStep: string;
  /**
   * The file or directory the error is about, when there is exactly one and
   * its location is already known — such as a workspace directory that
   * exists but holds no `config.yaml`. Left unset otherwise: a message such
   * as "no workspace here or in any parent directory" has no single path to
   * name.
   */
  readonly path?: string;

  constructor(code: string, message: string, nextStep = "", path?: string) {
    super(message);
    this.name = "UsageError";
    this.code = code;
    this.nextStep = nextStep;
    this.path = path;
  }
}
