"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function logInAlsKind(kindId: string) {
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
    return { error: "Alleen ouders kunnen dit doen." };
  }

  const { data: kindProfile } = await supabase
    .from("profiles")
    .select("family_id, role")
    .eq("id", kindId)
    .single();
  if (!kindProfile || kindProfile.role !== "kind" || kindProfile.family_id !== profile.family_id) {
    return { error: "Kind-account niet gevonden." };
  }

  let hashedToken: string;
  try {
    const admin = createAdminClient();
    const { data: kindUser, error: getUserError } = await admin.auth.admin.getUserById(kindId);
    if (getUserError || !kindUser?.user?.email) {
      return { error: "Kon het kind-account niet vinden." };
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: kindUser.user.email,
    });
    if (linkError || !linkData?.properties?.hashed_token) {
      return { error: linkError?.message ?? "Kon geen inloglink genereren." };
    }
    hashedToken = linkData.properties.hashed_token;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Onbekende fout bij het inloggen als kind." };
  }

  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: hashedToken,
    type: "magiclink",
  });
  if (verifyError) return { error: verifyError.message };

  redirect("/kind");
}
