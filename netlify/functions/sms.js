// Majoris Inc → SMS to a newly registered patient with the clinic's Telegram channel link (Eskiz.uz gateway).
// Netlify environment variables:
//   TG_CHANNEL_LINK  – e.g. https://t.me/majoris_klinika   (required)
//   ESKIZ_EMAIL, ESKIZ_PASSWORD – Eskiz.uz account (required for automatic SMS)
//   ESKIZ_FROM       – approved sender, default "4546"
//   SMS_TEXT         – approved template text; {link} is replaced with the channel link
const SB = "https://pccggjtidnxtwhfegmeq.supabase.co";
const KEY = "sb_publishable_LIgpNDvbE1-RHqiFK20HzA_C3VTeXI0";
const H = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
const out = (c, o) => ({ statusCode: c, headers: H, body: JSON.stringify(o) });
const sbh = { apikey: KEY, "Content-Type": "application/json" };

const phone = (s) => {
  const d = String(s || "").replace(/\D/g, "");
  if (d.length === 9) return "998" + d;
  if (d.length === 12 && d.startsWith("998")) return d;
  return "";
};
const text = () => (process.env.SMS_TEXT || "Majoris klinikasi: yangiliklar va ma'lumotlar uchun Telegram kanalimizga qo'shiling: {link}").replace("{link}", process.env.TG_CHANNEL_LINK || "");
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });

async function getRec(coll, id) {
  const r = await fetch(`${SB}/rest/v1/records?select=data&coll=eq.${coll}&id=eq.${encodeURIComponent(id)}&deleted=eq.false`, { headers: sbh });
  if (!r.ok) return null;
  const a = await r.json();
  return a[0] && a[0].data;
}
async function eskiz(to) {
  const fd = new FormData();
  fd.append("email", process.env.ESKIZ_EMAIL);
  fd.append("password", process.env.ESKIZ_PASSWORD);
  const a = await fetch("https://notify.eskiz.uz/api/auth/login", { method: "POST", body: fd });
  const aj = await a.json().catch(() => ({}));
  const token = aj && aj.data && aj.data.token;
  if (!token) return { ok: false, error: "Eskiz kirish xatosi" };
  const m = new FormData();
  m.append("mobile_phone", to);
  m.append("message", text());
  m.append("from", process.env.ESKIZ_FROM || "4546");
  const r = await fetch("https://notify.eskiz.uz/api/message/sms/send", { method: "POST", headers: { Authorization: "Bearer " + token }, body: m });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, error: r.ok ? undefined : (j && j.message) || "SMS yuborilmadi" };
}

exports.handler = async (ev) => {
  const link = process.env.TG_CHANNEL_LINK || "";
  const auto = !!(link && process.env.ESKIZ_EMAIL && process.env.ESKIZ_PASSWORD);
  if (ev.httpMethod === "OPTIONS") return out(204, {});
  if (ev.httpMethod === "GET") return out(200, { configured: auto, link, text: text() });
  if (ev.httpMethod !== "POST") return out(405, { ok: false });
  if (!auto) return out(503, { ok: false, error: "SMS sozlanmagan" });
  let b = {};
  try { b = JSON.parse(ev.body || "{}"); } catch (e) { return out(400, { ok: false }); }
  const u = await getRec("users", String(b.login || ""));
  if (!u || !["superadmin", "Admin", "Registrator"].includes(u.r)) return out(403, { ok: false, error: "ruxsat yo'q" });

  if (b.type === "test") {
    if (u.r === "Registrator") return out(403, { ok: false, error: "ruxsat yo'q" });
    const to = phone(b.phone);
    if (!to) return out(400, { ok: false, error: "telefon raqami noto'g'ri" });
    const r = await eskiz(to);
    return out(r.ok ? 200 : 502, r);
  }

  // patient: phone is read from the database record (never from the client); only today's patients, once per patient
  const rid = String(b.rid || "");
  const p = await getRec("rows", rid);
  if (!p) return out(404, { ok: false, retry: true, error: "bemor hali bazada yo'q" });
  if (p.date !== today()) return out(403, { ok: false, error: "faqat bugungi bemorlarga" });
  const to = phone(p.ph);
  if (!to) return out(400, { ok: false, error: "telefon raqami yo'q yoki noto'g'ri" });
  const ins = await fetch(`${SB}/rest/v1/records?on_conflict=coll,id`, {
    method: "POST",
    headers: { ...sbh, Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({ coll: "sms", id: rid, data: { t: Date.now(), to }, deleted: false, updated_at: new Date().toISOString() }),
  });
  if (!ins.ok) return out(500, { ok: false, error: "dublikat tekshiruvi ishlamadi" });
  const rows = await ins.json().catch(() => []);
  if (!rows.length) return out(200, { ok: true, dup: true });
  const r = await eskiz(to);
  if (!r.ok) await fetch(`${SB}/rest/v1/records?coll=eq.sms&id=eq.${encodeURIComponent(rid)}`, { method: "DELETE", headers: sbh }).catch(() => {});
  return out(r.ok ? 200 : 502, r);
};
