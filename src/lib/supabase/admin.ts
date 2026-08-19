import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client. Omzeilt RLS volledig - alleen gebruiken in route
 * handlers/server actions, nooit importeren in client components. Nodig om
 * als ouder een kind-account aan te maken (auth.admin.createUser).
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
