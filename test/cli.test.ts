import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli, type CliDependencies } from "../src/cli";
import type { TelegramMessage } from "../src/telegram";

const temporaryDirectories: string[] = [];

async function harness(overrides: Partial<CliDependencies> = {}) {
  const directory = await mkdtemp(join(tmpdir(), "tmsg-cli-test-"));
  temporaryDirectories.push(directory);
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    stdout,
    stderr,
    dependencies: {
      configPath: join(directory, "config.json"),
      stdout: (line: string) => stdout.push(line),
      stderr: (line: string) => stderr.push(line),
      ...overrides,
    } satisfies CliDependencies,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("CLI configuration commands", () => {
  test("sets and retrieves a user ID", async () => {
    const { dependencies, stdout, stderr } = await harness();

    expect(await runCli(["set-user-id", "123456"], dependencies)).toBe(0);
    stdout.length = 0;
    expect(await runCli(["get-user-id"], dependencies)).toBe(0);

    expect(stdout).toEqual(["123456"]);
    expect(stderr).toEqual([]);
  });

  test("accepts signed numeric chat IDs", async () => {
    const { dependencies } = await harness();
    expect(await runCli(["set-user-id", "-100123456"], dependencies)).toBe(0);
  });

  test("rejects invalid IDs and tokens without echoing them", async () => {
    const { dependencies, stderr } = await harness();

    expect(await runCli(["set-user-id", "not-a-number"], dependencies)).toBe(2);
    expect(await runCli(["set-bot-token", "secret invalid token"], dependencies)).toBe(2);

    expect(stderr.join("\n")).not.toContain("secret invalid token");
  });

  test("reports an unset user ID", async () => {
    const { dependencies, stderr } = await harness();

    expect(await runCli(["get-user-id"], dependencies)).toBe(1);
    expect(stderr[0]).toContain("User ID is not configured");
  });
});

describe("CLI notifications", () => {
  test("sends joined arguments with configured credentials", async () => {
    let captured: TelegramMessage | undefined;
    const { dependencies, stdout } = await harness({
      sendMessage: async (notification) => {
        captured = notification;
      },
    });

    await runCli(["set-user-id", "123456"], dependencies);
    await runCli(["set-bot-token", "999:token_value"], dependencies);
    stdout.length = 0;

    expect(await runCli(["notify", "Build", "finished"], dependencies)).toBe(0);
    expect(captured).toEqual({
      botToken: "999:token_value",
      userId: "123456",
      text: "Build finished",
    });
    expect(stdout).toEqual(["Notification sent."]);
  });

  test("requires both credentials", async () => {
    const { dependencies, stderr } = await harness();

    expect(await runCli(["notify", "hello"], dependencies)).toBe(1);
    expect(stderr[0]).toContain("User ID is not configured");

    await runCli(["set-user-id", "123456"], dependencies);
    expect(await runCli(["notify", "hello"], dependencies)).toBe(1);
    expect(stderr.at(-1)).toContain("Bot token is not configured");
  });

  test("rejects empty and oversized messages", async () => {
    const { dependencies } = await harness();

    expect(await runCli(["notify"], dependencies)).toBe(2);
    expect(await runCli(["notify", "x".repeat(4097)], dependencies)).toBe(2);
  });
});

describe("CLI help and errors", () => {
  test("shows help with no arguments", async () => {
    const { dependencies, stdout } = await harness();
    expect(await runCli([], dependencies)).toBe(0);
    expect(stdout[0]).toContain("tmsg set-user-id");
  });

  test("rejects unknown commands", async () => {
    const { dependencies, stderr } = await harness();
    expect(await runCli(["unknown"], dependencies)).toBe(2);
    expect(stderr[0]).toContain("Unknown command: unknown");
  });
});
