// meteo.js - Modulo meteo in tempo reale per RomaFlow (ES module, solo fetch del browser, nessuna chiave).
// Fonte: Open-Meteo (https://open-meteo.com), gratuito per uso non commerciale, licenza dati CC BY 4.0.
//
// Uso nel browser:
//   import { getMeteo, valutaLuoghiAperto } from './data/meteo.js';
//   const meteo = await getMeteo();                       // Roma, oggi + 6 giorni
//   const luoghi = (await (await fetch('./data/luoghi_roma.json')).json()).places;
//   const avvisi = valutaLuoghiAperto(luoghi, meteo, { soglia: 60 });

export const ROMA = { lat: 41.8933, lon: 12.4829 };
// Fasce orarie del dataset (07:00-22:00): gli avvisi pioggia considerano solo queste ore, salvo diversa opzione.
export const ORE_DATASET = Array.from({ length: 16 }, (_, i) => i + 7);
export const CATEGORIE_APERTO = ["monumento all'aperto", 'piazza', 'quartiere'];
const API = 'https://api.open-meteo.com/v1/forecast';
const VARIABILI = 'temperature_2m,precipitation_probability,precipitation,weather_code';

// Descrizione in italiano dei codici meteo WMO usati da Open-Meteo.
export const CODICI_METEO = {
  0: 'sereno', 1: 'prevalentemente sereno', 2: 'parzialmente nuvoloso', 3: 'coperto',
  45: 'nebbia', 48: 'nebbia con brina', 51: 'pioviggine leggera', 53: 'pioviggine', 55: 'pioviggine intensa',
  61: 'pioggia debole', 63: 'pioggia', 65: 'pioggia forte', 66: 'pioggia gelata', 67: 'pioggia gelata forte',
  71: 'neve debole', 73: 'neve', 75: 'neve forte', 77: 'granelli di neve',
  80: 'rovesci deboli', 81: 'rovesci', 82: 'rovesci violenti', 85: 'rovesci di neve', 86: 'rovesci di neve forti',
  95: 'temporale', 96: 'temporale con grandine', 99: 'temporale con grandine forte',
};

/** Costruisce l'URL Open-Meteo (esportato per test e debug). */
export function urlMeteo({ lat = ROMA.lat, lon = ROMA.lon, giorni = 7 } = {}) {
  const q = new URLSearchParams({ latitude: lat, longitude: lon, hourly: VARIABILI, timezone: 'Europe/Rome', forecast_days: String(giorni) });
  return `${API}?${q}`;
}

/** Trasforma la risposta grezza di Open-Meteo in un array di ore leggibile. */
export function normalizza(json) {
  const h = json.hourly;
  return h.time.map((t, i) => ({
    time: t,                       // ora locale di Roma, es. "2026-10-23T14:00"
    data: t.slice(0, 10),
    ora: Number(t.slice(11, 13)),
    temperatura: h.temperature_2m[i],
    probPioggia: h.precipitation_probability[i] ?? 0,   // %
    pioggiaMm: h.precipitation[i] ?? 0,
    codice: h.weather_code[i],
    descrizione: CODICI_METEO[h.weather_code[i]] ?? 'n/d',
  }));
}

/** Previsioni orarie (oggi + giorni-1). Restituisce { lat, lon, aggiornato, ore: [...] }. */
export async function getMeteo({ lat = ROMA.lat, lon = ROMA.lon, giorni = 7, fetchFn = globalThis.fetch } = {}) {
  const res = await fetchFn(urlMeteo({ lat, lon, giorni }));
  if (!res.ok) throw new Error(`Open-Meteo ha risposto ${res.status}`);
  const json = await res.json();
  return { lat: json.latitude, lon: json.longitude, aggiornato: new Date().toISOString(), ore: normalizza(json) };
}

/** Meteo per ciascun luogo (lat/lon propri). Una chiamata per luogo: usarlo solo se serve precisione.
 *  Per Roma centro le differenze tra luoghi sono minime, quindi di solito basta getMeteo(). */
export async function getMeteoPerLuoghi(luoghi, opzioni = {}) {
  const coppie = await Promise.all(luoghi.map(async (l) => [l.id, await getMeteo({ ...opzioni, lat: l.lat, lon: l.lon })]));
  return Object.fromEntries(coppie);
}

export const eAllAperto = (luogo) => CATEGORIE_APERTO.includes(luogo.category);

/** Ore (0-23) di una data in cui la probabilità di pioggia è >= soglia. */
export function orePiovose(meteo, data, soglia = 60, ore = ORE_DATASET) {
  return meteo.ore.filter((o) => o.data === data && ore.includes(o.ora) && o.probPioggia >= soglia).map((o) => o.ora);
}

/**
 * Segnala i luoghi all'aperto (monumento all'aperto / piazza / quartiere) come sconsigliati nelle ore con
 * probabilità di pioggia >= soglia. `meteo` può essere un singolo oggetto (Roma) o una mappa id -> meteo
 * (da getMeteoPerLuoghi). Restituisce { [id]: { allAperto, oreSconsigliate: { 'YYYY-MM-DD': [ore] } } }.
 */
export function valutaLuoghiAperto(luoghi, meteo, { soglia = 60, date = null, ore = ORE_DATASET } = {}) {
  const out = {};
  for (const l of luoghi) {
    const m = meteo.ore ? meteo : meteo[l.id];
    const giorni = date ?? [...new Set(m.ore.map((o) => o.data))];
    const oreSconsigliate = {};
    if (eAllAperto(l)) for (const d of giorni) { const piovose = orePiovose(m, d, soglia, ore); if (piovose.length) oreSconsigliate[d] = piovose; }
    out[l.id] = { allAperto: eAllAperto(l), oreSconsigliate };
  }
  return out;
}

/** true se il luogo è adatto in quella data/ora (i luoghi al chiuso sono sempre adatti). */
export function adattoAllOra(luogo, meteo, data, ora, soglia = 60) {
  if (!eAllAperto(luogo)) return true;
  const o = meteo.ore.find((x) => x.data === data && x.ora === ora);
  return !o || o.probPioggia < soglia;
}
