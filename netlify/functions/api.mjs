import { getStore } from "@netlify/blobs";
import { timingSafeEqual, randomUUID, randomBytes, createHash, scryptSync, createHmac } from "node:crypto";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const same = (a, b) => { const x = Buffer.from(a || ""), y = Buffer.from(b || ""); return x.length === y.length && timingSafeEqual(x, y); };
const uid = () => randomUUID().replace(/-/g, "");
const safe = (s) => typeof s === "string" && !["__proto__","prototype","constructor"].includes(s) && /^[\w-]{1,40}$/.test(s);
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
const CONTENT = ["heading", "subtitle", "section", "pdf", "image", "link"];
const LAB_TYPES = ["glucose_fasting","glucose_random","glucose_ogtt","cholesterol_total"];
const TYPES = [...LAB_TYPES, ...CONTENT, "text", "long", "number", "email", "date", ...CH, ...BLOCKS];
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
    if (CONTENT.includes(x.type)) { q.req = false; q.help = String(x.help || "").slice(0, 2000); if (["pdf","image"].includes(x.type) && safe(x.asset)) q.asset=x.asset; if(x.type === "link" && /^https?:\/\//i.test(x.url||"")) q.url=String(x.url).slice(0,2048); out.push(q); continue; }
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
const formSettings = (c) => ({ responseMode: "separate", editing: "none", refreshSeconds: 60, sectionMode: "inline", access: "public", nameRequired: true, sensitive: true, mergeKey: "barcode", ...(c?.settings || {}) });
const hasValue = v => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length);
const mergeValues = (old, fresh) => {
  const next = { ...old };
  for (const k of ["name", "age", "height", "weight", "sys", "dia"]) if (hasValue(fresh[k])) next[k] = fresh[k];
  next.x = { ...(old.x || {}) };
  for (const [k, v] of Object.entries(fresh.x || {})) if (hasValue(v)) next.x[k] = v;
  return next;
};
const accepting = (c) => c?.open !== false && (!c?.settings?.startAt || Date.now() >= Date.parse(c.settings.startAt)) && (!c?.settings?.endAt || Date.now() <= Date.parse(c.settings.endAt));
const bn = (s) => String(s ?? "").trim().toUpperCase().replace(/\s+/g, "");

const rng = (v, k) => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", "."));
  return isFinite(n) && n >= RANGE[k][0] && n <= RANGE[k][1] ? n : NaN;
};
const bkey = (q, val) => (q.other && typeof val === "string" && /^Other/.test(val) ? "Other" : val);
function clean(b, noName, cfg, partial=false) {
  const qs = (cfg ? cfg.q : []).filter((q) => q.type !== "barcode");
  const name = String(b.name || "").trim().slice(0, 120);
  if (!name && !noName) return { error: "name" };
  const out = { name, age: null, height: null, weight: null, sys: null, dia: null, x: {} };
  const grp = {}, bx = b.x || {};
  const take = (q) => {
    if (CONTENT.includes(q.type)) return null;
    if (q.type === "age") {
      const n = rng(b.age, "age");
      if (Number.isNaN(n)) return { error: "bad" };
      if (n == null && q.req) return { error: "req" };
      out.age = n; return null;
    }
    if (q.type === "hw") {
      const h = rng(b.height, "height"), w = rng(b.weight, "weight");
      if (Number.isNaN(h) || Number.isNaN(w)) return { error: "bad" };
      if (!partial && (h == null) !== (w == null)) return { error: "pair" };
      if (h == null && q.req) return { error: "req" };
      out.height = h; out.weight = w; return null;
    }
    if (q.type === "bp") {
      const s = rng(b.sys, "sys"), d = rng(b.dia, "dia");
      if (Number.isNaN(s) || Number.isNaN(d)) return { error: "bad" };
      if (!partial && (s == null) !== (d == null)) return { error: "pair" };
      if (s && d && s <= d) return { error: "bp" };
      if (s == null && q.req) return { error: "req" };
      out.sys = s; out.dia = d; return null;
    }
    const raw = bx[q.id];
    const empty = raw === undefined || raw === null || (Array.isArray(raw) ? raw.length === 0 : String(raw).trim() === "");
    let val = null;
    if (!empty) {
      if (LAB_TYPES.includes(q.type)) {
        if (typeof raw === "boolean" || typeof raw === "object" || !/^\d+(?:[.,]\d+)?$/.test(String(raw).trim())) return { error: "custom" };
        const n = Number(String(raw).trim().replace(",", "."));
        if (!Number.isFinite(n) || n <= 0 || n > 100) return { error: "custom" };
        val = n;
      } else if (q.type === "number") {
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
    if (!partial && n && n < g.length) return { error: "pair" };
  }
  return { rec: out };
}

// Session signing key: never derived from the admin password. Uses SESSION_SECRET (32+ chars) if set,
// otherwise a random key created once and kept in the function's private storage.
let sessionKeyCache = null;

export default async (req, context) => {
  const store = getStore({ name: "screening", consistency: "strong" });
  const url = new URL(req.url);
  const shortMatch=url.pathname.match(/^\/f\/([\w-]+)\/?$/);
  const action = shortMatch ? "short" : url.searchParams.get("action") || "";
  if (req.method === "POST" && Number(req.headers.get("content-length")||0)>5700000) return J({error:"request too large"},413);
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const code = req.headers.get("x-admin-code") || "";
  if (req.method !== "POST" && !["short","company","mine","lookup","asset","me","companies","all","admins_list"].includes(action)) return J({error:"method not allowed"},405);
  const digest = v => createHash("sha256").update(String(v)).digest("hex");
  const passwordHash = (v,salt) => scryptSync(String(v).trim().toUpperCase(),salt,32).toString("hex");
  const getJ = (key) => store.get(key, { type: "json" });
  const company = (id) => (safe(id) ? getJ("c:" + id) : null);
  const list = async (prefix) => {
    const { blobs } = await store.list({ prefix });
    return (await Promise.all(blobs.map((b) => getJ(b.key)))).filter(Boolean);
  };

  // Signed, expiring sessions: credentials are not stored in the browser.
  const usernameOf=v=>String(v||"").trim().toLowerCase();
  const secret=process.env.ADMIN_CODE||"";
  let sessKey=(process.env.SESSION_SECRET||"").length>=32?process.env.SESSION_SECRET:sessionKeyCache;
  if(!sessKey&&secret){let e=await getJ("sys:session-key");if(!e?.k){await store.setJSON("sys:session-key",{k:randomBytes(32).toString("hex")},{onlyIfNew:true});e=await getJ("sys:session-key")}sessKey=sessionKeyCache=e?.k||null}
  const sign=v=>createHmac("sha256",sessKey||"unset").update(v).digest("base64url");
  const verifyCredentials=async(user,password)=>{
    const u=usernameOf(user),pw=String(password||"");if(!pw||pw.length>128||!secret)return null;
    if((!u||u==="master")&&same(pw,secret))return {role:"master"};
    if(u&&u!=="master"){const k=await getJ("au:"+u),a=k?await getJ("a:"+k.id):null;if(a?.username===u&&a.passwordVerifier&&same(a.passwordVerifier,scryptSync(pw,a.salt,32).toString("hex")))return {role:"sub",admin:a};return null}
    const k=await getJ("ak:"+hashCode(pw)),a=k?await getJ("a:"+k.id):null;if(a&&!a.username&&a.hash===hashCode(pw)&&(!a.verifier||same(a.verifier,passwordHash(pw,a.salt))))return {role:"sub",admin:a};return null;
  };
  const sessionOf=w=>{const payload=Buffer.from(JSON.stringify({role:w.role,id:w.admin?.id,version:w.admin?.credVersion||"legacy",exp:Date.now()+8*3600000})).toString("base64url");return payload+"."+sign(payload)};
  const readSession=async t=>{if(!secret||!t||t.length>1024)return null;const [payload,sig,...rest]=t.split(".");if(rest.length||!payload||!sig||!same(sig,sign(payload)))return null;try{const v=JSON.parse(Buffer.from(payload,"base64url").toString());if(!Number.isFinite(v.exp)||v.exp<=Date.now())return null;if(v.role==="master")return {role:"master"};if(v.role!=="sub"||!safe(v.id))return null;const a=await getJ("a:"+v.id);return a&&(a.credVersion||"legacy")===v.version?{role:"sub",admin:a}:null}catch{return null}};
  // Login throttling: at most 8 password checks per client address and 30 per account in 15 minutes; then that key is locked for 15 minutes.
  // A successful login gives its slot back, so normal use (e.g. several staff behind one office network) is not counted.
  const ip=req.headers.get("x-nf-client-connection-ip")||context?.ip||"unknown";
  const WIN=15*60000,IP_MAX=8,ACCT_MAX=30,rk=k=>"rl:"+createHash("sha256").update(k).digest("hex").slice(0,40);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms)),jit=()=>sleep(5+Math.random()*30);
  // Reserve an attempt slot BEFORE checking the password (fail closed if it cannot be reserved), so parallel guesses cannot outrun the counter.
  const rlTake=async(k,max)=>{for(let i=0;i<12;i++){const e=await store.getWithMetadata(rk(k),{type:"json"}),now=Date.now();let v=e?.data||{n:0,first:now};if(v.until>now)return false;if(now-v.first>WIN)v={n:0,first:now};v.n++;if(v.n>max)v.until=now+WIN;const r=await store.setJSON(rk(k),v,e?{onlyIfMatch:e.etag}:{onlyIfNew:true});if(r?.modified)return v.n<=max;await jit()}return false};
  const rlRefund=async k=>{for(let i=0;i<6;i++){const e=await store.getWithMetadata(rk(k),{type:"json"});if(!e?.data||e.data.until)return;const r=await store.setJSON(rk(k),{...e.data,n:Math.max(0,e.data.n-1)},{onlyIfMatch:e.etag});if(r?.modified)return;await jit()}};
  const guarded=async(user,password)=>{const ipk="ip:"+ip,ak="user:"+(usernameOf(user)||"master");
    if(!await rlTake(ipk,IP_MAX))return {locked:true};
    if(!await rlTake(ak,ACCT_MAX)){await rlRefund(ipk);return {locked:true}}
    const w=await verifyCredentials(user,password);
    if(w)await Promise.all([rlRefund(ipk),rlRefund(ak)]);else await sleep(300);
    return {w}};
  const TOO_MANY=()=>J({error:"too many attempts; try again in 15 minutes"},429);
  if(action==="login"){const g=await guarded(body.username,body.password);if(g.locked)return TOO_MANY();return g.w?J({session:sessionOf(g.w)}):J({error:"invalid login"},401)}
  let who=await readSession(req.headers.get("x-admin-session"));
  if(!who&&code){const g=await guarded(req.headers.get("x-admin-user"),code);if(g.locked)return TOO_MANY();who=g.w}
  const master=who?.role==="master";
  const allowed=cid=>master||!!who?.admin?.companies?.includes(cid);
  const can=p=>master||!!who?.admin?.perms?.[p];
  const deny=()=>J({error:"forbidden"},403);
  const staffSubmit=cid=>allowed(cid)&&(master||who.admin.perms?.submit!==false);
  const canView=cid=>allowed(cid)&&(master||who.admin.perms?.view!==false);
  const canAccess=c=>(formSettings(c).access!=="staff"&&formSettings(c).responseMode!=="merge")||staffSubmit(c.id);
  const recordPublic=r=>{const {tokenHash,history,...rest}=r;return rest};
  if(action==="short"){
    const slug=shortMatch?.[1]||url.searchParams.get("slug");if(!safe(slug))return J({error:"not found"},404);
    const direct=await company(slug),alias=direct?null:await getJ("alias:"+slug.toLowerCase());const c=direct||(alias?await company(alias.id):null);
    return c?Response.redirect(new URL("/?c="+encodeURIComponent(c.id),url.origin),302):J({error:"form not found"},404);
  }
  if(action==="company"){
    const c=await company(url.searchParams.get("id"));if(!c)return J({error:"not found"},404);
    const f=formSettings(c);const staffRequired=f.access==="staff"||f.responseMode==="merge";
    return J({name:c.name,open:accepting(c),cfg:canAccess(c)?cfgOf(c):{q:[]},thankYou:c.thankYou||null,settings:{...f,calculatedColumns:undefined,staffRequired,authorized:staffSubmit(c.id)},closedMessage:c.closedMessage||null});
  }
  if(action==="mine"){
    const cid=url.searchParams.get("c"),id=url.searchParams.get("id"),c=await company(cid);
    if(!c||!canAccess(c)||!safe(id)||formSettings(c).editing==="none"||formSettings(c).responseMode==="merge")return deny();
    const r=await getJ(`r:${cid}:${id}`);const token=req.headers.get("x-response-token")||"";
    return r&&r.tokenHash&&token&&same(r.tokenHash,digest(token))?J({rec:recordPublic(r)}):deny();
  }
  if(action==="asset"){
    const c=await company(url.searchParams.get("c")),id=url.searchParams.get("id");if(!c||!safe(id)||(!canAccess(c)&&!(allowed(c.id)&&can("cfg"))))return deny();
    if(!allowed(c.id)&&(!accepting(c)||!cfgOf(c).q.some(q=>q.asset===id)))return deny();
    const a=await getJ(`asset:${c.id}:${id}`);if(!a)return J({error:"not found"},404);
    const bytes=Buffer.from(a.data,"base64");const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(bytes));controller.close()}});return new Response(stream,{headers:{"content-type":a.mime,"content-disposition":(url.searchParams.get("download")==="1"?"attachment":"inline")+`; filename="${a.name.replace(/[^a-zA-Z0-9._-]/g,"_")}"`,"x-content-type-options":"nosniff","cache-control":"private, no-store"}});
  }
  if (action === "lookup") {
    const c = await company(url.searchParams.get("c"));
    if (!c || !accepting(c) || !canAccess(c) || (formSettings(c).responseMode==="merge"&&!staffSubmit(c.id))) return J({ found: false }, 404);
    const list = (await getJ("n:" + c.id))?.entries || [];
    if (!list.length) return J({ found: true, nolist: true });
    const e = list.find((x) => bn(x.barcode) === bn(url.searchParams.get("code")));
    if (!e) return J({ found: false });
    const masked = String(e.name).split(/\s+/).map((w) => w.slice(0, 1) + "*".repeat(Math.min(Math.max(w.length - 1, 0), 4))).join(" ");
    return J({ found: true, masked });
  }
  if (action === "submit" || action === "update") {
    const c = await company(body.company);
    if (!c || !accepting(c)) return J({ error: "closed" }, 403);
    if (body.website) return J({ ok: true }); // honeypot for bots
    const bq = cfgOf(c).q.find((x) => x.type === "barcode");
    if (action === "submit" && bq?.req && formSettings(c).responseMode!=="merge" && !String(body.barcode || "").trim()) return J({ error: "req" }, 400);
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
    const f=formSettings(c), merging=f.responseMode==="merge";
    if(!canAccess(c)||(merging&&!staffSubmit(c.id)))return deny();
    if(merging&&action!=="submit")return deny();
    const config=cfgOf(c);
    const {rec,error}=clean({...body,name:nm},merging||!!bc||!f.nameRequired,merging?{q:config.q.map(q=>({...q,req:false}))}:config,merging);
    if(error)return J({error},400);
    const now=Date.now();
    if(action==="submit"){
      if(!body.consent)return J({error:"consent"},400);
      if(merging){
        const mk=f.mergeKey||"barcode",value=mk==="barcode"?bc:mk==="name"?rec.name:rec.x[mk];
        if(!hasValue(value)||Array.isArray(value))return J({error:"merge identifier required"},400);
        const normalized=bn(value),id="m"+digest(mk+":"+normalized).slice(0,31);
        // Locate older records; never silently merge duplicate historical records.
        const direct=await getJ(`r:${c.id}:${id}`);
        const existing=direct?[direct]:await list(`r:${c.id}:`);
        const matches=existing.filter(r=>bn(mk==="barcode"?r.barcode:mk==="name"?r.name:r.x?.[mk])===normalized);
        if(matches.length>1)return J({error:"duplicate historical records: resolve in admin first"},409);
        if(!matches.length&&existing.length>=MAX_PER_COMPANY)return J({error:"full"},429);
        const target=matches[0]?.id||id,key=`r:${c.id}:${target}`;
        // Retry conditional writes against fresh data, retaining unrelated fields from concurrent staff submissions.
        for(let attempt=0;attempt<4;attempt++){
          const entry=await store.getWithMetadata(key,{type:"json"}),old=entry?.data;
          const committedAt=Date.now();
          const next={...(old?mergeValues(old,rec):rec),id:target,company:c.id,barcode:bc||old?.barcode||null,lce:lce||old?.lce||null,created:old?.created||now,updated:committedAt,consent:committedAt,revision:uid(),history:[...(old?.history||(old?[{at:old.updated,kind:"legacy snapshot",values:recordPublic(old)}]:[])),{at:committedAt,kind:"submission",values:rec,barcode:bc}]};
          if(next.sys&&next.dia&&next.sys<=next.dia)return J({error:"invalid merged blood pressure"},400);
          if(JSON.stringify(next).length>3500000)return J({error:"record history storage limit reached"},409);
          const result=await store.setJSON(key,next,entry?{onlyIfMatch:entry.etag}:{onlyIfNew:true});
          if(result?.modified)return J({id:target,merged:!!old});
        }
        return J({error:"another submission changed this record; please retry"},409);
      }
      const {blobs}=await store.list({prefix:`r:${c.id}:`});if(blobs.length>=MAX_PER_COMPANY)return J({error:"full"},429);
      const id=uid(),token=f.editing!=="none"?randomBytes(32).toString("hex"):null;
      await store.setJSON(`r:${c.id}:${id}`,{...rec,id,company:c.id,barcode:bc||null,lce:lce||null,created:now,updated:now,consent:now,revision:uid(),...(token?{tokenHash:digest(token)}:{}),history:[{at:now,kind:"submission",values:rec,barcode:bc}]});
      return J({id,...(token?{token}:{})});
    }
    if(f.editing==="none"||!safe(body.id))return deny();
    const key=`r:${c.id}:${body.id}`,entry=await store.getWithMetadata(key,{type:"json"}),old=entry?.data;
    const token=req.headers.get("x-response-token")||"";
    if(!old?.tokenHash||!token||!same(old.tokenHash,digest(token)))return deny();
    const next={...old,...rec,revision:uid(),updated:now,history:[...(old.history||[]),{at:now,kind:"respondent update",values:rec}]};if(JSON.stringify(next).length>3500000)return J({error:"record history storage limit reached"},409);const result=await store.setJSON(key,next,{onlyIfMatch:entry.etag});
    return result?.modified?J({ok:true}):J({error:"conflict; reopen record"},409);
  }
  if(!who)return J({error:"unauthorized"},401);
  const validAssetSignature=(mime,bytes)=>mime==="application/pdf"?bytes.subarray(0,5).toString()==="%PDF-":mime==="image/png"?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==="image/jpeg"?bytes[0]===255&&bytes[1]===216:mime==="image/webp"?bytes.subarray(0,4).toString()==="RIFF"&&bytes.subarray(8,12).toString()==="WEBP":false;
  if(action==="asset_pdf_start"||action==="asset_pdf_finish"||action==="asset_pdf_cancel"){
    const cid=body.company;if(!allowed(cid)||!can("cfg")||!(await company(cid)))return deny();
    if(action==="asset_pdf_start"){
      const first=Buffer.from(String(body.data||""),"base64"),size=Number(body.size),mime=String(body.mime||"application/pdf");
      if(!Number.isInteger(size)||size<=4000000||size>5000000||first.length!==2500000||!validAssetSignature(mime,first))return J({error:"invalid attachment or exceeds 5 MB"},400);
      const id=uid();await store.setJSON(`upload:${cid}:${id}`,{data:first.toString("base64"),size,mime,name:String(body.name||"attachment").slice(0,120),created:Date.now()});return J({id});
    }
    if(!safe(body.id))return J({error:"invalid upload ID"},400);
    const key=`upload:${cid}:${body.id}`,dest=`asset:${cid}:${body.id}`;
    if(action==="asset_pdf_cancel"){await store.delete(key);return J({ok:true})}
    if(await getJ(dest)){await store.delete(key);return J({id:body.id})}
    const first=await getJ(key);if(!first||Date.now()-first.created>3600000){await store.delete(key);return J({error:"Upload expired; select file again"},409)}
    const last=Buffer.from(String(body.data||""),"base64"),bytes=Buffer.concat([Buffer.from(first.data,"base64"),last]);
    if(!last.length||last.length>2500000||bytes.length!==first.size||bytes.length>5000000)return J({error:"incomplete attachment or exceeds 5 MB"},400);
    await store.setJSON(dest,{name:first.name,mime:first.mime||"application/pdf",data:bytes.toString("base64")},{onlyIfNew:true});await store.delete(key);return J({id:body.id});
  }
  if(action==="asset_put"){
    if(!allowed(body.company)||!can("cfg")||!(await company(body.company)))return deny();
    const mime=String(body.mime||""),data=String(body.data||""),bytes=Buffer.from(data,"base64");
    if(!["application/pdf","image/png","image/jpeg","image/webp"].includes(mime)||!bytes.length||bytes.length>4000000)return J({error:"unsupported file or exceeds 4 MB"},400);
    const valid=mime==="application/pdf"?bytes.subarray(0,5).toString()==="%PDF-":mime==="image/png"?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==="image/jpeg"?bytes[0]===255&&bytes[1]===216:bytes.subarray(0,4).toString()==="RIFF"&&bytes.subarray(8,12).toString()==="WEBP";
    if(!valid)return J({error:"file signature mismatch"},400);
    const id=uid();await store.setJSON(`asset:${body.company}:${id}`,{name:String(body.name||"file").slice(0,120),mime,data});return J({id});
  }
  if(action==="alias_put"){
    if(!allowed(body.company)||!can("cfg"))return deny();const c=await company(body.company);const slug=String(body.slug||"").toLowerCase();
    if(!c||!/^[a-z][a-z0-9-]{2,39}$/.test(slug)||/^(?:[0-9a-f]{16}|[0-9a-f]{32})$/.test(slug)||await company(slug))return J({error:"invalid or reserved alias"},400);
    const key="alias:"+slug,old=await getJ(key);if(old&&old.id!==c.id)return J({error:"short link already used"},409);
    if(!old){const claim=await store.setJSON(key,{id:c.id},{onlyIfNew:true});if(!claim?.modified)return J({error:"short link already used"},409);}
    const entry=await store.getWithMetadata("c:"+c.id,{type:"json"});if(entry?.data){const result=await store.setJSON("c:"+c.id,{...entry.data,shortSlug:slug},{onlyIfMatch:entry.etag});if(!result?.modified)return J({ok:true,slug,warning:"Link created but default link preference was not updated. Try again."})}
    return J({ok:true,slug});
  }
  if (action === "me") return J({ role: who.role, name: master ? "Master admin" : who.admin.name, perms: master ? { del: true, cfg: true } : who.admin.perms || {} });

  if (action === "companies") {
    const cs = (await list("c:")).filter((c) => allowed(c.id)).map((c) => ({ ...c, cfg: cfgOf(c) }));
    const ids = new Set(cs.map((c) => c.id)), counts = {};
    const { blobs } = await store.list({ prefix: "r:" });
    for (const b of blobs) { const id = b.key.split(":")[1]; if (ids.has(id)) counts[id] = (counts[id] || 0) + 1; }
    return J({ companies: cs, counts });
  }
  if (action === "records" && safe(body.company)) {
    if (!canView(body.company)) return deny();
    const {blobs}=await store.list({prefix:`r:${body.company}:`});
    const version=digest(JSON.stringify(blobs.map(b=>[b.key,b.etag]).sort()));
    if(body.version===version)return J({unchanged:true,version});
    return J({version,records:(await Promise.all(blobs.map(b=>getJ(b.key)))).filter(Boolean).map(r=>{const {tokenHash,...rest}=r;return rest})});
  }
  if (action === "all") {
    const cs = (await list("c:")).filter((c) => canView(c.id)).map((c) => ({ ...c, cfg: cfgOf(c) }));
    return J({ companies: cs, records: (await Promise.all(cs.map((c) => list(`r:${c.id}:`)))).flat().map(r=>{const {tokenHash,...rest}=r;return rest}) });
  }
  if (action === "company_put") {
    const name = String(body.name || "").trim().slice(0, 120);
    if (!name) return J({ error: "name" }, 400);
    const id = safe(body.id) ? body.id : uid();
    const oldEntry=await store.getWithMetadata("c:"+id,{type:"json"});const old=oldEntry?.data;
    if(body.id&&!old)return J({error:"form not found"},404);
    if(!body.id&&old)return J({error:"ID collision, retry"},409);
    if (!old && !master) return deny();
    if(!old){const reserved=await store.setJSON("form-id:"+id,{created:Date.now()},{onlyIfNew:true});if(!reserved?.modified)return J({error:"Form ID already reserved; retry creation"},409)}
    if (old && (!allowed(id) || !can("cfg"))) return deny();
    let cfg = old ? {v:2,q:cfgOf(old).q} : {v:2,q:[]};
    if (body.cfg && Array.isArray(body.cfg.q)) cfg = { v: 2, q: cleanQ(body.cfg.q) };
    const settings = { ...(old ? formSettings(old) : {...formSettings(null),nameRequired:false}) };
    if (body.settings && typeof body.settings === "object") {
      if (Object.hasOwn(body.settings, "responseMode")) {
        if (!["separate", "merge"].includes(body.settings.responseMode)) return J({ error: "invalid response mode" }, 400);
        settings.responseMode = body.settings.responseMode;
      }
      if (Object.hasOwn(body.settings, "editing")) {
        if (!["none", "legacy", "token"].includes(body.settings.editing)) return J({ error: "invalid editing mode" }, 400);
        settings.editing = body.settings.editing;
      }
      if (Object.hasOwn(body.settings, "refreshSeconds")) {
        if (![0, 30, 60].includes(Number(body.settings.refreshSeconds))) return J({ error: "invalid refresh interval" }, 400);
        settings.refreshSeconds = Number(body.settings.refreshSeconds);
      }
      if(["inline","paged"].includes(body.settings.sectionMode))settings.sectionMode=body.settings.sectionMode;
      if(["public","staff"].includes(body.settings.access))settings.access=body.settings.access;
      for(const k of ["nameRequired","sensitive"])if(typeof body.settings[k]==="boolean")settings[k]=body.settings[k];
      if(typeof body.settings.mergeKey==="string" && safe(body.settings.mergeKey))settings.mergeKey=body.settings.mergeKey;
      for (const k of ["startAt", "endAt"]) {
        if (Object.hasOwn(body.settings, k)) {
          const v = body.settings[k];
          if (v && !Number.isFinite(Date.parse(v))) return J({ error: "invalid date" }, 400);
          settings[k] = v || null;
        }
      }
      if (settings.startAt && settings.endAt && Date.parse(settings.startAt) >= Date.parse(settings.endAt)) return J({ error: "invalid schedule" }, 400);
    }
    if(body.settings&&Object.hasOwn(body.settings,"calculatedColumns")){
      const a=body.settings.calculatedColumns;if(!Array.isArray(a)||a.length>15||a.some(x=>!safe(x?.id)||typeof x.label!=="string"||!x.label.trim()||x.label.length>100||typeof x.formula!=="string"||!x.formula.trim()||x.formula.length>300)||new Set(a.map(x=>x.id)).size!==a.length)return J({error:"invalid calculated columns"},400);
      settings.calculatedColumns=a.map(({id,label,formula})=>({id,label:label.trim(),formula}));
    }
    if(settings.responseMode==="merge" && !((settings.mergeKey==="barcode"&&cfg.q?.some(q=>q.type==="barcode"))||(settings.mergeKey==="name"&&settings.nameRequired)||cfg.q?.some(q=>q.id===settings.mergeKey&&["text","number","email"].includes(q.type))))return J({error:"select an existing unique merge field"},400);
    if(old&&settings.responseMode==="merge"&&(formSettings(old).responseMode!=="merge"||formSettings(old).mergeKey!==settings.mergeKey)){
      const seen=new Set(),records=await list(`r:${id}:`);for(const r of records){const k=settings.mergeKey,v=bn(k==="barcode"?r.barcode:k==="name"?r.name:r.x?.[k]);if(!v)continue;if(seen.has(v))return J({error:"Existing duplicate identifiers. Review/export the records before enabling merge."},409);seen.add(v)}
    }
    for(const q of cfg.q||[])if(q.asset&&!(await getJ(`asset:${id}:${q.asset}`)))return J({error:"attachment missing"},400);
    const thankYou = body.thankYou === undefined ? old?.thankYou : {
      title: String(body.thankYou?.title || "Thank you!").slice(0, 160),
      message: String(body.thankYou?.message || "Your response has been submitted successfully.").slice(0, 1500),
      another: body.thankYou?.another!==false, buttonText:String(body.thankYou?.buttonText||"").slice(0,100), buttonUrl:/^https?:\/\//i.test(body.thankYou?.buttonUrl||"")?String(body.thankYou.buttonUrl).slice(0,2048):""
    };
    const closedMessage = body.closedMessage === undefined ? old?.closedMessage : String(body.closedMessage || "This form is not accepting responses.").slice(0, 500);
    let shortSlug=old?.shortSlug||null;
    if(!old){for(let i=0;i<3&&!shortSlug;i++){const slug="s-"+randomBytes(6).toString("hex");const claim=await store.setJSON("alias:"+slug,{id},{onlyIfNew:true});if(claim?.modified)shortSlug=slug}}
    const saved=await store.setJSON("c:"+id,{id,name,open:body.open??old?.open??true,cfg,settings,thankYou,closedMessage,shortSlug,created:old?.created||Date.now()},oldEntry?{onlyIfMatch:oldEntry.etag}:{onlyIfNew:true});
    if(!saved?.modified)return J({error:"Form configuration changed or ID collision; reload and retry"},409);
    return J({ok:true,id,shortSlug});
  }
  if (action === "company_del" && safe(body.id)) {
    if (!master) return deny();
    await store.setJSON("form-id:"+body.id,{retired:true},{onlyIfNew:true});
    await store.delete("c:" + body.id);
    await store.delete("n:" + body.id);
    for(const prefix of [`r:${body.id}:`,`asset:${body.id}:`,`upload:${body.id}:`,`h:${body.id}:`]){const {blobs}=await store.list({prefix});await Promise.all(blobs.map(b=>store.delete(b.key)));}
    return J({ ok: true });
  }
  if (action === "rec_del" && safe(body.company) && safe(body.id)) {
    if (!canView(body.company) || !can("del")) return deny();
    await store.delete(`r:${body.company}:${body.id}`);
    return J({ ok: true });
  }
  if(action==="rec_put"&&safe(body.company)&&safe(body.id)){
    if(!canView(body.company)||!can("edit"))return deny();
    const c=await company(body.company);if(!c)return J({error:"not found"},404);
    const key=`r:${body.company}:${body.id}`,entry=await store.getWithMetadata(key,{type:"json"}),old=entry?.data;
    if(!old)return J({error:"not found"},404);
    if((old.revision||String(old.updated))!==body.revision)return J({error:"record changed; refresh and retry"},409);
    const f=formSettings(c),raw={...old,...body.patch,x:{...(old.x||{}),...(body.patch?.x||{})}};
    const {rec,error}=clean(raw,!f.nameRequired||!!old.barcode||f.responseMode==="merge",{q:cfgOf(c).q.map(q=>({...q,req:false,after:undefined,go:undefined}))},f.responseMode==="merge");if(error)return J({error},400);
    if(f.responseMode==="merge"&&f.mergeKey!=="barcode"&&bn(f.mergeKey==="name"?rec.name:rec.x[f.mergeKey])!==bn(f.mergeKey==="name"?old.name:old.x?.[f.mergeKey]))return J({error:"cannot change merge identifier"},400);
    const updated={...old,x:{...old.x},updated:Date.now(),revision:uid(),history:[...(old.history||[{at:old.updated,kind:"legacy snapshot",values:recordPublic(old)}]),{at:Date.now(),kind:"admin correction",actor:master?"master":who.admin.id,values:body.patch}]};
    for(const k of ["name","age","height","weight","sys","dia"])if(Object.hasOwn(body.patch||{},k))updated[k]=rec[k];
    for(const q of cfgOf(c).q)if(body.patch?.x&&Object.hasOwn(body.patch.x,q.id)&&!CONTENT.includes(q.type)&&!BLOCKS.includes(q.type)){if(hasValue(rec.x[q.id]))updated.x[q.id]=rec.x[q.id];else delete updated.x[q.id]}
    if(updated.sys&&updated.dia&&updated.sys<=updated.dia)return J({error:"invalid blood pressure"},400);
    if(JSON.stringify(updated).length>3500000)return J({error:"history limit reached"},409);
    const result=await store.setJSON(key,updated,{onlyIfMatch:entry.etag});return result?.modified?J({ok:true}):J({error:"record changed; refresh and retry"},409);
  }
  if (action === "namelist_get" && safe(body.company)) {
    if (!allowed(body.company)||(!canView(body.company)&&!can("cfg"))) return deny();
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
    if (action === "admins_list") return J({ admins: (await list("a:")).map(({ hash, salt, verifier, passwordVerifier, credVersion, ...a }) => a) });
    if (action === "admin_put") {
      const name = String(body.name || "").trim().slice(0, 60);
      if (!name) return J({ error: "name" }, 400);
      const id = safe(body.id) ? body.id : uid(), old = await getJ("a:" + id);
      const companies = (Array.isArray(body.companies) ? body.companies : []).filter(safe).slice(0, 200);
      const perms = { del: !!body.perms?.del, cfg: !!body.perms?.cfg, view:body.perms?.view!==false, edit:!!body.perms?.edit, submit:body.perms?.submit!==false };
      const custom=String(body.code||""),username=body.username===undefined?old?.username||"":usernameOf(body.username);
      if(username&&(!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)||username==="master"))return J({error:"invalid username"},400);
      if(!username&&!old)return J({error:"username required"},400);
      if(old?.username&&!username)return J({error:"cannot remove username"},400);
      if(custom&&(custom.length<12||custom.length>80))return J({error:"password must be 12 to 80 characters"},400);
      if(custom&&same(custom,secret))return J({error:"choose a different password"},400);
      if(username!== (old?.username||"")&&old&&!custom&&!body.resetCode)return J({error:"set a new password when assigning a username"},400);
      let hash=old?.hash||null,salt=old?.salt||null,verifier=old?.verifier||null,passwordVerifier=old?.passwordVerifier||null,credVersion=old?.credVersion||"legacy",newCode=null;
      if(username){const uk="au:"+username,existing=await getJ(uk);if(existing&&existing.id!==id)return J({error:"username taken"},409);if(!existing){const claim=await store.setJSON(uk,{id},{onlyIfNew:true});if(!claim?.modified)return J({error:"username taken"},409)}}
      if(custom||!old||body.resetCode){const password=custom||genCode();if(!custom)newCode=password;salt=randomBytes(16).toString("hex");credVersion=uid();
        if(username){passwordVerifier=scryptSync(password,salt,32).toString("hex");hash=null;verifier=null;}
        else{hash=hashCode(password);const ex=await getJ("ak:"+hash);if(ex&&ex.id!==id)return J({error:"password already assigned"},409);verifier=passwordHash(password,salt);await store.setJSON("ak:"+hash,{id})}
      }
      await store.setJSON("a:"+id,{id,name,username:username||null,companies,perms,hash,salt,verifier,passwordVerifier,credVersion,created:old?.created||Date.now()});
      if(old?.hash&&old.hash!==hash)await store.delete("ak:"+old.hash);
      if(old?.username&&old.username!==username)await store.delete("au:"+old.username);
      return J({ ok: true, id, code: newCode });
    }
    if (action === "admin_del" && safe(body.id)) {
      const a = await getJ("a:" + body.id);
      if (a) { if(a.hash)await store.delete("ak:"+a.hash);if(a.username)await store.delete("au:"+a.username);await store.delete("a:"+body.id); }
      return J({ ok: true });
    }
  }
  return J({ error: "bad action" }, 400);
};

export const config = { path: ["/api", "/f/:slug"], method: ["GET", "POST"] };
