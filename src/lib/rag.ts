import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedTekst } from "@/lib/gemini";
import { maakChunks } from "@/lib/chunking";

/**
 * Knipt de inhoud van een materiaal op in stukken en embedt elk stukje,
 * zodat de AI-vakdocent later per vraag alleen de relevante stukjes ophaalt
 * (RAG) in plaats van alle lesstof van een vak in elk gesprek mee te sturen.
 * Dit houdt de kennisbank behapbaar, ook als er per vak veel materiaal
 * bijkomt.
 */
export async function chunkEnEmbedMateriaal(
  supabase: SupabaseClient,
  params: { materialId: string; subjectId: string; familyId: string; content: string }
) {
  const chunks = maakChunks(params.content);
  if (chunks.length === 0) return;

  const rows: { family_id: string; subject_id: string; material_id: string; content: string; embedding: number[] }[] = [];

  for (const chunk of chunks) {
    try {
      const embedding = await embedTekst(chunk);
      rows.push({
        family_id: params.familyId,
        subject_id: params.subjectId,
        material_id: params.materialId,
        content: chunk,
        embedding,
      });
    } catch {
      // Als het embedden van 1 stukje faalt, sla het over - de rest van de
      // kennisbank blijft dan wel doorzoekbaar.
    }
  }

  if (rows.length > 0) {
    await supabase.from("material_chunks").insert(rows);
  }
}
