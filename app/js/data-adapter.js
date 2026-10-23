/**
 * RomaFlow - Data adapter
 * ------------------------------------------------------------------
 * UNICO punto di accesso ai dati. Il resto dell'app usa solo le funzioni
 * esportate qui e non conosce il formato delle sorgenti.
 *
 * Per collegare dati reali (API orari di punta, CSV, open data) basta:
 *   1. sostituire i file JSON in app/data/ mantenendo lo schema (vedi SCHEMA.md), oppure
 *   2. modificare `fetchRaw()` qui sotto perché legga da un'altra sorgente
 *      e restituisca oggetti nello stesso formato.
 *
 * Modello normalizzato restituito da loadData():
 *   {
 *     meta:   { dataStatus, disclaimer, ... },
 *     places: [{ id, name, category, emoji, description, interests[], indoor,
 *                bookingRequired, visitMinutes, peakDelayMinutes,
 *                coordinates:{lat,lng}, openingHours:{mon:[[o,c]]|null,...},
 *                crowd:{mon:number[24],...} }],
 *     config: { startAreas[], interests[], paces[], model{} },
 *     events: [{ id, name, placeIds[], weekdays?[], monthDay?, from, to, crowdDelta }]
 *   }
 */

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const WEEKDAY_LABELS = { mon: "Lun", tue: "Mar", wed: "Mer", thu: "Gio", fri: "Ven", sat: "Sab", sun: "Dom" };

const BASE = new URL("../data/", import.meta.url);

async function fetchJson(name) {
  const res = await fetch(new URL(name, BASE), { cache: "no-cache" });
  if (!res.ok) throw new Error(`Impossibile caricare ${name} (${res.status})`);
  return res.json();
}

/** Prova i percorsi in ordine (string o array) e restituisce { json, from }. */
async function fetchFirst(names) {
  const list = Array.isArray(names) ? names : [names];
  let last;
  for (const n of list) {
    try { return { json: await fetchJson(n), from: n }; } catch (e) { last = e; console.info(`[dati] ${n} non disponibile, provo il successivo`); }
  }
  throw last || new Error("Nessuna sorgente dati");
}

// Orari del giorno da calendario.json (stagione applicata per data): "YYYY-MM-DD" -> { placeId: [[o,c]] | null }
let DAY_HOURS = new Map();
export const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Legge le sorgenti grezze. I nomi dei file sono in config.json -> dataSources.
 * Sostituire questa funzione per usare altre sorgenti (API, CSV...).
 */
async function fetchRaw() {
  const config = await fetchJson("config.json");
  const src = { places: "luoghi_roma.json", placesExtra: "places-extra.json", events: "events.json", ...(config.dataSources || {}) };
  const [placesRes, extra, events, calendar] = await Promise.all([
    fetchFirst(src.places),
    fetchJson(src.placesExtra).catch(() => ({ places: {} })),
    fetchJson(src.events).catch(() => ({ events: [] })),
    src.calendar ? fetchFirst(src.calendar).then((r) => r.json).catch(() => null) : null,
  ]);
  return { places: placesRes.json, placesFrom: placesRes.from, extra: extra.places || {}, config, events, calendar };
}

export const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + (m || 0);
};
export const fmtTime = (min) => {
  const m = Math.round(min);
  const h = Math.floor(m / 60) % 24;
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

const IT_DAYS = { lun: "mon", mar: "tue", mer: "wed", gio: "thu", ven: "fri", sab: "sat", dom: "sun" };

/** Default per categoria quando places-extra.json non copre un luogo. */
const CATEGORY_DEFAULTS = {
  museo: { emoji: "🖼️", indoor: true, interests: ["arte"] },
  chiesa: { emoji: "⛪", indoor: true, interests: ["chiese"] },
  piazza: { emoji: "⛲", indoor: false, interests: ["piazze"] },
  quartiere: { emoji: "🏘️", indoor: false, interests: ["autentica"] },
  "monumento all'aperto": { emoji: "🏛️", indoor: false, interests: ["storia-antica"] },
};

/**
 * Converte un luogo nel formato del dataset "luoghi_roma.json" (Persona 1, branch dati-luoghi)
 * nel modello interno. Fasce crowd_hours (7..22) -> array di 24 valori;
 * crowd_weekday per lun-ven, crowd_weekend per sab-dom.
 */
function fromLuoghiRoma(p, extra) {
  const hours = p.crowd_hours || Array.from({ length: 16 }, (_, i) => 7 + i);
  const toRow = (vals) => {
    const row = new Array(24).fill(0);
    hours.forEach((h, i) => (row[h] = vals[i] ?? 0));
    return row;
  };
  // Correzioni trasparenti (data/README.md): crowd_weekday/weekend = curva base x wikipedia_trend
  // (eventuale fusione Flickr già inclusa). Se mancano le curve corrette, le ricalcola dalla base.
  const corr = p.crowd_corrections || {};
  const trend = Number(corr.wikipedia_trend) || 1;
  const corrected = (v, base) => v || (base ? base.map((x) => Math.min(100, Math.round(x * trend))) : null);
  const cwk = corrected(p.crowd_weekday, p.crowd_weekday_base);
  const wk = toRow(cwk), we = toRow(corrected(p.crowd_weekend, p.crowd_weekend_base) || cwk);
  const openingHours = {};
  for (const [it, en] of Object.entries(IT_DAYS)) {
    const v = p.opening_hours?.[it];
    openingHours[en] = v ? [v] : null;
  }
  const def = CATEGORY_DEFAULTS[p.category] || {};
  const booking = String(p.booking || "");
  const pop = p.popularity ?? 0.5;
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    coordinates: { lat: p.lat, lng: p.lon },
    openingHours,
    openingHoursNote: p.opening_hours_note || "",
    openingHoursStatus: p.sources?.opening_hours_status || "",
    bookingRequired: booking.startsWith("obbligatoria"),
    bookingLevel: booking,
    bookingNote: p.booking_note || "",
    visitMinutes: p.visit_duration_min || 60,
    annualVisitors: p.annual_visitors ?? null,
    annualVisitorsYear: p.annual_visitors_year ?? null,
    annualVisitorsNote: p.annual_visitors_note || "",
    popularity: pop,
    crowd: { mon: wk, tue: wk, wed: wk, thu: wk, fri: wk, sat: we, sun: we },
    crowdSource: p.crowd_source || "stima dimostrativa",
    crowdCorrections: { wikipediaTrend: trend, flickrBlend: !!corr.flickr_blend, flickrPhotos: corr.flickr_photos_07_22 ?? null },
    sources: p.sources || {},
    emoji: def.emoji,
    indoor: def.indoor,
    interests: def.interests,
    peakDelayMinutes: Math.round(10 + 50 * pop),
    ...extra,
  };
}

function validatePlace(p) {
  const req = ["id", "name", "coordinates", "openingHours", "crowd", "visitMinutes"];
  for (const k of req) if (p[k] == null) throw new Error(`Luogo ${p.id || "?"}: manca il campo ${k}`);
  for (const d of WEEKDAYS) {
    const row = p.crowd[d];
    if (!Array.isArray(row) || row.length !== 24) throw new Error(`Luogo ${p.id}: crowd.${d} deve avere 24 valori`);
  }
}

/** Accetta sia il formato luoghi_roma.json sia il modello interno (vedi SCHEMA.md). */
function normalizePlace(p, extras) {
  const extra = extras[p.id] || {};
  const q = "crowd_weekday" in p || "lon" in p ? fromLuoghiRoma(p, extra) : { ...p, ...extra };
  validatePlace(q);
  const openingHours = {};
  for (const d of WEEKDAYS) {
    const v = q.openingHours[d];
    openingHours[d] = v ? v.map(([o, c]) => [toMinutes(o), toMinutes(c)]) : null;
  }
  return {
    category: "luogo", emoji: "📍", description: "", interests: [], indoor: false,
    bookingRequired: false, peakDelayMinutes: 20, annualVisitors: null, crowdSource: "stima dimostrativa",
    ...q,
    openingHours,
  };
}

/** Carica e normalizza tutti i dati. */
export async function loadData() {
  const raw = await fetchRaw();
  const places = raw.places.places.map((p) => normalizePlace(p, raw.extra));
  DAY_HOURS = new Map();
  for (const g of raw.calendar?.giorni || []) {
    const m = {};
    for (const [id, l] of Object.entries(g.luoghi || {})) m[id] = l.open ? [[toMinutes(l.open[0]), toMinutes(l.open[1])]] : null;
    DAY_HOURS.set(g.date, m);
  }
  const events = (raw.events.events || []).map((e) => ({ ...e, fromMin: toMinutes(e.from), toMin: toMinutes(e.to) }));
  return {
    meta: {
      ...raw.places.meta,
      crowdStatus: "dimostrativi",
      updatedAt: raw.places.meta?.generated_at || null,
      calendarUpdatedAt: raw.calendar?.meta?.generated_at || null,
      liveData: String(raw.placesFrom).startsWith("../"),
      seasonalDays: DAY_HOURS.size,
    },
    places,
    placeById: Object.fromEntries(places.map((p) => [p.id, p])),
    config: raw.config,
    events,
  };
}

/** Chiave giorno ("mon".."sun") da una Date. */
export const weekdayKey = (date) => WEEKDAYS[(date.getDay() + 6) % 7];

function eventApplies(e, place, date, minute) {
  if (!e.placeIds.includes(place.id)) return false;
  if (minute < e.fromMin || minute >= e.toMin) return false;
  if (e.weekdays && !e.weekdays.includes(weekdayKey(date))) return false;
  if (e.monthDay === "first-sunday" && !(date.getDay() === 0 && date.getDate() <= 7)) return false;
  return true;
}

/**
 * Livello di folla (0-100) previsto per un luogo, in una data, a un minuto del giorno.
 * Interpola linearmente tra le fasce orarie e applica gli eventi.
 */
export function crowdAt(data, place, date, minute) {
  const row = place.crowd[weekdayKey(date)];
  const h = Math.max(0, Math.min(23.999, minute / 60 - 0.5));
  const i = Math.floor(h), f = h - i;
  let v = row[i] * (1 - f) + row[Math.min(23, i + 1)] * f;
  for (const e of data.events) if (eventApplies(e, place, date, minute)) v += e.crowdDelta;
  return Math.max(0, Math.min(100, v));
}

/** Eventi attivi per un luogo in una data (per mostrarli in UI). */
export function eventsFor(data, place, date) {
  return data.events.filter((e) => eventApplies(e, place, date, e.fromMin));
}

/** Intervallo di apertura che contiene [start, end], oppure null. */
/** Fasce di apertura del luogo in quella data: orari stagionali da calendario.json se la data è coperta, altrimenti orari del dataset. */
export function hoursFor(place, date) {
  const day = DAY_HOURS.get(dateKey(date));
  if (day && place.id in day) return day[place.id];
  return place.openingHours[weekdayKey(date)];
}

export function openWindow(place, date, start, end) {
  const slots = hoursFor(place, date);
  if (!slots) return null;
  for (const [o, c] of slots) if (start >= o && end <= c) return [o, c];
  return null;
}
export const isClosedOn = (place, date) => !hoursFor(place, date);
export const firstOpening = (place, date) => {
  const s = hoursFor(place, date);
  return s ? s[0][0] : null;
};
