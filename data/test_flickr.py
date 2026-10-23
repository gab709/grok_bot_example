#!/usr/bin/env python3
"""Test del percorso Flickr con risposte finte (nessuna chiave reale, nessuna rete).
Uso: python3 data/test_flickr.py"""
import json, os, sys, tempfile, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import flickr_profili as F, genera_dataset as G

def fetch_finto(url):
    q = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(url).query))
    assert q["method"] == "flickr.photos.search" and q["extras"] == "date_taken" and "min_taken_date" in q
    pagina, pagine = int(q["page"]), 2
    foto = []
    # Colosseo: 300 foto, picco alle 17 (feriale 2026-10-21 mercoledi', festivo 2026-10-24 sabato); altri luoghi: 20 foto
    n = 150 if abs(float(q["lat"]) - 41.8902) < 1e-4 else 10
    for i in range(n):
        ora = 17 if i % 3 else 9
        giorno = "2026-10-21" if i % 2 else "2026-10-24"
        foto.append({"id": f"{q['lat']}-{pagina}-{i}", "datetaken": f"{giorno} {ora:02d}:15:00", "datetakenunknown": "0"})
    foto.append({"id": "x", "datetaken": "2026-10-21 03:00:00", "datetakenunknown": "1"})  # da scartare
    return {"stat": "ok", "photos": {"page": pagina, "pages": pagine, "photo": foto}}

with tempfile.TemporaryDirectory() as tmp:
    F.FILE = os.path.join(tmp, "flickr_profili.json")
    luoghi = [{"id": p["id"], "lat": p["lat"], "lon": p["lon"], "category": p["category"]} for p in G.P]
    doc = F.aggiorna(luoghi, forza=True, fetch=fetch_finto, pausa=0)
    col = doc["luoghi"]["colosseo"]
    assert col["foto_07_22"] == 300 and col["campione_sufficiente"], col
    assert col["profilo_feriale"][17 - 7] == 100 and col["profilo_feriale"][9 - 7] == 50, col["profilo_feriale"]
    assert not doc["luoghi"]["pantheon"]["campione_sufficiente"]
    G.OUT = tmp  # non sovrascrivere i file veri
    places, _ = G.genera(trend={"colosseo": 1.1}, flickr=doc["luoghi"])
    c = next(p for p in places if p["id"] == "colosseo")
    pa = next(p for p in places if p["id"] == "pantheon")
    assert c["crowd_source"] == "profilo da foto Flickr + stima" and c["crowd_corrections"]["flickr_blend"]
    assert pa["crowd_source"] == "stima dimostrativa"
    assert c["crowd_weekday"][17 - 7] > c["crowd_weekday"][12 - 7] or c["crowd_weekday"][17 - 7] == 0
    print("Colosseo feriale (Flickr finto + stima, trend 1.1):", c["crowd_weekday"])
    print("test Flickr OK")
