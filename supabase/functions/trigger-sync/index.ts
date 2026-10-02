// Startet den GitHub-Actions-Sync sofort ("Jetzt synchronisieren" in der App).
// Supabase prüft den Login (verify_jwt), daher kann nur der eingeloggte Nutzer das auslösen.
// Secrets: GITHUB_TOKEN (Fine-grained PAT mit "Actions: Read and write" nur für dieses Repo), GITHUB_REPO (z.B. PietsWelt/TrainingsAPP)

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const token = Deno.env.get("GITHUB_TOKEN");
  const repo = Deno.env.get("GITHUB_REPO");
  if (!token || !repo) {
    return Response.json({ error: "GITHUB_TOKEN oder GITHUB_REPO fehlt" }, { status: 500, headers: cors });
  }

  // Der Zeitplan in Supabase schickt {"trigger": "schedule"}, der Knopf in der App nichts.
  const body = await req.json().catch(() => ({}));
  const trigger = body?.trigger === "schedule" ? "schedule" : "manual";

  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/sync.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "trainingsapp-sync",
    },
    body: JSON.stringify({ ref: "main", inputs: { trigger } }),
  });

  if (!res.ok) {
    return Response.json({ error: `GitHub: ${res.status} ${await res.text()}` }, { status: 502, headers: cors });
  }
  return Response.json({ ok: true }, { headers: cors });
});
