import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export interface TmsgConfig {
  userId?: string;
  botToken?: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function getConfigPath(
  env: Record<string, string | undefined> = process.env,
  homeDirectory = homedir(),
): string {
  const configHome = env.XDG_CONFIG_HOME || join(homeDirectory, ".config");
  return join(configHome, "tmsg", "config.json");
}

function parseConfig(contents: string, configPath: string): TmsgConfig {
  let parsed: unknown;

  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new ConfigError(`Configuration file contains invalid JSON: ${configPath}`);
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ConfigError(`Configuration file must contain a JSON object: ${configPath}`);
  }

  const value = parsed as Record<string, unknown>;
  const config: TmsgConfig = {};

  if (value.userId !== undefined) {
    if (typeof value.userId !== "string") {
      throw new ConfigError(`Configuration field "userId" must be a string: ${configPath}`);
    }
    config.userId = value.userId;
  }

  if (value.botToken !== undefined) {
    if (typeof value.botToken !== "string") {
      throw new ConfigError(`Configuration field "botToken" must be a string: ${configPath}`);
    }
    config.botToken = value.botToken;
  }

  return config;
}

export async function readConfig(configPath = getConfigPath()): Promise<TmsgConfig> {
  try {
    return parseConfig(await readFile(configPath, "utf8"), configPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

export async function updateConfig(
  changes: Partial<TmsgConfig>,
  configPath = getConfigPath(),
): Promise<TmsgConfig> {
  const current = await readConfig(configPath);
  const next = { ...current, ...changes };
  const configDirectory = dirname(configPath);
  const temporaryPath = join(
    configDirectory,
    `.config.${process.pid}.${randomUUID()}.tmp`,
  );

  await mkdir(configDirectory, { recursive: true, mode: 0o700 });
  await chmod(configDirectory, 0o700);

  try {
    await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, configPath);
    await chmod(configPath, 0o600);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }

  return next;
}
