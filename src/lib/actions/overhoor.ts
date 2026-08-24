"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Leerfase } from "@/lib/types";

export interface OverhoorTranscriptRegel {
  vraag: string;
  antwoord: string;
  feedback: string;
  beoordeling: "goed" | "deels" | "fout" | "geen";
}

/**
 * Slaat het resultaat van 1 afgeronde overhoor-/oefensessie op: de score
 * per beoordeling (voor de langetermijn-voortgang, blijft altijd staan) en
 * het transcript van de sessie zelf (de inhoud - wordt bewaard tot de
 * huidige roosterperiode voorbij is, zie wisOudeChatgeschiedenis).
 */
export async function slaOverhoorResultaatOp(
  subjectId: string,
  leerfase: Leerfase,
  score: { goed: number; deels: number; fout: number },
  transcript: OverhoorTranscriptRegel[] = [],
  hoofdstuk: string | null = null
) {
  const totaal = score.goed + score.deels + score.fout;
  if (totaal === 0) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("family_id")
    .eq("id", user.id)
    .single();
  if (!profile) return;

  await supabase.from("overhoor_sessies").insert({
    family_id: profile.family_id,
    user_id: user.id,
    subject_id: subjectId,
    leerfase,
    aantal_goed: score.goed,
    aantal_deels: score.deels,
    aantal_fout: score.fout,
    transcript,
    hoofdstuk,
  });

  revalidatePath(`/kind/vakken/${subjectId}`);
  revalidatePath(`/ouder/vakken/${subjectId}`);
}
