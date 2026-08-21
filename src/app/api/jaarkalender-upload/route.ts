import { NextResponse } from "next/server";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { createClient } from "@/lib/supabase/server";
import { createClaudeClient, vereistClaudeKey, CLAUDE_MODEL } from "@/lib/claude";

const MAX_BESTANDSGROOTTE = 15 * 1024 * 1024;
const TOEGESTANE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

const ExtractieSchema = z.object({
  periodes: z.array(
    z.object({
      titel: z.string().describe("Naam van de periode, bijv. 'Meivakantie' of 'Toetsweek 1'"),
      type: z.enum(["vakantie", "toetsweek", "anders"]).describe("Soort periode"),
      start: z.string().describe("Startdatum in YYYY-MM-DD formaat"),
      eind: z.string().describe("Einddatum in YYYY-MM-DD formaat (gelijk aan start als het 1 dag is)"),
    })
  ),
});

function bouwPrompt(vandaag: string) {
  return (
    `Vandaag is ${vandaag}. Dit is een bron met belangrijke schoolperiodes: vakanties, toetsweken, ` +
    "of andere belangrijke momenten in het schooljaar (kan tekst zijn, of een screenshot/foto van een " +
    "schoolkalender of jaarplanning). Herken elke periode met een titel, het soort (vakantie/toetsweek/anders), " +
    "en de start- en einddatum. Als een jaartal ontbreekt, redeneer vanuit de datum van vandaag " +
    "(het eerstvolgende logische jaar). Geef ISO-datums (YYYY-MM-DD) terug."
  );
}

export async function POST(request: Request) {
  try {
    vereistClaudeKey();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI niet geconfigureerd." }, { status: 500 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  const tekst = formData.get("text");
  const vandaag = new Date().toISOString().slice(0, 10);

  if (!(file instanceof File) && (!tekst || typeof tekst !== "string" || !tekst.trim())) {
    return NextResponse.json({ error: "Geef tekst op of kies een screenshot." }, { status: 400 });
  }

  if (file instanceof File) {
    if (!TOEGESTANE_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Alleen foto's/screenshots (JPEG/PNG/WebP) worden ondersteund." }, { status: 400 });
    }
    if (file.size > MAX_BESTANDSGROOTTE) {
      return NextResponse.json({ error: "Bestand is te groot (max 15MB)." }, { status: 400 });
    }
  }

  try {
    const client = createClaudeClient();

    const content: (
      | { type: "text"; text: string }
      | { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/webp"; data: string } }
    )[] = [{ type: "text", text: bouwPrompt(vandaag) }];

    if (file instanceof File) {
      const bytes = await file.arrayBuffer();
      content.push({
        type: "image",
        source: { type: "base64", media_type: file.type as "image/jpeg" | "image/png" | "image/webp", data: Buffer.from(bytes).toString("base64") },
      });
    } else {
      content.push({ type: "text", text: `Bron:\n${String(tekst)}` });
    }

    const response = await client.beta.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content }],
      output_format: betaZodOutputFormat(ExtractieSchema),
    });

    if (!response.parsed_output) throw new Error("Geen bruikbaar resultaat van de AI ontvangen.");
    return NextResponse.json({ periodes: response.parsed_output.periodes });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? `AI-verwerking mislukt: ${e.message}` : "AI-verwerking mislukt." },
      { status: 502 }
    );
  }
}
