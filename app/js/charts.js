/** RomaFlow - piccoli grafici SVG/HTML senza dipendenze. */
import { WEEKDAYS, WEEKDAY_LABELS } from "./data-adapter.js";

export const crowdClass = (v) => (v < 40 ? "low" : v < 70 ? "mid" : "high");
export const crowdLabel = (v) => (v < 40 ? "Folla bassa" : v < 70 ? "Folla media" : "Folla alta");

export function heatColor(v, open = true) {
  if (!open) return "rgba(255,255,255,0.03)";
  // verde -> ambra -> rosso
  const stops = [[60, 207, 145], [243, 178, 60], [239, 90, 76]];
  const t = Math.max(0, Math.min(1, v / 100)) * 2;
  const i = Math.min(1, Math.floor(t)), f = t - i;
  const c = stops[i].map((x, k) => Math.round(x + (stops[i + 1][k] - x) * f));
  return `rgba(${c[0]},${c[1]},${c[2]},${0.25 + 0.7 * (v / 100)})`;
}

/** Sparkline del profilo orario 7-22 di un giorno. */
export function sparkline(row, w = 180, h = 26) {
  const vals = row.slice(7, 23);
  const step = w / (vals.length - 1);
  const pts = vals.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / 100) * (h - 4)).toFixed(1)}`);
  const id = "g" + Math.random().toString(36).slice(2, 8);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="#3ccf91"/><stop offset=".5" stop-color="#f3b23c"/><stop offset="1" stop-color="#ef5a4c"/></linearGradient></defs>
    <polyline points="${pts.join(" ")}" fill="none" stroke="url(#${id})" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** Curva della folla di un giorno con marcatori RomaFlow / standard (minuti). */
export function dayCurve(row, optMin, baseMin, w = 520, h = 150) {
  const x = (hour) => ((hour - 7) / 15) * w;
  const y = (v) => h - 18 - (v / 100) * (h - 52);
  const pts = row.slice(7, 23).map((v, i) => [x(7 + i + 0.5), y(v)]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  const at = (m) => { const hh = m / 60; const i = Math.max(0, Math.min(15, Math.floor(hh - 7.5))); const f = Math.max(0, Math.min(1, hh - 7.5 - i)); const v = row[7 + i] * (1 - f) + row[7 + Math.min(15, i + 1)] * f; return [x(hh), y(v)]; };
  const marker = (m, cls, label) => {
    if (m == null) return "";
    const [mx, my] = at(m);
    return `<g class="${cls}"><line x1="${mx}" x2="${mx}" y1="${my}" y2="${h - 18}" stroke="${cls === "opt" ? "#3ccf91" : "#ef5a4c"}" stroke-dasharray="3 3"/>
      <circle cx="${mx}" cy="${my}" r="7" fill="${cls === "opt" ? "#3ccf91" : "#ef5a4c"}" stroke="#0b1426" stroke-width="3"/>
      <text x="${mx}" y="${my - 14}" text-anchor="middle" fill="#f5efe4" font-size="12" font-weight="700">${label}</text></g>`;
  };
  const ticks = [8, 10, 12, 14, 16, 18, 20, 22].map((t) => `<text x="${x(t)}" y="${h - 2}" fill="#a9b3c7" font-size="11" text-anchor="middle">${t}</text>`).join("");
  return `<svg class="curve" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs><linearGradient id="cv" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#d4683a" stop-opacity=".45"/><stop offset="1" stop-color="#d4683a" stop-opacity="0"/></linearGradient></defs>
    <path d="${d} L${pts[pts.length - 1][0]},${h - 18} L${pts[0][0]},${h - 18} Z" fill="url(#cv)"/>
    <path class="line" d="${d}" fill="none" stroke="#e3b866" stroke-width="3" stroke-linecap="round"/>
    ${ticks}${marker(baseMin, "base", "Standard")}${marker(optMin, "opt", "RomaFlow")}</svg>`;
}

/** Heatmap giorni x ore (8-21) con marcatori. */
export function heatmap(place, { optDay, optHour, baseHour }) {
  const hours = Array.from({ length: 14 }, (_, i) => 8 + i);
  let html = `<div class="heat-grid" data-testid="heatmap"><div></div>${hours.map((h) => `<div class="h">${h}</div>`).join("")}`;
  WEEKDAYS.forEach((d, r) => {
    html += `<div class="d">${WEEKDAY_LABELS[d]}</div>`;
    hours.forEach((h, c) => {
      const slots = place.openingHours[d];
      const open = !!slots && slots.some(([o, cl]) => h * 60 + 30 >= o && h * 60 < cl);
      const v = place.crowd[d][h];
      let cls = "cell";
      if (d === optDay) { cls += " cur-day"; if (h === optHour) cls += " mark-opt"; else if (h === baseHour) cls += " mark-base"; }
      html += `<div class="${cls}" style="background:${heatColor(v, open)};animation-delay:${(r * 14 + c) * 6}ms" title="${WEEKDAY_LABELS[d]} ${h}:00 · ${open ? "folla " + v : "chiuso"}"></div>`;
    });
  });
  return html + "</div>";
}
