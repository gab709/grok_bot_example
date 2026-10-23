# RomaFlow, retrospettiva dello sprint

## What did you build
Abbiamo costruito **RomaFlow**, una web app responsive che pianifica la visita a Roma per evitare la folla. Il turista indica date, luoghi da vedere e ritmo, e l'app crea un itinerario giorno per giorno: ordina le tappe in base ai livelli di folla previsti per ogni ora, agli orari di apertura e alle prenotazioni obbligatorie. Mostra il percorso su una mappa, ricalcola la giornata in caso di imprevisti (pioggia, Colosseo affollato) e calcola quanta coda si evita rispetto a un itinerario classico.

- App online su GitHub Pages: https://gab709.github.io/grok_bot_example/
- Codice separato dai dati, con uno schema documentato in `app/data/SCHEMA.md`.
- Dataset di 15 luoghi iconici con orari, prenotazioni e visitatori annui reali (Ministero della Cultura 2024), più livelli di folla per fascia oraria che per ora sono stime dimostrative.
- Meteo in tempo reale e aggiornamento automatico dei dati.
- Mappa Leaflet con fornitore configurabile e passaggio automatico a una riserva.
- Documentazione: pitch, piano del team, fonti di dati, guida all'uso e istruzioni per il video.

## What broke
- **Configurazione di Git e GitHub:** ci ha preso troppo tempo. Il browser del bot non riusciva a caricare GitHub e abbiamo dovuto autorizzare l'accesso a mano. Poi c'è stata confusione sulle app GitHub di Cursor per i collaboratori, e il token non aveva i permessi per i workflow, quindi siamo passati a GitHub Pages direttamente dal branch.
- **Troppa autonomia:** Grok Bot ha deciso molte cose da solo, come il nome dell'app, lo stile grafico, la struttura dei dati e le soluzioni alternative quando qualcosa non andava. In uno sprint di un'ora è un vantaggio, perché fa andare veloci, ma toglie al team un po' di controllo sulle scelte.
- **Coordinamento tra agenti:** quando si scrive al Grok Bot principale, non sempre capisce subito se deve far intervenire i bot specializzati (Coding, startup pitch) o fare il lavoro da solo. Bisogna dirglielo in modo esplicito.

## What's next
- Sostituire le stime di affollamento con dati reali: un'API degli orari di punta come BestTime.app, il conteggio delle persone dalle webcam pubbliche e, in prospettiva, accordi con i gestori dei siti.
- Calcolare meglio gli spostamenti con i dati reali di ATAC e un servizio di percorsi a piedi.
- Finire il video pitch e testare l'app con i primi turisti veri.
- Estendere RomaFlow ad altre città d'arte, come Firenze, Venezia e Napoli.
