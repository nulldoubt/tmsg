import { describe, expect, test } from "bun:test";
import {
  sendTelegramMessage,
  TelegramError,
  type FetchLike,
} from "../src/telegram";

const message = {
  botToken: "123456:token_value",
  userId: "987654",
  text: "Build finished successfully",
};

describe("sendTelegramMessage", () => {
  test("posts the expected plain-text payload", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const fetchImpl: FetchLike = async (input, init) => {
      capturedUrl = input.toString();
      capturedInit = init;
      return Response.json({ ok: true, result: {} });
    };

    await sendTelegramMessage(message, { fetchImpl });

    expect(capturedUrl).toBe(
      "https://api.telegram.org/bot123456:token_value/sendMessage",
    );
    expect(capturedInit?.method).toBe("POST");
    expect(JSON.parse(capturedInit?.body as string)).toEqual({
      chat_id: "987654",
      text: "Build finished successfully",
    });
    expect(JSON.parse(capturedInit?.body as string)).not.toHaveProperty("parse_mode");
  });

  test("surfaces API descriptions while redacting the token", async () => {
    const fetchImpl: FetchLike = async () =>
      Response.json(
        { ok: false, description: `Invalid token ${message.botToken}` },
        { status: 401 },
      );

    try {
      await sendTelegramMessage(message, { fetchImpl });
      throw new Error("Expected sendTelegramMessage to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(TelegramError);
      expect((error as Error).message).toContain("[redacted]");
      expect((error as Error).message).not.toContain(message.botToken);
    }
  });

  test("does not expose request details on network errors", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error(`Failed to fetch /bot${message.botToken}/sendMessage`);
    };

    try {
      await sendTelegramMessage(message, { fetchImpl });
      throw new Error("Expected sendTelegramMessage to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(TelegramError);
      expect((error as Error).message).toBe("Unable to reach Telegram.");
      expect((error as Error).message).not.toContain(message.botToken);
    }
  });

  test("reports timeouts", async () => {
    const fetchImpl: FetchLike = (_, init) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });

    await expect(
      sendTelegramMessage(message, { fetchImpl, timeoutMs: 5 }),
    ).rejects.toThrow("Telegram request timed out after 5ms.");
  });

  test("rejects invalid JSON responses", async () => {
    const fetchImpl: FetchLike = async () => new Response("not-json", { status: 502 });

    await expect(sendTelegramMessage(message, { fetchImpl })).rejects.toThrow(
      "Telegram returned an invalid response (HTTP 502).",
    );
  });
});
