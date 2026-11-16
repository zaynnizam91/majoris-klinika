// Majoris Inc → Telegram. Bot token and chat id live ONLY in Netlify environment variables.
const SB = "https://pccggjtidnxtwhfegmeq.supabase.co";
const KEY = "sb_publishable_LIgpNDvbE1-RHqiFK20HzA_C3VTeXI0";
const H = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
const out = (c, o) => ({ statusCode: c, headers: H, body: JSON.stringify(o) });

async function user(login) {
  const r = await fetch(`${SB}/rest/v1/records?select=data&coll=eq.users&id=eq.${encodeURIComponent(login)}&deleted=eq.false`, { headers: { apikey: KEY } });
  if (!r.ok) return null;
  const a = await r.json();
  return a[0] && a[0].data;
}

exports.handler = async (ev) => {
  const T = process.env.TG_BOT_TOKEN, C = process.env.TG_CHAT_ID;
  if (ev.httpMethod === "OPTIONS") return out(204, {});
  if (ev.httpMethod === "GET") return out(200, { configured: !!(T && C) });
  if (ev.httpMethod !== "POST") return out(405, { ok: false });
  if (!T || !C) return out(503, { ok: false, error: "TG_BOT_TOKEN / TG_CHAT_ID sozlanmagan" });
  let b = {};
  try { b = JSON.parse(ev.body || "{}"); } catch (e) { return out(400, { ok: false }); }
  const u = await user(String(b.login || ""));
  if (!u) return out(403, { ok: false, error: "xodim topilmadi" });
  const t = new Date().toLocaleTimeString("ru-RU", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit" });
  let text;
  if (b.type === "arrive" && u.r === "LOR") text = `✅ LOR shifokori ${u.n} ishga keldi (${t})`;
  else if (b.type === "test" && (u.r === "superadmin" || u.r === "Admin")) text = `🔔 Majoris Inc: Telegram ulandi (${t})`;
  else return out(403, { ok: false, error: "ruxsat yo'q" });
  const r = await fetch(`https://api.telegram.org/bot${T}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: C, text }) });
  const j = await r.json().catch(() => ({}));
  return out(r.ok ? 200 : 502, { ok: !!j.ok, error: j.description });
};
