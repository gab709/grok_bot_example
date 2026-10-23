# RomaFlow · Roma al momento giusto

Prototipo dimostrativo di **RomaFlow**, l'app che pianifica la visita di Roma usando i flussi storici di persone per luogo e fascia oraria, e costruisce un itinerario che evita i picchi di folla per far risparmiare tempo al turista.

Il pitch completo è in [`docs/01-pitch.md`](docs/01-pitch.md); la guida per usare l'app in una demo è in [`docs/03-guida-demo.md`](docs/03-guida-demo.md).

## Cosa fa il prototipo

1. **Home** con il messaggio del prodotto.
2. **Preferenze:** data e numero di giorni, zona di partenza, luoghi imperdibili, ritmo (rilassato, equilibrato, intenso), interessi.
3. **Itinerario giorno per giorno:** orari di arrivo, livello di folla previsto (verde, giallo, rosso), coda stimata, prenotazioni, tempi a piedi o con i mezzi, mappa con il percorso numerato.
4. **Impatto:** minuti di coda evitati rispetto a un itinerario standard, confronto tappa per tappa e mappa di calore della folla per giorno e ora.
5. **Imprevisti in tempo reale:** "Sta piovendo", "affollato ora", "in ritardo": l'app ricalcola il resto della giornata.

## Avviarlo in locale

Non serve installare nulla né compilare: è un sito statico (HTML, CSS e JavaScript).

```bash
cd app
python3 -m http.server 8000
# poi apri http://localhost:8000
```

Versione dimostrativa precompilata: `http://localhost:8000/?demo=1` (altri parametri nella guida demo).

## Struttura

```
app/
  index.html            pagina unica dell'app
  css/style.css         stile (tema scuro, palette romana)
  js/data-adapter.js    UNICO accesso ai dati: carica e normalizza i JSON
  js/optimizer.js       ottimizzatore dell'itinerario (greedy + miglioramento locale) e ricalcolo
  js/charts.js          grafici SVG (curva della folla, mappa di calore)
  js/app.js             schermate e interazioni
  data/                 dati in JSON + SCHEMA.md
data/                   dataset di Persona 1 (fonti, CSV, script di generazione)
docs/                   pitch e guida demo
```

## Dati

- **Reali (fonti pubbliche):** orari di apertura, prenotazione obbligatoria o consigliata, visitatori annui 2024 (MiC; Musei Vaticani).
- **Dimostrativi:** tutti i **livelli di affollamento orari** e la stima dei minuti di coda. L'app lo dichiara con il badge "Dati dimostrativi".
- Lo schema e il modo di collegare dati reali sono descritti in [`app/data/SCHEMA.md`](app/data/SCHEMA.md).

## Tecnologie

HTML, CSS e JavaScript (moduli ES) senza passaggi di build; [Leaflet](https://leafletjs.com/) per la mappa; il provider delle tile si configura in `app/data/config.json` (`map`): predefinito Esri World Dark Gray senza chiave, ripiego automatico su OpenStreetMap, e provider con chiave (MapTiler, Stadia Maps, Mapbox) attivabili inserendo `apiKey` (vedi `app/data/SCHEMA.md`); font Fraunces e Inter da Google Fonts.
