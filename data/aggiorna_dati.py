#!/usr/bin/env python3
"""Aggiornamento orario dei dati RomaFlow (solo libreria standard).

Esegue, in ordine:
 1. rigenera luoghi_roma.json/.csv e affollamento_orario.csv con gli orari della stagione corrente
    (cambio estate/inverno per data) e il timestamp generated_at;
 2. scarica da Open-Meteo (gratuito, senza chiave) le previsioni orarie per Roma dei prossimi 7 giorni
    -> meteo_roma.json;
 3. costruisce calendario.json per i prossimi 60 giorni: festivita' italiane (calcolate nel codice),
    prima domenica del mese gratuita nei musei statali, ultima domenica gratuita ai Musei Vaticani,
    udienza generale del mercoledi' a San Pietro; per ogni giorno applica le correzioni all'affollamento
    stimato (che resta una STIMA DIMOSTRATIVA) e segnala le ore sconsigliate all'aperto per pioggia.

Uso: python3 data/aggiorna_dati.py [--giorni 60] [--soglia-pioggia 60] [--senza-meteo]
"""
import argparse, datetime as dt, json, os, sys, urllib.request, urllib.parse
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import genera_dataset as G
import wikipedia_interesse as W
import flickr_profili as F

OUT = G.OUT
ROMA = ZoneInfo("Europe/Rome")
ROMA_LAT, ROMA_LON = 41.8933, 12.4829
OPEN_METEO = "https://api.open-meteo.com/v1/forecast"
CATEGORIE_APERTO = {"monumento all'aperto", "piazza", "quartiere"}
STATALI = {"colosseo", "foro_romano_palatino", "pantheon", "castel_santangelo", "galleria_borghese", "terme_di_caracalla"}

# ---------------------------------------------------------------- meteo
def scarica_meteo(giorni=7):
    q = urllib.parse.urlencode({
        "latitude": ROMA_LAT, "longitude": ROMA_LON, "timezone": "Europe/Rome", "forecast_days": giorni,
        "hourly": "temperature_2m,precipitation_probability,precipitation,weather_code"})
    with urllib.request.urlopen(f"{OPEN_METEO}?{q}", timeout=30) as r:
        d = json.load(r)
    h = d["hourly"]
    ore = [{"time": t, "temperature_c": h["temperature_2m"][i], "precipitation_probability": h["precipitation_probability"][i],
            "precipitation_mm": h["precipitation"][i], "weather_code": h["weather_code"][i]} for i, t in enumerate(h["time"])]
    return {"fonte": "Open-Meteo (https://open-meteo.com), previsione, licenza CC BY 4.0", "url": f"{OPEN_METEO}?{q}",
            "scaricato_il": dt.datetime.now(ROMA).isoformat(timespec="seconds"),
            "latitude": d["latitude"], "longitude": d["longitude"], "timezone": d["timezone"], "hourly": ore}

# ---------------------------------------------------------------- festivita'
def pasqua(anno):
    """Domenica di Pasqua (algoritmo di Meeus/Jones/Butcher, calendario gregoriano)."""
    a, b, c = anno % 19, anno // 100, anno % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25; g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    mese = (h + l - 7 * m + 114) // 31
    return dt.date(anno, mese, (h + l - 7 * m + 114) % 31 + 1)

def festivita(anno):
    p = pasqua(anno)
    f = {dt.date(anno, 1, 1): "Capodanno", dt.date(anno, 1, 6): "Epifania", p: "Pasqua",
         p + dt.timedelta(days=1): "Lunedi' dell'Angelo (Pasquetta)", dt.date(anno, 4, 25): "Festa della Liberazione",
         dt.date(anno, 5, 1): "Festa dei Lavoratori", dt.date(anno, 6, 2): "Festa della Repubblica",
         dt.date(anno, 6, 29): "Santi Pietro e Paolo (patroni di Roma)", dt.date(anno, 8, 15): "Ferragosto",
         dt.date(anno, 11, 1): "Ognissanti", dt.date(anno, 12, 8): "Immacolata Concezione",
         dt.date(anno, 12, 25): "Natale", dt.date(anno, 12, 26): "Santo Stefano"}
    return f

# Chiusure note per luogo (dalle note degli orari ufficiali). Funzione data -> bool.
def chiusure_vaticani(g):
    p = pasqua(g.year)
    fisse = {(1, 1), (1, 6), (2, 11), (3, 19), (5, 1), (6, 29), (8, 14), (8, 15), (11, 1), (12, 8), (12, 25), (12, 26)}
    return (g.month, g.day) in fisse or g == p + dt.timedelta(days=1)
CHIUSURE = {
    "musei_vaticani": chiusure_vaticani,
    "colosseo": lambda g: (g.month, g.day) in {(12, 25), (1, 1)},
    "foro_romano_palatino": lambda g: (g.month, g.day) in {(12, 25), (1, 1)},
    "pantheon": lambda g: (g.month, g.day) in {(12, 25), (1, 1)},
    "musei_capitolini": lambda g: (g.month, g.day) in {(5, 1), (12, 25)},
    "bocca_della_verita": lambda g: (g.month, g.day) == (1, 1),
}

def prima_domenica(g): return g.weekday() == 6 and g.day <= 7
def ultima_domenica(g): return g.weekday() == 6 and (g + dt.timedelta(days=7)).month != g.month
def vaticani_gratis(g):
    # niente domenica gratuita se coincide con Pasqua, 29/6, 25/12, 26/12, 31/12
    return ultima_domenica(g) and g != pasqua(g.year) and (g.month, g.day) not in {(6, 29), (12, 25), (12, 26), (12, 31)}

# ---------------------------------------------------------------- calendario + correzioni
DAYS = G.DAYS
def costruisci_calendario(places, giorni, meteo, soglia):
    oggi = dt.datetime.now(ROMA).date()
    pioggia = {}  # "YYYY-MM-DD" -> {ora: prob}
    if meteo:
        for o in meteo["hourly"]:
            d, h = o["time"][:10], int(o["time"][11:13])
            pioggia.setdefault(d, {})[h] = o["precipitation_probability"]
    base = {p["id"]: p for p in places}
    out = []
    for n in range(giorni):
        g = oggi + dt.timedelta(days=n)
        fest = festivita(g.year).get(g)
        wd = DAYS[g.weekday()]
        day_type = "festivo" if (g.weekday() >= 5 or fest) else "feriale"
        eventi = []
        if fest: eventi.append({"tipo": "festivita", "nome": fest})
        if prima_domenica(g): eventi.append({"tipo": "ingresso_gratuito", "nome": "#domenicalmuseo: ingresso gratuito nei luoghi statali (prima domenica del mese)", "luoghi": sorted(STATALI)})
        if vaticani_gratis(g): eventi.append({"tipo": "ingresso_gratuito", "nome": "Musei Vaticani gratuiti (ultima domenica del mese, 9-14, ultimo ingresso 12:30)", "luoghi": ["musei_vaticani"]})
        if g.weekday() == 2: eventi.append({"tipo": "evento_religioso", "nome": "Udienza generale del Papa (di norma mercoledi' ore 10 in Piazza San Pietro; a luglio di solito sospesa: verificare su vatican.va)", "luoghi": ["basilica_san_pietro"]})
        luoghi = {}
        for pid, p in base.items():
            orario = G.orario_stagionale(pid, G.P_BY_ID[pid]["hours"][wd], g)  # orari della stagione di quel giorno
            fattore, note = 1.0, []
            if pid == "musei_vaticani" and vaticani_gratis(g):
                orario, fattore = ["09:00", "14:00"], 1.6; note.append("domenica gratuita: code molto lunghe")
            if CHIUSURE.get(pid, lambda _: False)(g):
                orario = None; note.append("chiuso per festivita'")
            if pid in STATALI and prima_domenica(g):
                fattore = 1.5; note.append("ingresso gratuito, nessuna prenotazione")
            if fest and p["category"] in CATEGORIE_APERTO:
                fattore = max(fattore, 1.15); note.append("festivita': piu' gente in giro")
            profilo = p["crowd_weekend" if day_type == "festivo" else "crowd_weekday"]
            crowd = []
            for i, h in enumerate(G.HOURS):
                aperto = G.is_open(orario, h)
                f_trend = p.get("crowd_corrections", {}).get("wikipedia_trend", 1.0)
                v = profilo[i] if profilo[i] > 0 else (G.PROF[p["category"]][day_type][i] * p["popularity"] * 100 * f_trend)
                if pid == "basilica_san_pietro" and g.weekday() == 2 and 8 <= h <= 12:
                    v *= 1.3  # udienza: piazza piena, accesso alla basilica limitato
                crowd.append(int(round(min(100, v * fattore))) if aperto else 0)
            if pid == "basilica_san_pietro" and g.weekday() == 2:
                note.append("mercoledi' mattina: accesso alla basilica limitato durante l'udienza (stima)")
            sconsigliato = []
            if p["category"] in CATEGORIE_APERTO and g.isoformat() in pioggia:
                sconsigliato = [h for h in G.HOURS if (pioggia[g.isoformat()].get(h) or 0) >= soglia]
            luoghi[pid] = {"open": orario, "crowd": crowd, "fattore": fattore, "note": note,
                           "fattore_wikipedia": p.get("crowd_corrections", {}).get("wikipedia_trend", 1.0),
                           "crowd_source": p.get("crowd_source", "stima dimostrativa"),
                           "ore_sconsigliate_pioggia": sconsigliato}
        out.append({"date": g.isoformat(), "weekday": wd, "day_type": day_type, "eventi": eventi, "luoghi": luoghi})
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--giorni", type=int, default=60)
    ap.add_argument("--soglia-pioggia", type=int, default=60)
    ap.add_argument("--senza-meteo", action="store_true")
    a = ap.parse_args()
    # Segnali reali (facoltativi): un errore qui non deve mai bloccare l'aggiornamento.
    trend, flickr = {}, {}
    try:
        trend = W.fattori_trend(W.aggiorna(log=print))
    except Exception as e:
        print("ATTENZIONE: Wikipedia non disponibile:", e, file=sys.stderr)
        try:  # ripiego sulla cache, anche se vecchia
            trend = W.fattori_trend(json.load(open(W.FILE, encoding="utf-8")))
        except Exception:
            pass
    try:
        doc_f = F.aggiorna([{"id": p["id"], "lat": p["lat"], "lon": p["lon"], "category": p["category"]} for p in G.P], log=print)
        flickr = (doc_f or {}).get("luoghi", {})
    except Exception as e:
        print("ATTENZIONE: Flickr non disponibile:", e, file=sys.stderr)
    places, stag = G.genera(trend=trend, flickr=flickr)
    meteo = None
    if not a.senza_meteo:
        try:
            meteo = scarica_meteo(7)
            with open(os.path.join(OUT, "meteo_roma.json"), "w", encoding="utf-8") as f:
                json.dump(meteo, f, ensure_ascii=False, indent=1)
        except Exception as e:  # il meteo non deve bloccare il resto dell'aggiornamento
            print("ATTENZIONE: meteo non aggiornato:", e, file=sys.stderr)
    cal = costruisci_calendario(places, a.giorni, meteo, a.soglia_pioggia)
    doc = {"meta": {"generated_at": dt.datetime.now(ROMA).isoformat(timespec="seconds"), "giorni": a.giorni,
                    "stagione_orari": stag, "soglia_pioggia_percento": a.soglia_pioggia,
                    "crowd_hours": G.HOURS, "crowd_source": "stima dimostrativa (per luogo vedi luoghi.*.crowd_source)",
                    "note": "crowd = profilo stimato del luogo x fattore evento (gratuita' 1.5-1.6, festivita' all'aperto 1.15, udienza 1.3 sulla mattina a San Pietro); il profilo del luogo include gia' fattore_wikipedia (trend interesse online 0.85-1.25); 0 = chiuso. "
                            "ore_sconsigliate_pioggia solo per i prossimi 7 giorni (previsione Open-Meteo) e per i luoghi all'aperto. "
                            "Orari di eventi e festivita' calcolati con regole fisse: verificare sui siti ufficiali."},
           "giorni": cal}
    with open(os.path.join(OUT, "calendario.json"), "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print(f"ok: stagione={stag}, giorni={len(cal)}, meteo={'si' if meteo else 'no'}")

if __name__ == "__main__":
    main()
