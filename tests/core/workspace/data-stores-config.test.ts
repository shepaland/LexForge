import { afterEach, describe, expect, it } from "vitest";

import type { UsageError } from "../../../src/cli/errors.js";
import { readProjectConfig } from "../../../src/core/workspace/project-config.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const created: string[] = [];

function workspace(config: string): string {
  const root = makeWorkspace({ "lexforge/config.yaml": config });
  created.push(root);
  return root;
}

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

// The newlines put the message on a line of its own, which the cycle runner matches whole.
const EXPECTED = "\n`readProjectConfig` returns no field `stores`\n";

type Store = { name: string; dialect: string };

function stores(config: string): Store[] | undefined {
  return (readProjectConfig(workspace(config)) as { stores?: Store[] }).stores;
}

/** The code of the error `readProjectConfig` throws, or `undefined` when it does not throw. */
function errorCode(config: string): string | undefined {
  const root = workspace(config);
  try {
    // The field must exist, or a config that is fine today would pass for "did not throw".
    if ((readProjectConfig(root) as { stores?: Store[] }).stores === undefined) {
      return "stores field missing";
    }
  } catch (error) {
    return (error as UsageError).code;
  }
  return undefined;
}

describe("readProjectConfig stores", () => {
  it("gives an empty array for a config without data_stores", () => {
    expect(stores("schema: spec-driven\n"), EXPECTED).toEqual([]);
  });

  it("lists the stores as name and dialect in the written order", () => {
    const config =
      "data_stores:\n" +
      "  - name: main\n    dialect: postgresql\n" +
      "  - name: events\n    dialect: mongodb\n";

    expect(stores(config), EXPECTED).toEqual([
      { name: "main", dialect: "postgresql" },
      { name: "events", dialect: "mongodb" },
    ]);
  });

  it("keeps a duplicate store name as written", () => {
    const config =
      "data_stores:\n" +
      "  - name: main\n    dialect: postgresql\n" +
      "  - name: main\n    dialect: mysql\n";

    expect(stores(config), EXPECTED).toEqual([
      { name: "main", dialect: "postgresql" },
      { name: "main", dialect: "mysql" },
    ]);
  });

  it("keeps a store name that is not kebab-case as written", () => {
    const config = "data_stores:\n  - name: Main_DB\n    dialect: postgresql\n";

    expect(stores(config), EXPECTED).toEqual([{ name: "Main_DB", dialect: "postgresql" }]);
  });

  it("keeps an empty dialect as written", () => {
    const config = 'data_stores:\n  - name: main\n    dialect: ""\n';

    expect(stores(config), EXPECTED).toEqual([{ name: "main", dialect: "" }]);
  });

  it("throws project-config-invalid for an entry without dialect", () => {
    expect(errorCode("data_stores:\n  - name: main\n"), EXPECTED).toBe("project-config-invalid");
  });

  it("throws project-config-invalid for a list written as a mapping", () => {
    const config = "data_stores:\n  main:\n    dialect: postgresql\n";

    expect(errorCode(config), EXPECTED).toBe("project-config-invalid");
  });
});
