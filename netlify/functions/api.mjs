import { getStore } from "@netlify/blobs";
import { timingSafeEqual, randomUUID, randomBytes, createHash } from "node:crypto";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const same = (a, b) => { const x = Buffer.from(a || ""), y = Buffer.from(b || ""); return x.length === y.length && timingSafeEqual(x, y); };
const uid = () => randomUUID().replace(/-/g, "").slice(0, 16);
const safe = (s) => typeof s === "string" && /^[\w-]{1,40}$/.test(s);
const RANGE = { age: [1, 120], height: [50, 250], weight: [10, 400], sys: [50, 300], dia: [30, 200] };
const MAX_PER_COMPANY = 3000;
const hashCode = (c) => createHash("sha256").update("lifecare|" + String(c).trim().toUpperCase()).digest("hex");
const genCode = () => {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789", b = randomBytes(12);
  let s = "";
  for (let i = 0; i < 12; i++) { s += A[b[i] % A.length]; if (i % 4 === 3 && i < 11) s += "-"; }
  return s;
};
const BLOCKS = ["barcode", "age", "hw", "bp"], CH = ["choice", "dropdown", "multi", "yesno"];
const TYPES = ["text", "long", "number", "email", "date", ...CH, ...BLOCKS];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const legacyQ = (c) => {
  const cfg = c?.cfg || {}, b = { barcode: true, age: true, hw: true, bp: true, ...(cfg.builtin || {}) }, r = cfg.req || {}, q = [];
  for (const k of BLOCKS) if (b[k]) q.push({ id: k, type: k, label: "", req: !!r[k] });
  for (const x of Array.isArray(cfg.custom) ? cfg.custom : []) q.push({ id: x.id, type: x.type === "text" ? "text" : "number", label: x.label, req: !!x.req, group: x.group || "" });
  return q;
};
const cfgOf = (c) => ({ q: Array.isArray(c?.cfg?.q) ? c.cfg.q : legacyQ(c) });
const CHB = ["choice", "dropdown", "yesno"];
function cleanQ(arr) {
  const out = [], seen = new Set(), ids = new Set();
  for (const x of (Array.isArray(arr) ? arr : []).slice(0, 60)) {
    if (!TYPES.includes(x?.type)) continue;
    const isB = BLOCKS.includes(x.type);
    if (isB) { if (seen.has(x.type)) continue; seen.add(x.type); }
    const id = isB ? x.type : safe(x.id) && !ids.has(x.id) ? x.id : "q" + uid().slice(0, 8);
    ids.add(id);
    const q = { id, type: x.type, label: String(x.label || "").trim().slice(0, 120), req: !!x.req };
    if (!isB && !q.label) continue;
    if (x.help) q.help = String(x.help).trim().slice(0, 120);
    if (x.type === "yesno") q.opts = ["Yes", "No"];
    else if (["choice", "dropdown", "multi"].includes(x.type)) {
      q.opts = [...new Set((Array.isArray(x.opts) ? x.opts : []).map((o) => String(o).trim().slice(0, 80)).filter(Boolean))].slice(0, 40);
      q.other = !!x.other;
      if (!q.opts.length || q.opts.length + (q.other ? 1 : 0) < 2) continue;
    }
    if (x.type === "number") for (const k of ["min", "max"]) { const n = Number(x[k]); if (x[k] !== "" && x[k] != null && isFinite(n)) q[k] = n; }
    if (!isB && /^[A-D]$/.test(x.group)) q.group = x.group;
    if (CHB.includes(x.type) && x.go && typeof x.go === "object") q._go = x.go;
    else if (x.type !== "barcode" && x.after) q._after = String(x.after);
    out.push(q);
  }
  const idx = new Map(out.map((q, i) => [q.id, i]));
  const okT = (i, t) => t === "end" || (idx.has(t) && idx.get(t) > i && out[idx.get(t)].type !== "barcode");
  out.forEach((q, i) => {
    if (q._go) {
      const go = {};
      for (const k of [...(q.opts || []), ...(q.other ? ["Other"] : [])]) if (q._go[k] && okT(i, String(q._go[k]))) go[k] = String(q._go[k]);
      if (Object.keys(go).length) q.go = go;
      delete q._go;
    }
    if (q._after) { if (okT(i, q._after)) q.after = q._after; delete q._after; }
  });
  return out;
}
const bn = (s) => String(s || "").trim().toUpperCase().replace(/\s+/g, "");

const rng = (v, k) => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", "."));
  return isFinite(n) && n >= RANGE[k][0] && n <= RANGE[k][1] ? n : NaN;
};
const bkey = (q, val) => (q.other && typeof val === "string" && /^Other/.test(val) ? "Other" : val);
function clean(b, noName, cfg) {
  const qs = (cfg ? cfg.q : []).filter((q) => q.type !== "barcode");
  const name = String(b.name || "").trim().slice(0, 120);
  if (!name && !noName) return { error: "name" };
  const out = { name, age: null, height: null, weight: null, sys: null, dia: null, x: {} };
  const grp = {}, bx = b.x || {};
  const take = (q) => {
    if (q.type === "age") {
      const n = rng(b.age, "age");
      if (Number.isNaN(n)) return { error: "bad" };
      if (n == null && q.req) return { error: "req" };
      out.age = n; return null;
    }
    if (q.type === "hw") {
      const h = rng(b.height, "height"), w = rng(b.weight, "weight");
      if (Number.isNaN(h) || Number.isNaN(w)) return { error: "bad" };
      if ((h == null) !== (w == null)) return { error: "pair" };
      if (h == null && q.req) return { error: "req" };
      out.height = h; out.weight = w; return null;
    }
    if (q.type === "bp") {
      const s = rng(b.sys, "sys"), d = rng(b.dia, "dia");
      if (Number.isNaN(s) || Number.isNaN(d)) return { error: "bad" };
      if ((s == null) !== (d == null)) return { error: "pair" };
      if (s && d && s <= d) return { error: "bp" };
      if (s == null && q.req) return { error: "req" };
      out.sys = s; out.dia = d; return null;
    }
    const raw = bx[q.id];
    const empty = raw === undefined || raw === null || (Array.isArray(raw) ? raw.length === 0 : String(raw).trim() === "");
    let val = null;
    if (!empty) {
      if (q.type === "number") {
        const n = Number(String(raw).replace(",", "."));
        if (!isFinite(n) || (q.min != null && n < q.min) || (q.max != null && n > q.max)) return { error: "custom" };
        val = n;
      } else if (q.type === "email") {
        const s = String(raw).trim().slice(0, 120);
        if (!EMAIL.test(s)) return { error: "custom" };
        val = s;
      } else if (q.type === "date") {
        const s = String(raw).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s))) return { error: "custom" };
        val = s;
      } else if (q.type === "multi") {
        const a = [];
        for (const e0 of Array.isArray(raw) ? raw : [raw]) {
          const e = String(e0);
          if (q.opts.includes(e)) a.push(e);
          else if (q.other && e === "Other") return { error: "req" };
          else if (q.other && /^Other: \S/.test(e)) a.push(e.slice(0, 208));
          else return { error: "custom" };
        }
        val = a;
      } else if (q.type === "choice" || q.type === "dropdown" || q.type === "yesno") {
        const s = String(raw);
        if (q.opts.includes(s)) val = s;
        else if (q.other && s === "Other") return { error: "req" };
        else if (q.other && /^Other: \S/.test(s)) val = s.slice(0, 208);
        else return { error: "custom" };
      } else if (q.type === "long") val = String(raw).trim().slice(0, 1000);
      else val = String(raw).trim().slice(0, 200);
    }
    if (val === null) { if (q.req) return { error: "req" }; }
    else out.x[q.id] = val;
    if (q.group) (grp[q.group] ||= []).push(val !== null);
    return null;
  };
  let i = 0, guard = 0;
  while (i < qs.length && guard++ < 500) {
    const q = qs[i], err = take(q);
    if (err) return err;
    let nx = i + 1;
    const t = CHB.includes(q.type) ? q.go?.[bkey(q, out.x[q.id])] : q.after;
    if (t === "end") nx = qs.length;
    else if (t) { const j = qs.findIndex((y) => y.id === t); if (j > i) nx = j; }
    i = nx;
  }
  for (const g of Object.values(grp)) {
    const n = g.filter(Boolean).length;
    if (n && n < g.length) return { error: "pair" };
  }
  return { rec: out };
}

export default async (req) => {
  const store = getStore({ name: "screening", consistency: "strong" });
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const getJ = (key) => store.get(key, { type: "json" });
  const company = (id) => (safe(id) ? getJ("c:" + id) : null);
  const list = async (prefix) => {
    const { blobs } = await store.list({ prefix });
    return (await Promise.all(blobs.map((b) => getJ(b.key)))).filter(Boolean);
  };

  // ---------- public (staff self-entry): can only create / read / update ONE record ----------
  if (action === "company") {
    const c = await company(url.searchParams.get("id"));
    return c ? J({ name: c.name, open: c.open !== false, cfg: cfgOf(c) }) : J({ error: "not found" }, 404);
  }
  if (action === "mine") {
    const cid = url.searchParams.get("c"), id = url.searchParams.get("id");
    const rec = safe(cid) && safe(id) ? await getJ(`r:${cid}:${id}`) : null;
    return rec ? J({ rec }) : J({ error: "not found" }, 404);
  }
  if (action === "lookup") {
    const c = await company(url.searchParams.get("c"));
    if (!c || c.open === false) return J({ found: false }, 404);
    const list = (await getJ("n:" + c.id))?.entries || [];
    if (!list.length) return J({ found: true, nolist: true });
    const e = list.find((x) => bn(x.barcode) === bn(url.searchParams.get("code")));
    if (!e) return J({ found: false });
    const masked = String(e.name).split(/\s+/).map((w) => w.slice(0, 1) + "*".repeat(Math.min(Math.max(w.length - 1, 0), 4))).join(" ");
    return J({ found: true, masked });
  }
  if (action === "submit" || action === "update") {
    const c = await company(body.company);
    if (!c || c.open === false) return J({ error: "closed" }, 403);
    if (body.website) return J({ ok: true }); // honeypot for bots
    const bq = cfgOf(c).q.find((x) => x.type === "barcode");
    if (action === "submit" && bq?.req && !String(body.barcode || "").trim()) return J({ error: "req" }, 400);
    let bc = "", lce = "", nm = body.name;
    if (action === "submit" && body.barcode && bq) {
      const list = (await getJ("n:" + c.id))?.entries || [];
      if (!list.length) bc = String(body.barcode).trim().slice(0, 60); // no namelist: record barcode as scanned
      else {
        const e = list.find((x) => bn(x.barcode) === bn(body.barcode));
        if (!e) return J({ error: "barcode" }, 400);
        nm = e.name; bc = e.barcode; lce = e.lce || "";
      }
    }
    const { rec, error } = clean({ ...body, name: nm }, !!bc, cfgOf(c));
    if (error) return J({ error }, 400);
    if (action === "submit") {
      if (!body.consent) return J({ error: "consent" }, 400);
      const { blobs } = await store.list({ prefix: `r:${c.id}:` });
      if (blobs.length >= MAX_PER_COMPANY) return J({ error: "full" }, 429);
      const id = uid(), now = Date.now();
      await store.setJSON(`r:${c.id}:${id}`, { ...rec, id, company: c.id, barcode: bc || null, lce: lce || null, created: now, updated: now, consent: now });
      return J({ id });
    }
    if (!safe(body.id)) return J({ error: "bad id" }, 400);
    const key = `r:${c.id}:${body.id}`, old = await getJ(key);
    if (!old) return J({ error: "not found" }, 404);
    await store.setJSON(key, { ...old, ...rec, updated: Date.now() });
    return J({ ok: true });
  }

  // ---------- admin: master (ADMIN_CODE) or sub-admin (code issued by master) ----------
  const code = req.headers.get("x-admin-code") || "";
  let who = null;
  if (process.env.ADMIN_CODE && same(code, process.env.ADMIN_CODE)) who = { role: "master" };
  else if (code) {
    const k = await getJ("ak:" + hashCode(code));
    const a = k ? await getJ("a:" + k.id) : null;
    if (a) who = { role: "sub", admin: a };
  }
  if (!who) return J({ error: "unauthorized" }, 401);
  const master = who.role === "master";
  const allowed = (cid) => master || (who.admin.companies || []).includes(cid);
  const can = (p) => master || !!who.admin.perms?.[p];
  const deny = () => J({ error: "forbidden" }, 403);

  if (action === "me") return J({ role: who.role, name: master ? "Master admin" : who.admin.name, perms: master ? { del: true, cfg: true } : who.admin.perms || {} });

  if (action === "companies") {
    const cs = (await list("c:")).filter((c) => allowed(c.id)).map((c) => ({ ...c, cfg: cfgOf(c) }));
    const ids = new Set(cs.map((c) => c.id)), counts = {};
    const { blobs } = await store.list({ prefix: "r:" });
    for (const b of blobs) { const id = b.key.split(":")[1]; if (ids.has(id)) counts[id] = (counts[id] || 0) + 1; }
    return J({ companies: cs, counts });
  }
  if (action === "records" && safe(body.company)) {
    if (!allowed(body.company)) return deny();
    return J({ records: await list(`r:${body.company}:`) });
  }
  if (action === "all") {
    const cs = (await list("c:")).filter((c) => allowed(c.id)).map((c) => ({ ...c, cfg: cfgOf(c) }));
    return J({ companies: cs, records: (await Promise.all(cs.map((c) => list(`r:${c.id}:`)))).flat() });
  }
  if (action === "company_put") {
    const name = String(body.name || "").trim().slice(0, 120);
    if (!name) return J({ error: "name" }, 400);
    const id = safe(body.id) ? body.id : uid();
    const old = await getJ("c:" + id);
    if (!old && !master) return deny();
    if (old && (!allowed(id) || !can("cfg"))) return deny();
    let cfg = old?.cfg;
    if (body.cfg && Array.isArray(body.cfg.q)) cfg = { v: 2, q: cleanQ(body.cfg.q) };
    await store.setJSON("c:" + id, { id, name, open: body.open ?? old?.open ?? true, cfg, created: old?.created || Date.now() });
    return J({ ok: true, id });
  }
  if (action === "company_del" && safe(body.id)) {
    if (!master) return deny();
    await store.delete("c:" + body.id);
    await store.delete("n:" + body.id);
    const { blobs } = await store.list({ prefix: `r:${body.id}:` });
    await Promise.all(blobs.map((b) => store.delete(b.key)));
    return J({ ok: true });
  }
  if (action === "rec_del" && safe(body.company) && safe(body.id)) {
    if (!allowed(body.company) || !can("del")) return deny();
    await store.delete(`r:${body.company}:${body.id}`);
    return J({ ok: true });
  }
  if (action === "rec_put" && safe(body.company)) {
    if (!master) return deny();
    const { rec, error } = clean(body, false, cfgOf(await company(body.company)));
    if (error) return J({ error }, 400);
    const id = safe(body.id) ? body.id : uid(), key = `r:${body.company}:${id}`, old = await getJ(key), now = Date.now();
    await store.setJSON(key, { ...old, ...rec, id, company: body.company, created: old?.created || now, updated: now });
    return J({ ok: true, id });
  }
  if (action === "namelist_get" && safe(body.company)) {
    if (!allowed(body.company)) return deny();
    return J({ entries: (await getJ("n:" + body.company))?.entries || [] });
  }
  if (action === "namelist_put" && safe(body.company)) {
    if (!allowed(body.company) || !can("cfg")) return deny();
    if (!(await company(body.company))) return J({ error: "no company" }, 404);
    const seen = new Set(), entries = [];
    for (const e of Array.isArray(body.entries) ? body.entries.slice(0, 5000) : []) {
      const name = String(e.name || "").trim().slice(0, 120), barcode = String(e.barcode || "").trim().slice(0, 60);
      if (!name || !barcode || seen.has(bn(barcode))) continue;
      seen.add(bn(barcode));
      entries.push({ name, barcode, lce: String(e.lce || "").trim().slice(0, 60) });
    }
    if (entries.length === 0) await store.delete("n:" + body.company);
    else await store.setJSON("n:" + body.company, { updated: Date.now(), entries });
    return J({ ok: true, count: entries.length });
  }

  // ---------- master only: manage admins ----------
  if (action.startsWith("admin")) {
    if (!master) return deny();
    if (action === "admins_list") return J({ admins: (await list("a:")).map(({ hash, ...a }) => a) });
    if (action === "admin_put") {
      const name = String(body.name || "").trim().slice(0, 60);
      if (!name) return J({ error: "name" }, 400);
      const id = safe(body.id) ? body.id : uid(), old = await getJ("a:" + id);
      const companies = (Array.isArray(body.companies) ? body.companies : []).filter(safe).slice(0, 200);
      const perms = { del: !!body.perms?.del, cfg: !!body.perms?.cfg };
      const custom = String(body.code || "").trim();
      if (custom) {
        if (custom.length < 8 || custom.length > 40) return J({ error: "short" }, 400);
        if (process.env.ADMIN_CODE && String(process.env.ADMIN_CODE).toUpperCase() === custom.toUpperCase()) return J({ error: "taken" }, 400);
        const ex = await getJ("ak:" + hashCode(custom));
        if (ex && ex.id !== id) return J({ error: "taken" }, 400);
      }
      let hash = old?.hash, newCode = null;
      if (custom) {
        const nh = hashCode(custom);
        if (old?.hash && old.hash !== nh) await store.delete("ak:" + old.hash);
        hash = nh;
        await store.setJSON("ak:" + nh, { id });
      } else if (!old || body.resetCode) {
        newCode = genCode();
        if (old?.hash) await store.delete("ak:" + old.hash);
        hash = hashCode(newCode);
        await store.setJSON("ak:" + hash, { id });
      }
      await store.setJSON("a:" + id, { id, name, companies, perms, hash, created: old?.created || Date.now() });
      return J({ ok: true, id, code: newCode });
    }
    if (action === "admin_del" && safe(body.id)) {
      const a = await getJ("a:" + body.id);
      if (a) { await store.delete("ak:" + a.hash); await store.delete("a:" + body.id); }
      return J({ ok: true });
    }
  }
  return J({ error: "bad action" }, 400);
};

export const config = { path: "/api" };
