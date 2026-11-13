#!/usr/bin/env node
/**
 * Simulator layanan luar untuk demo & uji end-to-end lokal (tanpa akun apa pun).
 *
 *   - Fonnte (WhatsApp):  POST /fonnte/send  → pesan muncul di UI mirip WhatsApp (http://localhost:3200)
 *                         lalu status terkirim → diterima → dibaca dikirim balik ke
 *                         /api/webhooks/fonnte milik Kosku, persis seperti Fonnte asli.
 *   - Midtrans Snap:      POST /midtrans/snap/v1/transactions → halaman bayar tiruan;
 *                         tombol "Bayar" mengirim notifikasi bertanda tangan (SHA-512) ke
 *                         /api/webhooks/payment, dan GET /midtrans/v2/:id/status menjawab cek ulang.
 *
 * Env: APP_URL, FONNTE_TOKEN, FONNTE_WEBHOOK_SECRET, MIDTRANS_SERVER_KEY, SIM_PORT (default 3200).
 * Jalankan lewat `pnpm sim` (lihat scripts/sim/start.sh). Data hanya di memori.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.SIM_PORT ?? 3200);
const APP_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const FONNTE_TOKEN = process.env.FONNTE_TOKEN ?? "";
const FONNTE_WEBHOOK_SECRET = process.env.FONNTE_WEBHOOK_SECRET ?? "";
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY ?? "";
const SELF = `http://localhost:${PORT}`;

/** @type {{id:string,to:string,body:string,at:number,status:string}[]} */
const messages = [];
/** @type {Map<string, any>} */
const transactions = new Map();
const state = { deviceConnected: true, events: /** @type {string[]} */ ([]) };
let seq = 1000;

const log = (line) => {
  const entry = `${new Date().toLocaleTimeString("id-ID")} ${line}`;
  state.events.unshift(entry);
  state.events.length = Math.min(state.events.length, 50);
  console.info(`[sim] ${line}`);
};

// ---------- util ----------
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  const type = req.headers["content-type"] ?? "";
  if (type.includes("json")) return raw ? JSON.parse(raw) : {};
  return Object.fromEntries(new URLSearchParams(raw));
}
function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}
function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const rupiah = (n) => "Rp" + Number(n).toLocaleString("id-ID");

// ---------- Fonnte ----------
async function pushFonnteStatus(msg, status) {
  msg.status = status;
  if (!FONNTE_WEBHOOK_SECRET) return;
  try {
    const r = await fetch(
      `${APP_URL}/api/webhooks/fonnte?secret=${encodeURIComponent(FONNTE_WEBHOOK_SECRET)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: msg.id, status, state: status }),
      },
    );
    log(`webhook Fonnte #${msg.id} → ${status} (HTTP ${r.status})`);
  } catch (e) {
    log(`webhook Fonnte #${msg.id} gagal: ${e.message}`);
  }
}

async function fonnteSend(req, res) {
  const auth = req.headers.authorization ?? "";
  if (!FONNTE_TOKEN || !safeEqual(auth, FONNTE_TOKEN)) {
    return send(res, 200, { status: false, reason: "invalid token" });
  }
  if (!state.deviceConnected) {
    log("Fonnte menolak pesan: perangkat terputus");
    return send(res, 200, { status: false, reason: "device disconnected" });
  }
  const body = await readBody(req);
  const msg = {
    id: String(++seq),
    to: String(body.target ?? ""),
    body: String(body.message ?? ""),
    at: Date.now(),
    status: "queued",
  };
  messages.push(msg);
  log(`WA → ${msg.to} (#${msg.id})`);
  setTimeout(() => pushFonnteStatus(msg, "sent"), 800);
  setTimeout(() => pushFonnteStatus(msg, "delivered"), 2500);
  send(res, 200, { status: true, id: [msg.id], process: "pending", detail: "success! message in queue" });
}

// ---------- Midtrans ----------
function checkMidtransAuth(req) {
  const expected = `Basic ${Buffer.from(`${MIDTRANS_SERVER_KEY}:`).toString("base64")}`;
  return Boolean(MIDTRANS_SERVER_KEY) && safeEqual(req.headers.authorization ?? "", expected);
}

async function snapCreate(req, res) {
  if (!checkMidtransAuth(req))
    return send(res, 401, { error_messages: ["Access denied (server key salah)"] });
  const body = await readBody(req);
  const orderId = body?.transaction_details?.order_id;
  const amount = body?.transaction_details?.gross_amount;
  if (!orderId || !amount) return send(res, 400, { error_messages: ["transaction_details wajib"] });
  if (transactions.has(orderId)) return send(res, 400, { error_messages: ["order_id sudah dipakai"] });
  transactions.set(orderId, {
    order_id: orderId,
    gross_amount: `${amount}.00`,
    transaction_status: "pending",
    status_code: "201",
    payment_type: null,
    transaction_id: null,
    customer: body.customer_details?.first_name ?? "",
    description: body.item_details?.[0]?.name ?? "Pembayaran",
    finish: body.callbacks?.finish ?? APP_URL,
    at: Date.now(),
  });
  log(`Midtrans: transaksi ${orderId} dibuat (${rupiah(amount)})`);
  send(res, 201, { token: orderId, redirect_url: `${SELF}/midtrans/pay/${encodeURIComponent(orderId)}` });
}

function snapStatus(req, res, orderId) {
  if (!checkMidtransAuth(req)) return send(res, 401, { status_message: "Access denied" });
  const t = transactions.get(orderId);
  if (!t) return send(res, 404, { status_code: "404", status_message: "Transaction doesn't exist." });
  send(res, 200, { ...t, status_message: "Success, transaction found" });
}

async function snapPay(req, res, orderId) {
  const t = transactions.get(orderId);
  if (!t) return send(res, 404, "Transaksi tidak ditemukan", "text/plain; charset=utf-8");
  const body = await readBody(req);
  const outcome = body.outcome === "fail" ? "deny" : "settlement";
  t.payment_type = { qris: "qris", gopay: "gopay", va: "bank_transfer" }[body.method] ?? "qris";
  t.transaction_status = outcome;
  t.status_code = outcome === "settlement" ? "200" : "202";
  t.transaction_id = `sim-${++seq}`;
  const signature_key = createHash("sha512")
    .update(t.order_id + t.status_code + t.gross_amount + MIDTRANS_SERVER_KEY)
    .digest("hex");
  try {
    const r = await fetch(`${APP_URL}/api/webhooks/payment`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...t, signature_key }),
    });
    log(`Midtrans: ${orderId} → ${outcome}, notifikasi ke Kosku HTTP ${r.status} ${await r.text()}`);
  } catch (e) {
    log(`Midtrans: notifikasi gagal: ${e.message}`);
  }
  res.writeHead(303, { location: t.finish });
  res.end();
}

function payPage(orderId) {
  const t = transactions.get(orderId);
  if (!t) return null;
  const done = t.transaction_status !== "pending";
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Simulasi Pembayaran</title><style>
body{margin:0;font-family:system-ui,sans-serif;background:#eef2f7;color:#0f172a}
.card{max-width:420px;margin:24px auto;background:#fff;border-radius:16px;box-shadow:0 4px 24px #0001;overflow:hidden}
.head{background:#0b2a4a;color:#fff;padding:16px 20px}.head small{opacity:.7}
.amt{font-size:28px;font-weight:700;margin:4px 0}
.body{padding:16px 20px}label{display:flex;gap:10px;align-items:center;border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin:8px 0;cursor:pointer}
button{width:100%;padding:14px;border:0;border-radius:10px;font-size:16px;font-weight:600;margin-top:8px;cursor:pointer}
.pay{background:#0f766e;color:#fff}.fail{background:#fee2e2;color:#991b1b}
.badge{display:inline-block;background:#fef3c7;color:#92400e;font-size:12px;padding:2px 8px;border-radius:99px}
</style></head><body><div class="card">
<div class="head"><span class="badge">SIMULASI — bukan Midtrans asli</span><div><small>${esc(t.description)}</small></div>
<div class="amt">${rupiah(parseInt(t.gross_amount))}</div><small>Order ${esc(t.order_id)}</small></div>
<div class="body">${
    done
      ? `<p>Transaksi sudah <b>${esc(t.transaction_status)}</b>.</p><a href="${esc(t.finish)}">Kembali ke Kosku</a>`
      : `<form method="post" action="/midtrans/pay/${encodeURIComponent(orderId)}">
<label><input type="radio" name="method" value="qris" checked> QRIS</label>
<label><input type="radio" name="method" value="gopay"> GoPay</label>
<label><input type="radio" name="method" value="va"> Virtual Account BCA</label>
<button class="pay" name="outcome" value="ok">Bayar ${rupiah(parseInt(t.gross_amount))}</button>
<button class="fail" name="outcome" value="fail">Simulasikan pembayaran gagal</button></form>`
  }</div></div></body></html>`;
}

// ---------- UI WhatsApp ----------
const UI = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Simulator WhatsApp · Kosku</title><style>
:root{--g:#008069;--bg:#efeae2;--me:#d9fdd3}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;height:100vh;display:flex;flex-direction:column;background:#f0f2f5}
header{background:var(--g);color:#fff;padding:10px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
header h1{font-size:17px;margin:0;flex:1}header label{font-size:13px;display:flex;gap:6px;align-items:center;cursor:pointer}
main{flex:1;display:flex;min-height:0}
#list{width:300px;background:#fff;border-right:1px solid #ddd;overflow:auto}
.chat{padding:12px 16px;border-bottom:1px solid #f0f0f0;cursor:pointer}.chat:hover,.chat.on{background:#f0f2f5}
.chat b{display:block}.chat span{color:#667781;font-size:13px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.unread{float:right;background:#25d366;color:#fff;border-radius:99px;font-size:11px;padding:1px 7px}
#conv{flex:1;display:flex;flex-direction:column;background:var(--bg);min-width:0}
#conv .top{background:#f0f2f5;padding:10px 16px;font-weight:600;border-bottom:1px solid #ddd}
#msgs{flex:1;overflow:auto;padding:16px 6%}
.b{background:var(--me);max-width:min(520px,85%);margin:0 0 10px auto;padding:8px 10px 4px;border-radius:8px;box-shadow:0 1px 1px #0001;white-space:pre-wrap;word-wrap:break-word;font-size:14.5px}
.b a{color:#027eb5}.meta{text-align:right;font-size:11px;color:#667781;margin-top:2px}.tick.read{color:#53bdeb}
#events{width:300px;background:#fff;border-left:1px solid #ddd;overflow:auto;font:12px ui-monospace,monospace;padding:8px}
#events div{padding:4px 0;border-bottom:1px dashed #eee}
.empty{color:#667781;text-align:center;margin-top:30vh}
@media (max-width:800px){main{flex-direction:column}#list,#events{width:auto;max-height:30vh}#events{display:none}}
</style></head><body>
<header><h1>📱 Simulator WhatsApp · Kosku <small style="opacity:.75;font-weight:400">(pesan tidak dikirim ke mana pun)</small></h1>
<label><input type="checkbox" id="dev" checked> Perangkat Fonnte terhubung</label></header>
<main><div id="list"></div><div id="conv"><div class="top" id="title">Pilih percakapan</div><div id="msgs"><p class="empty">Belum ada pesan.</p></div></div>
<div id="events"></div></main>
<script>
let current = null, lastJson = "";
const esc = s => s.replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);
const fmt = s => esc(s).replace(/\\*([^*\\n]+)\\*/g,"<b>$1</b>").replace(/(^|\\s)_([^_\\n]+)_/g,"$1<i>$2</i>")
  .replace(/https?:\\/\\/[^\\s<]+/g, u => '<a href="'+u+'" target="_blank" rel="noopener">'+u+'</a>');
const tick = s => s==="read" ? '<span class="tick read">✓✓</span>' : s==="delivered" ? '<span class="tick">✓✓</span>' : s==="sent" ? '<span class="tick">✓</span>' : '🕓';
async function refresh(){
  const r = await fetch("/api/state"); const d = await r.json(); const j = JSON.stringify(d);
  if (j === lastJson) return; lastJson = j;
  document.getElementById("dev").checked = d.deviceConnected;
  const byTo = {}; for (const m of d.messages) (byTo[m.to] ??= []).push(m);
  const chats = Object.entries(byTo).sort((a,b) => b[1].at(-1).at - a[1].at(-1).at);
  if (!current && chats.length) current = chats[0][0];
  document.getElementById("list").innerHTML = chats.map(([to, ms]) => {
    const unread = ms.filter(m => m.status !== "read").length;
    return '<div class="chat'+(to===current?" on":"")+'" data-to="'+to+'"><b>+'+to+(unread&&to!==current?'<span class="unread">'+unread+'</span>':'')+'</b><span>'+esc(ms.at(-1).body.split("\\n")[0])+'</span></div>';
  }).join("") || '<p class="empty" style="margin-top:20px">Belum ada chat</p>';
  document.querySelectorAll(".chat").forEach(el => el.onclick = () => { current = el.dataset.to; lastJson = ""; refresh(); });
  const ms = byTo[current] ?? [];
  document.getElementById("title").textContent = current ? "+" + current : "Pilih percakapan";
  const box = document.getElementById("msgs");
  box.innerHTML = ms.map(m => '<div class="b">'+fmt(m.body)+'<div class="meta">'+new Date(m.at).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})+' '+tick(m.status)+'</div></div>').join("") || '<p class="empty">Belum ada pesan.</p>';
  box.scrollTop = box.scrollHeight;
  document.getElementById("events").innerHTML = "<b>Log simulator</b>" + d.events.map(e => "<div>"+esc(e)+"</div>").join("");
  if (current && ms.some(m => m.status === "delivered")) fetch("/api/read", {method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({to: current})});
}
document.getElementById("dev").onchange = e => fetch("/api/device", {method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({connected: e.target.checked})});
refresh(); setInterval(refresh, 1500);
</script></body></html>`;

// ---------- router ----------
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", SELF);
  const p = url.pathname;
  try {
    if (req.method === "POST" && p === "/fonnte/send") return await fonnteSend(req, res);
    if (req.method === "POST" && p === "/midtrans/snap/v1/transactions") return await snapCreate(req, res);
    const status = /^\/midtrans\/v2\/([^/]+)\/status$/.exec(p);
    if (req.method === "GET" && status) return snapStatus(req, res, decodeURIComponent(status[1]));
    const pay = /^\/midtrans\/pay\/([^/]+)$/.exec(p);
    if (pay && req.method === "POST") return await snapPay(req, res, decodeURIComponent(pay[1]));
    if (pay && req.method === "GET") {
      const html = payPage(decodeURIComponent(pay[1]));
      return html
        ? send(res, 200, html, "text/html; charset=utf-8")
        : send(res, 404, "Tidak ditemukan", "text/plain");
    }
    if (req.method === "GET" && p === "/api/state")
      return send(res, 200, {
        messages,
        deviceConnected: state.deviceConnected,
        events: state.events,
        transactions: [...transactions.values()],
      });
    if (req.method === "POST" && p === "/api/read") {
      const { to } = await readBody(req);
      for (const m of messages) if (m.to === to && m.status === "delivered") void pushFonnteStatus(m, "read");
      return send(res, 200, { ok: true });
    }
    if (req.method === "POST" && p === "/api/device") {
      state.deviceConnected = Boolean((await readBody(req)).connected);
      log(`Perangkat Fonnte ${state.deviceConnected ? "terhubung" : "TERPUTUS"}`);
      return send(res, 200, { ok: true });
    }
    if (req.method === "GET" && p === "/") return send(res, 200, UI, "text/html; charset=utf-8");
    if (p === "/favicon.ico") return send(res, 204, "", "image/x-icon");
    send(res, 404, { error: "not found" });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: String(e) });
  }
});

server.listen(PORT, () => {
  console.info(`[sim] Simulator WhatsApp & Midtrans: ${SELF}  →  Kosku: ${APP_URL}`);
  if (!FONNTE_TOKEN || !MIDTRANS_SERVER_KEY || !FONNTE_WEBHOOK_SECRET)
    console.warn("[sim] Peringatan: FONNTE_TOKEN / FONNTE_WEBHOOK_SECRET / MIDTRANS_SERVER_KEY belum diisi.");
});
