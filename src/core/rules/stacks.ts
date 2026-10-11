export interface RuleStack {
  name: string;
  prefix: string;
  file: string;
}

export const GENERAL_SECTIONS = [
  { name: "backend", prefix: "BE", file: "backend.md" },
  { name: "frontend", prefix: "FE", file: "frontend.md" },
  { name: "testing", prefix: "TS", file: "testing.md" },
  { name: "review", prefix: "RV", file: "review.md" },
] as const satisfies readonly RuleStack[];

const STACK_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ["node", "NODE"],
  ["python", "PY"],
  ["jvm", "JVM"],
  ["go", "GO"],
  ["dotnet", "NET"],
  ["php", "PHP"],
  ["ruby", "RB"],
  ["rust", "RS"],
  ["react", "REACT"],
  ["vue", "VUE"],
  ["angular", "NG"],
  ["svelte", "SVELTE"],
];

export const KNOWN_STACKS: readonly RuleStack[] = STACK_PREFIXES.map(([name, prefix]) => ({
  name,
  prefix,
  file: `${name}.md`,
}));
