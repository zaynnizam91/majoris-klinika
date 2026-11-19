// Majoris Inc → Telegram. Bot token and chat ids live ONLY in Netlify environment variables.
//   TG_BOT_TOKEN        – bot token (required)
//   TG_CHAT_ID          – default group
//   TG_CHAT_ID_LOR      – LOR doctors' group (optional, falls back to TG_CHAT_ID)
//   TG_CHAT_ID_NURSE    – nurses' group (optional)
//   TG_CHAT_ID_KASSA    – cashiers' group (optional; alt: TG_CHAT_ID_ADMIN)
const SB = "https://pccggjtidnxtwhfegmeq.supabase.co";
const KEY = "sb_publishable_LIgpNDvbE1-RHqiFK20HzA_C3VTeXI0";
const H = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
const out = (c, o) => ({ statusCode: c, headers: H, body: JSON.stringify(o) });

const ROLES = {
  LOR: { env: "TG_CHAT_ID_LOR", label: "LOR shifokori" },
  Hamshira: { env: "TG_CHAT_ID_NURSE", label: "Muolaja hamshirasi" },
  Registrator: { env: "TG_CHAT_ID_KASSA", alt: "TG_CHAT_ID_ADMIN", label: "Kassir" },
};
const chatFor = (role) => (ROLES[role] && (process.env[ROLES[role].env] || (ROLES[role].alt && process.env[ROLES[role].alt]) || process.env.TG_CHAT_ID)) || "";

async function user(login) {
  const r = await fetch(`${SB}/rest/v1/records?select=data&coll=eq.users&id=eq.${encodeURIComponent(login)}&deleted=eq.false`, { headers: { apikey: KEY } });
  if (!r.ok) return null;
  const a = await r.json();
  return a[0] && a[0].data;
}
async function send(T, chat, text) {
  const r = await fetch(`https://api.telegram.org/bot${T}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text }) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && !!j.ok, error: j.description };
}

exports.handler = async (ev) => {
  const T = process.env.TG_BOT_TOKEN;
  if (ev.httpMethod === "OPTIONS") return out(204, {});
  if (ev.httpMethod === "GET") {
    const g = (r) => !!(T && chatFor(r));
    const src = (r) => { const o = ROLES[r]; const n = [o.env, o.alt, "TG_CHAT_ID"].find((k) => k && process.env[k]); return n ? `${n} …${String(process.env[n]).slice(-5)}` : ""; };
    return out(200, { configured: !!(T && (process.env.TG_CHAT_ID || process.env.TG_CHAT_ID_LOR || process.env.TG_CHAT_ID_NURSE || process.env.TG_CHAT_ID_KASSA || process.env.TG_CHAT_ID_ADMIN)), groups: { lor: g("LOR"), nurse: g("Hamshira"), kassa: g("Registrator") }, src: { lor: src("LOR"), nurse: src("Hamshira"), kassa: src("Registrator") }, bot: !!T });
  }
  if (ev.httpMethod !== "POST") return out(405, { ok: false });
  if (!T) return out(503, { ok: false, error: "TG_BOT_TOKEN sozlanmagan" });
  let b = {};
  try { b = JSON.parse(ev.body || "{}"); } catch (e) { return out(400, { ok: false }); }
  const u = await user(String(b.login || ""));
  if (!u) return out(403, { ok: false, error: "xodim topilmadi" });
  const t = new Date().toLocaleTimeString("ru-RU", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit" });

  if (b.type === "arrive" && ROLES[u.r]) {
    const chat = chatFor(u.r);
    if (!chat) return out(503, { ok: false, error: "guruh ID sozlanmagan" });
    const r = await send(T, chat, `✅ ${ROLES[u.r].label} ${u.n} ishga keldi (${t})`);
    return out(r.ok ? 200 : 502, r);
  }
  if (b.type === "leave" && ROLES[u.r]) {
    const chat = chatFor(u.r);
    if (!chat) return out(503, { ok: false, error: "guruh ID sozlanmagan" });
    const at = /^\d{2}:\d{2}$/.test(String(b.at || "")) ? b.at : t;
    const r = await send(T, chat, `🏁 ${ROLES[u.r].label} ${u.n} ishdan ketdi (${at})`);
    return out(r.ok ? 200 : 502, r);
  }
  if (b.type === "chats" && (u.r === "superadmin" || u.r === "Admin")) {
    const r = await fetch(`https://api.telegram.org/bot${T}/getUpdates?limit=100&allowed_updates=${encodeURIComponent('["message","my_chat_member","channel_post"]')}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) return out(502, { ok: false, error: j.description || "getUpdates xatosi" });
    const m = {};
    for (const x of j.result || []) {
      const c = (x.message || x.channel_post || x.my_chat_member || {}).chat;
      if (c && c.id < 0) m[c.id] = { id: c.id, title: c.title || String(c.id), type: c.type };
    }
    return out(200, { ok: true, chats: Object.values(m) });
  }
  if (b.type === "test" && (u.r === "superadmin" || u.r === "Admin")) {
    const done = {}, res = [];
    for (const [role, name] of [["LOR", "LOR"], ["Hamshira", "Hamshira"], ["Registrator", "Kassa"]]) {
      const chat = chatFor(role);
      if (!chat || done[chat]) continue;
      done[chat] = 1;
      const r = await send(T, chat, `🔔 Majoris Inc: Telegram ulandi — ${name} guruhi (${t})`);
      res.push({ group: name, ok: r.ok, error: r.error });
    }
    if (!res.length) return out(503, { ok: false, error: "hech bir guruh ID sozlanmagan" });
    const bad = res.find((x) => !x.ok);
    return out(bad ? 502 : 200, { ok: !bad, error: bad && `${bad.group}: ${bad.error}`, sent: res.length });
  }
  return out(403, { ok: false, error: "ruxsat yo'q" });
};
