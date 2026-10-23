// Test di meteo.js con Node 18+ (fetch integrato): node data/test_meteo.mjs
import fs from 'node:fs';
import * as M from './meteo.js';
const luoghi = JSON.parse(fs.readFileSync(new URL('./luoghi_roma.json', import.meta.url))).places;
// 1) chiamata reale (Node 20 ha fetch)
const meteo = await M.getMeteo();
console.log('ore ricevute:', meteo.ore.length, 'lat/lon', meteo.lat, meteo.lon);
console.log(meteo.ore.slice(12, 16));
const maxProb = Math.max(...meteo.ore.map(o => o.probPioggia));
console.log('prob. pioggia massima nei 7 giorni:', maxProb, '%');
const reale = M.valutaLuoghiAperto(luoghi, meteo, { soglia: 60 });
console.log('avvisi reali (soglia 60):', Object.entries(reale).filter(([, v]) => Object.keys(v.oreSconsigliate).length).map(([k, v]) => [k, v.oreSconsigliate]).slice(0, 3));
// 2) logica con dati finti: pioggia 80% alle 14-16
const finto = { ore: Array.from({ length: 24 }, (_, h) => ({ data: '2026-10-24', ora: h, probPioggia: h >= 14 && h <= 16 ? 80 : 10 })) };
const r = M.valutaLuoghiAperto(luoghi, finto, { soglia: 60 });
console.assert(JSON.stringify(r.colosseo.oreSconsigliate) === '{"2026-10-24":[14,15,16]}', 'colosseo');
console.assert(Object.keys(r.musei_vaticani.oreSconsigliate).length === 0, 'vaticani al chiuso');
console.assert(Object.keys(r.trastevere.oreSconsigliate).length === 1, 'trastevere');
console.assert(M.adattoAllOra(luoghi.find(l => l.id === 'piazza_navona'), finto, '2026-10-24', 15) === false);
console.assert(M.adattoAllOra(luoghi.find(l => l.id === 'piazza_navona'), finto, '2026-10-24', 10) === true);
console.assert(Object.keys(M.valutaLuoghiAperto(luoghi, finto, { soglia: 90 }).colosseo.oreSconsigliate).length === 0, 'soglia');
console.log('test logica OK:', Object.entries(r).filter(([, v]) => v.allAperto).map(([k]) => k).join(', '));
