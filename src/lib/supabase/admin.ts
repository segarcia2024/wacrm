import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Shared service-role client. Bypasses RLS — every query MUST filter
 * by account_id (or equivalent tenant key). Do not import this from
 * client components.
 *
 * Instantiated with {@link Database} so new call sites can opt into
 * `AppSupabaseClient`. Returned as a plain client so existing DTOs
 * (`null` vs `undefined`) keep compiling until they are aligned.
 */
let client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
      );
    }
    client = createClient<Database>(url, key) as SupabaseClient;
  }
  return client;
}
