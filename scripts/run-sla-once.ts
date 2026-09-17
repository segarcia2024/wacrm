/**
 * One-off SLA processor (same logic as GET /api/sla/cron).
 * Usage: set -a && source .env.local && set +a && npx tsx scripts/run-sla-once.ts
 */
import { createClient } from "@supabase/supabase-js";

import { processConversationSla } from "../src/lib/crm11/sla";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

async function main() {
  const admin = createClient(url!, key!);
  const result = await processConversationSla(admin);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
