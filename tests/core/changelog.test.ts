import { describe, expect, it } from "vitest";

import { changelogVersionMismatch } from "../helpers/changelog.js";

describe("сверка версии журнала с версией пакета", () => {
  it("поднятая версия пакета при прежней верхней записи называет обе версии в сообщении", () => {
    const raisedVersion = "1.0.0";
    const staleEntries = [{ version: "0.1.0", date: "2026-08-30" }];

    const mismatch = changelogVersionMismatch(raisedVersion, staleEntries);

    expect(mismatch, "расхождение версий должно быть найдено").not.toBeNull();
    expect(mismatch, "сообщение не называет новую версию пакета").toContain(raisedVersion);
    expect(mismatch, "сообщение не называет старую версию верхней записи").toContain(
      staleEntries[0]!.version,
    );
  });

  it("совпадающая версия расхождения не даёт", () => {
    const mismatch = changelogVersionMismatch("1.0.0", [{ version: "1.0.0", date: "2026-08-30" }]);

    expect(mismatch).toBeNull();
  });
});
