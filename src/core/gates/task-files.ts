/** Anything written in backticks. Both file names and commands turn up here. */
const INLINE_CODE = /`([^`]+)`/g;

/**
 * The extensions a plan can plausibly name, across the languages and
 * ecosystems a project on this gate might be written in - not just this
 * repository's own. Matching any two-to-four-letter tail after a dot took
 * `finding.rule` and `task.line` - field names in backticks, spelled like
 * paths by accident - for files; naming the extensions instead closes that
 * without reopening it for the next short field name. Case-insensitive:
 * `README.MD` is a file too.
 */
const EXTENSION =
  /\.(ts|tsx|js|mjs|cjs|jsx|vue|svelte|md|mdx|json|ya?ml|snap|sh|txt|py|go|rs|rb|java|css|scss|less|sass|styl|html|sql|c|h|cpp|cs|php|swift|kt|toml|ini|xml|csv|tsv|tf|dart|lua|pl|ps1|bat|exs|ex|erl|jl|hs|clj|tex|proto|scala|rst|cfg|conf|env|lock|ipynb)$/i;

/** Everything written in backticks across the lines of one task, in order. */
export function inlineCodeSpans(lines: string[]): string[] {
  const spans: string[] = [];

  for (const line of lines) {
    for (const match of line.matchAll(INLINE_CODE)) {
      spans.push(match[1]!.trim());
    }
  }

  return spans;
}

/** Whether a single token - not a whole backtick span - looks like a path: it holds a slash or ends in an extension. */
function isPathShaped(token: string): boolean {
  return token.includes("/") || EXTENSION.test(token);
}

/**
 * The only programs `readNamedFiles` trusts to run a script handed to them
 * as their very next token. The list is short and closed on purpose: `node`,
 * `python`, `python3`, `ruby`, `sh` and `bash` are the interpreters this
 * gate's own red-run commands and the plans it checks actually invoke this
 * way. A test runner such as `pytest`, `jest` or `ruff` is never on it, even
 * though its own name is not path-shaped either - its first argument is the
 * file it operates on, not a script it runs, and dropping it reopens the
 * shared-file collision this gate exists to catch. The cost of keeping the
 * list short: an interpreter outside it, invoked with a script as its first
 * argument - `perl script.pl`, `tsx app.ts` - still has that script named as
 * a target, the same ambiguity every other program's first path-shaped
 * argument already carries.
 */
const SCRIPT_INTERPRETERS = new Set(["node", "python", "python3", "ruby", "sh", "bash"]);

/**
 * Unwraps the quoting a nested shell command puts around a `--command`
 * value, such as `` --command "npx vitest run x.test.ts" ``, once that value
 * has been split into tokens by whitespace like every other token in the
 * span. Stripping is scoped to exactly that value - the token right after a
 * literal `--command` and every token up to the one that closes the quote -
 * rather than to every token of the command, so a path that legitimately
 * starts or ends with a quote character elsewhere in the command is left
 * untouched instead of silently corrupted.
 */
function unwrapCommandQuotes(tokens: string[]): string[] {
  const result: string[] = [];
  let quoteChar: string | null = null;

  for (let index = 0; index < tokens.length; index += 1) {
    let token = tokens[index]!;

    if (quoteChar) {
      if (token.endsWith(quoteChar)) {
        token = token.slice(0, -1);
        quoteChar = null;
      }
      result.push(token);
      continue;
    }

    const opensQuote = (token.startsWith('"') || token.startsWith("'")) && tokens[index - 1] === "--command";
    if (opensQuote) {
      quoteChar = token[0]!;
      token = token.slice(1);
      if (token.endsWith(quoteChar)) {
        token = token.slice(0, -1);
        quoteChar = null;
      }
    }

    result.push(token);
  }

  return result;
}

/**
 * File paths the task writes. Only what stands in backticks is read, and of
 * that only what looks like a path: it holds a slash or ends in an extension.
 * A whole command is left out, so `npm test` is not taken for a file - this
 * is deliberately narrower than `namedFiles` below.
 */
export function readFiles(lines: string[]): string[] {
  const files: string[] = [];

  for (const span of inlineCodeSpans(lines)) {
    if (/\s/.test(span)) {
      continue;
    }

    if (isPathShaped(span)) {
      files.push(span);
    }
  }

  return [...new Set(files)];
}

/**
 * Every file the task names, its `Check:` commands included. A backtick span
 * with no whitespace in it is a bare file reference - the case `readFiles`
 * above already handles - and is kept exactly as before, whether or not it
 * is path-shaped.
 *
 * A span with whitespace in it is a command, split on whitespace into
 * tokens, with a quoted `--command` value unwrapped by `unwrapCommandQuotes`
 * first. Its leading token is the program that runs it, dropped whether or
 * not it is path-shaped: `` `npx vitest run x.test.ts` `` drops `npx` even
 * though `npx` holds no slash and matches no extension anyway.
 *
 * The token right after the program is dropped too, as the script that
 * program runs, only when the program is one of `SCRIPT_INTERPRETERS` and
 * that next token is itself path-shaped: `` `node bin/lexforge.js evidence
 * red --command "npx vitest run x.test.ts"` `` drops both `node` and
 * `bin/lexforge.js`, so only `x.test.ts` is named from that span. A program
 * outside the list - `pytest tests/test_login.py` - drops nothing past its
 * own leading token, so the file it operates on is still named; the same
 * program invoked with a flag instead of a script - `python3 -m pytest
 * tests/test_login.py` - drops nothing on the interpreter's account either,
 * since `-m` fails the path-shape test on its own.
 *
 * Every remaining token is checked and named exactly as `readFiles` checks a
 * bare span.
 */
export function readNamedFiles(lines: string[]): string[] {
  const files: string[] = [];

  for (const span of inlineCodeSpans(lines)) {
    if (!/\s/.test(span)) {
      if (isPathShaped(span)) {
        files.push(span);
      }
      continue;
    }

    const tokens = unwrapCommandQuotes(span.split(/\s+/));
    const program = tokens[0]!;
    const second = tokens[1];
    const dropsInterpreterScript =
      SCRIPT_INTERPRETERS.has(program) && second !== undefined && isPathShaped(second);
    const operands = dropsInterpreterScript ? tokens.slice(2) : tokens.slice(1);

    for (const token of operands) {
      if (isPathShaped(token)) {
        files.push(token);
      }
    }
  }

  return [...new Set(files)];
}
