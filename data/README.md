# Dataset luoghi di Roma (RomaFlow, Persona 1 - Dati)

Dataset di **15 luoghi iconici di Roma** per il prototipo RomaFlow: anagrafica, coordinate, orari di apertura, prenotazione, durata tipica della visita, visitatori annui (dove esiste un dato pubblico) e **livello di folla orario 07:00-22:00** per un giorno feriale e uno festivo tipici.

> **Attenzione:** i livelli di folla orari sono **stime dimostrative**, non misure reali. Nel dataset sono marcati con `crowd_source: "stima dimostrativa"`. Non vanno presentati come dati reali.

## File

| File | Contenuto |
|---|---|
| `luoghi_roma.json` | Formato principale per la web app: `{ meta, places[] }` |
| `luoghi_roma.csv` | Una riga per luogo (orari per giorno come `HH:MM-HH:MM` o `chiuso`) |
| `affollamento_orario.csv` | Formato lungo: `place_id, day_type (feriale/festivo), hour, crowd_level, crowd_source` |
| `genera_dataset.py` | Script che genera i tre file sopra (orari della stagione corrente). Modificare qui i dati dei luoghi |
| `aggiorna_dati.py` | Aggiornamento completo (ogni ora): rigenera i file sopra, `meteo_roma.json` e `calendario.json` |
| `meteo_roma.json` | Previsione meteo oraria per Roma, prossimi 7 giorni (Open-Meteo), istantanea dell'ultimo aggiornamento |
| `calendario.json` | Prossimi 60 giorni: festività, eventi, orari del giorno e affollamento corretto per ogni luogo |
| `meteo.js` | Modulo ES per il browser: meteo in tempo reale da Open-Meteo e avvisi pioggia per i luoghi all'aperto |
| `wikipedia_interesse.py` / `wikipedia_interesse.json` | Interesse online per luogo dalle visualizzazioni Wikipedia (it+en, ultimi 365 giorni): indici 7/30 giorni, profilo per giorno della settimana, fattore di tendenza |
| `flickr_profili.py` / `flickr_profili.json` | Profili orari dalle foto pubbliche Flickr (solo con `FLICKR_API_KEY`; il JSON esiste solo dopo il primo scaricamento) |
| `test_flickr.py` | Test del percorso Flickr con risposte finte (`python3 data/test_flickr.py`) |
| `test_meteo.mjs` | Test di `meteo.js` con Node 18+ (`node data/test_meteo.mjs`) |

## Luoghi

Colosseo, Foro Romano e Palatino, Pantheon, Fontana di Trevi, Musei Vaticani e Cappella Sistina, Basilica di San Pietro, Piazza Navona, Piazza di Spagna e Trinità dei Monti, Galleria Borghese, Castel Sant'Angelo, Trastevere, Campo de' Fiori, Bocca della Verità (Santa Maria in Cosmedin), Terme di Caracalla, Musei Capitolini.

## Campi (JSON)

| Campo | Significato | Reale o stimato |
|---|---|---|
| `id`, `name`, `category` | Identificativo, nome, categoria (`museo`, `monumento all'aperto`, `piazza`, `chiesa`, `quartiere`) | Classificazione nostra |
| `lat`, `lon` | Coordinate WGS84 | Pubbliche (Wikipedia/OpenStreetMap), precisione ~50 m, non verificate punto per punto |
| `opening_hours` | Per giorno `lun`..`dom`: `[apertura, chiusura]`, `null` = chiuso, `00:00-24:00` = spazio pubblico sempre accessibile | **Reale** dai siti ufficiali dove indicato in `sources.opening_hours_status` |
| `opening_hours_note` | Ultimo ingresso, variazioni stagionali, giorni di chiusura, eccezioni | Reale (con eventuali avvisi "da verificare") |
| `booking`, `booking_note` | Prenotazione obbligatoria / consigliata / non necessaria | Reale dove c'è fonte, altrimenti nostra valutazione |
| `visit_duration_min` | Durata tipica della visita in minuti | **Stima** |
| `annual_visitors`, `annual_visitors_year`, `annual_visitors_note` | Visitatori annui; `null` se non esiste un dato ufficiale | **Reale** (MiC 2024; Musei Vaticani 2024) |
| `popularity` | Peso 0-1 usato per scalare il profilo orario | Derivato dai visitatori reali dove presenti, altrimenti **stima manuale** |
| `crowd_hours` | Ore di inizio fascia: 7..22 (16 fasce) | - |
| `crowd_weekday`, `crowd_weekend` | Livello di folla 0-100 per ogni fascia; 0 se il luogo è chiuso | **Stima dimostrativa** |
| `sources` | Fonte per ogni tipo di valore (coordinate, orari, prenotazione, durata, visitatori, popolarità, folla) | - |
| `crowd_source` | Sempre `"stima dimostrativa"` | - |

## Che cosa è reale e che cosa è stimato

**Reale (verificato su fonte pubblica, ottobre 2026):**
- Orari di apertura di Colosseo, Foro Romano/Palatino, Pantheon, Musei Vaticani, Basilica di San Pietro, Castel Sant'Angelo, Terme di Caracalla, Musei Capitolini.
- Visitatori annui 2024: Parco archeologico del Colosseo 14.733.395 (dato dell'intero Parco, include Foro e Palatino), Pantheon 4.086.947, Castel Sant'Angelo 1.315.063, Galleria Borghese 599.104, Terme di Caracalla 258.687 (fonte MiC); Musei Vaticani 6.825.436 (dato dei Musei Vaticani riportato da The Art Newspaper).

**Parzialmente verificato:** orari Galleria Borghese (fonte del concessionario Gebart, da ricontrollare sul sito ufficiale), Bocca della Verità (fonti non concordi sulla pausa pranzo), regole di accesso alla Fontana di Trevi (accesso regolato al bordo vasca da verificare).

**Non disponibile:** visitatori annui di Fontana di Trevi, San Pietro, piazze, Trastevere, Bocca della Verità e Musei Capitolini (museo civico, fuori dalle statistiche MiC: la stampa cita "circa un milione" nel 2025, ma non lo usiamo come dato ufficiale).

**Stimato:** durata della visita, popolarità per i luoghi senza dati, **tutti i livelli di folla orari**.

## Metodo delle stime di affollamento

1. **Profilo orario tipico per categoria** (valori 0-1 per le fasce 07-22), scritto a mano da conoscenza generale dei flussi turistici: i musei e i monumenti hanno il picco a fine mattinata (10-12) e calano nel pomeriggio; le chiese hanno il picco al mattino; le piazze crescono verso il tramonto e la sera (picco 18-20); il quartiere (Trastevere) ha il picco serale (20-22). Il profilo festivo è un po' più pieno e più lungo.
2. **Popolarità** del luogo (0-1): per i luoghi con visitatori reali, scala logaritmica tra 250.000 visitatori/anno (0,5) e 15 milioni (1,0); per gli altri, stima manuale.
3. `folla = profilo_categoria[ora] x popolarità x (1,1 se festivo) x 100`, limitato a 100.
4. **Fasce di chiusura = 0**, calcolate dagli orari reali (feriale = orari del mercoledì, festivo = orari del sabato).

Non sono stati usati dati di Google Maps "orari di punta" (non è consentito estrarli in automatico). Per l'MVP le stime vanno sostituite con una fonte oraria reale (per esempio BestTime.app o dati di bigliettazione tramite partnership), come previsto nel pitch (sezione 11).

## Avvertenze sugli orari (importanti per l'itinerario)

- Gli orari in `luoghi_roma.json` sono quelli della **stagione valida alla data di generazione** (vedi `meta.opening_hours_season`); per le date future usare `calendario.json`, che applica la stagione di ogni singolo giorno.
- **Musei Vaticani:** chiusi la domenica, **tranne l'ultima domenica del mese** (9-14, ultimo ingresso 12:30, gratuito, non prenotabile, code lunghissime). Ultimo ingresso nei giorni normali alle 18:00. Chiusi anche in varie festività (vedi nota).
- **Colosseo / Foro:** il 25 ottobre 2026 la chiusura passa da 18:30 a 16:30 (ultimo ingresso 15:30). Prenotazione della fascia obbligatoria. Prima domenica del mese gratuita (senza prenotazione, molta folla).
- **Basilica di San Pietro:** dal 26 ottobre 2026 7-19 (prima 7-20). Mercoledì mattina (udienza generale) e celebrazioni papali possono limitare l'accesso.
- **Lunedì chiusi:** Galleria Borghese, Castel Sant'Angelo (salvo primo lunedì del mese, 14-20), Terme di Caracalla.
- **Pantheon:** durante le Messe (sabato 17:00, domenica 10:30) ingresso solo per il culto.
- **Prime domeniche del mese** (siti statali gratuiti) e **ultima domenica** (Vaticani gratuiti) generano picchi anomali non modellati in questa versione.

## Fonti

- MiC, Tavola 8 - Top 30 visitatori 2024: https://statistica.cultura.gov.it/wp-content/uploads/2025/05/MUSEI_TAVOLA8_2024-1.pdf
- MiC, comunicato top 30 2024: https://cultura.gov.it/comunicato/27590
- The Art Newspaper, musei più visitati 2024 (Musei Vaticani): https://www.theartnewspaper.com/2025/04/01/the-worlds-most-visited-museums-2024-
- Musei Vaticani, orari e chiusure: https://www.museivaticani.va/content/museivaticani/it/info/orari-musei-vaticani.html
- Musei Vaticani, tariffe: https://www.museivaticani.va/content/museivaticani/it/organizza-visita/tariffe-e-biglietti.html
- Parco archeologico del Colosseo, orari e biglietti: https://colosseo.it/orari-e-biglietti/
- Pantheon (Direzione Musei nazionali di Roma): https://direzionemuseiroma.cultura.gov.it/pantheon/
- Castel Sant'Angelo: https://direzionemuseiroma.cultura.gov.it/museo-nazionale-di-castel-santangelo/
- Galleria Borghese (Gebart): https://www.gebart.it/musei/galleria-borghese/ e sito ufficiale https://galleriaborghese.cultura.gov.it/
- Terme di Caracalla (MiC): https://cultura.gov.it/luogo/terme-di-caracalla
- Basilica di San Pietro, orari: https://www.basilicasanpietro.va/it/orari
- Musei Capitolini, informazioni pratiche: https://www.museicapitolini.org/it/informazioni_pratiche/orari_e_indirizzi
- Santa Maria in Cosmedin (Turismo Roma): https://www.turismoroma.it/it/luoghi/basilica-di-santa-maria-cosmedin

## Dati in tempo reale e aggiornamento automatico

### Meteo in tempo reale nel browser (`meteo.js`)

Modulo ES senza dipendenze e senza chiave API: chiama direttamente [Open-Meteo](https://open-meteo.com/en/docs) (gratuito per uso non commerciale, dati CC BY 4.0, va citata la fonte nell'app).

```js
import { getMeteo, getMeteoPerLuoghi, valutaLuoghiAperto, adattoAllOra } from './data/meteo.js';

const luoghi = (await (await fetch('./data/luoghi_roma.json')).json()).places;
const meteo = await getMeteo();                 // Roma centro, oggi + 6 giorni, ora per ora
// meteo.ore = [{ time, data, ora, temperatura, probPioggia, pioggiaMm, codice, descrizione }, ...]

const avvisi = valutaLuoghiAperto(luoghi, meteo, { soglia: 60 });
// { colosseo: { allAperto: true, oreSconsigliate: { '2026-10-24': [14, 15] } }, musei_vaticani: { allAperto: false, ... } }

adattoAllOra(luoghi[0], meteo, '2026-10-24', 15);   // false se piove (prob >= 60%) e il luogo è all'aperto
const perLuogo = await getMeteoPerLuoghi(luoghi);   // facoltativo: una chiamata per luogo (lat/lon propri)
```

- Luoghi "all'aperto" = categoria `monumento all'aperto`, `piazza`, `quartiere`. Nota: il Pantheon è classificato come monumento ed è quindi trattato come luogo all'aperto (in realtà è coperto, a parte l'oculo); l'app può fare un'eccezione.
- Soglia di probabilità di pioggia configurabile (`soglia`, default 60%). Si considerano solo le fasce 07-22 (`ore`, configurabile).
- Se la chiamata live non funziona (offline), l'app può usare `meteo_roma.json` come riserva (istantanea dell'ultimo aggiornamento orario).

### Aggiornamento orario (`aggiorna_dati.py`)

```bash
python3 data/aggiorna_dati.py                # tutto: dataset + meteo + calendario 60 giorni
python3 data/aggiorna_dati.py --senza-meteo --giorni 30 --soglia-pioggia 70
```

Solo libreria standard Python (3.9+). A ogni esecuzione:

1. **Orari stagionali**: sceglie la stagione per data (regola ricavata dagli orari 2026 del Parco del Colosseo, allineata all'ora legale): `estate` (ultima domenica di marzo - 30/09), `ottobre` (1/10 - sabato prima dell'ultima domenica di ottobre), `inverno` (ultima domenica di ottobre - fine febbraio), `marzo`. Varia la chiusura di Colosseo, Foro/Palatino, San Pietro e Terme di Caracalla (estate e marzo di Caracalla non verificati). Tutte le date sono calcolate sull'ora di Roma.
2. **`generated_at`** in `luoghi_roma.json` e `calendario.json`.
3. **`meteo_roma.json`**: previsione oraria Open-Meteo per i prossimi 7 giorni (se fallisce, il resto viene aggiornato comunque).
4. **`calendario.json`** per i prossimi 60 giorni, con per ogni giorno `eventi` e, per ogni luogo, `open` (orario del giorno o `null`), `crowd` (16 valori, 07-22), `fattore`, `note`, `ore_sconsigliate_pioggia`.
   - Festività nazionali calcolate nel codice (Pasqua con algoritmo di Meeus) + 29 giugno (patroni di Roma).
   - Prima domenica del mese: ingresso gratuito nei luoghi statali (Colosseo, Foro/Palatino, Pantheon, Castel Sant'Angelo, Galleria Borghese, Terme di Caracalla) -> affollamento x1,5.
   - Ultima domenica del mese: Musei Vaticani gratuiti 9-14 (escluse Pasqua, 29/6, 25-26/12, 31/12) -> x1,6.
   - Mercoledì: udienza generale del Papa -> San Pietro x1,3 dalle 8 alle 12 e nota di accesso limitato (a luglio di solito sospesa: verificare su vatican.va).
   - Festività: luoghi all'aperto x1,15; chiusure festive note (Vaticani, Colosseo, Pantheon, Capitolini, Bocca della Verità).
   - **L'affollamento resta una stima dimostrativa** (`crowd_source: "stima dimostrativa"`): i fattori sono ipotesi, non misure.

### GitHub Actions (`.github/workflows/aggiorna-dati.yml`)

- **Ogni ora** al minuto 0 (`0 * * * *`; GitHub puo' ritardare di qualche minuto) e a mano con `workflow_dispatch`.
- Esegue `python3 data/aggiorna_dati.py` e fa commit sullo stesso branch **solo se i file sono cambiati**, come `github-actions[bot]` (`permissions: contents: write`). Poiché `generated_at` e il meteo cambiano a ogni esecuzione, in pratica c'è un commit ogni ora.
- **Limite di GitHub:** i trigger `schedule` partono solo quando il workflow è sul **branch di default (main)** e girano su main; quindi l'aggiornamento automatico funziona solo dopo il merge di `data/` e del workflow su main.

## Segnali reali per calibrare l'affollamento

L'obiettivo è sostituire gradualmente le curve inventate con segnali reali e gratuiti. Le curve restano **stime**: i segnali correggono la stima, non sono conteggi di persone.

### 1. Interesse online da Wikipedia (attivo)

- **Fonte:** [Wikimedia REST API, Pageviews per articolo](https://wikimedia.org/api/rest_v1/#/Pageviews%20data) (gratuita, senza chiave, dati CC0), visite di utenti umani alle pagine it.wikipedia + en.wikipedia di ogni luogo, ultimi 365 giorni. Le richieste usano uno User-Agent descrittivo, come chiede Wikimedia. I titoli degli articoli sono in `TITOLI` dentro `wikipedia_interesse.py` (verificati: nessuno manca e nessuno è un redirect).
- **Cosa misura:** l'**interesse online**, NON le persone presenti sul posto.
- **Calcolo** (`wikipedia_interesse.json`, per luogo): `indice_7_giorni` e `indice_30_giorni` = media degli ultimi 7/30 giorni / media dell'anno; `profilo_giorno_settimana` (1 = medio); `fattore_trend = 1 + 0,5 x (0,7 x indice_30 + 0,3 x indice_7 - 1)`, limitato a **[0,85; 1,25]**.
- **Applicazione:** `crowd_weekday`/`crowd_weekend` in `luoghi_roma.json` = curva base x `fattore_trend`. Per trasparenza: `crowd_weekday_base`/`crowd_weekend_base` (curva senza correzione) e `crowd_corrections.wikipedia_trend`. In `calendario.json` ogni luogo ha `fattore_wikipedia`.
- **Cache:** si riscarica solo se `meta.fetched_at` ha più di 20 ore (la data di modifica del file non è affidabile in GitHub Actions). Se l'API non risponde si usa la cache, anche se vecchia; se manca anche quella il fattore vale 1,0. L'aggiornamento non si blocca mai.
- Il profilo per giorno della settimana viene salvato ma non è ancora applicato alle curve (l'interesse online tende a salire nei giorni feriali, cioè quando si pianifica, non quando si visita).

### 2. Profili orari da foto Flickr (pronto, serve una chiave)

- **Fonte:** [Flickr API `flickr.photos.search`](https://www.flickr.com/services/api/flickr.photos.search.html): foto pubbliche geolocalizzate entro ~0,25 km dal luogo (0,2 km piazze, 0,5 km Trastevere), scattate negli ultimi 3 anni, `extras=date_taken`, massimo 16 pagine da 250 per luogo, circa 1 richiesta al secondo.
- **Cosa misura:** le foto pubbliche come **indicatore della presenza di persone** per ora del giorno (07-22), separando feriale (lun-ven) e weekend. L'ora è quella della fotocamera.
- **Fusione:** se un luogo ha **almeno 200 foto** nella fascia 07-22, la forma oraria diventa `70% profilo Flickr + 30% curva di categoria`, scalata per popolarità (e per il trend Wikipedia). In quel caso `crowd_source = "profilo da foto Flickr + stima"` e `crowd_corrections.flickr_blend = true`; altrimenti resta `"stima dimostrativa"`.
- **Attivazione:** creare una chiave su https://www.flickr.com/services/apps/create/ e aggiungerla come secret **`FLICKR_API_KEY`** del repository (Settings > Secrets and variables > Actions). Senza chiave lo script scrive una riga di log e prosegue. Cache: riscarica al massimo una volta a settimana.

### Nuovi campi (aggiunti, nessun campo esistente modificato)

| File | Campo | Significato |
|---|---|---|
| `luoghi_roma.json` | `crowd_weekday_base`, `crowd_weekend_base` | Curva prima delle correzioni |
| `luoghi_roma.json` | `crowd_corrections` | `wikipedia_trend`, `flickr_blend`, `flickr_photos_07_22`, `flickr_weight` |
| `luoghi_roma.json` | `sources.wikipedia_trend`, `sources.flickr_profile` | Fonti dei segnali |
| `luoghi_roma.json` | `meta.crowd_corrections_note` | Spiegazione delle correzioni |
| `calendario.json` | `luoghi.*.fattore_wikipedia`, `luoghi.*.crowd_source` | Correzione applicata e origine della curva |

> Nota per l'app: `app/` legge la propria copia statica `app/data/luoghi_roma.json`, che **non** viene aggiornata dal workflow. Per usare i dati aggiornati basta impostare in `app/data/config.json` `dataSources.places` a `"../../data/luoghi_roma.json"` (il formato è compatibile, testato con l'adapter dell'app).
