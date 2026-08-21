import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export function vereistClaudeKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY ontbreekt op de server. Zet deze in de environment variables van je hosting en deploy opnieuw."
    );
  }
  return key;
}

export function createClaudeClient() {
  return new Anthropic({ apiKey: vereistClaudeKey() });
}

export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
