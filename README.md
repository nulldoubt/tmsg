# tmsg

`tmsg` is a small Bun-powered CLI for sending yourself Telegram notifications from scripts and AI agents.

## Setup

1. Open [@BotFather](https://t.me/BotFather), run `/newbot`, and copy the bot token.
2. Open the new bot in Telegram and press **Start**. Telegram bots cannot initiate a private conversation until you do this once.
3. Find your numeric Telegram user ID (or the numeric chat ID you want to notify).
4. Configure `tmsg`:

   ```sh
   tmsg set-bot-token <bot-token>
   tmsg set-user-id <user-id>
   ```

5. Verify the saved ID and send a test message:

   ```sh
   tmsg get-user-id
   tmsg notify "tmsg is ready"
   ```

The configuration is stored in `${XDG_CONFIG_HOME:-~/.config}/tmsg/config.json`. The directory is restricted to the current user (`0700`) and the file to owner read/write (`0600`). Treat the BotFather token like a password; `tmsg` never prints it back.

## Commands

```text
tmsg set-user-id <user-id>
tmsg get-user-id
tmsg set-bot-token <token>
tmsg notify <message...>
tmsg help
tmsg --version
```

Messages are sent as plain text and may contain up to 4096 Unicode characters. A successful notification prints `Notification sent.` and exits with status 0. Configuration, network, or Telegram errors are written to stderr and return a nonzero status.

## Development

```sh
bun install
bun test
bun run typecheck
bun run install-global
```

`bun run install-global` builds a standalone executable and copies it directly to `~/.bun/bin/tmsg`. The installed command is a regular file—not a symlink—and continues working if this project directory is moved or deleted.

## Agent prompt

```text
When I may be away and you finish, become blocked, or need my attention, notify me by running:

tmsg notify "A short, actionable status message"

If the command fails, report the error normally and do not retry indefinitely.
```
