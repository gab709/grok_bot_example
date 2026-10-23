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
  const res = await fetch(new URL(name, BASE));
  if (!res.ok) throw new Error(`Impossibile caricare ${name} (${res.status})`);
  return res.json();
}

/**
 * Legge le sorgenti grezze. I nomi dei file sono in config.json -> dataSources.
 * Sostituire questa funzione per usare altre sorgenti (API, CSV...).
 */
async function fetchRaw() {
  const config = await fetchJson("config.json");
  const src = { places: "luoghi_roma.json", placesExtra: "places-extra.json", events: "events.json", ...(config.dataSources || {}) };
  const [places, extra, events] = await Promise.all([
    fetchJson(src.places),
    fetchJson(src.placesExtra).catch(() => ({ places: {} })),
    fetchJson(src.events).catch(() => ({ events: [] })),
  ]);
  return { places, extra: extra.places || {}, config, events };
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
  const wk = toRow(p.crowd_weekday), we = toRow(p.crowd_weekend || p.crowd_weekday);
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
  const events = (raw.events.events || []).map((e) => ({ ...e, fromMin: toMinutes(e.from), toMin: toMinutes(e.to) }));
  return {
    meta: { ...raw.places.meta, crowdStatus: "dimostrativi" },
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
export function openWindow(place, date, start, end) {
  const slots = place.openingHours[weekdayKey(date)];
  if (!slots) return null;
  for (const [o, c] of slots) if (start >= o && end <= c) return [o, c];
  return null;
}
export const isClosedOn = (place, date) => !place.openingHours[weekdayKey(date)];
export const firstOpening = (place, date) => {
  const s = place.openingHours[weekdayKey(date)];
  return s ? s[0][0] : null;
};
