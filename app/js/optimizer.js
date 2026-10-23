/**
 * RomaFlow - Ottimizzatore dell'itinerario
 * ------------------------------------------------------------------
 * Euristica semplice e spiegabile:
 *  1. selezione dei luoghi (da vedere + riempimento per interessi);
 *  2. ripartizione sui giorni per vicinanza geografica e giorni di apertura;
 *  3. per ogni giorno: costruzione greedy (inserimento a costo minimo)
 *     + miglioramento locale (spostamento, scambio, 2-opt) finché migliora.
 * Funzione di costo = minuti a piedi + minuti persi in coda/folla
 *                     + peso * livello di folla + attese per apertura + penalità.
 * Rispetta orari di apertura, fine giornata e pausa pranzo.
 * L'itinerario "standard" di confronto parte alle 9:30 e segue l'ordine
 * del vicino più prossimo, ignorando la folla (come una guida classica).
 */
import { crowdAt, openWindow, isClosedOn, toMinutes, hoursFor } from "./data-adapter.js";

const R = 6371;
export function distanceKm(a, b) {
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function travel(a, b, pace, model) {
  const km = distanceKm(a, b) * model.detourFactor;
  const walk = (km / pace.walkSpeedKmh) * 60;
  if (walk > model.transitThresholdMinutes) {
    return { km, minutes: Math.round(model.transitFixedMinutes + (km / model.transitSpeedKmh) * 60), mode: "mezzi" };
  }
  return { km, minutes: Math.max(2, Math.round(walk)), mode: "piedi" };
}

/** Minuti persi in coda / tra la folla a un dato livello di affollamento. */
export const delayFor = (place, crowd) => place.peakDelayMinutes * (crowd / 100) ** 2;

/**
 * Simula una giornata con un ordine fissato.
 * ctx: { data, date, pace, model, startCoord, startMin, endMin, lunchTaken, scenario }
 * scenario (opzionale): { rain:{untilMin}, crowdBoost:{placeId, fromMin, toMin, delta} }
 */
export function simulateDay(order, ctx) {
  const { data, date, pace, model } = ctx;
  const lunchAfter = toMinutes(model.lunchAfter);
  let t = ctx.startMin, loc = ctx.startCoord, lunch = !!ctx.lunchTaken;
  let cost = 0, feasible = true;
  const stops = [];
  const tot = { walk: 0, delay: 0, idle: 0, crowdSum: 0, visits: 0 };
  for (const place of order) {
    const longSpan = t >= 11.5 * 60 && t + place.visitMinutes + 20 > 14.5 * 60;
    if (!lunch && (t >= lunchAfter || longSpan)) {
      stops.push({ type: "lunch", start: t, end: t + pace.lunchMinutes });
      t += pace.lunchMinutes;
      lunch = true;
    }
    const tr = travel(loc, place.coordinates, pace, model);
    const arrive = t + tr.minutes;
    let start = arrive;
    const slots = hoursFor(place, date);
    let ok = false;
    if (slots) {
      for (const [o, c] of slots) {
        const s = Math.max(arrive, o);
        if (s + place.visitMinutes <= c) { start = s; ok = true; break; }
      }
    }
    let crowd = crowdAt(data, place, date, start);
    const cb = ctx.scenario?.crowdBoost;
    if (cb && cb.placeId === place.id && start >= cb.fromMin && start < cb.toMin) crowd = Math.min(100, crowd + cb.delta);
    const delay = delayFor(place, crowd);
    const end = start + delay + place.visitMinutes;
    const idle = start - arrive;
    let penalty = 0;
    if (!ok) { penalty += 1000; feasible = false; }
    if (end > ctx.endMin) { penalty += 300 + (end - ctx.endMin) * 5; feasible = false; }
    const rainHit = !!(ctx.scenario?.rain && !place.indoor && start < ctx.scenario.rain.untilMin);
    if (rainHit) penalty += 120;
    cost += tr.minutes + delay + model.crowdWeight * crowd + idle * model.idleWeight + penalty;
    stops.push({ type: "visit", place, travel: tr, arrive, start, end, idle, crowd, delay, ok, rainHit });
    tot.walk += tr.minutes; tot.delay += delay; tot.idle += idle; tot.crowdSum += crowd; tot.visits++;
    t = end; loc = place.coordinates;
  }
  return { stops, cost, feasible, totals: { ...tot, crowdAvg: tot.visits ? tot.crowdSum / tot.visits : 0, end: t } };
}

/** Greedy: a ogni passo inserisce il luogo nella posizione che aumenta meno il costo. */
function greedyOrder(places, ctx, first) {
  let order = first ? [first] : [];
  const rest = places.filter((p) => p !== first);
  while (rest.length) {
    let best = null;
    for (const p of rest) {
      for (let i = 0; i <= order.length; i++) {
        const cand = [...order.slice(0, i), p, ...order.slice(i)];
        const c = simulateDay(cand, ctx).cost;
        if (!best || c < best.c) best = { c, cand, p };
      }
    }
    order = best.cand;
    rest.splice(rest.indexOf(best.p), 1);
  }
  return order;
}

/** Miglioramento locale: relocate, swap e 2-opt finché il costo scende. */
function localImprove(order, ctx) {
  let best = order, bestC = simulateDay(order, ctx).cost, improved = true, guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    const n = best.length;
    const tryCand = (cand) => {
      const c = simulateDay(cand, ctx).cost;
      if (c < bestC - 0.01) { best = cand; bestC = c; improved = true; }
    };
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const a = [...best]; const [x] = a.splice(i, 1); a.splice(j, 0, x); tryCand(a);
        if (i < j) {
          const s = [...best]; [s[i], s[j]] = [s[j], s[i]]; tryCand(s);
          const r = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)]; tryCand(r);
        }
      }
  }
  return best;
}

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  return arr.flatMap((x, i) => permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
}

export function optimizeDay(places, ctx) {
  if (!places.length) return [];
  // Pochi luoghi: verifica esaustiva (garantisce l'ottimo, < 5040 simulazioni)
  if (places.length <= 6) {
    let best = null;
    for (const o of permutations(places)) {
      const c = simulateDay(o, ctx).cost;
      if (!best || c < best.c) best = { c, o };
    }
    return best.o;
  }
  const starts = [null, ...places.slice(0, 4)];
  let best = null;
  for (const s of starts) {
    const o = localImprove(greedyOrder(places, ctx, s), ctx);
    const c = simulateDay(o, ctx).cost;
    if (!best || c < best.c) best = { c, o };
  }
  return best.o;
}

function nearestNeighborOrder(places, startCoord) {
  const rest = [...places], out = [];
  let loc = startCoord;
  while (rest.length) {
    rest.sort((a, b) => distanceKm(loc, a.coordinates) - distanceKm(loc, b.coordinates));
    const p = rest.shift(); out.push(p); loc = p.coordinates;
  }
  return out;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d;
}

/** Scelta dei luoghi: prima quelli imperdibili, poi quelli che corrispondono agli interessi. */
function selectPlaces(prefs, data, capacity) {
  const must = prefs.mustSee.map((id) => data.placeById[id]).filter(Boolean);
  const others = data.places
    .filter((p) => !prefs.mustSee.includes(p.id))
    .map((p) => {
      const match = p.interests.filter((i) => prefs.interests.includes(i)).length;
      const avgCrowd = p.crowd.tue.slice(9, 18).reduce((a, b) => a + b, 0) / 9;
      return { p, score: match * 100 - avgCrowd * 0.3 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
  const fill = others.slice(0, Math.max(0, capacity - must.length));
  return { must, fill, spare: others.slice(fill.length) };
}

function centroid(places) {
  const n = places.length;
  return { lat: places.reduce((s, p) => s + p.coordinates.lat, 0) / n, lng: places.reduce((s, p) => s + p.coordinates.lng, 0) / n };
}

/** Ripartizione sui giorni: seme sui punti più lontani, poi assegnazione al giorno più vicino aperto. */
function assignDays(places, dates, maxStops, mustIds) {
  const days = dates.map(() => []);
  const sorted = [...places].sort((a, b) => (mustIds.has(b.id) ? 1 : 0) - (mustIds.has(a.id) ? 1 : 0) || b.visitMinutes - a.visitMinutes);
  const minutesOf = (d) => days[d].reduce((s, p) => s + p.visitMinutes, 0);
  for (const p of sorted) {
    let best = null;
    dates.forEach((date, d) => {
      if (isClosedOn(p, date) || days[d].length >= maxStops) return;
      const dist = days[d].length ? distanceKm(centroid(days[d]), p.coordinates) : 1.2;
      const score = dist * 60 + minutesOf(d) * 0.12;
      if (!best || score < best.score) best = { d, score };
    });
    if (best) days[best.d].push(p);
  }
  return days;
}

function dayContext(data, prefs, date, scenario) {
  const pace = data.config.paces.find((p) => p.id === prefs.pace) || data.config.paces[1];
  const area = data.config.startAreas.find((a) => a.id === prefs.startArea) || data.config.startAreas[0];
  return {
    data, date, pace, model: data.config.model, scenario,
    startCoord: area.coordinates, startMin: toMinutes(pace.dayStart), endMin: toMinutes(pace.dayEnd),
  };
}

/** Pianifica l'intero viaggio. Restituisce itinerario ottimizzato, baseline e impatto. */
export function planTrip(prefs, data) {
  const t0 = performance.now();
  const pace = data.config.paces.find((p) => p.id === prefs.pace) || data.config.paces[1];
  const dates = Array.from({ length: prefs.days }, (_, i) => addDays(prefs.startDate, i));
  const capacity = Math.min(prefs.days * pace.maxStops, data.places.length);
  const { must, fill } = selectPlaces(prefs, data, capacity);
  const mustIds = new Set(must.map((p) => p.id));
  const groups = assignDays(must, dates, pace.maxStops, mustIds);
  // riempimento: aggiungi luoghi per interesse solo se vicini a un giorno con posti liberi
  for (const p of fill) {
    let best = null;
    groups.forEach((g, d) => {
      if (g.length >= pace.maxStops || isClosedOn(p, dates[d])) return;
      const dist = g.length ? Math.min(...g.map((q) => distanceKm(q.coordinates, p.coordinates))) : 0.5;
      const load = g.reduce((s, q) => s + q.visitMinutes, 0) + p.visitMinutes;
      if (dist > 2.2 || load > 420) return;
      if (!best || dist < best.dist) best = { d, dist };
    });
    if (best) groups[best.d].push(p);
  }
  const assigned = new Set(groups.flat().map((p) => p.id));
  const skipped = must.filter((p) => !assigned.has(p.id));

  const days = dates.map((date, d) => {
    const ctx = dayContext(data, prefs, date);
    let set = groups[d];
    let order = optimizeDay(set, ctx);
    let sim = simulateDay(order, ctx);
    // Se non entra tutto, togli prima i luoghi non imperdibili
    while (!sim.feasible && set.length > 1) {
      const bad = sim.stops.filter((s) => s.type === "visit" && (!s.ok || s.end > ctx.endMin)).map((s) => s.place);
      const victim = [...bad, ...set].find((p) => !mustIds.has(p.id)) || bad[0] || set[set.length - 1];
      if (mustIds.has(victim.id)) skipped.push(victim);
      set = set.filter((p) => p !== victim);
      order = optimizeDay(set, ctx);
      sim = simulateDay(order, ctx);
    }
    const bctx = { ...ctx, startMin: toMinutes(data.config.model.baselineDayStart), endMin: 24 * 60 };
    const baseline = simulateDay(nearestNeighborOrder(set, ctx.startCoord), bctx);
    return { date, index: d, ctx, order, ...sim, baseline };
  });

  return { prefs, pace, days, skipped, impact: computeImpact(days), elapsedMs: performance.now() - t0 };
}

export function computeImpact(days) {
  let opt = 0, base = 0, peaks = 0, peaksBase = 0, peaksOpt = 0, optCrowd = 0, baseCrowd = 0, n = 0, walkOpt = 0, walkBase = 0;
  for (const d of days) {
    opt += d.totals.delay; base += d.baseline.totals.delay;
    walkOpt += d.totals.walk; walkBase += d.baseline.totals.walk;
    const bmap = Object.fromEntries(d.baseline.stops.filter((s) => s.type === "visit").map((s) => [s.place.id, s]));
    for (const s of d.stops) {
      if (s.type !== "visit") continue;
      const b = bmap[s.place.id];
      optCrowd += s.crowd; baseCrowd += b ? b.crowd : s.crowd; n++;
      if (b && b.crowd >= 60) peaksBase++;
      if (s.crowd >= 60) peaksOpt++;
      if (b && b.crowd >= 60 && s.crowd < 60) peaks++;
    }
  }
  return {
    minutesSaved: Math.max(0, Math.round(base - opt)),
    optDelay: Math.round(opt), baseDelay: Math.round(base),
    crowdReductionPct: baseCrowd ? Math.max(0, Math.round((1 - optCrowd / baseCrowd) * 100)) : 0,
    peaksAvoided: peaks, peaksBase, peaksOpt, visits: n, walkOpt: Math.round(walkOpt), walkBase: Math.round(walkBase),
  };
}

/**
 * Ricalcolo "what-if" sul resto della giornata.
 * doneCount = numero di visite già fatte (restano fisse).
 * kind: "pioggia" | "folla" | "ritardo"
 */
export function replanDay(plan, dayIndex, doneCount, kind, data) {
  const day = plan.days[dayIndex];
  const visits = day.stops.filter((s) => s.type === "visit");
  const done = visits.slice(0, doneCount);
  const remaining = visits.slice(doneCount).map((s) => s.place);
  const last = done[done.length - 1];
  let nowMin = last ? last.end : day.ctx.startMin;
  const lunchTaken = day.stops.some((s) => s.type === "lunch" && s.end <= nowMin);
  const scenario = {};
  let message = "", swapped = null;

  if (kind === "pioggia") {
    scenario.rain = { untilMin: toMinutes(data.config.model.rainUntil) };
    // sostituisci un luogo all'aperto non imperdibile con uno al chiuso libero
    const used = new Set(plan.days.flatMap((d) => d.order.map((p) => p.id)));
    const must = new Set(plan.prefs.mustSee);
    const outdoor = remaining.find((p) => !p.indoor && !must.has(p.id));
    if (outdoor) {
      const alt = data.places
        .filter((p) => p.indoor && !used.has(p.id) && !isClosedOn(p, day.date))
        .sort((a, b) => distanceKm(a.coordinates, outdoor.coordinates) - distanceKm(b.coordinates, outdoor.coordinates))[0];
      if (alt) { remaining.splice(remaining.indexOf(outdoor), 1, alt); swapped = { from: outdoor, to: alt }; }
    }
    message = "Pioggia fino alle " + data.config.model.rainUntil + ": prima i luoghi al coperto";
  } else if (kind === "folla") {
    const target = remaining[0];
    if (target) scenario.crowdBoost = { placeId: target.id, fromMin: nowMin, toMin: nowMin + 180, delta: 55 };
    message = target ? `${target.name} più affollato del previsto: lo spostiamo più tardi` : "";
  } else if (kind === "ritardo") {
    nowMin += 45;
    message = "Sei in ritardo di 45 minuti: riorganizziamo il resto della giornata";
  }

  const ctx = {
    ...day.ctx, scenario, lunchTaken,
    startCoord: last ? last.place.coordinates : day.ctx.startCoord, startMin: nowMin,
  };
  const before = simulateDay(visits.slice(doneCount).map((s) => s.place), ctx);
  let order = optimizeDay(remaining, ctx);
  let sim = simulateDay(order, ctx);
  const dropped = [];
  while (!sim.feasible && order.length > 1) {
    const bad = sim.stops.filter((s) => s.type === "visit" && (!s.ok || s.end > ctx.endMin)).map((s) => s.place);
    const victim = bad.find((p) => !plan.prefs.mustSee.includes(p.id)) || bad[bad.length - 1] || order[order.length - 1];
    dropped.push(victim);
    order = order.filter((p) => p !== victim);
    sim = simulateDay(order, ctx);
  }
  const doneStops = day.stops.filter((s) => s.type !== "visit" ? s.end <= nowMin : done.includes(s));
  const newDay = {
    ...day,
    order: [...done.map((s) => s.place), ...order],
    stops: [...doneStops, ...sim.stops],
    totals: mergeTotals(done, sim.totals),
    replan: { kind, message, target: scenario.crowdBoost?.placeId, nowMin, doneCount, swapped, dropped, saved: Math.max(0, Math.round(before.cost - sim.cost)), delaySaved: Math.max(0, Math.round(before.totals.delay - sim.totals.delay)) },
  };
  const days = plan.days.map((d, i) => (i === dayIndex ? newDay : d));
  return { ...plan, days, impact: computeImpact(days) };
}

function mergeTotals(done, t) {
  const tot = { ...t };
  for (const s of done) { tot.walk += s.travel.minutes; tot.delay += s.delay; tot.crowdSum += s.crowd; tot.visits++; }
  tot.crowdAvg = tot.visits ? tot.crowdSum / tot.visits : 0;
  return tot;
}
