// Mirrors on-site live chat into a Discord channel (one way: site -> Discord).
// Deploy:  supabase functions deploy live-to-discord --no-verify-jwt
// Secrets: supabase secrets set DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... MIRROR_TOKEN=<any long random string>
// Supabase → Database → Webhooks → Create: table live_messages, event Insert, type HTTP Request (POST),
//   URL https://<project>.supabase.co/functions/v1/live-to-discord, header  x-mirror-token: <same MIRROR_TOKEN>
Deno.serve(async (req) => {
  if (req.headers.get("x-mirror-token") !== Deno.env.get("MIRROR_TOKEN")) return new Response("no", { status: 401 });
  const hook = Deno.env.get("DISCORD_WEBHOOK_URL");
  if (!hook) return new Response("not configured", { status: 500 });
  const { record } = await req.json();
  if (!record || record.is_host) return new Response("skip", { status: 200 }); // your own posts already come from Discord/host
  const name = String(record.author_name || "Member").slice(0, 60);
  const body = String(record.body || "").slice(0, 500);
  await fetch(hook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: `${name} (site)`, content: body, allowed_mentions: { parse: [] } }),
  });
  return new Response("ok");
});
