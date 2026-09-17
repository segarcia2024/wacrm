import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Typed client for the public schema.
 * Wire this incrementally — UI DTOs still use `undefined` where the
 * generated rows use `null`.
 */
export type AppSupabaseClient = SupabaseClient<Database>;
