import type { OutputStream } from "../../src/core/types.js";

export interface Capture {
  stdout: OutputStream;
  stderr: OutputStream;
  /** Everything written to stdout so far. */
  readonly out: string;
  /** Everything written to stderr so far. */
  readonly err: string;
}

export function createCapture(): Capture {
  let out = "";
  let err = "";

  return {
    stdout: {
      write(chunk: string) {
        out += chunk;
        return true;
      },
    },
    stderr: {
      write(chunk: string) {
        err += chunk;
        return true;
      },
    },
    get out() {
      return out;
    },
    get err() {
      return err;
    },
  };
}
