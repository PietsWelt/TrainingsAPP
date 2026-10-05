// Startet den GitHub-Actions-Sync sofort ("Jetzt synchronisieren" in der App) und für den Zeitplan.
// Erlaubt sind nur der eingeloggte Besitzer (is_owner, Migration 0010) und der Zeitplan mit dem
// Geheimnis aus dem Vault (x-cron-secret). Der öffentliche anon-Key allein reicht nicht.
// Secrets: GITHUB_TOKEN (Fine-grained PAT mit "Actions: Read and write" nur für dieses Repo), GITHUB_REPO (z.B. PietsWelt/TrainingsAPP),
// CRON_SECRET (Wert von sync_cron_secret aus dem Vault, siehe 0015_sync_stuendlich.sql)
// Optional: ALLOWED_ORIGIN (Standard https://pietswelt.github.io). SUPABASE_URL, SUPABASE_ANON_KEY und
// SUPABASE_SERVICE_ROLE_KEY stellt Supabase selbst bereit.

const origin = Deno.env.get("ALLOWED_ORIGIN") ?? "https://pietswelt.github.io";
const cors = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  Vary: "Origin",
};

const url = Deno.env.get("SUPABASE_URL")!;

/** Ruft eine Datenbank-Funktion auf, mit dem Login des Aufrufers oder dem Service-Key. */
async function rpc(fn: string, auth: string, args: Record<string, unknown> = {}): Promise<boolean> {
  const key = Deno.env.get("SUPABASE_ANON_KEY")!;
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) console.error("RPC", fn, res.status, await res.text());
  return res.ok && (await res.json()) === true;
}

/** Vergleich in konstanter Zeit, damit die Antwortzeit nichts über das Geheimnis verrät. */
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function allowed(req: Request): Promise<boolean> {
  const secret = req.headers.get("x-cron-secret");
  // Bevorzugt: dasselbe Geheimnis als Function-Secret CRON_SECRET (README, Schritt 4). Die Prüfung
  // über die Datenbank mit dem service_role-Key wurde in manchen Projekten abgelehnt.
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (secret && cronSecret) return sameSecret(secret, cronSecret);
  if (secret) return rpc("check_cron_secret", `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, { s: secret });
  const auth = req.headers.get("authorization");
  return auth ? rpc("is_owner", auth) : false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!(await allowed(req))) return Response.json({ error: "Nicht erlaubt" }, { status: 403, headers: cors });

  const token = Deno.env.get("GITHUB_TOKEN");
  const repo = Deno.env.get("GITHUB_REPO");
  if (!token || !repo) {
    return Response.json({ error: "GITHUB_TOKEN oder GITHUB_REPO fehlt" }, { status: 500, headers: cors });
  }

  // Der Zeitplan schickt {"trigger": "schedule"}, der Knopf in der App nichts.
  const body = await req.json().catch(() => ({}));
  const trigger = body?.trigger === "schedule" && req.headers.get("x-cron-secret") ? "schedule" : "manual";

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
    // Details nur ins Function-Log, nicht an den Aufrufer.
    console.error("GitHub", res.status, await res.text());
    return Response.json({ error: `GitHub-Fehler ${res.status}` }, { status: 502, headers: cors });
  }
  return Response.json({ ok: true }, { headers: cors });
});
