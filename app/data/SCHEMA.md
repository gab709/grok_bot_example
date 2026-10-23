# Schema dei dati di RomaFlow

Tutti i dati dell'app stanno in questa cartella. Il codice li legge **solo** tramite `app/js/data-adapter.js`, che li converte in un modello interno unico. Per collegare dati reali (API degli orari di punta, CSV, open data) basta sostituire i file JSON mantenendo uno dei formati qui sotto, oppure modificare la funzione `fetchRaw()` dell'adapter.

> **Dati dimostrativi.** I livelli di affollamento orari sono **stime dimostrative**, non misure reali. L'interfaccia lo segnala con il badge "Dati dimostrativi". Orari di apertura, prenotazioni e visitatori annui invece provengono da fonti pubbliche (vedi sotto).

## File

| File | Contenuto |
|---|---|
| `config.json` | Zone di partenza, interessi, ritmi di visita, parametri del modello e `dataSources` (quali file leggere) |
| `luoghi_roma.json` | **Dataset principale dei luoghi** (15 luoghi). Origine: branch `dati-luoghi` di Persona 1 (commit `ddcde2c`, file `data/luoghi_roma.json`), copiato qui senza modifiche. Metodo e fonti in `data/README.md` |
| `places-extra.json` | Arricchimento per la sola interfaccia, per id: emoji, descrizione breve, interessi, `indoor`, `peakDelayMinutes` (stima) |
| `events.json` | Eventi che alzano la folla prevista (udienza del mercoledì, prima domenica gratuita, mercato) - dimostrativi |

## Formato A: `luoghi_roma.json` (supportato nativamente)

`{ meta, places[] }`, ogni luogo:

| Campo | Tipo | Note | Reale / stimato |
|---|---|---|---|
| `id`, `name`, `category` | string | categoria: `museo`, `monumento all'aperto`, `piazza`, `chiesa`, `quartiere` | - |
| `lat`, `lon` | number | WGS84 | pubblico |
| `opening_hours` | `{lun..dom: ["HH:MM","HH:MM"] \| null}` | `null` = chiuso | **reale** (siti ufficiali) |
| `opening_hours_note` | string | ultimo ingresso, eccezioni | reale |
| `booking`, `booking_note` | string | `obbligatoria` → `bookingRequired: true` | reale dove c'è fonte |
| `visit_duration_min` | number | durata tipica | stima |
| `annual_visitors`, `annual_visitors_year`, `annual_visitors_note` | number/null | MiC 2024, Musei Vaticani 2024 | **reale** |
| `popularity` | 0-1 | | derivato |
| `crowd_hours` | number[16] | ore di inizio fascia 7..22 | - |
| `crowd_weekday`, `crowd_weekend` | number[16] 0-100 | 0 = chiuso | **stima dimostrativa** |
| `sources` | object | fonte per ogni valore | - |

Conversione nell'adapter (`fromLuoghiRoma`): `crowd_weekday` vale per lun-ven, `crowd_weekend` per sab-dom, scelto **in base alla data** del viaggio; le ore fuori da 7..22 valgono 0; i giorni `lun..dom` diventano `mon..sun`.

## Formato B: modello interno (accettato anche in ingresso)

```jsonc
{
  "id": "colosseo",
  "name": "Colosseo",
  "category": "monumento",
  "emoji": "🏟️",
  "description": "Breve descrizione",
  "interests": ["storia-antica"],          // id da config.json -> interests
  "indoor": false,
  "bookingRequired": true,
  "visitMinutes": 90,
  "peakDelayMinutes": 70,                 // minuti persi in coda/folla con folla 100
  "coordinates": { "lat": 41.8902, "lng": 12.4922 },
  "openingHours": { "mon": [["08:30","16:30"]], "tue": [["08:30","16:30"]], "sun": null },
  "crowd": { "mon": [/* 24 valori 0-100, indice = ora */], "tue": [], "...": [] }
}
```

## Modello di costo (in `app/js/optimizer.js`)

- Coda stimata in un luogo = `peakDelayMinutes × (folla/100)²`.
- Spostamenti: distanza in linea d'aria × 1,3; a piedi alla velocità del ritmo scelto; oltre 30 minuti si usano i mezzi (12 min fissi + 18 km/h).
- Costo della giornata = cammino + coda + 0,15 × folla + 0,3 × attese per apertura + penalità (orari, fine giornata, pioggia sui luoghi all'aperto).
- Itinerario standard (baseline): stessi luoghi, partenza 9:30, ordine "vicino più prossimo" senza guardare la folla.

## Come collegare dati reali

1. **Stesso formato, valori reali:** sostituire `crowd_weekday`/`crowd_weekend` in `luoghi_roma.json` (o rigenerarlo con `data/genera_dataset.py`).
2. **Sorgente diversa (API, CSV):** riscrivere `fetchRaw()` in `data-adapter.js` perché restituisca `{ places: {meta, places[]}, extra, config, events }`; il resto dell'app non cambia.
3. **Più granularità (per data, stagione):** estendere `crowdAt()` nell'adapter, unico punto in cui si legge la folla.

## Mappa: provider delle tile (`config.json` → `map`)

La mappa usa Leaflet; il provider delle tile è configurabile senza toccare il codice:

| Campo | Significato |
|---|---|
| `provider` | id del provider da usare (chiave in `providers`). Predefinito: `esri-dark` (Esri World Dark Gray, senza chiave, senza filigrana) |
| `fallback` | elenco ordinato di provider di ripiego. Predefinito: `osm-dark` (OpenStreetMap standard scurito via CSS), poi `carto-dark` |
| `apiKey` | chiave per i provider a pagamento/registrati; sostituisce `{apiKey}` nell'URL |
| `providers.<id>` | `tileUrl`, `attribution`, `maxZoom`, opzionali `subdomains`, `labelsUrl` (secondo livello con le etichette), `darkFilter` (scurisce tile chiare), `requiresKey` |

**Ripiego automatico:** se il provider attivo dà 3 errori di caricamento (`tileerror`) prima di mostrare una tile, o nessuna tile arriva entro 8 secondi, l'app passa al provider successivo di `fallback`. I provider con `requiresKey: true` vengono saltati se `apiKey` è vuota.

> Nota (ottobre 2026): CARTO `basemaps.cartocdn.com` risponde ancora con HTTP 200 ma disegna una filigrana "API KEY REQUIRED"; poiché non è un errore il ripiego non scatta, per questo CARTO è solo l'ultima scelta. Lo stesso vale per qualsiasi provider che restituisca immagini di errore invece di errori HTTP.

**Passare a un provider con chiave** (MapTiler, Stadia Maps, Mapbox; già presenti come `maptiler-dark`, `stadia-dark`, `mapbox-dark`):

```json
"map": { "provider": "maptiler-dark", "fallback": ["esri-dark", "osm-dark"], "apiKey": "LA_TUA_CHIAVE", ... }
```

La chiave finisce nel codice del browser: usare una chiave pubblica limitata al dominio (es. restrizione per `gab709.github.io` nella console del provider). Per Stadia Maps in alternativa si può registrare il dominio senza chiave. Per OpenStreetMap standard rispettare la [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) (va bene per una demo, non per traffico elevato).
