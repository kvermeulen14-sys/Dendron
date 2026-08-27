import { createClient } from "@/lib/supabase/server";
import { KleurenschemaForm } from "./kleurenschema-form";

export default async function KleurenschemaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase.from("profiles").select("family_id").eq("id", user!.id).single();
  const { data: family } = await supabase
    .from("families")
    .select("theme_kleuren")
    .eq("id", profile!.family_id)
    .single();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Kleurenschema</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pas de kleur per categorie aan. Dit werkt overal door - agenda, rooster en jaarkalender delen dezelfde
          kleuren.
        </p>
      </div>

      <KleurenschemaForm opgeslagenKleuren={family?.theme_kleuren ?? null} />
    </div>
  );
}
