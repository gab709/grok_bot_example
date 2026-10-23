# Guida all'uso dell'app per la demo

Questa guida spiega come aprire RomaFlow e cosa fa ogni schermata e ogni comando, per chi registra o presenta la demo. Non impone un copione: la sequenza di clic è solo un suggerimento.

## 1. Aprire l'app

- **Online (GitHub Pages):** https://gab709.github.io/grok_bot_example/
- **In locale:** `cd app && python3 -m http.server 8000`, poi apri http://localhost:8000

Serve la connessione a internet per la mappa (Leaflet e tile Esri; provider configurabile in `app/data/config.json`, con ripiego automatico su OpenStreetMap) e per i font.

### Modalità demo e parametri URL

| URL | Effetto |
|---|---|
| `?demo=1` | Precompila le preferenze di esempio: 3 novembre 2026 (martedì), 2 giorni, partenza Centro storico, ritmo equilibrato, 6 imperdibili (Colosseo, Foro Romano e Palatino, Fontana di Trevi, Pantheon, Musei Vaticani, San Pietro), interessi storia antica, arte, cibo |
| `?demo=1&screen=prefs` | Apre direttamente le preferenze precompilate |
| `?demo=1&screen=plan` | Apre direttamente l'itinerario generato |
| `?demo=1&screen=impact` | Apre direttamente la schermata dell'impatto |
| `&fast=1` | Animazioni più rapide (overlay di calcolo e contatori) |
| `date=2026-11-07` | Data di partenza (AAAA-MM-GG). Un sabato usa i profili di folla del weekend |
| `days=1..3` | Numero di giorni |
| `start=termini\|centro-storico\|monti\|prati\|trastevere` | Zona di partenza (dove dormi) |
| `pace=rilassato\|equilibrato\|intenso` | Ritmo |
| `must=colosseo,pantheon,...` | Imperdibili (id dei luoghi, vedi `app/data/luoghi_roma.json`) |
| `interests=arte,cibo,...` | Interessi: storia-antica, arte, chiese, piazze, cibo, autentica, panorami |

Esempio: `?demo=1&screen=plan&date=2026-11-07&days=1&pace=intenso`

Tutti gli elementi interattivi hanno un attributo `data-testid` (per esempio `cta-demo`, `btn-generate`, `whatif-pioggia`), utile per test automatici.

## 2. Barra superiore (sempre visibile)

- **Logo RomaFlow:** torna alla home.
- **Passi 1 Preferenze · 2 Itinerario · 3 Impatto:** navigazione tra le schermate; i passi 2 e 3 si attivano dopo aver generato un itinerario.
- **Badge "Dati dimostrativi":** ricorda che i livelli di folla sono stime dimostrative (orari, prenotazioni e visitatori annui sono invece reali).
- **Ricomincia:** azzera preferenze e itinerario e torna alla home (vedi "Come ripartire da zero").

## 3. Schermate

### Home
- Titolo "Roma al momento giusto" e anteprima animata: la curva di affollamento del Colosseo in un martedì, con l'orario suggerito da RomaFlow (verde) e quello "come tutti" (rosso, al picco).
- **Pianifica il tuo viaggio:** apre le preferenze vuote.
- **Prova con l'esempio:** carica il viaggio di esempio (come `?demo=1`) e apre le preferenze già compilate.

### Preferenze
- **Quando:** data di arrivo e giorni (pulsanti − e +, da 1 a 3). Il giorno della settimana conta: orari di apertura e profili di folla cambiano tra feriali e weekend.
- **Dove dormi:** zona di partenza di ogni giornata.
- **Imperdibili:** schede dei 15 luoghi con emoji, visitatori annui, durata e badge "Prenotazione". Clic per selezionare o deselezionare. Ogni scheda mostra una mini-curva della folla del giorno.
- **Ritmo:** rilassato (fino a 4 tappe al giorno), equilibrato (5), intenso (7): cambia orari di inizio e fine giornata e la velocità a piedi.
- **Interessi:** l'app aggiunge tappe vicine coerenti con gli interessi se c'è tempo.
- **Riepilogo e "Genera il mio itinerario":** parte un breve overlay con i passi del calcolo, poi si apre l'itinerario.

### Itinerario
- **KPI in alto:** coda evitata (minuti), folla media rispetto a un itinerario standard, visite all'ora di punta (folla ≥ 60/100) con RomaFlow invece che con l'itinerario standard, numero di tappe e giorni.
- **Schede Giorno 1 / Giorno 2:** cambiano timeline e mappa.
- **Timeline:** per ogni tappa orario di arrivo e uscita, livello di folla (verde basso, giallo medio, rosso alto, con valore 0-100), minuti di coda stimati, "Al coperto", "Prenotazione obbligatoria", vantaggio rispetto all'orario di picco; tra le tappe i tempi a piedi o con i mezzi; pausa pranzo inserita in automatico.
- **Mappa:** percorso numerato nell'ordine della timeline, partenza segnata con l'icona della casa; clic su un numero per il nome della tappa.
- **Imprevisti in tempo reale** (pannello sotto la mappa):
  - **Sta piovendo:** pioggia fino alle 16; i luoghi all'aperto non imperdibili vengono sostituiti con luoghi al coperto vicini e l'ordine viene ricalcolato.
  - **"<Luogo> affollato"** (es. "Campo affollato"): la prossima tappa diventa molto affollata (per esempio un gruppo organizzato); l'app la sposta più avanti nella giornata.
  - **In ritardo di 45':** 45 minuti di ritardo dopo la prima tappa; l'app riordina il resto della giornata.
  - Le tappe si riordinano con un'animazione, compare una nota che spiega cosa è cambiato e le tappe modificate sono evidenziate.
  - **Annulla** (compare dopo un imprevisto): torna al piano originale della giornata.
- **Quanto tempo risparmi?:** apre la schermata dell'impatto.

### Impatto
- **Contatore animato** dei minuti di coda evitati in tutto il viaggio, con folla media e visite all'ora di punta.
- **Barre per tappa:** coda stimata con RomaFlow e con l'itinerario standard (stessi luoghi, partenza 9:30, ordine per vicinanza senza guardare la folla).
- **Quando andare: la mappa della folla:** i pulsanti con i nomi dei luoghi scelgono il luogo; sotto, la mappa di calore della folla per ora (8-21) e giorno della settimana con evidenziati l'orario RomaFlow e quello standard, e la curva della giornata con i due orari (verde RomaFlow, rosso standard).
- **Torna all'itinerario** e **Modifica preferenze**.

## 4. Come ripartire da zero

- Pulsante **Ricomincia** in alto a destra; oppure
- ricaricare l'URL senza parametri (lo stato non viene salvato nel browser); oppure
- per ripartire dalla demo: ricaricare `?demo=1`.
- Dentro l'itinerario, **Annulla** nel pannello imprevisti ripristina solo la giornata corrente.

## 5. Percorso di clic suggerito (circa 2 minuti)

1. Home: lasciare animare la curva del Colosseo (3-4 s).
2. **Prova con l'esempio** → scorrere le preferenze (imperdibili, ritmo, interessi).
3. **Genera il mio itinerario** → overlay di calcolo → itinerario Giorno 1.
4. Indicare i KPI, scorrere la timeline, passare con il mouse sulla mappa.
5. **Sta piovendo** → riordino animato e nota; poi il pulsante del luogo affollato.
6. **Annulla**, poi scheda **Giorno 2**.
7. **Quanto tempo risparmi?** → contatore, barre, mappa di calore.
8. **Ricomincia** per chiudere.

Per ripartire velocemente da un punto: `?demo=1&screen=plan&fast=1` o `?demo=1&screen=impact`.

## 6. Dimensioni consigliate per la registrazione

- **1920 × 1080** (desktop, zoom del browser 100-125%): la resa migliore, KPI, timeline e mappa visibili insieme.
- **1280 × 720:** funziona; con zoom 90% si vede più timeline.
- **Mobile 390 × 844** (strumenti sviluppatore, iPhone 14): layout a una colonna, mappa sotto la timeline.
- Nascondere barre dei segnalibri e usare la modalità a schermo intero (F11) per un'inquadratura pulita.

## Momenti forti (facoltativi)

- La curva del Colosseo in home: "stesso luogo, due orari, due esperienze".
- Il pulsante **Sta piovendo** con il riordino animato.
- Il contatore dei minuti risparmiati nella schermata Impatto.
