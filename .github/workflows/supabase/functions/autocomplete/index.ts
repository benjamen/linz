import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

serve(async (req) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  );

  const { data, error } = await supabase.rpc("search_addresses", {
    query: q,
  });

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
});