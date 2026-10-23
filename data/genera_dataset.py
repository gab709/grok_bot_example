"""Genera luoghi_roma.json, luoghi_roma.csv e affollamento_orario.csv.
Dati reali (orari, visitatori annui) inseriti a mano con fonte; profili orari = stima dimostrativa."""
import json, csv, math, os
OUT = os.path.dirname(os.path.abspath(__file__))
HOURS = list(range(7, 23))  # 07:00 ... 22:00 (16 fasce, ogni fascia = ora che inizia a HH:00)
DAYS = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"]

SRC = {
 "mic2024": "https://statistica.cultura.gov.it/wp-content/uploads/2025/05/MUSEI_TAVOLA8_2024-1.pdf",
 "mic2024_comunicato": "https://cultura.gov.it/comunicato/27590",
 "vat_visitatori": "https://www.theartnewspaper.com/2025/04/01/the-worlds-most-visited-museums-2024-",
 "vat_orari": "https://www.museivaticani.va/content/museivaticani/it/info/orari-musei-vaticani.html",
 "colosseo": "https://colosseo.it/orari-e-biglietti/",
 "pantheon": "https://direzionemuseiroma.cultura.gov.it/pantheon/",
 "castel": "https://direzionemuseiroma.cultura.gov.it/museo-nazionale-di-castel-santangelo/",
 "borghese": "https://www.gebart.it/musei/galleria-borghese/",
 "caracalla": "https://cultura.gov.it/luogo/terme-di-caracalla",
 "sanpietro": "https://www.basilicasanpietro.va/it/orari",
 "capitolini": "https://www.museicapitolini.org/it/informazioni_pratiche/orari_e_indirizzi",
 "cosmedin": "https://www.turismoroma.it/it/luoghi/basilica-di-santa-maria-cosmedin",
}
COORD_SRC = "coordinate pubbliche (Wikipedia/OpenStreetMap), precisione ~50 m, non verificate puntualmente in questa sessione"

def week(o, c, closed=()):
    return {d: (None if d in closed else [o, c]) for d in DAYS}
ALWAYS = {d: ["00:00", "24:00"] for d in DAYS}

P = [
 dict(id="colosseo", name="Colosseo", category="monumento all'aperto", lat=41.8902, lon=12.4922,
      hours=week("08:30","16:30"), hours_note="Orario invernale dal 25/10/2026 al 28/02/2027 (ultimo ingresso 15:30). Dal 1 al 24/10/2026 8:30-18:30; 29/03-30/09/2026 8:30-19:15. Chiuso 25/12 e 1/1. Gratis la prima domenica del mese (senza prenotazione, folla molto alta).",
      hours_source=SRC["colosseo"], hours_status="verificato",
      booking="obbligatoria", booking_note="Prenotazione obbligatoria della fascia oraria per il Colosseo (vendita 30 giorni prima).", booking_source=SRC["colosseo"],
      duration_min=90, visitors=14733395, visitors_year=2024, visitors_note="Dato MiC per l'intero Parco archeologico del Colosseo (Colosseo + Foro Romano + Palatino + Domus Aurea ecc.), istituti a pagamento.", visitors_source=SRC["mic2024"]),
 dict(id="foro_romano_palatino", name="Foro Romano e Palatino", category="monumento all'aperto", lat=41.8925, lon=12.4853,
      hours=week("09:00","16:30"), hours_note="Apre alle 9:00; chiusura del Parco 16:30 dal 25/10/2026 (18:30 fino al 24/10). Chiuso 25/12 e 1/1.",
      hours_source=SRC["colosseo"], hours_status="verificato",
      booking="obbligatoria", booking_note="Accesso con biglietto del Parco prenotato online.", booking_source=SRC["colosseo"],
      duration_min=120, visitors=None, visitors_year=2024, visitors_note="Non disponibile separatamente: incluso nel dato del Parco archeologico del Colosseo (14.733.395 nel 2024).", visitors_source=SRC["mic2024"]),
 dict(id="pantheon", name="Pantheon", category="monumento all'aperto", lat=41.8986, lon=12.4769,
      hours=week("09:00","19:00"), hours_note="Tutti i giorni 9-19, biglietteria fino alle 18, ultimo ingresso 18:30. Durante le Messe (sab/prefestivi 17:00, dom/festivi 10:30) ingresso libero solo per il culto. Chiuso 25/12 e 1/1. Biglietto 7 EUR dal 1/7/2026. Classificato qui come monumento (e' anche basilica).",
      hours_source=SRC["pantheon"], hours_status="verificato",
      booking="consigliata", booking_note="Biglietto nominativo con fascia oraria su museiitaliani.it o in loco; niente saltafila.", booking_source=SRC["pantheon"],
      duration_min=30, visitors=4086947, visitors_year=2024, visitors_note="Dato MiC 2024 (primo anno interamente a pagamento).", visitors_source=SRC["mic2024"]),
 dict(id="fontana_di_trevi", name="Fontana di Trevi", category="piazza", lat=41.9009, lon=12.4833,
      hours=ALWAYS, hours_note="Spazio pubblico sempre accessibile. Roma Capitale ha introdotto un accesso regolato/contingentato al bordo vasca (con biglietto per non residenti): regole e orari da verificare prima dell'uso.",
      hours_source="non verificato", hours_status="non verificato",
      booking="non necessaria (da verificare per l'accesso al bordo vasca)", booking_note="", booking_source="non verificato",
      duration_min=20, visitors=None, visitors_year=None, visitors_note="Nessun dato ufficiale pubblico di visitatori annui verificato.", visitors_source="non disponibile"),
 dict(id="musei_vaticani", name="Musei Vaticani e Cappella Sistina", category="museo", lat=41.9065, lon=12.4536,
      hours=week("08:00","20:00", closed=("dom",)), hours_note="Lun-sab 8-20 (ultimo ingresso 18:00, uscita dalle sale 30 min prima della chiusura). Domenica CHIUSO tranne l'ultima domenica del mese: 9-14 (ultimo ingresso 12:30), gratuito, non prenotabile, code molto lunghe. Chiusi anche 1 e 6/1, 11/2, 19/3, lunedì di Pasqua, 1/5, 29/6, 14-15/8, 1/11, 8/12, 25-26/12. Alcuni venerdì sera aprile-ottobre aperture serali su prenotazione.",
      hours_source=SRC["vat_orari"], hours_status="verificato",
      booking="fortemente consigliata", booking_note="Biglietto 20 EUR in loco; prenotazione 'salta la fila' online con sovrapprezzo.", booking_source="https://www.museivaticani.va/content/museivaticani/it/organizza-visita/tariffe-e-biglietti.html",
      duration_min=180, visitors=6825436, visitors_year=2024, visitors_note="Dato dichiarato dai Musei Vaticani e pubblicato da The Art Newspaper (classifica 2024). Non e' un dato MiC (Stato estero).", visitors_source=SRC["vat_visitatori"]),
 dict(id="basilica_san_pietro", name="Basilica di San Pietro", category="chiesa", lat=41.9022, lon=12.4539,
      hours=week("07:00","19:00"), hours_note="Dal 26/10/2026 al 28/03/2027 7-19; fino al 25/10/2026 7-20. Il mercoledì mattina (udienza generale in piazza, ore 10) e durante celebrazioni papali l'accesso puo' essere limitato o sospeso: da verificare caso per caso.",
      hours_source=SRC["sanpietro"], hours_status="verificato",
      booking="non necessaria", booking_note="Ingresso gratuito con controlli di sicurezza (code). Cupola a pagamento.", booking_source=SRC["sanpietro"],
      duration_min=75, visitors=None, visitors_year=None, visitors_note="Nessun dato ufficiale annuo verificato in questa sessione.", visitors_source="non disponibile"),
 dict(id="piazza_navona", name="Piazza Navona", category="piazza", lat=41.8992, lon=12.4731,
      hours=ALWAYS, hours_note="Spazio pubblico sempre accessibile.", hours_source="spazio pubblico", hours_status="n/a (spazio pubblico)",
      booking="non necessaria", booking_note="", booking_source="spazio pubblico",
      duration_min=30, visitors=None, visitors_year=None, visitors_note="Nessun dato ufficiale.", visitors_source="non disponibile"),
 dict(id="piazza_di_spagna", name="Piazza di Spagna e Trinità dei Monti", category="piazza", lat=41.9058, lon=12.4823,
      hours=ALWAYS, hours_note="Piazza e Scalinata sempre accessibili (vietato sedersi sui gradini). Orari della chiesa di Trinità dei Monti non verificati.", hours_source="spazio pubblico", hours_status="n/a (spazio pubblico); chiesa non verificata",
      booking="non necessaria", booking_note="", booking_source="spazio pubblico",
      duration_min=30, visitors=None, visitors_year=None, visitors_note="Nessun dato ufficiale.", visitors_source="non disponibile"),
 dict(id="galleria_borghese", name="Galleria Borghese", category="museo", lat=41.9142, lon=12.4921,
      hours=week("09:00","19:00", closed=("lun",)), hours_note="Mar-dom 9-19, lunedi' chiuso; ingressi a turni (ultimo turno 17:00/17:45 secondo la fonte). Orario da fonte del concessionario biglietteria, da ricontrollare sul sito ufficiale galleriaborghese.cultura.gov.it.",
      hours_source=SRC["borghese"], hours_status="parzialmente verificato (fonte secondaria)",
      booking="obbligatoria", booking_note="Prenotazione obbligatoria a turni, numero limitato di ingressi.", booking_source=SRC["borghese"],
      duration_min=120, visitors=599104, visitors_year=2024, visitors_note="Dato MiC 2024.", visitors_source=SRC["mic2024"]),
 dict(id="castel_santangelo", name="Castel Sant'Angelo", category="museo", lat=41.9031, lon=12.4663,
      hours=week("09:00","19:30", closed=("lun",)), hours_note="Mar-dom 9-19:30 (ultimo ingresso 18:30). Lunedi' chiuso, eccetto il primo lunedi' del mese nel 2026: 14-20 (ultimo ingresso 19), biglietto 5 EUR.",
      hours_source=SRC["castel"], hours_status="verificato (sintesi da ricerca, pagina ufficiale)",
      booking="consigliata", booking_note="", booking_source=SRC["castel"],
      duration_min=90, visitors=1315063, visitors_year=2024, visitors_note="Dato MiC 2024 (Museo Nazionale di Castel Sant'Angelo e Passetto di Borgo).", visitors_source=SRC["mic2024"]),
 dict(id="trastevere", name="Trastevere", category="quartiere", lat=41.8897, lon=12.4699,
      hours=ALWAYS, hours_note="Quartiere sempre accessibile; affollamento serale legato a locali e ristoranti.", hours_source="spazio pubblico", hours_status="n/a (spazio pubblico)",
      booking="non necessaria", booking_note="", booking_source="spazio pubblico",
      duration_min=120, visitors=None, visitors_year=None, visitors_note="Nessun dato ufficiale.", visitors_source="non disponibile"),
 dict(id="campo_de_fiori", name="Campo de' Fiori", category="piazza", lat=41.8956, lon=12.4722,
      hours=ALWAYS, hours_note="Piazza sempre accessibile. Mercato al mattino dal lunedi' al sabato (orari indicativi, non verificati).", hours_source="spazio pubblico", hours_status="n/a (spazio pubblico); mercato non verificato",
      booking="non necessaria", booking_note="", booking_source="spazio pubblico",
      duration_min=30, visitors=None, visitors_year=None, visitors_note="Nessun dato ufficiale.", visitors_source="non disponibile"),
 dict(id="bocca_della_verita", name="Bocca della Verità (Santa Maria in Cosmedin)", category="chiesa", lat=41.8881, lon=12.4816,
      hours=week("09:30","17:50"), hours_note="Tutti i giorni 9:30-17:50 secondo Turismo Roma; alcune fonti indicano una pausa 13-14 e accesso regolato durante la liturgia domenicale (10:30). Chiuso 1/1. Da riverificare.",
      hours_source=SRC["cosmedin"], hours_status="parzialmente verificato",
      booking="non necessaria", booking_note="Ingresso gratuito (offerta), coda per la foto.", booking_source=SRC["cosmedin"],
      duration_min=20, visitors=None, visitors_year=None, visitors_note="Nessun dato ufficiale.", visitors_source="non disponibile"),
 dict(id="terme_di_caracalla", name="Terme di Caracalla", category="monumento all'aperto", lat=41.8791, lon=12.4924,
      hours=week("09:00","17:30", closed=("lun",)), hours_note="Lunedi' chiuso. Dal 25/10/2026 9-17:30; fino al 24/10/2026 9-18:30.",
      hours_source=SRC["caracalla"], hours_status="verificato (sintesi da ricerca)",
      booking="consigliata", booking_note="", booking_source=SRC["caracalla"],
      duration_min=90, visitors=258687, visitors_year=2024, visitors_note="Dato MiC 2024.", visitors_source=SRC["mic2024"]),
 dict(id="musei_capitolini", name="Musei Capitolini", category="museo", lat=41.8930, lon=12.4826,
      hours=week("09:30","19:30"), hours_note="Tutti i giorni 9:30-19:30, ultimo ingresso un'ora prima. Chiusi 1/5 e 25/12.",
      hours_source=SRC["capitolini"], hours_status="verificato (sintesi da ricerca, sito ufficiale)",
      booking="consigliata", booking_note="", booking_source=SRC["capitolini"],
      duration_min=120, visitors=None, visitors_year=None, visitors_note="Museo civico (Roma Capitale), non nelle statistiche MiC. La stampa (Il Messaggero, 2026) cita 'circa un milione' nel 2025: valore giornalistico, non usato come dato ufficiale.", visitors_source="non disponibile (stampa: https://www.ilmessaggero.it/roma/centro_storico/roma_incassi_arte_colosseo_fontana_trevi_pantheon-9487124.html)"),
]

# --- Profili orari tipici per categoria (07..22), 0-1, STIMA DIMOSTRATIVA ---
PROF = {
 "museo":                {"feriale":[0,.30,.55,.85,1,.95,.80,.85,.80,.65,.45,.25,.10,0,0,0],
                          "festivo":[0,.30,.60,.90,1,1,.90,.90,.85,.70,.50,.30,.10,0,0,0]},
 "monumento all'aperto": {"feriale":[0,.20,.50,.80,1,.95,.80,.75,.80,.70,.55,.40,.20,.10,0,0],
                          "festivo":[0,.20,.55,.85,1,1,.90,.85,.85,.75,.60,.45,.25,.10,0,0]},
 "piazza":               {"feriale":[.05,.10,.20,.40,.60,.70,.70,.65,.65,.70,.80,.90,1,.95,.80,.60],
                          "festivo":[.05,.10,.20,.45,.65,.80,.80,.75,.75,.80,.90,1,1,1,.90,.70]},
 "chiesa":               {"feriale":[.15,.35,.60,.85,1,.85,.60,.65,.70,.65,.55,.40,0,0,0,0],
                          "festivo":[.20,.40,.70,.95,1,.90,.70,.70,.75,.70,.60,.45,0,0,0,0]},
 "quartiere":            {"feriale":[.05,.10,.15,.20,.30,.40,.50,.40,.35,.35,.40,.55,.75,.95,1,.90],
                          "festivo":[.05,.10,.15,.25,.40,.55,.65,.55,.50,.50,.55,.70,.85,1,1,1]},
}
# Popolarita' (0-1): da visitatori reali (scala logaritmica) dove disponibili, altrimenti stima manuale.
POP_MANUAL = {"foro_romano_palatino": .85, "fontana_di_trevi": 1.0, "basilica_san_pietro": .95, "piazza_navona": .80,
              "piazza_di_spagna": .85, "trastevere": .75, "campo_de_fiori": .60, "bocca_della_verita": .55, "musei_capitolini": .55}
P_BY_ID = {p["id"]: p for p in P}

def popularity(p):
    if p["visitors"]:
        v = p["visitors"]  # 250k -> ~0.5, 15M -> 1.0
        return round(min(1, max(.4, .5 + .5 * (math.log10(v) - math.log10(250_000)) / (math.log10(15_000_000) - math.log10(250_000)))), 3), "calcolata da visitatori annui reali (scala logaritmica)"
    return POP_MANUAL[p["id"]], "stima manuale (nessun dato visitatori ufficiale)"

def is_open(hours_day, h):
    if hours_day is None: return False
    o, c = hours_day
    oh, om = map(int, o.split(":")); ch, cm = map(int, c.split(":"))
    start, end = h*60, h*60+60
    return start < ch*60+cm and end > oh*60+om


# --- Orari stagionali (cambio estate/inverno per data) ---------------------
import datetime as _dt
from zoneinfo import ZoneInfo
ROMA = ZoneInfo("Europe/Rome")  # i runner GitHub sono in UTC: le date si calcolano sempre sull'ora di Roma
def ultima_domenica(anno, mese):
    """Ultima domenica del mese (usata per i cambi di stagione, allineati all'ora legale)."""
    d = _dt.date(anno, mese + 1, 1) - _dt.timedelta(days=1) if mese < 12 else _dt.date(anno, 12, 31)
    return d - _dt.timedelta(days=(d.weekday() + 1) % 7)

def stagione(oggi):
    """'estate' = da ultima domenica di marzo al 30/09; 'ottobre' = 1/10 fino al giorno prima dell'ultima
    domenica di ottobre; 'inverno' = da ultima domenica di ottobre a fine febbraio; 'marzo' = 1/3 fino al giorno
    prima dell'ultima domenica di marzo. Regola ricavata dagli orari 2026 del Parco del Colosseo."""
    y = oggi.year
    if oggi >= ultima_domenica(y, 10) or oggi.month <= 2: return "inverno"
    if oggi.month == 3 and oggi < ultima_domenica(y, 3): return "marzo"
    if oggi.month >= 10: return "ottobre"
    return "estate"

# Orari di chiusura per stagione (apertura invariata). Fonte: note in P (colosseo.it, basilicasanpietro.va, cultura.gov.it).
STAGIONALI = {
    "colosseo":             {"open": "08:30", "close": {"estate": "19:15", "ottobre": "18:30", "inverno": "16:30", "marzo": "17:30"}},
    "foro_romano_palatino": {"open": "09:00", "close": {"estate": "19:15", "ottobre": "18:30", "inverno": "16:30", "marzo": "17:30"}},
    # San Pietro: 7-20 fino al 25/10/2026, 7-19 dal 26/10/2026 al 28/03/2027 (cambio approssimato all'ultima domenica)
    "basilica_san_pietro":  {"open": "07:00", "close": {"estate": "20:00", "ottobre": "20:00", "inverno": "19:00", "marzo": "19:00"}},
    # Caracalla: 18:30 fino al 24/10/2026, 17:30 dal 25/10. Estate e marzo NON verificati (assunto 18:30 / 17:30).
    "terme_di_caracalla":   {"open": "09:00", "close": {"estate": "18:30", "ottobre": "18:30", "inverno": "17:30", "marzo": "17:30"}},
}
def orario_stagionale(pid, orario_giorno, oggi):
    """Orario [apertura, chiusura] di un giorno, corretto per la stagione della data `oggi`."""
    st = STAGIONALI.get(pid)
    if not st or orario_giorno is None: return orario_giorno
    return [st["open"], st["close"][stagione(oggi)]]

def applica_stagione(oggi):
    s = stagione(oggi)
    for p in P:
        st = STAGIONALI.get(p["id"])
        if st:
            p["hours"] = {d: (None if v is None else [st["open"], st["close"][s]]) for d, v in p["hours"].items()}
    return s

FLICKR_PESO = 0.7  # nella fusione: 70% forma oraria Flickr, 30% curva di categoria

def genera(oggi=None, trend=None, flickr=None):
    """Rigenera luoghi_roma.json/.csv e affollamento_orario.csv con gli orari della stagione di `oggi`.
    trend:  {id: fattore 0.85-1.25} dal trend Wikipedia (facoltativo, vedi wikipedia_interesse.py)
    flickr: {id: {profilo_feriale[16], profilo_festivo[16], campione_sufficiente, foto_07_22}} (facoltativo)"""
    oggi = oggi or _dt.datetime.now(ROMA).date()
    stag = applica_stagione(oggi)
    trend, flickr = trend or {}, flickr or {}
    places = []
    for p in P:
        pop, pop_src = popularity(p)
        f_trend = trend.get(p["id"], 1.0)
        fl = flickr.get(p["id"])
        usa_flickr = bool(fl and fl.get("campione_sufficiente"))
        crowd, base = {}, {}
        for dt, ref_day in (("feriale", "mer"), ("festivo", "sab")):
            prof = PROF[p["category"]][dt]
            if usa_flickr:  # forma oraria: 70% foto Flickr (0-1) + 30% curva di categoria
                fprof = fl["profilo_" + dt]
                prof = [FLICKR_PESO * fprof[i] / 100 + (1 - FLICKR_PESO) * prof[i] for i in range(len(HOURS))]
            boost = 1.1 if dt == "festivo" else 1.0
            vals, vals0 = [], []
            for i, h in enumerate(HOURS):
                open_ = is_open(p["hours"][ref_day], h)
                v = prof[i] * pop * boost * 100
                vals0.append(int(round(min(100, v))) if open_ else 0)
                vals.append(int(round(min(100, v * f_trend))) if open_ else 0)
            crowd[dt], base[dt] = vals, vals0
        crowd_src = "profilo da foto Flickr + stima" if usa_flickr else "stima dimostrativa"
        places.append({
            "id": p["id"], "name": p["name"], "category": p["category"],
            "lat": p["lat"], "lon": p["lon"],
            "opening_hours": p["hours"], "opening_hours_note": p["hours_note"],
            "booking": p["booking"], "booking_note": p["booking_note"],
            "visit_duration_min": p["duration_min"],
            "annual_visitors": p["visitors"], "annual_visitors_year": p["visitors_year"], "annual_visitors_note": p["visitors_note"],
            "popularity": pop,
            "crowd_hours": HOURS,
            "crowd_weekday": crowd["feriale"], "crowd_weekend": crowd["festivo"],
            # campi aggiunti (retrocompatibili): curve prima della correzione e correzioni applicate
            "crowd_weekday_base": base["feriale"], "crowd_weekend_base": base["festivo"],
            "crowd_corrections": {
                "wikipedia_trend": f_trend,
                "wikipedia_trend_note": "fattore 0.85-1.25 dall'interesse online (pagine Wikipedia it+en), moltiplica la curva base; 1.0 = dato assente",
                "flickr_blend": usa_flickr,
                "flickr_photos_07_22": (fl or {}).get("foto_07_22"),
                "flickr_weight": FLICKR_PESO if usa_flickr else 0,
            },
            "sources": {
                "coordinates": COORD_SRC,
                "opening_hours": p["hours_source"], "opening_hours_status": p["hours_status"],
                "booking": p["booking_source"],
                "visit_duration": "stima (durata tipica di visita, non da fonte ufficiale)",
                "annual_visitors": p["visitors_source"],
                "popularity": pop_src,
                "crowd": crowd_src + (" (corretta con trend Wikipedia)" if f_trend != 1.0 else ""),
                "wikipedia_trend": "Wikimedia Pageviews API (https://wikimedia.org/api/rest_v1/), vedi wikipedia_interesse.json" if p["id"] in trend else "non disponibile",
                "flickr_profile": "Flickr API, vedi flickr_profili.json" if usa_flickr else "non disponibile",
            },
            "crowd_source": crowd_src,
        })

    meta = {
        "dataset": "RomaFlow - luoghi iconici di Roma", "version": "1.0", 
        "crowd_scale": "0-100 (0 = chiuso o vuoto, 100 = picco massimo relativo nel dataset)",
        "crowd_hours_meaning": "Ogni valore si riferisce alla fascia che inizia all'ora indicata (7 = 07:00-07:59 ... 22 = 22:00-22:59)",
        "crowd_weekday_ref": "giorno feriale tipico (calcolato con gli orari del mercoledi')",
        "crowd_weekend_ref": "giorno festivo tipico (calcolato con gli orari del sabato; la domenica alcuni luoghi sono chiusi: controllare opening_hours)",
        "crowd_disclaimer": "I livelli di affollamento orari sono STIME DIMOSTRATIVE, non misure reali. Vedi data/README.md.",
        "crowd_corrections_note": "crowd_weekday/weekend = curva base x crowd_corrections.wikipedia_trend (interesse online, non presenze). "
                                  "Se crowd_corrections.flickr_blend e' true la forma oraria e' 70% foto Flickr + 30% curva di categoria. "
                                  "Le curve senza correzione sono in crowd_weekday_base/crowd_weekend_base.",
        "opening_hours_season": f"Orari della stagione '{stag}' valida al {oggi.isoformat()} (cambio automatico per data, vedi aggiorna_dati.py). Dettagli in opening_hours_note.",
        "generated_at": _dt.datetime.now(ROMA).isoformat(timespec="seconds"),
        "opening_hours_format": "per giorno (lun..dom): [apertura, chiusura] in HH:MM, null = chiuso; 00:00-24:00 = spazio pubblico sempre accessibile",
    }
    with open(os.path.join(OUT, "luoghi_roma.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "places": places}, f, ensure_ascii=False, indent=2)

    with open(os.path.join(OUT, "luoghi_roma.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id","name","category","lat","lon"] + [f"orario_{d}" for d in DAYS] +
                   ["opening_hours_note","booking","visit_duration_min","annual_visitors","annual_visitors_year","popularity",
                    "source_coordinates","source_opening_hours","opening_hours_status","source_booking","source_visit_duration",
                    "source_annual_visitors","source_popularity","crowd_source"])
        for p in places:
            s = p["sources"]
            w.writerow([p["id"],p["name"],p["category"],p["lat"],p["lon"]] +
                       [("chiuso" if p["opening_hours"][d] is None else "-".join(p["opening_hours"][d])) for d in DAYS] +
                       [p["opening_hours_note"],p["booking"],p["visit_duration_min"],p["annual_visitors"] or "",p["annual_visitors_year"] or "",p["popularity"],
                        s["coordinates"],s["opening_hours"],s["opening_hours_status"],s["booking"],s["visit_duration"],s["annual_visitors"],s["popularity"],p["crowd_source"]])

    with open(os.path.join(OUT, "affollamento_orario.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["place_id","day_type","hour","crowd_level","crowd_source"])
        for p in places:
            for dt, key in (("feriale","crowd_weekday"),("festivo","crowd_weekend")):
                for h, v in zip(HOURS, p[key]):
                    w.writerow([p["id"], dt, f"{h:02d}:00", v, "stima dimostrativa"])
    print("ok", len(places))

    return places, stag

if __name__ == "__main__":
    genera()
