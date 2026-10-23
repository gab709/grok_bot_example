#!/usr/bin/env python3
"""Interesse online per i luoghi, dalle visualizzazioni delle pagine Wikipedia (it + en).

Fonte: Wikimedia REST API "pageviews per-article" (gratuita, senza chiave; richiede uno User-Agent
descrittivo). Misura l'INTERESSE ONLINE, non le persone presenti sul posto: lo usiamo solo come
fattore di tendenza, limitato, sulla stima di affollamento.

Uso: python3 data/wikipedia_interesse.py [--forza]   (solo libreria standard)
"""
import datetime as dt, json, os, sys, time, urllib.parse, urllib.request
from statistics import mean
from zoneinfo import ZoneInfo

OUT = os.path.dirname(os.path.abspath(__file__))
FILE = os.path.join(OUT, "wikipedia_interesse.json")
ROMA = ZoneInfo("Europe/Rome")
UA = "RomaFlow-hackathon/1.0 (https://github.com/gab709/grok_bot_example; prototipo itinerari Roma) python-urllib"
API = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/{proj}/all-access/user/{title}/daily/{start}/{end}"
CACHE_ORE = 20          # i dati Wikipedia sono giornalieri: non riscaricare prima di 20 ore
TREND_MIN, TREND_MAX = 0.85, 1.25

# id luogo -> (titolo it.wikipedia, titolo en.wikipedia). Titoli verificati con l'API MediaWiki (nessun redirect).
TITOLI = {
    "colosseo": ("Colosseo", "Colosseum"),
    "foro_romano_palatino": ("Foro_Romano", "Roman_Forum"),
    "pantheon": ("Pantheon_(Roma)", "Pantheon,_Rome"),
    "fontana_di_trevi": ("Fontana_di_Trevi", "Trevi_Fountain"),
    "musei_vaticani": ("Musei_Vaticani", "Vatican_Museums"),
    "basilica_san_pietro": ("Basilica_di_San_Pietro_in_Vaticano", "St._Peter's_Basilica"),
    "piazza_navona": ("Piazza_Navona", "Piazza_Navona"),
    "piazza_di_spagna": ("Piazza_di_Spagna", "Piazza_di_Spagna"),
    "galleria_borghese": ("Galleria_Borghese", "Galleria_Borghese"),
    "castel_santangelo": ("Castel_Sant'Angelo", "Castel_Sant'Angelo"),
    "trastevere": ("Trastevere", "Trastevere"),
    "campo_de_fiori": ("Campo_de'_Fiori", "Campo_de'_Fiori"),
    "bocca_della_verita": ("Bocca_della_Verità", "Bocca_della_Verità"),
    "terme_di_caracalla": ("Terme_di_Caracalla", "Baths_of_Caracalla"),
    "musei_capitolini": ("Musei_Capitolini", "Capitoline_Museums"),
}
GIORNI_SETT = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"]

def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def scarica_serie(proj, title, start, end):
    """{ 'YYYY-MM-DD': visualizzazioni } per un articolo (solo utenti umani, tutti gli accessi)."""
    url = API.format(proj=proj, title=urllib.parse.quote(title, safe=""), start=start.strftime("%Y%m%d"), end=end.strftime("%Y%m%d"))
    d = _get(url)
    return {f"{i['timestamp'][:4]}-{i['timestamp'][4:6]}-{i['timestamp'][6:8]}": i["views"] for i in d.get("items", [])}

def calcola(serie):
    """Indici da una serie giornaliera {data: views} (it+en sommati)."""
    giorni = sorted(serie)
    v = [serie[g] for g in giorni]
    media_anno = mean(v)
    m7, m30 = mean(v[-7:]), mean(v[-30:])
    idx7, idx30 = m7 / media_anno, m30 / media_anno
    # profilo per giorno della settimana: media per weekday / media generale (1.0 = medio)
    per_wd = {k: [] for k in range(7)}
    for g, x in zip(giorni, v):
        per_wd[dt.date.fromisoformat(g).weekday()].append(x)
    profilo = {GIORNI_SETT[k]: round(mean(xs) / media_anno, 3) for k, xs in per_wd.items() if xs}
    # trend: media pesata 30/7 giorni rispetto all'anno, smorzata del 50% e limitata a [0.85, 1.25]
    grezzo = 0.7 * idx30 + 0.3 * idx7
    trend = max(TREND_MIN, min(TREND_MAX, 1 + 0.5 * (grezzo - 1)))
    return {"giorni": len(v), "dal": giorni[0], "al": giorni[-1], "media_giornaliera_anno": round(media_anno, 1),
            "media_ultimi_7": round(m7, 1), "media_ultimi_30": round(m30, 1),
            "indice_7_giorni": round(idx7, 3), "indice_30_giorni": round(idx30, 3),
            "profilo_giorno_settimana": profilo, "trend_grezzo": round(grezzo, 3), "fattore_trend": round(trend, 3)}

def eta_ore_documento(doc):
    """Eta' della cache in ore, letta da meta.fetched_at (NON dalla data del file: in GitHub Actions
    il checkout rinnova la data di modifica di tutti i file)."""
    t = dt.datetime.fromisoformat(doc["meta"]["fetched_at"])
    return (dt.datetime.now(ROMA) - t).total_seconds() / 3600

def aggiorna(forza=False, log=print):
    """Scarica (se la cache e' vecchia) e salva wikipedia_interesse.json. Restituisce il documento o None."""
    if not forza and os.path.exists(FILE):
        try:
            doc = json.load(open(FILE, encoding="utf-8"))
            eta_ore = eta_ore_documento(doc)
            if eta_ore < CACHE_ORE:
                log(f"Wikipedia: uso la cache ({eta_ore:.1f} h < {CACHE_ORE} h)")
                return doc
        except Exception:
            pass
    oggi = dt.datetime.now(dt.timezone.utc).date()
    end, start = oggi - dt.timedelta(days=1), oggi - dt.timedelta(days=365)
    luoghi, errori = {}, []
    for pid, (it, en) in TITOLI.items():
        tot, dettaglio = {}, {}
        for proj, title in (("it.wikipedia", it), ("en.wikipedia", en)):
            try:
                s = scarica_serie(proj, title, start, end)
                dettaglio[proj] = {"titolo": title, "totale_periodo": sum(s.values()),
                                   "url": f"https://{proj}.org/wiki/{urllib.parse.quote(title)}"}
                for g, x in s.items(): tot[g] = tot.get(g, 0) + x
            except Exception as e:
                errori.append(f"{pid}/{proj}: {e}")
            time.sleep(0.1)  # cortesia verso l'API
        if len(tot) >= 60:
            luoghi[pid] = {**calcola(tot), "articoli": dettaglio}
    if not luoghi:
        raise RuntimeError("nessuna serie Wikipedia scaricata: " + "; ".join(errori[:3]))
    doc = {"meta": {
        "fonte": "Wikimedia REST API - Pageviews per articolo (utenti umani, tutti gli accessi), it.wikipedia + en.wikipedia",
        "url_api": "https://wikimedia.org/api/rest_v1/#/Pageviews%20data",
        "esempio_url": API.format(proj="it.wikipedia", title="Colosseo", start=start.strftime("%Y%m%d"), end=end.strftime("%Y%m%d")),
        "licenza": "dati Wikimedia, CC0",
        "fetched_at": dt.datetime.now(ROMA).isoformat(timespec="seconds"),
        "nota": "Misura l'INTERESSE ONLINE (visite alle pagine Wikipedia), NON le persone presenti sul posto. "
                "Usato solo come fattore di tendenza limitato (0.85-1.25) sulla stima di affollamento.",
        "metodo": "indice_N = media ultimi N giorni / media dell'anno; trend_grezzo = 0.7*indice_30 + 0.3*indice_7; "
                  "fattore_trend = 1 + 0.5*(trend_grezzo - 1), limitato a [0.85, 1.25]. "
                  "profilo_giorno_settimana = media per giorno / media dell'anno (1 = medio).",
        "errori": errori},
        "luoghi": luoghi}
    with open(FILE, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    log(f"Wikipedia: aggiornati {len(luoghi)} luoghi, errori {len(errori)}")
    return doc

def fattori_trend(doc):
    return {pid: v["fattore_trend"] for pid, v in (doc or {}).get("luoghi", {}).items()}

if __name__ == "__main__":
    d = aggiorna(forza="--forza" in sys.argv)
    for pid, v in sorted(d["luoghi"].items(), key=lambda kv: -kv[1]["media_ultimi_30"]):
        print(f"{pid:22} anno={v['media_giornaliera_anno']:8.0f}/g  7g={v['indice_7_giorni']:.2f} 30g={v['indice_30_giorni']:.2f} trend={v['fattore_trend']}")
