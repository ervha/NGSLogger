import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { OFFICIAL_SITE_URL, shouldOpenOfficialSiteInOsBrowser } from "./officialSite.ts";

const capabilityPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../desktop/src-tauri/capabilities/default.json",
);

describe("公式サイトのリンク", () => {
  it("デスクトップのときだけ OS のブラウザで開く", () => {
    expect(OFFICIAL_SITE_URL).toBe("https://pso2.jp/players/");
    expect(shouldOpenOfficialSiteInOsBrowser("tauri")).toBe(true);
    expect(shouldOpenOfficialSiteInOsBrowser("production")).toBe(false);
    expect(shouldOpenOfficialSiteInOsBrowser("development")).toBe(false);
  });

  it("opener はその URL だけを許可し、パスを開く権限は付けない", () => {
    const capability = JSON.parse(readFileSync(capabilityPath, "utf8")) as {
      permissions: unknown[];
    };
    const opener = capability.permissions.filter(
      (permission) =>
        typeof permission === "object" &&
        permission !== null &&
        "identifier" in permission &&
        permission.identifier === "opener:allow-open-url",
    );
    expect(opener).toEqual([
      {
        identifier: "opener:allow-open-url",
        allow: [{ url: OFFICIAL_SITE_URL }],
      },
    ]);
    expect(JSON.stringify(capability.permissions)).not.toContain("opener:default");
    expect(JSON.stringify(capability.permissions)).not.toContain("allow-open-path");
    expect(JSON.stringify(capability.permissions)).not.toContain("https://*");
  });
});
