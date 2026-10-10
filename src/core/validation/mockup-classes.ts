/** A class name and the line, counted from 1, where it was read. */
export interface ClassUse {
  name: string;
  line: number;
}

/** Replaces every match with spaces, keeping line breaks so offsets and lines stay put. */
function blank(text: string, pattern: RegExp): string {
  return text.replace(pattern, (m) => m.replace(/[^\n]/g, " "));
}

function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i++) if (text[i] === "\n") line++;
  return line;
}

const GROUP_RULE = /^@(media|supports|layer|container|document)\b/;

/** Reads the class selectors of a CSS text. Declaration blocks are skipped. */
export function declaredClasses(css: string): ClassUse[] {
  const text = blank(blank(css, /\/\*[\s\S]*?\*\//g), /\[[^\]\n]*\]/g);
  const found: ClassUse[] = [];
  const stack: Array<"group" | "block"> = [];
  let prelude = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      const head = text.slice(prelude, i);
      if (stack[stack.length - 1] !== "block") {
        if (GROUP_RULE.test(head.trim())) {
          stack.push("group");
        } else {
          if (!head.trim().startsWith("@")) {
            for (const m of head.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) {
              found.push({ name: m[1], line: lineAt(text, prelude + (m.index ?? 0)) });
            }
          }
          stack.push("block");
        }
      } else {
        stack.push("block");
      }
      prelude = i + 1;
    } else if (ch === "}") {
      stack.pop();
      prelude = i + 1;
    } else if (ch === ";" && stack[stack.length - 1] !== "block") {
      prelude = i + 1;
    }
  }
  return found;
}

/** Reads the names in the static class attributes of an HTML text. */
export function usedClasses(html: string): ClassUse[] {
  const text = blank(html, /<!--[\s\S]*?-->/g);
  const found: ClassUse[] = [];
  for (const m of text.matchAll(/\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const value = m[1] ?? m[2] ?? "";
    const line = lineAt(text, m.index ?? 0);
    for (const name of value.split(/\s+/)) {
      if (name !== "") found.push({ name, line });
    }
  }
  return found;
}
