import { describe, expect, it } from "vitest";

import { requiredNodeVersion } from "../../src/core/package-info.js";

describe("requiredNodeVersion", () => {
  it("читает поле engines.node из package.json пакета", () => {
    expect(requiredNodeVersion()).toBe(">=20.19.0");
  });
});
