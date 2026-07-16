import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ConfigError, getConfigPath, readConfig, updateConfig } from "../src/config";

const temporaryDirectories: string[] = [];

async function temporaryConfigPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "tmsg-config-test-"));
  temporaryDirectories.push(directory);
  return join(directory, "nested", "config.json");
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("getConfigPath", () => {
  test("honors XDG_CONFIG_HOME", () => {
    expect(getConfigPath({ XDG_CONFIG_HOME: "/custom/config" }, "/home/tester")).toBe(
      "/custom/config/tmsg/config.json",
    );
  });

  test("falls back to ~/.config", () => {
    expect(getConfigPath({}, "/home/tester")).toBe(
      "/home/tester/.config/tmsg/config.json",
    );
  });
});

describe("configuration persistence", () => {
  test("returns an empty object when the file is missing", async () => {
    expect(await readConfig(await temporaryConfigPath())).toEqual({});
  });

  test("writes atomically with private permissions", async () => {
    const configPath = await temporaryConfigPath();

    await updateConfig({ userId: "123456" }, configPath);

    expect(JSON.parse(await readFile(configPath, "utf8"))).toEqual({ userId: "123456" });
    expect((await stat(dirname(configPath))).mode & 0o777).toBe(0o700);
    expect((await stat(configPath)).mode & 0o777).toBe(0o600);
  });

  test("preserves previously configured values", async () => {
    const configPath = await temporaryConfigPath();

    await updateConfig({ userId: "123456" }, configPath);
    await updateConfig({ botToken: "999:token_value" }, configPath);

    expect(await readConfig(configPath)).toEqual({
      userId: "123456",
      botToken: "999:token_value",
    });
  });

  test("rejects malformed JSON without exposing its contents", async () => {
    const configPath = await temporaryConfigPath();
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, "{not valid or secret-token}");

    try {
      await readConfig(configPath);
      throw new Error("Expected readConfig to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as Error).message).not.toContain("secret-token");
    }
  });

  test("rejects invalid field types", async () => {
    const configPath = await temporaryConfigPath();
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify({ userId: 123456 }));

    await expect(readConfig(configPath)).rejects.toThrow('field "userId" must be a string');
  });
});
