"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function maakKindAccount(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, family_id")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "ouder") {
    return { error: "Alleen ouders kunnen een kind-account aanmaken." };
  }

  const fullName = String(formData.get("fullName") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!fullName || !email || password.length < 6) {
    return { error: "Vul een naam, e-mailadres en wachtwoord (min. 6 tekens) in." };
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: "kind", full_name: fullName, family_id: profile.family_id },
    });

    if (error) return { error: error.message };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Onbekende fout bij het aanmaken van het account." };
  }

  revalidatePath("/ouder/account");
  return { success: true };
}

/** Verifieert dat de ingelogde ouder een kind-account uit het eigen gezin mag beheren. */
async function vereistOuderVoorKind(kindId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." } as const;

  const { data: profile } = await supabase.from("profiles").select("role, family_id").eq("id", user.id).single();
  if (!profile || profile.role !== "ouder") {
    return { error: "Alleen ouders kunnen een kind-account beheren." } as const;
  }

  const { data: kind } = await supabase.from("profiles").select("family_id, role").eq("id", kindId).single();
  if (!kind || kind.family_id !== profile.family_id || kind.role !== "kind") {
    return { error: "Dit kind-account hoort niet bij jouw gezin." } as const;
  }

  return { supabase } as const;
}

// Naam, e-mailadres en (optioneel) wachtwoord van een bestaand kind-account
// aanpassen - alles wat bij het aanmaken in te vullen was, moet ook achteraf
// te herstellen zijn (bv. een vergeten wachtwoord, of een getypte fout in het
// e-mailadres) zonder het account opnieuw te moeten aanmaken.
export async function bewerkKindAccount(kindId: string, formData: FormData) {
  const ctx = await vereistOuderVoorKind(kindId);
  if ("error" in ctx) return ctx;

  const fullName = String(formData.get("fullName") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!fullName || !email) {
    return { error: "Vul een naam en e-mailadres in." };
  }
  if (password && password.length < 6) {
    return { error: "Een nieuw wachtwoord moet minimaal 6 tekens zijn." };
  }

  try {
    // Een ouder mag het profiel van een kind niet via de normale (RLS-
    // beperkte) client wijzigen - alleen jezelf mag je eigen rij bijwerken.
    // Daarom loopt zowel de auth-wijziging als de profielnaam via de
    // service-role admin-client, na de handmatige gezins-check hierboven.
    const admin = createAdminClient();
    const { error: authError } = await admin.auth.admin.updateUserById(kindId, {
      email,
      ...(password ? { password } : {}),
      user_metadata: { role: "kind", full_name: fullName },
    });
    if (authError) return { error: authError.message };

    const { error: profielError } = await admin.from("profiles").update({ full_name: fullName }).eq("id", kindId);
    if (profielError) return { error: profielError.message };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Onbekende fout bij het bijwerken van het account." };
  }

  revalidatePath("/ouder/account");
  revalidatePath("/ouder/kind-login");
  return { success: true };
}
