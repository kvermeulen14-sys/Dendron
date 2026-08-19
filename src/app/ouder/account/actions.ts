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
