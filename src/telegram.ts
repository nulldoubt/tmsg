const TELEGRAM_API_ROOT = "https://api.telegram.org";
const DEFAULT_TIMEOUT_MS = 10_000;

export interface TelegramMessage {
  botToken: string;
  userId: string;
  text: string;
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface TelegramClientOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export class TelegramError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramError";
  }
}

function redact(value: string, secret: string): string {
  return secret.length > 0 ? value.replaceAll(secret, "[redacted]") : value;
}

export async function sendTelegramMessage(
  message: TelegramMessage,
  options: TelegramClientOptions = {},
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;

  try {
    response = await fetchImpl(
      `${TELEGRAM_API_ROOT}/bot${message.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: message.userId, text: message.text }),
        signal: controller.signal,
      },
    );
  } catch {
    if (controller.signal.aborted) {
      throw new TelegramError(`Telegram request timed out after ${timeoutMs}ms.`);
    }
    throw new TelegramError("Unable to reach Telegram.");
  } finally {
    clearTimeout(timeout);
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new TelegramError(`Telegram returned an invalid response (HTTP ${response.status}).`);
  }

  const result = payload as { ok?: unknown; description?: unknown };
  if (!response.ok || result.ok !== true) {
    const description =
      typeof result.description === "string"
        ? redact(result.description, message.botToken)
        : `HTTP ${response.status}`;
    throw new TelegramError(`Telegram API error: ${description}`);
  }
}
