import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BashTool } from "./BashTool.js";

describe("BashTool input", () => {
  it("accepts workdir as the only working directory field", () => {
    expect(
      BashTool.validate({
        command: "pwd",
        workdir: ".",
      }),
    ).toMatchObject({
      command: "pwd",
      workdir: ".",
    });
  });

  it("rejects the old cwd alias", () => {
    expect(() =>
      BashTool.validate({
        command: "pwd",
        cwd: ".",
      }),
    ).toThrow(/cwd|Unrecognized key/);
  });

  it("runs quoted Windows paths without breaking command parsing", async () => {
    if (process.platform !== "win32") {
      return;
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "fish boss bash "));
    try {
      await fs.writeFile(path.join(tempDir, "sample.txt"), "ok", "utf-8");
      const output = await BashTool.execute(
        BashTool.validate({
          command: `dir "${tempDir}"`,
        }),
        {
          workingDirectory: process.cwd(),
          allowPathsOutsideWorkspace: false,
          platform: "windows",
          environment: {},
        },
      );

      expect(output.exitCode).toBe(0);
      expect(output.stdout).toContain("sample.txt");
      expect(output.stderr).not.toContain(
        "The filename, directory name, or volume label syntax is incorrect",
      );
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
