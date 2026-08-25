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

// Bij een bijgevoegde foto (bv. een opgave uit het boek) telt nauwkeurig
// lezen zwaarder dan snelheid - flash mist daar geregeld details (een
// verkeerd cijfer, een verwisselde rechthoek I/II) die pro beter goed leest.
export const GEMINI_VISION_MODEL = process.env.GEMINI_VISION_MODEL || "gemini-2.5-pro";

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
  maxOutputTokens = 8192,
  opties: { debugFouten?: boolean } = {}
): Promise<T> {
  async function eenPoging(): Promise<T> {
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
    const ruw: unknown = JSON.parse(response.text);
    return schema.parse(ruw);
  }

  // 1x automatisch opnieuw proberen bij een kapotte/afgekapte JSON-respons -
  // dit gebeurt af en toe (bv. bij een net iets langer antwoord) en is voor
  // de gebruiker vervelend als het meteen een foutmelding oplevert terwijl
  // een nieuwe poging het meestal gewoon oplost.
  try {
    return await eenPoging();
  } catch (eersteFout) {
    try {
      return await eenPoging();
    } catch (tweedeFout) {
      // Volledige fout (bv. de exacte zod-validatiefout of API-foutmelding)
      // alleen naar de serverlogs, nooit naar de gebruiker - die krijgt een
      // begrijpelijke generieke melding, maar dit maakt het bij herhaalde
      // fouten mogelijk om de echte oorzaak in de Netlify-functielogs terug
      // te vinden.
      console.error("genereerGestructureerd: 2 pogingen mislukt.", { eersteFout, tweedeFout });
      if (opties.debugFouten) {
        const detail = tweedeFout instanceof Error ? tweedeFout.message : String(tweedeFout);
        throw new Error(`De AI gaf geen volledig/geldig resultaat terug - probeer het opnieuw. [detail: ${detail.slice(0, 400)}]`);
      }
      throw new Error("De AI gaf geen volledig/geldig resultaat terug - probeer het opnieuw.");
    }
  }
}
