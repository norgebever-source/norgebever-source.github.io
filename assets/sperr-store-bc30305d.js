// Svingen · Live-Sperrungen: Daten, Prüfungen und Kartenzeichnung (ohne React)
// Datenquelle: Statens vegvesen (DATEX II, NLOD 2.0), aufbereitet als öffentliches JSON.
export const JSON_URL = "https://norgebever-source.github.io/svingen-sperrungen/sperrungen.json";
export const UNLOCK_KEY = "svingen-live-unlock";
export const MAP_KEY = "svingen-live-map";
const CODE_HASH = "e245a5a23ebd56989fdc337b1e8bbeed9be78e9736b3dca40c8301ac630bced2";
const STALE_MS = 3 * 3600 * 1000;
const subs = new Set();
export const store = {
  unlocked: false, loading: false, error: null, data: null, generated: 0,
  stale: false, showMap: true, vehicle: null, items: [], mapItems: [], v: 0, total: 0, hidden: 0,
};
let timer = null, started = false, lastFetch = 0;

function emit() { store.v++; subs.forEach((f) => { try { f(); } catch (e) {} }); }
export function subscribe(f) { subs.add(f); return () => subs.delete(f); }
export function getVersion() { return store.v; }

export function readUnlock() {
  try { store.unlocked = localStorage.getItem(UNLOCK_KEY) === "1"; } catch (e) { store.unlocked = false; }
  try { store.showMap = localStorage.getItem(MAP_KEY) !== "0"; } catch (e) {}
  return store.unlocked;
}
function normCode(c) { return String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
async function sha256hex(t) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
export async function tryUnlock(code) {
  try {
    const h = await sha256hex("svingen-live:" + normCode(code));
    if (h !== CODE_HASH) return false;
    try { localStorage.setItem(UNLOCK_KEY, "1"); } catch (e) {}
    // Vorhandene Daten sofort neu aufbereiten: start() lädt innerhalb von 2 Minuten nicht neu,
    // sonst bliebe die Liste nach "ausschalten" + erneutem Freischalten leer.
    store.unlocked = true; rebuild(); emit(); start();
    return true;
  } catch (e) { return false; }
}
export function lock() {
  try { localStorage.removeItem(UNLOCK_KEY); } catch (e) {}
  store.unlocked = false; rebuild(); stop(); emit();
}
export function setShowMap(b) {
  store.showMap = !!b;
  try { localStorage.setItem(MAP_KEY, b ? "1" : "0"); } catch (e) {}
  rebuild(); emit();
}

// ---- Anwendbarkeit auf das Fahrzeug -------------------------------------------
function cmp(op, have, lim) {
  switch (op) {
    case "greaterThan": return have > lim;
    case "greaterThanOrEqualTo": return have >= lim;
    case "lessThan": return have < lim;
    case "lessThanOrEqualTo": return have <= lim;
    default: return true;
  }
}
function maxWeight(v) {
  if (!v) return 3.5;
  if (v.kind === "caravan") return 4.5;
  if (v.kind === "motorhome") return v.over3500 ? 7.5 : 3.5;
  return 3.5;
}
export function appliesTo(it, v) {
  const f = it.f || {};
  if (f.len && !cmp(f.len.op, v ? v.lengthM : 0, f.len.v)) return false;
  if (f.hgt && !cmp(f.hgt.op, v ? v.heightM : 0, f.hgt.v)) return false;
  if (f.wid && !cmp(f.wid.op, 2.55, f.wid.v)) return false;
  if (f.wgt && !cmp(f.wgt.op, maxWeight(v), f.wgt.v)) return false;
  return true;
}
const fmtN = (n) => String(n).replace(".", ",");
export function restrictionText(it) {
  const f = it.f || {}, o = [];
  const w = (x) => (x.op === "lessThanOrEqualTo" || x.op === "lessThan" ? "höchstens/unter " : "über ");
  if (f.len) o.push("Länge " + w(f.len) + fmtN(f.len.v) + " m");
  if (f.wid) o.push("Breite " + w(f.wid) + fmtN(f.wid.v) + " m");
  if (f.hgt) o.push("Höhe " + w(f.hgt) + fmtN(f.hgt.v) + " m");
  if (f.wgt) o.push("Gesamtgewicht " + w(f.wgt) + fmtN(f.wgt.v) + " t");
  return o.length ? "Gilt für Fahrzeuge mit " + o.join(", ") + "." : "";
}
export const CAT = {
  gesperrt: { t: { jetzt: "Straße gesperrt", zeitweise: "Zeitweise gesperrt", geplant: "Sperrung geplant" }, sev: "stop" },
  winter: { t: { jetzt: "Wintersperre", zeitweise: "Wintersperre (zeitweise)", geplant: "Wintersperre geplant" }, sev: "stop" },
  kurz: { t: { jetzt: "Kurze Sperrungen im Wechsel", zeitweise: "Kurze Sperrungen (zu bestimmten Zeiten)", geplant: "Kurze Sperrungen geplant" }, sev: "caution" },
  gewicht: { t: { jetzt: "Gewichts- oder Achslastgrenze", zeitweise: "Gewichtsgrenze (zeitweise)", geplant: "Gewichtsgrenze geplant" }, sev: "caution" },
  hindernis: { t: { jetzt: "Hindernis oder Störung", zeitweise: "Hindernis (zeitweise)", geplant: "Hindernis geplant" }, sev: "caution" },
  spur: { t: { jetzt: "Fahrstreifen gesperrt", zeitweise: "Fahrstreifen gesperrt (zeitweise)", geplant: "Fahrstreifen-Sperrung geplant" }, sev: "info" },
  eng: { t: { jetzt: "Fahrbahn verengt", zeitweise: "Fahrbahn verengt (zeitweise)", geplant: "Verengung geplant" }, sev: "info" },
};
export function severity(it) {
  const c = CAT[it.c] || { sev: "info" };
  if (it.p === "geplant") return "info";
  if (it.p === "zeitweise" && c.sev === "stop") return "caution";
  return c.sev;
}
export function titleOf(it) { return ((CAT[it.c] || { t: {} }).t[it.p]) || "Meldung"; }
export function untilText(it) {
  const f = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? m[3] + "." + m[2] + "." + m[1] : null; };
  if (it.p === "geplant" && it.a) return "ab " + f(it.a) + (it.e ? " bis " + f(it.e) : "");
  return it.e ? "bis " + f(it.e) : "ohne Enddatum";
}
export function labelOf(it) {
  const r = it.r ? it.r.replace(/^([A-Za-z]+)(\d+)$/, "$1 $2") : "";
  return [r, it.n].filter(Boolean).join(" ") || it.l || "Straße";
}

// ---- Geometrie ----------------------------------------------------------------
const M_LAT = 110540;
function mLng(lat) { return 111320 * Math.cos((lat * Math.PI) / 180); }
function prep(it) {
  const lines = it.g && it.g.length ? it.g : null;
  const pts = lines ? null : it.q || [];
  let a = 90, b = 180, c = -90, d = -180;
  const all = lines ? [].concat(...lines) : pts;
  for (const p of all) { if (p[0] < a) a = p[0]; if (p[0] > c) c = p[0]; if (p[1] < b) b = p[1]; if (p[1] > d) d = p[1]; }
  return { it, lines, pts, bbox: [a, b, c, d], isPoint: !lines, lat0: (a + c) / 2, id: it.i };
}
function ptSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function samples(P, step) {
  // Stützpunkte entlang der Meldung (ca. alle step Meter, höchstens 300)
  if (P.isPoint) return P.pts.map((p) => [p[0], p[1]]);
  const k = mLng(P.lat0), out = [];
  let total = 0;
  for (const ln of P.lines) for (let i = 1; i < ln.length; i++) total += Math.hypot((ln[i][1] - ln[i - 1][1]) * k, (ln[i][0] - ln[i - 1][0]) * M_LAT);
  const st = Math.max(step, total / 300);
  for (const ln of P.lines) {
    out.push([ln[0][0], ln[0][1]]);
    let acc = 0;
    for (let i = 1; i < ln.length; i++) {
      const seg = Math.hypot((ln[i][1] - ln[i - 1][1]) * k, (ln[i][0] - ln[i - 1][0]) * M_LAT);
      let pos = st - acc;
      while (pos < seg) {
        const t = pos / seg;
        out.push([ln[i - 1][0] + (ln[i][0] - ln[i - 1][0]) * t, ln[i - 1][1] + (ln[i][1] - ln[i - 1][1]) * t]);
        pos += st;
      }
      acc = (acc + seg) % st;
    }
    out.push([ln[ln.length - 1][0], ln[ln.length - 1][1]]);
  }
  return out;
}
// Mindestabstand eines Punktes zu einer Linienfolge (Meter), pts = [[lat,lng],...]
function distToPath(lat, lng, path, i0, i1) {
  const k = mLng(lat);
  let best = Infinity;
  for (let i = Math.max(0, i0); i < Math.min(path.length - 1, i1); i++) {
    const a = path[i], b = path[i + 1];
    const d = ptSeg(lng * k, lat * M_LAT, a[1] * k, a[0] * M_LAT, b[1] * k, b[0] * M_LAT);
    if (d < best) best = d;
  }
  return best;
}
// Route (Array [lat,lng]) gegen vorbereitete Meldungen prüfen
export function checkPath(prepared, path, opt) {
  const o = Object.assign({ near: 30, cross: 45, point: 90, frac: 0.25 }, opt || {});
  if (!path || path.length < 2) return [];
  const mLat = 0.0008;
  const hits = [];
  for (const P of prepared) {
    const mLg = mLat / Math.cos((P.lat0 * Math.PI) / 180);
    const [a, b, c, d] = P.bbox;
    const m1 = a - mLat * (P.isPoint ? 1.5 : 1), m2 = b - mLg, m3 = c + mLat * (P.isPoint ? 1.5 : 1), m4 = d + mLg;
    const segs = [];
    for (let i = 0; i < path.length - 1; i++) {
      const p = path[i], q = path[i + 1];
      const lo = p[0] < q[0] ? p[0] : q[0], hi = p[0] < q[0] ? q[0] : p[0];
      if (hi < m1 || lo > m3) continue;
      const lo2 = p[1] < q[1] ? p[1] : q[1], hi2 = p[1] < q[1] ? q[1] : p[1];
      if (hi2 < m2 || lo2 > m4) continue;
      segs.push(i);
    }
    if (!segs.length) continue;
    const S = samples(P, 20);
    let minD = Infinity, near = 0, atIdx = segs[0];
    const lim = P.isPoint ? o.point : o.near;
    for (const s of S) {
      let best = Infinity, bi = -1;
      const k = mLng(s[0]);
      for (const i of segs) {
        const p = path[i], q = path[i + 1];
        const dd = ptSeg(s[1] * k, s[0] * M_LAT, p[1] * k, p[0] * M_LAT, q[1] * k, q[0] * M_LAT);
        if (dd < best) { best = dd; bi = i; }
      }
      if (best < minD) { minD = best; atIdx = bi; }
      if (best <= lim) near++;
    }
    // Route-Stützpunkte gegen Meldungslinie (fängt kurze Meldungen zwischen den Stützpunkten ab)
    if (!P.isPoint) {
      const flat = [].concat(...P.lines.map((ln) => ln));
      for (const i of segs) {
        for (const e of [path[i], path[i + 1]]) {
          let dd = Infinity;
          for (const ln of P.lines) { const x = distToPath(e[0], e[1], ln, 0, ln.length - 1); if (x < dd) dd = x; }
          if (dd < minD) { minD = dd; atIdx = i; }
        }
      }
    }
    const frac = near / S.length;
    const on = P.isPoint ? minD <= o.point : (frac >= o.frac || (S.length <= 3 && minD <= o.cross) || (minD <= o.near && P.lines.every((ln) => ln.length <= 3)));
    if (on) hits.push({ it: P.it, kind: "auf", d: minD, at: atIdx });
    else if (!P.isPoint && minD <= o.cross) hits.push({ it: P.it, kind: "nahe", d: minD, at: atIdx });
  }
  hits.sort((x, y) => x.at - y.at);
  return hits;
}
function bearing(a, b) {
  const k = mLng(a[0]);
  return (Math.atan2((b[1] - a[1]) * k, (b[0] - a[0]) * M_LAT) * 180) / Math.PI;
}
// Standort-Check: Meldungen am Standort oder voraus (in Fahrtrichtung)
export function checkPosition(prepared, pos, prev) {
  if (!pos) return [];
  const here = [pos.lat, pos.lng];
  let heading = null;
  if (prev) {
    const k = mLng(pos.lat);
    const mv = Math.hypot((pos.lng - prev.lng) * k, (pos.lat - prev.lat) * M_LAT);
    if (mv >= 15) heading = bearing([prev.lat, prev.lng], here);
  }
  const hits = [];
  for (const P of prepared) {
    const [a, b, c, d] = P.bbox;
    if (here[0] < a - 0.05 || here[0] > c + 0.05 || here[1] < b - 0.1 || here[1] > d + 0.1) continue;
    const S = samples(P, 25);
    let best = Infinity, bs = null;
    const k = mLng(here[0]);
    for (const s of S) {
      const dd = Math.hypot((s[1] - here[1]) * k, (s[0] - here[0]) * M_LAT);
      if (dd < best) { best = dd; bs = s; }
    }
    if (best <= 60) { hits.push({ it: P.it, kind: "hier", d: best }); continue; }
    if (heading == null || best > 3000) continue;
    if (P.it.c === "spur" || P.it.c === "eng") continue;
    let diff = Math.abs(((bearing(here, bs) - heading + 540) % 360) - 180);
    if (diff <= 60) hits.push({ it: P.it, kind: "voraus", d: best });
  }
  hits.sort((x, y) => x.d - y.d);
  return hits.slice(0, 4);
}

// ---- Laden --------------------------------------------------------------------
let prepared = [];
export function getPrepared() { return prepared; }
export function rebuild() {
  const d = store.data;
  if (!d || store.stale || !store.unlocked) { prepared = []; store.items = []; store.mapItems = []; store.total = 0; store.hidden = 0; return; }
  const all = d.s || [];
  const ok = all.filter((it) => appliesTo(it, store.vehicle));
  store.total = all.length; store.hidden = all.length - ok.length;
  store.items = ok;
  prepared = ok.map(prep);
  store.mapItems = store.showMap ? ok : [];
}
export function setVehicle(v) {
  const a = JSON.stringify(v && [v.kind, v.lengthM, v.heightM, !!v.over3500, !!v.tempo100]);
  if (a === store._veh) return;
  store._veh = a; store.vehicle = v; rebuild(); emit();
}
export async function refresh() {
  if (!store.unlocked || store.loading) return;
  store.loading = true; emit();
  try {
    const r = await fetch(JSON_URL + "?t=" + Math.floor(Date.now() / 120000), { cache: "no-cache" });
    if (!r.ok) throw new Error("http " + r.status);
    const d = await r.json();
    if (!d || d.v !== 1 || !Array.isArray(d.s)) throw new Error("format");
    store.data = d; store.error = null; lastFetch = Date.now();
    store.generated = Date.parse(d.erzeugt) || 0;
    store.stale = !store.generated || Date.now() - store.generated > STALE_MS;
  } catch (e) {
    store.error = "Sperrungen gerade nicht abrufbar.";
    if (!store.data) store.data = null;
  } finally {
    store.loading = false; rebuild(); emit();
  }
}
export function start() {
  if (!store.unlocked) return;
  if (!started) {
    started = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && store.unlocked && Date.now() - lastFetch > 120000) refresh();
    });
  }
  if (!lastFetch || Date.now() - lastFetch > 120000) refresh();
  if (!timer) timer = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 300000);
}
export function stop() { if (timer) { clearInterval(timer); timer = null; } }

// ---- Karte --------------------------------------------------------------------
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
export function popupHtml(it) {
  const parts = ["<strong>" + esc(titleOf(it)) + "</strong>", esc(labelOf(it)) + (it.o ? " · " + esc(it.o) : "")];
  const r = restrictionText(it); if (r) parts.push(esc(r));
  parts.push(esc(untilText(it)) + (it.p === "zeitweise" ? " · gerade nicht aktiv, gilt zu bestimmten Zeiten" : ""));
  if (it.t && it.t.length) parts.push("<em>Meldung (norwegisch):</em> " + esc(it.t.join(" · ")));
  return '<div style="max-width:240px;font-size:13px;line-height:1.35">' + parts.join("<br>") + "</div>";
}
const STYLE = {
  gesperrt: { base: "#d7102f", casing: true, hatch: true },
  winter: { base: "#5b3fa6", casing: true, hatch: true },
  kurz: { base: "#d7102f", casing: true, dash: "2 9" },
  gewicht: { base: "#ff7a00", casing: false },
  hindernis: { base: "#ff7a00", casing: false },
  spur: { base: "#6b6258", casing: false, thin: true },
  eng: { base: "#6b6258", casing: false, thin: true },
};
export function drawMap(L, layer) {
  if (!store.unlocked || !store.showMap) return;
  const order = { spur: 0, eng: 0, hindernis: 1, gewicht: 1, kurz: 2, winter: 3, gesperrt: 4 };
  const list = store.mapItems.slice().sort((a, b) => (order[a.c] || 0) - (order[b.c] || 0));
  for (const it of list) {
    const st = STYLE[it.c] || STYLE.spur;
    const faint = it.p !== "jetzt";
    const tip = titleOf(it) + " · " + labelOf(it);
    const html = popupHtml(it);
    const lines = it.g && it.g.length ? it.g : null;
    if (lines) {
      for (const ln of lines) {
        const ll = ln.map((p) => [p[0], p[1]]);
        if (st.casing) L.polyline(ll, { color: "#14221c", weight: 10, opacity: faint ? 0.45 : 0.85, lineCap: "butt", interactive: false }).addTo(layer);
        const main = L.polyline(ll, { color: st.base, weight: st.thin ? 4 : 6, opacity: faint ? 0.6 : 0.95, dashArray: faint ? "10 8" : st.dash || null, lineCap: "butt" });
        main.bindTooltip(tip, { sticky: true }); main.bindPopup(html); main.addTo(layer);
        if (st.hatch && !faint) L.polyline(ll, { color: "#ffffff", weight: 2, opacity: 0.95, dashArray: "5 11", lineCap: "butt", interactive: false }).addTo(layer);
      }
    } else if (it.q && it.q[0]) {
      const m = L.circleMarker(it.q[0], { radius: st.thin ? 5 : 8, color: "#14221c", weight: 2, fillColor: st.base, fillOpacity: faint ? 0.55 : 0.95 });
      m.bindTooltip(tip, { sticky: true }); m.bindPopup(html); m.addTo(layer);
    }
  }
}
