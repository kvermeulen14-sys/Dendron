import "server-only";
import { GoogleGenAI, type ContentListUnion } from "@google/genai";
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

// Voor gestructureerde JSON-extractie (geen open gesprek) is "denken" niet
// nodig - zonder dit uit te zetten gaat een deel van maxOutputTokens op aan
// interne redenering, waardoor de uiteindelijke JSON-output soms halverwege
// afbreekt (en JSON.parse dan faalt op een "unterminated string").
export const GEEN_THINKING = { thinkingBudget: 0 } as const;

// Zet een zod-schema om naar het (beperkte) JSON-schema dat Gemini's
// response_json_schema ondersteunt - zie GenerateContentConfig.responseJsonSchema.
export function jsonSchemaVoorGemini(schema: z.ZodType) {
  const volledig = z.toJSONSchema(schema) as Record<string, unknown>;
  delete volledig.$schema;
  return volledig;
}

// Vraagt Gemini om een resultaat volgens `schema` (denken uit, JSON-mode aan)
// en valideert het resultaat. Gedeelde helper zodat alle AI-extractieroutes
// (huiswerk/rooster/jaarkalender/materiaal/overhoren) dezelfde, robuuste
// afhandeling gebruiken.
export async function genereerGestructureerd<T>(
  client: GoogleGenAI,
  schema: z.ZodType<T>,
  contents: ContentListUnion,
  maxOutputTokens = 8192
): Promise<T> {
  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents,
    config: {
      maxOutputTokens,
      responseMimeType: "application/json",
      responseJsonSchema: jsonSchemaVoorGemini(schema),
      thinkingConfig: GEEN_THINKING,
    },
  });

  if (!response.text) throw new Error("Geen bruikbaar resultaat van de AI ontvangen.");

  let ruw: unknown;
  try {
    ruw = JSON.parse(response.text);
  } catch {
    throw new Error("De AI gaf geen volledig/geldig resultaat terug - probeer het opnieuw.");
  }
  return schema.parse(ruw);
}
