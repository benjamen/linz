import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";

serve(async (req) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // RPC call to Postgres function
  const { data, error } = await supabase.rpc("search_addresses", {
    query: q,
  });

  if (error) {
    return new Response(JSON.stringify({ error }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
});