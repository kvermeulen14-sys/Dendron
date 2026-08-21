import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

export function vereistGeminiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY ontbreekt op de server. Zet deze in de environment variables van je hosting en deploy opnieuw."
    );
  }
  return key;
}

export function createGeminiClient() {
  return new GoogleGenAI({ apiKey: vereistGeminiKey() });
}

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// Zet een zod-schema om naar het (beperkte) JSON-schema dat Gemini's
// response_json_schema ondersteunt - zie GenerateContentConfig.responseJsonSchema.
export function jsonSchemaVoorGemini(schema: z.ZodType) {
  const volledig = z.toJSONSchema(schema) as Record<string, unknown>;
  delete volledig.$schema;
  return volledig;
}
