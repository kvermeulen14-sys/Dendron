import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";

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
  return new GoogleGenerativeAI(vereistGeminiKey());
}

const EMBEDDING_MODEL = "text-embedding-004";

/**
 * Zet tekst om in een embedding-vector, gebruikt voor het zoeken naar
 * relevante stukjes lesstof (RAG) in plaats van alle lesstof van een vak in
 * elk gesprek mee te sturen.
 */
export async function embedTekst(tekst: string): Promise<number[]> {
  const genAI = createGeminiClient();
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  const result = await model.embedContent(tekst.slice(0, 8000));
  return result.embedding.values;
}
