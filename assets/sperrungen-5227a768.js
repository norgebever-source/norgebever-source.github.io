// Svingen · Live-Sperrungen (Oberfläche)
import { n as __toESM } from "./rolldown-runtime-CbXtAM7H.js";
import { a as __jsx, o as __react } from "./index-ebbe152c.js";
import {
  store, subscribe, getVersion, readUnlock, tryUnlock, lock, setShowMap, setVehicle, start, refresh,
  getPrepared, checkPath, checkPosition, severity, titleOf, untilText, labelOf, restrictionText,
} from "./sperr-store-2c45c0e2.js";

const R = __toESM(__react(), 1);
const J = __jsx();
const h = J.jsx, hs = J.jsxs;
const { useState, useEffect, useMemo, useSyncExternalStore } = R;

function useStore() { return useSyncExternalStore(subscribe, getVersion, () => 0); }
const SEV = { stop: "bg-stop-soft text-stop", caution: "bg-amber-soft text-amber", info: "bg-bg text-ink border border-line" };

function Entry({ hit, extra }) {
  const it = hit.it;
  const sev = severity(it);
  const r = restrictionText(it);
  const where = hit.kind === "auf" ? "auf der Route" : hit.kind === "nahe" ? "kreuzt oder berührt die Route" : hit.kind === "hier" ? "an deinem Standort" : hit.kind === "voraus" ? "voraus, in etwa " + (hit.d >= 1000 ? (hit.d / 1000).toFixed(1).replace(".", ",") + " km" : Math.max(50, Math.round(hit.d / 50) * 50) + " m") : null;
  return hs("li", {
    className: "rounded-2xl px-3 py-2 text-sm " + SEV[sev],
    children: [
      hs("p", { className: "font-medium", children: [titleOf(it), where ? " · " + where : ""] }),
      hs("p", { children: [labelOf(it), it.o ? " · " + it.o : "", " · ", untilText(it)] }),
      r ? h("p", { children: r }) : null,
      it.p === "zeitweise" ? h("p", { children: "Gerade nicht aktiv, gilt aber zu bestimmten Zeiten (zum Beispiel nachts)." }) : null,
      it.l && !it.r ? null : null,
      it.t && it.t.length ? hs("p", { className: "mt-1 break-words", children: ["Meldung (norwegisch): ", it.t.join(" · ")] }) : null,
      extra || null,
    ],
  });
}

function Switch({ label, on, onClick }) {
  return hs("button", {
    type: "button", role: "switch", "aria-checked": on, onClick,
    className: "flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-line bg-bg px-3 text-left",
    children: [h("span", { children: label }), h("span", { className: "rounded-full px-3 py-1 text-sm " + (on ? "bg-spruce text-bg" : "bg-line text-ink"), children: on ? "An" : "Aus" })],
  });
}

function fullRoute(route) {
  try {
    const f = globalThis.__svingenRouteFull;
    if (f && f.line === route && Array.isArray(f.full) && f.full.length > 1) return f.full.map((p) => [p[1], p[0]]);
  } catch (e) {}
  return route.map((p) => [p.lat, p.lng]);
}

export function Sperrungen({ route, position, prev, vehicle, roads }) {
  useStore();
  useEffect(() => { readUnlock(); }, []);
  useEffect(() => { if (store.unlocked) start(); }, [store.unlocked]);
  useEffect(() => { if (vehicle) setVehicle(vehicle); }, [vehicle && vehicle.kind, vehicle && vehicle.lengthM, vehicle && vehicle.heightM, vehicle && vehicle.over3500, vehicle && vehicle.tempo100, store.unlocked]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const v = store.v;
  const routeHits = useMemo(() => (store.unlocked && route && route.length > 1 ? checkPath(getPrepared(), fullRoute(route)) : []), [v, route, store.unlocked]);
  const posHits = useMemo(() => (store.unlocked && position ? checkPosition(getPrepared(), position, prev) : []), [v, position, prev, store.unlocked]);
  const roadHits = useMemo(() => {
    if (!store.unlocked || !roads) return [];
    const out = [];
    const prep = getPrepared().filter((P) => P.it.c === "gesperrt" || P.it.c === "winter" || P.it.c === "kurz" || P.it.c === "gewicht");
    for (const e of roads) {
      if (!e.line || e.line.length < 2) continue;
      const hits = checkPath(prep, e.line.map((p) => [p.lat, p.lng]), { near: 60, cross: 0.1, point: 120, frac: 0.2 }).filter((x) => x.kind === "auf" && x.it.p !== "geplant");
      if (hits.length) out.push({ road: e, hits });
    }
    return out;
  }, [v, roads, store.unlocked]);
  if (!store.unlocked) return null;

  const stamp = store.generated ? new Date(store.generated).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;
  const live = store.items.filter((it) => it.p !== "geplant");
  const nStop = live.filter((it) => severity(it) === "stop").length;
  const routeActive = routeHits.filter((x) => x.it.p !== "geplant");
  const needle = q.trim().toLowerCase();
  const list = live.filter((it) => !needle || (labelOf(it) + " " + (it.o || "") + " " + (it.l || "")).toLowerCase().includes(needle)).sort((a, b) => ["stop", "caution", "info"].indexOf(severity(a)) - ["stop", "caution", "info"].indexOf(severity(b)));
  const ok = store.data && !store.stale;
  const hasRoute = route && route.length > 1;

  return hs("section", {
    className: "flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card",
    children: [
      h("h2", { className: "font-display text-2xl", children: "Live-Sperrungen" }),
      h("p", { className: "text-sm text-muted", children: "Aktuelle Meldungen von Statens vegvesen: gesperrte Straßen, Wintersperren, Gewichtsgrenzen, Fahrstreifen und Hindernisse. Svingen prüft damit deine Route und deinen Standort." }),
      store.error && !ok ? h("p", { className: "rounded-2xl px-3 py-2 text-sm " + SEV.caution, children: store.error + " Es werden keine Sperrungen angezeigt." }) : null,
      store.data && store.stale ? hs("p", { className: "rounded-2xl px-3 py-2 text-sm " + SEV.caution, children: ["Die Sperrungsdaten sind veraltet (Stand ", stamp, "). Sie werden nicht angezeigt."] }) : null,
      !store.data && !store.error ? h("p", { className: "text-sm text-muted", children: "Sperrungen werden geladen …" }) : null,
      ok ? hs("p", { className: "text-sm", children: [hs("span", { className: "font-medium", children: [live.length, " Meldungen"] }), hs("span", { className: "text-muted", children: [" für dein Fahrzeug · "] }), hs("span", { className: "text-stop", children: [nStop, " Straßen gesperrt"] }), hs("span", { className: "text-muted", children: [" · Stand ", stamp] }), store.hidden ? hs("span", { className: "text-muted", children: [" · ", store.hidden, " Meldungen für andere Fahrzeuge ausgeblendet"] }) : null] }) : null,
      ok && hasRoute ? (routeActive.length ? hs("div", { className: "flex flex-col gap-2", children: [h("p", { className: "font-medium text-stop", children: routeActive.length === 1 ? "1 Meldung an deiner Route" : routeActive.length + " Meldungen an deiner Route" }), h("ul", { className: "flex flex-col gap-2", children: routeHits.map((x) => h(Entry, { hit: x }, x.it.i)) }), h("p", { className: "text-sm text-muted", children: "Die Fahrtrichtung der Sperrung ist hier nicht berücksichtigt; Ortsangabe und Beschilderung prüfen." })] }) : h("p", { className: "rounded-2xl px-3 py-2 text-sm bg-spruce-soft text-spruce", children: "Auf dieser Route ist keine aktuelle Sperrung gemeldet." })) : null,
      ok && !hasRoute ? h("p", { className: "text-sm text-muted", children: "Route bewerten: Svingen prüft sie dann gegen alle gemeldeten Sperrungen." }) : null,
      ok && posHits.length ? hs("div", { className: "flex flex-col gap-2", children: [h("p", { className: "font-medium text-stop", children: "Bei deinem Standort" }), h("ul", { className: "flex flex-col gap-2", children: posHits.map((x) => h(Entry, { hit: x }, x.it.i)) })] }) : null,
      ok && roadHits.length ? hs("div", { className: "flex flex-col gap-2", children: [h("p", { className: "font-medium", children: "Strecken aus der Liste mit Meldung" }), h("ul", { className: "flex flex-col gap-2", children: roadHits.map((rh) => hs("li", { className: "rounded-2xl px-3 py-2 text-sm " + SEV[rh.hits.some((x) => severity(x.it) === "stop") ? "stop" : "caution"], children: [hs("p", { className: "font-medium", children: [rh.road.ref, " ", rh.road.name] }), ...rh.hits.slice(0, 3).map((x) => hs("p", { key: x.it.i, children: [titleOf(x.it), " · ", labelOf(x.it), " · ", untilText(x.it)] }))] }, rh.road.id)) })] }) : null,
      h(Switch, { label: "Sperrungen auf der Karte", on: store.showMap, onClick: () => setShowMap(!store.showMap) }),
      store.showMap && ok ? hs("p", { className: "text-sm text-muted", children: ["Karte: rot-weiß gestrichelt gesperrt, violett Wintersperre, orange Gewichtsgrenze oder Hindernis, grau Fahrstreifen oder Verengung. Blasse gestrichelte Linien gelten nur zu bestimmten Zeiten. Antippen zeigt Details."] }) : null,
      ok ? hs("div", { className: "flex flex-col gap-2", children: [
        h("button", { type: "button", className: "min-h-11 rounded-2xl border border-line bg-bg px-3 text-left", onClick: () => setOpen(!open), "aria-expanded": open, children: open ? "Alle Meldungen ausblenden" : "Alle Meldungen ansehen (" + live.length + ")" }),
        open ? hs("div", { className: "flex flex-col gap-2", children: [
          h("input", { className: "min-h-11 rounded-2xl border border-line bg-bg px-3", placeholder: "Suchen, zum Beispiel E39 oder Trollstigen", value: q, onChange: (e) => setQ(e.target.value), "aria-label": "Sperrungen suchen" }),
          h("ul", { className: "flex flex-col gap-2", children: list.slice(0, 40).map((it) => h(Entry, { hit: { it } }, it.i)) }),
          list.length > 40 ? hs("p", { className: "text-sm text-muted", children: [list.length - 40, " weitere Meldungen. Suche eingrenzen."] }) : null,
          list.length === 0 ? h("p", { className: "text-sm text-muted", children: "Keine Meldung gefunden." }) : null,
        ] }) : null,
      ] }) : null,
      h("button", { type: "button", className: "min-h-11 rounded-2xl border border-line bg-bg px-3", disabled: store.loading, onClick: () => refresh(), children: store.loading ? "Wird aktualisiert …" : "Jetzt aktualisieren" }),
      hs("p", { className: "text-sm text-muted", children: ["Datenquelle: Statens vegvesen (DATEX II, NLOD). Aktualisierung etwa alle 15 Minuten. Alle Angaben ohne Gewähr; Beschilderung vor Ort geht immer vor."] }),
    ],
  });
}

export function Freischaltung() {
  useStore();
  useEffect(() => { readUnlock(); }, []);
  const [code, setCode] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  async function go(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const ok = await tryUnlock(code);
    setBusy(false);
    if (!ok) setErr("Der Code stimmt nicht."); else setCode("");
  }
  return hs("section", {
    className: "flex flex-col gap-2",
    children: [
      h("h2", { className: "font-display text-2xl", children: "Einstellungen" }),
      store.unlocked
        ? hs("div", { className: "flex flex-col gap-2", children: [
            h("p", { className: "text-sm", children: "Live-Sperrungen sind freigeschaltet." }),
            h("button", { type: "button", className: "min-h-11 rounded-2xl border border-line bg-bg px-3", onClick: () => lock(), children: "Live-Sperrungen ausschalten" }),
          ] })
        : hs("form", { className: "flex flex-col gap-2", onSubmit: go, children: [
            h("p", { className: "text-sm text-muted", children: "Live-Sperrungen (Beta) sind per Freischaltcode verfügbar." }),
            h("input", { className: "min-h-11 rounded-2xl border border-line bg-surface px-3", placeholder: "Freischaltcode", value: code, autoComplete: "off", autoCapitalize: "characters", spellCheck: false, onChange: (e) => setCode(e.target.value), "aria-label": "Freischaltcode" }),
            err ? h("p", { className: "text-sm text-stop", children: err }) : null,
            h("button", { type: "submit", disabled: busy || code.trim().length < 4, className: "min-h-11 rounded-2xl bg-spruce px-3 text-bg disabled:opacity-50", children: "Freischalten" }),
          ] }),
    ],
  });
}
