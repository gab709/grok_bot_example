#!/usr/bin/env python3
"""Profili orari di presenza dalle foto pubbliche Flickr (solo libreria standard).

Se la variabile d'ambiente FLICKR_API_KEY e' impostata, per ogni luogo chiama flickr.photos.search
(lat/lon del luogo, raggio ~0.25 km, foto scattate negli ultimi ~3 anni, extras=date_taken), conta le foto
per ora del giorno (07-22) separando feriali e weekend, normalizza a 0-100 e salva data/flickr_profili.json.
Le foto pubbliche sono un INDICATORE della presenza di persone, non un conteggio.
Senza chiave non fa nulla (riga di log). Cache: riscarica al massimo una volta a settimana.

Uso: FLICKR_API_KEY=... python3 data/flickr_profili.py [--forza]
"""
import datetime as dt, json, os, sys, time, urllib.parse, urllib.request
from zoneinfo import ZoneInfo

OUT = os.path.dirname(os.path.abspath(__file__))
FILE = os.path.join(OUT, "flickr_profili.json")
ROMA = ZoneInfo("Europe/Rome")
API = "https://api.flickr.com/services/rest/"
UA = "RomaFlow-hackathon/1.0 (https://github.com/gab709/grok_bot_example)"
HOURS = list(range(7, 23))
CACHE_GIORNI = 7
RAGGIO_KM = {"quartiere": 0.5, "piazza": 0.2}   # default 0.25 km
PER_PAGE, MAX_PAGINE = 250, 16                 # Flickr restituisce al massimo ~4000 risultati per ricerca
PAUSA_S = 1.1                                  # ~1 richiesta al secondo (limite Flickr: 3600/ora)
CAMPIONE_MINIMO = 200                          # sotto questa soglia il profilo non viene usato

def _chiama(params, key, fetch=None):
    q = {"method": "flickr.photos.search", "api_key": key, "format": "json", "nojsoncallback": 1, **params}
    url = f"{API}?{urllib.parse.urlencode(q)}"
    if fetch:  # per i test: funzione finta url -> dict
        return fetch(url)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def conta_foto(lat, lon, raggio_km, key, anni=3, fetch=None, pausa=PAUSA_S):
    """Conta le foto per ora (07-22), separando feriale (lun-ven) e weekend. Restituisce (conteggi, n_totale)."""
    min_taken = (dt.date.today() - dt.timedelta(days=365 * anni)).isoformat()
    cont = {"feriale": [0] * len(HOURS), "festivo": [0] * len(HOURS)}
    n, visti = 0, set()
    for pagina in range(1, MAX_PAGINE + 1):
        d = _chiama({"lat": lat, "lon": lon, "radius": raggio_km, "radius_units": "km", "min_taken_date": min_taken,
                     "extras": "date_taken", "per_page": PER_PAGE, "page": pagina, "content_type": 1}, key, fetch)
        if d.get("stat") != "ok":
            raise RuntimeError(f"Flickr: {d.get('message', d)}")
        foto = d["photos"]["photo"]
        for f in foto:
            if f["id"] in visti or not f.get("datetaken"):
                continue
            visti.add(f["id"])
            if f.get("datetakenunknown") in ("1", 1):
                continue  # data di scatto sconosciuta
            t = dt.datetime.strptime(f["datetaken"][:19], "%Y-%m-%d %H:%M:%S")  # ora locale della fotocamera
            n += 1
            if t.hour in HOURS:
                cont["festivo" if t.weekday() >= 5 else "feriale"][t.hour - 7] += 1
        if pagina >= int(d["photos"].get("pages", 1)) or not foto:
            break
        time.sleep(pausa)
    return cont, n

def normalizza(v):
    m = max(v) or 1
    return [round(100 * x / m) for x in v]

def aggiorna(luoghi, forza=False, log=print, fetch=None, pausa=PAUSA_S):
    """luoghi: lista di dict con id, lat, lon, category. Restituisce il documento (dalla cache o nuovo) o None."""
    key = os.environ.get("FLICKR_API_KEY", "").strip()
    cache = None
    if os.path.exists(FILE):
        try:
            cache = json.load(open(FILE, encoding="utf-8"))
        except Exception:
            cache = None
    if not key and not fetch:
        log("Flickr: FLICKR_API_KEY non impostata, salto (uso la cache se presente)" if cache else "Flickr: FLICKR_API_KEY non impostata, salto")
        return cache
    # eta' da meta.fetched_at, non dalla data del file (il checkout di GitHub Actions la rinnova)
    eta_s = (dt.datetime.now(ROMA) - dt.datetime.fromisoformat(cache["meta"]["fetched_at"])).total_seconds() if cache else None
    if cache and not forza and eta_s < CACHE_GIORNI * 86400:
        log(f"Flickr: uso la cache (meno di {CACHE_GIORNI} giorni)")
        return cache
    out = {}
    for l in luoghi:
        r = RAGGIO_KM.get(l["category"], 0.25)
        try:
            cont, n = conta_foto(l["lat"], l["lon"], r, key or "TEST", fetch=fetch, pausa=pausa)
        except Exception as e:
            log(f"Flickr: errore su {l['id']}: {e}")
            continue
        n_fascia = sum(cont["feriale"]) + sum(cont["festivo"])
        out[l["id"]] = {"raggio_km": r, "foto_totali": n, "foto_07_22": n_fascia,
                        "conteggi": cont, "profilo_feriale": normalizza(cont["feriale"]), "profilo_festivo": normalizza(cont["festivo"]),
                        "campione_sufficiente": n_fascia >= CAMPIONE_MINIMO}
    doc = {"meta": {"fonte": "Flickr API flickr.photos.search (https://www.flickr.com/services/api/flickr.photos.search.html)",
                    "fetched_at": dt.datetime.now(ROMA).isoformat(timespec="seconds"),
                    "nota": "foto pubbliche come indicatore della presenza di persone (non un conteggio di visitatori)",
                    "metodo": f"foto geolocalizzate nel raggio indicato, scattate negli ultimi 3 anni; conteggio per ora di scatto "
                              f"(ora della fotocamera) 07-22, feriale = lun-ven, festivo = sab-dom; profilo = conteggio / massimo x 100. "
                              f"Usato solo se foto_07_22 >= {CAMPIONE_MINIMO}.",
                    "campione_minimo": CAMPIONE_MINIMO, "hours": HOURS},
           "luoghi": out}
    if out:
        with open(FILE, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=1)
        log(f"Flickr: profili salvati per {len(out)} luoghi")
    return doc

if __name__ == "__main__":
    sys.path.insert(0, OUT)
    import genera_dataset as G
    aggiorna([{"id": p["id"], "lat": p["lat"], "lon": p["lon"], "category": p["category"]} for p in G.P], forza="--forza" in sys.argv)
