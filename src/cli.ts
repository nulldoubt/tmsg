#!/usr/bin/env bun

import packageJson from "../package.json";
import { ConfigError, getConfigPath, readConfig, updateConfig } from "./config";
import { sendTelegramMessage, TelegramError, type TelegramMessage } from "./telegram";

type WriteLine = (line: string) => void;
type SendMessage = (message: TelegramMessage) => Promise<void>;

export interface CliDependencies {
  configPath?: string;
  stdout?: WriteLine;
  stderr?: WriteLine;
  sendMessage?: SendMessage;
}

function help(configPath: string): string {
  return `tmsg ${packageJson.version} — Send Telegram notifications from the command line

Usage:
  tmsg set-user-id <user-id>       Save the Telegram user/chat ID
  tmsg get-user-id                 Print the configured user/chat ID
  tmsg set-bot-token <token>       Save the Telegram BotFather token
  tmsg notify <message...>         Send a plain-text Telegram notification
  tmsg help                        Show this help
  tmsg --version                   Print the version

Configuration:
  ${configPath}`;
}

function isUserId(value: string): boolean {
  return /^-?\d+$/.test(value);
}

function isBotToken(value: string): boolean {
  return /^\d+:[A-Za-z0-9_-]+$/.test(value);
}

function usageError(stderr: WriteLine, message: string): number {
  stderr(message);
  return 2;
}

export async function runCli(
  argv = process.argv.slice(2),
  dependencies: CliDependencies = {},
): Promise<number> {
  const stdout = dependencies.stdout ?? console.log;
  const stderr = dependencies.stderr ?? console.error;
  const configPath = dependencies.configPath ?? getConfigPath();
  const sendMessage = dependencies.sendMessage ?? sendTelegramMessage;
  const [command, ...args] = argv;

  try {
    switch (command) {
      case undefined:
      case "help":
      case "--help":
      case "-h":
        stdout(help(configPath));
        return 0;

      case "--version":
      case "-v":
        stdout(packageJson.version);
        return 0;

      case "set-user-id": {
        if (args.length !== 1 || !args[0] || !isUserId(args[0])) {
          return usageError(stderr, "Usage: tmsg set-user-id <numeric-user-id>");
        }
        await updateConfig({ userId: args[0] }, configPath);
        stdout(`User ID saved to ${configPath}`);
        return 0;
      }

      case "get-user-id": {
        if (args.length !== 0) {
          return usageError(stderr, "Usage: tmsg get-user-id");
        }
        const config = await readConfig(configPath);
        if (!config.userId) {
          stderr("User ID is not configured. Run: tmsg set-user-id <user-id>");
          return 1;
        }
        stdout(config.userId);
        return 0;
      }

      case "set-bot-token": {
        if (args.length !== 1 || !args[0] || !isBotToken(args[0])) {
          return usageError(stderr, "Usage: tmsg set-bot-token <bot-token>");
        }
        await updateConfig({ botToken: args[0] }, configPath);
        stdout(`Bot token saved securely to ${configPath}`);
        return 0;
      }

      case "notify": {
        const text = args.join(" ");
        const characterCount = Array.from(text).length;
        if (characterCount < 1 || characterCount > 4096 || text.trim().length === 0) {
          return usageError(
            stderr,
            "Usage: tmsg notify <message> (message must be 1–4096 characters)",
          );
        }

        const config = await readConfig(configPath);
        if (!config.userId) {
          stderr("User ID is not configured. Run: tmsg set-user-id <user-id>");
          return 1;
        }
        if (!config.botToken) {
          stderr("Bot token is not configured. Run: tmsg set-bot-token <bot-token>");
          return 1;
        }

        await sendMessage({
          botToken: config.botToken,
          userId: config.userId,
          text,
        });
        stdout("Notification sent.");
        return 0;
      }

      default:
        return usageError(stderr, `Unknown command: ${command}\n\n${help(configPath)}`);
    }
  } catch (error) {
    if (error instanceof ConfigError || error instanceof TelegramError) {
      stderr(error.message);
    } else {
      stderr("tmsg failed unexpectedly.");
    }
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await runCli();
}
