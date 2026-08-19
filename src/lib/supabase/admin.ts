import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client. Omzeilt RLS volledig - alleen gebruiken in route
 * handlers/server actions, nooit importeren in client components. Nodig om
 * als ouder een kind-account aan te maken (auth.admin.createUser).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    const ontbreekt = [!url && "NEXT_PUBLIC_SUPABASE_URL", !serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY"]
      .filter(Boolean)
      .join(" en ");
    throw new Error(
      `${ontbreekt} ontbreekt op de server. Zet deze in de environment variables van je hosting (bijv. Netlify) en deploy opnieuw.`
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
