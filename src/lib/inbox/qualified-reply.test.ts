import { describe, expect, it } from "vitest";
import {
  detectsQualifyingReply,
  endsWithQuestion,
  isSubstantiveReply,
} from "./qualified-reply";

describe("isSubstantiveReply", () => {
  it("accepts a plain text answer", () => {
    expect(isSubstantiveReply({ content_type: "text", content_text: "Zara Bakery" })).toBe(true);
  });

  it("accepts a short Urdu-script answer", () => {
    expect(isSubstantiveReply({ content_type: "text", content_text: "کاروبار" })).toBe(true);
  });

  it("accepts a button/list interactive reply", () => {
    expect(isSubstantiveReply({ content_type: "interactive", content_text: "Restaurant" })).toBe(true);
  });

  it("rejects emoji-only text", () => {
    expect(isSubstantiveReply({ content_type: "text", content_text: "🥂" })).toBe(false);
  });

  it("rejects a single punctuation character", () => {
    expect(isSubstantiveReply({ content_type: "text", content_text: "." })).toBe(false);
  });

  it("rejects a sticker regardless of content_text", () => {
    expect(isSubstantiveReply({ content_type: "image", content_text: "Zara Bakery" })).toBe(false);
  });

  it("rejects a voice note with no caption", () => {
    expect(isSubstantiveReply({ content_type: "audio", content_text: null })).toBe(false);
  });

  it("rejects null/empty content", () => {
    expect(isSubstantiveReply({ content_type: "text", content_text: null })).toBe(false);
    expect(isSubstantiveReply({ content_type: "text", content_text: "" })).toBe(false);
  });

  it("strips emoji before checking length, so text+emoji still counts", () => {
    expect(isSubstantiveReply({ content_type: "text", content_text: "Hi 👋" })).toBe(true);
  });
});

describe("endsWithQuestion", () => {
  it("true for text ending in ?", () => {
    expect(endsWithQuestion("What's your business called?")).toBe(true);
  });

  it("true when trailing whitespace precedes the ?", () => {
    expect(endsWithQuestion("What's your business called?   ")).toBe(true);
  });

  it("false for a statement", () => {
    expect(endsWithQuestion("Got it — connecting you with someone from our team.")).toBe(false);
  });

  it("false for null/empty", () => {
    expect(endsWithQuestion(null)).toBe(false);
    expect(endsWithQuestion("")).toBe(false);
  });
});

describe("detectsQualifyingReply", () => {
  it("qualifies a real answer to a bot question", () => {
    expect(
      detectsQualifyingReply({
        precedingMessage: { sender_type: "agent", content_text: "What's your business called?" },
        newMessage: { content_type: "text", content_text: "Zara Bakery" },
      }),
    ).toBe(true);
  });

  it("qualifies when the preceding sender is 'bot' (Flows/Automations engine)", () => {
    expect(
      detectsQualifyingReply({
        precedingMessage: { sender_type: "bot", content_text: "Which best describes your business?" },
        newMessage: { content_type: "interactive", content_text: "Restaurant" },
      }),
    ).toBe(true);
  });

  it("does not qualify an emoji reply to a question", () => {
    expect(
      detectsQualifyingReply({
        precedingMessage: { sender_type: "agent", content_text: "What's your business called?" },
        newMessage: { content_type: "text", content_text: "🥂" },
      }),
    ).toBe(false);
  });

  it("does not qualify a real answer when the preceding message wasn't a question", () => {
    expect(
      detectsQualifyingReply({
        precedingMessage: { sender_type: "agent", content_text: "Got it, thanks!" },
        newMessage: { content_type: "text", content_text: "Zara Bakery" },
      }),
    ).toBe(false);
  });

  it("does not qualify a customer's own question back", () => {
    expect(
      detectsQualifyingReply({
        precedingMessage: { sender_type: "customer", content_text: "What's the price?" },
        newMessage: { content_type: "text", content_text: "Around 5000" },
      }),
    ).toBe(false);
  });

  it("does not qualify with no preceding message", () => {
    expect(
      detectsQualifyingReply({
        precedingMessage: null,
        newMessage: { content_type: "text", content_text: "Zara Bakery" },
      }),
    ).toBe(false);
  });

  it("does not qualify a voice-note reply even to a real question", () => {
    expect(
      detectsQualifyingReply({
        precedingMessage: { sender_type: "agent", content_text: "What's your business called?" },
        newMessage: { content_type: "audio", content_text: null },
      }),
    ).toBe(false);
  });
});
