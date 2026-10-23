/**
 * RomaFlow - applicazione (stato, schermate, interazioni).
 * Parametri URL utili per demo e test automatici (vedi docs/03-guida-demo.md):
 *   ?demo=1            precompila le preferenze con lo scenario dimostrativo
 *   &screen=prefs|plan|impact   apre direttamente una schermata (plan/impact generano l'itinerario)
 *   &fast=1            salta le animazioni di caricamento (overlay)
 *   &date=2026-11-03 &days=2 &start=centro-storico &pace=equilibrato
 *   &must=colosseo,pantheon &interests=arte,cibo
 */
import { loadData, fmtTime, weekdayKey, WEEKDAY_LABELS } from "./data-adapter.js";
import { planTrip, replanDay } from "./optimizer.js";
import { crowdClass, crowdLabel, sparkline, dayCurve, heatmap } from "./charts.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const app = $("#app");
const params = new URLSearchParams(location.search);
const FAST = params.get("fast") === "1" || matchMedia("(prefers-reduced-motion: reduce)").matches;

const DEMO_PREFS = {
  startDate: "2026-11-03",
  days: 2,
  startArea: "centro-storico",
  pace: "equilibrato",
  mustSee: ["colosseo", "foro_romano_palatino", "fontana_di_trevi", "pantheon", "musei_vaticani", "basilica_san_pietro"],
  interests: ["storia-antica", "arte", "cibo"],
};

function nextTuesday() {
  const d = new Date();
  d.setDate(d.getDate() + ((2 - d.getDay() + 7) % 7 || 7));
  return d.toISOString().slice(0, 10);
}
const defaultPrefs = () => ({ startDate: nextTuesday(), days: 2, startArea: "centro-storico", pace: "equilibrato", mustSee: [], interests: [] });

const state = { data: null, prefs: defaultPrefs(), plan: null, original: null, day: 0, screen: "home", whatif: null, heatPlace: null };

/* ------------------------------------------------------------------ */
async function init() {
  try {
    state.data = await loadData();
  } catch (e) {
    app.innerHTML = `<div class="boot">Errore nel caricamento dei dati: ${e.message}</div>`;
    console.error(e);
    return;
  }
  const badge = $('[data-testid="badge-demo-data"]');
  badge.title = "Livelli di affollamento: stime dimostrative, non misure reali. Orari, prenotazioni e visitatori annui da fonti pubbliche (vedi app/data/SCHEMA.md).";
  applyUrlParams();
  bindChrome();
  const target = params.get("screen");
  if (target === "plan" || target === "impact") { generate(true).then(() => target === "impact" && go("impact")); }
  else go(target === "prefs" ? "prefs" : "home");
}

function applyUrlParams() {
  if (params.get("demo") === "1") state.prefs = { ...DEMO_PREFS };
  const p = state.prefs;
  if (params.get("date")) p.startDate = params.get("date");
  if (params.get("days")) p.days = Math.max(1, Math.min(4, +params.get("days")));
  if (params.get("start")) p.startArea = params.get("start");
  if (params.get("pace")) p.pace = params.get("pace");
  if (params.get("must")) p.mustSee = params.get("must").split(",").filter((id) => state.data.placeById[id]);
  if (params.get("interests")) p.interests = params.get("interests").split(",");
}

function bindChrome() {
  $('[data-testid="brand-home"]').onclick = () => go("home");
  $("#btn-reset").onclick = reset;
  $$(".steps button").forEach((b) => (b.onclick = () => go(b.dataset.step)));
}

function reset() {
  state.prefs = params.get("demo") === "1" ? { ...DEMO_PREFS } : defaultPrefs();
  state.plan = state.original = null;
  state.whatif = null; state.day = 0; state.heatPlace = null;
  go("home");
  toast("↺ Ricominciamo da capo");
}

function go(screen) {
  if ((screen === "plan" || screen === "impact") && !state.plan) screen = "prefs";
  state.screen = screen;
  $$(".steps button").forEach((b) => {
    b.classList.toggle("active", b.dataset.step === screen);
    b.disabled = (b.dataset.step === "plan" || b.dataset.step === "impact") && !state.plan;
  });
  document.body.dataset.screen = screen;
  window.scrollTo({ top: 0, behavior: "instant" });
  ({ home: renderHome, prefs: renderPrefs, plan: renderPlan, impact: renderImpact })[screen]();
}

/* ------------------------------------------------------------------ HOME */
function renderHome() {
  const col = state.data.placeById.colosseo || state.data.places[0];
  const row = col.crowd.tue;
  app.innerHTML = `
  <section class="screen home" data-testid="screen-home">
    <div class="hero">
      <div>
        <span class="eyebrow">Pianificatore di viaggio · Roma</span>
        <h1>Roma al<br><em>momento giusto.</em></h1>
        <p class="lead">RomaFlow conosce in anticipo quando il Colosseo, la Fontana di Trevi o i Musei Vaticani saranno affollati, e costruisce l'itinerario che ti fa vedere di più facendo meno fila.</p>
        <div class="hero-ctas">
          <button class="btn-primary" data-testid="cta-start">Pianifica il tuo viaggio <span class="arrow">→</span></button>
          <button class="btn-ghost" data-testid="cta-demo">✨ Prova con l'esempio</button>
        </div>
        <div class="hero-stats">
          <div><b>${state.data.places.length}</b><span>luoghi iconici</span></div>
          <div><b>16 × 7</b><span>fasce orarie a settimana</span></div>
          <div><b>1 tap</b><span>per ricalcolare la giornata</span></div>
        </div>
      </div>
      <div class="card preview" aria-hidden="true">
        <div class="mini-route">✓ Ora migliore: 08:30</div>
        <div class="preview-head"><div><h3>${col.emoji} ${col.name}</h3><small>Affollamento tipico · martedì</small></div><span class="crowd low">Ora: bassa</span></div>
        ${dayCurve(row, 8.75 * 60, 11.5 * 60)}
        <div class="best"><div class="good"><small>Con RomaFlow</small><b>08:30 · coda breve</b></div><div class="bad"><small>Come tutti</small><b>11:30 · picco</b></div></div>
      </div>
      <div class="sun"></div>
      <div class="skyline">${skylineSvg()}</div>
    </div>
  </section>`;
  $('[data-testid="cta-start"]').onclick = () => go("prefs");
  $('[data-testid="cta-demo"]').onclick = () => { state.prefs = { ...DEMO_PREFS }; go("prefs"); };
}

function skylineSvg() {
  return `<svg viewBox="0 0 1440 190" preserveAspectRatio="xMidYMax slice">
  <defs><linearGradient id="sk" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#1a2847"/><stop offset="1" stop-color="#0b1426"/></linearGradient>
  <linearGradient id="sk2" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#22345c" stop-opacity=".7"/><stop offset="1" stop-color="#0b1426"/></linearGradient></defs>
  <path fill="url(#sk2)" d="M0 150 L80 150 L80 120 L120 120 L130 100 L140 120 L200 120 L200 140 L260 140 Q300 80 340 140 L420 140 L430 110 L436 110 L446 140 L520 140 L520 125 L600 125 L600 145 L700 145 L720 112 L740 145 L860 145 L860 128 L960 128 L960 146 L1100 146 L1110 118 L1120 146 L1230 146 L1240 125 L1300 125 L1300 146 L1440 146 L1440 190 L0 190Z"/>
  <g fill="url(#sk)">
    <path d="M0 170 L60 170 L60 150 L150 150 L150 165 L230 165 L232 130 Q236 120 240 130 L242 165 L330 165 L330 150 L380 150 L380 165 L400 165 L400 190 L0 190Z"/>
    <!-- San Pietro -->
    <path d="M430 190 L430 150 L470 150 L470 128 L486 128 Q490 76 530 70 L530 58 L534 50 L538 58 L538 70 Q578 76 582 128 L598 128 L598 150 L640 150 L640 190Z"/>
    <!-- cipressi -->
    <path d="M680 190 Q676 140 686 112 Q696 140 692 190Z M705 190 Q701 150 710 126 Q719 150 715 190Z"/>
    <!-- Colosseo -->
    <path d="M820 190 L820 112 Q900 96 1000 104 L1000 120 L1012 120 L1012 190Z"/>
    <path d="M1060 190 L1060 160 L1120 160 L1120 142 L1180 142 L1180 165 L1250 165 L1254 120 L1262 120 L1266 165 L1340 165 L1340 150 L1440 150 L1440 190Z"/>
  </g>
  <g fill="#0b1426" opacity=".9">${Array.from({ length: 8 }, (_, i) => `<path d="M${830 + i * 22} 190 L${830 + i * 22} 160 Q${839 + i * 22} 148 ${848 + i * 22} 160 L${848 + i * 22} 190Z"/><path d="M${832 + i * 22} 146 L${832 + i * 22} 132 Q${839 + i * 22} 122 ${846 + i * 22} 132 L${846 + i * 22} 146Z"/>`).join("")}</g>
  <g fill="#e3b866" opacity=".55">${Array.from({ length: 14 }, (_, i) => `<circle cx="${60 + i * 101}" cy="${176 - (i % 3) * 6}" r="1.6"/>`).join("")}</g>
  </svg>`;
}

/* ------------------------------------------------------------------ PREFS */
function renderPrefs() {
  const { data, prefs } = state;
  const cfg = data.config;
  app.innerHTML = `
  <section class="screen wrap" data-testid="screen-prefs">
    <div class="page-head">
      <div><span class="eyebrow">Passo 1 di 3</span><h2>Raccontaci il tuo viaggio</h2>
      <p>Poche scelte: al resto pensano i dati sui flussi di persone, gli orari e le prenotazioni.</p></div>
    </div>
    <div class="prefs-grid">
      <div>
        <div class="card panel">
          <h3>Quando arrivi</h3>
          <div class="field">
            <input type="date" class="date-input" data-testid="input-date" value="${prefs.startDate}" aria-label="Data di inizio" />
            <div class="stepper" aria-label="Numero di giorni">
              <button data-testid="days-minus" aria-label="Un giorno in meno">−</button>
              <output data-testid="days-value">${prefs.days} ${prefs.days === 1 ? "giorno" : "giorni"}</output>
              <button data-testid="days-plus" aria-label="Un giorno in più">+</button>
            </div>
          </div>
        </div>
        <div class="card panel">
          <h3>Dove alloggi</h3>
          <div class="chips">${cfg.startAreas.map((a) => `<button class="chip ${prefs.startArea === a.id ? "on" : ""}" data-area="${a.id}" data-testid="area-${a.id}">${a.emoji} ${a.name}</button>`).join("")}</div>
        </div>
        <div class="card panel">
          <h3>Il tuo ritmo</h3>
          <div class="seg">${cfg.paces.map((p) => `<button class="${prefs.pace === p.id ? "on" : ""}" data-pace="${p.id}" data-testid="pace-${p.id}"><span>${p.emoji}</span><b>${p.name}</b><small>${p.description}</small></button>`).join("")}</div>
        </div>
        <div class="card panel">
          <h3>Cosa ti appassiona</h3>
          <div class="chips">${cfg.interests.map((i) => `<button class="chip ${prefs.interests.includes(i.id) ? "on" : ""}" data-interest="${i.id}" data-testid="interest-${i.id}">${i.emoji} ${i.name}</button>`).join("")}</div>
        </div>
      </div>
      <div class="card panel">
        <h3>Da vedere assolutamente <span class="count" data-testid="must-count"></span></h3>
        <div class="places-grid">${data.places.map(placeCard).join("")}</div>
      </div>
    </div>
    <div class="card generate-bar">
      <div class="summary" data-testid="prefs-summary"></div>
      <button class="btn-primary" data-testid="btn-generate">Genera il mio itinerario <span class="arrow">→</span></button>
    </div>
  </section>`;

  const updateSummary = () => {
    const d = new Date(prefs.startDate + "T12:00:00");
    const area = cfg.startAreas.find((a) => a.id === prefs.startArea);
    $('[data-testid="must-count"]').textContent = `${prefs.mustSee.length} selezionati`;
    $('[data-testid="prefs-summary"]').innerHTML = `<b>${prefs.days} ${prefs.days === 1 ? "giorno" : "giorni"}</b> da ${d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })} · partenza da <b>${area?.name || "-"}</b> · <b>${prefs.mustSee.length}</b> luoghi imperdibili`;
  };
  updateSummary();

  $('[data-testid="input-date"]').onchange = (e) => { prefs.startDate = e.target.value || prefs.startDate; updateSummary(); };
  const setDays = (n) => { prefs.days = Math.max(1, Math.min(4, n)); $('[data-testid="days-value"]').textContent = `${prefs.days} ${prefs.days === 1 ? "giorno" : "giorni"}`; updateSummary(); };
  $('[data-testid="days-minus"]').onclick = () => setDays(prefs.days - 1);
  $('[data-testid="days-plus"]').onclick = () => setDays(prefs.days + 1);
  $$("[data-area]").forEach((b) => (b.onclick = () => { prefs.startArea = b.dataset.area; $$("[data-area]").forEach((x) => x.classList.toggle("on", x === b)); updateSummary(); }));
  $$("[data-pace]").forEach((b) => (b.onclick = () => { prefs.pace = b.dataset.pace; $$("[data-pace]").forEach((x) => x.classList.toggle("on", x === b)); }));
  $$("[data-interest]").forEach((b) => (b.onclick = () => { toggle(prefs.interests, b.dataset.interest); b.classList.toggle("on"); }));
  $$("[data-place]").forEach((b) => (b.onclick = () => { toggle(prefs.mustSee, b.dataset.place); b.classList.toggle("on"); b.setAttribute("aria-pressed", b.classList.contains("on")); updateSummary(); }));
  $('[data-testid="btn-generate"]').onclick = () => generate();
}

const toggle = (arr, v) => { const i = arr.indexOf(v); i >= 0 ? arr.splice(i, 1) : arr.push(v); };
const fmtVisitors = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(".", ",") + " mln" : Math.round(n / 1000) + "k");

function placeCard(p) {
  const on = state.prefs.mustSee.includes(p.id);
  const row = p.crowd[weekdayKey(new Date(state.prefs.startDate + "T12:00:00"))];
  return `<button class="place-card ${on ? "on" : ""}" data-place="${p.id}" data-testid="place-${p.id}" aria-pressed="${on}">
    <span class="check">✓</span>
    <span class="emoji">${p.emoji}</span>
    <h4>${p.name}</h4>
    <p>${p.description}</p>
    ${sparkline(row)}
    <span class="tags">
      ${p.bookingRequired ? `<span class="tag book" title="${esc(p.bookingNote)}">🎟️ Prenotazione</span>` : ""}
      ${p.annualVisitors ? `<span class="tag" title="Visitatori ${p.annualVisitorsYear} · ${esc(p.annualVisitorsNote)}">👥 ${fmtVisitors(p.annualVisitors)}/anno</span>` : ""}
      <span class="tag">⏱ ${p.visitMinutes} min</span>
    </span>
  </button>`;
}
const esc = (s) => String(s || "").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/* ------------------------------------------------------------------ GENERATE */
async function generate(silent = false) {
  const { prefs, data } = state;
  if (!prefs.mustSee.length && !prefs.interests.length) {
    toast("Scegli almeno un luogo da vedere o un interesse");
    return;
  }
  const plan = planTrip(prefs, data);
  state.plan = state.original = plan;
  state.day = 0; state.whatif = null; state.heatPlace = null;
  if (!silent && !FAST) {
    await overlay("Costruisco il tuo itinerario", [
      `Leggo ${data.places.length * 16 * 7} fasce orarie di affollamento`,
      "Controllo orari di apertura e prenotazioni",
      `Provo gli ordini possibili per ${prefs.days} ${prefs.days === 1 ? "giorno" : "giorni"}`,
      `Evito i picchi: −${plan.impact.minutesSaved} minuti di coda`,
    ]);
  }
  go("plan");
}

function overlay(title, steps, stepMs = 420) {
  const el = $("#overlay");
  $("#overlay-title").textContent = title;
  $("#overlay-steps").innerHTML = steps.map((s) => `<li>${s}</li>`).join("");
  el.hidden = false;
  const lis = $$("#overlay-steps li");
  return new Promise((res) => {
    lis.forEach((li, i) => setTimeout(() => li.classList.add("show"), 200 + i * stepMs));
    setTimeout(() => { el.hidden = true; res(); }, 300 + steps.length * stepMs + 250);
  });
}

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  t.style.animation = "none"; void t.offsetWidth; t.style.animation = "";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

/* ------------------------------------------------------------------ PLAN */
let map, mapLayer;
function renderPlan() {
  const { plan } = state;
  const imp = plan.impact;
  app.innerHTML = `
  <section class="screen wrap" data-testid="screen-plan">
    <div class="page-head">
      <div><span class="eyebrow">Passo 2 di 3</span><h2>Il tuo itinerario</h2>
      <p>Ordinato per arrivare nei luoghi quando c'è meno gente, rispettando orari e prenotazioni.</p></div>
      <button class="btn-primary btn-gold" data-testid="btn-impact">Quanto tempo risparmi? <span class="arrow">→</span></button>
    </div>
    <div class="kpis">
      <div class="card kpi hl"><small>Coda evitata</small><b data-testid="kpi-saved"><span data-count="${imp.minutesSaved}">0</span> min</b><button data-testid="kpi-impact" aria-label="Vedi l'impatto"></button></div>
      <div class="card kpi"><small>Folla media</small><b>−<span data-count="${imp.crowdReductionPct}">0</span>%</b></div>
      <div class="card kpi" title="Visite in fascia con folla ≥ 60/100"><small>Visite all'ora di punta</small><b data-testid="kpi-peaks">${imp.peaksOpt} <span style="font-size:17px;color:var(--muted)">invece di ${imp.peaksBase}</span></b></div>
      <div class="card kpi"><small>Tappe</small><b>${plan.days.reduce((s, d) => s + d.order.length, 0)} in ${plan.days.length} ${plan.days.length === 1 ? "giorno" : "giorni"}</b></div>
    </div>
    <div class="plan-grid">
      <div>
        <div class="day-tabs" role="tablist">${plan.days.map((d, i) => `<button class="day-tab ${i === state.day ? "on" : ""}" data-day="${i}" data-testid="day-tab-${i + 1}" role="tab"><b>Giorno ${i + 1}</b><small>${d.date.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" })} · ${d.order.length} tappe</small></button>`).join("")}</div>
        <div class="timeline" data-testid="timeline"></div>
        ${plan.skipped.length ? `<div class="skipped">⚠️ Non entrano nel tempo disponibile: ${plan.skipped.map((p) => p.name).join(", ")}. Aggiungi un giorno o scegli un ritmo più intenso.</div>` : ""}
      </div>
      <div class="side">
        <div id="map" class="map" data-testid="map"></div>
        <div class="card whatif" data-testid="whatif-panel"></div>
      </div>
    </div>
  </section>`;
  countUp();
  $('[data-testid="btn-impact"]').onclick = () => go("impact");
  $('[data-testid="kpi-impact"]').onclick = () => go("impact");
  $$("[data-day]").forEach((b) => (b.onclick = () => { state.day = +b.dataset.day; $$("[data-day]").forEach((x) => x.classList.toggle("on", x === b)); renderDay(); }));
  initMap();
  renderDay();
}

function renderDay(changedIds = new Set()) {
  const day = state.plan.days[state.day];
  const rp = day.replan;
  const doneCount = rp ? rp.doneCount : 0;
  let n = 0, html = "";
  day.stops.forEach((s, idx) => {
    if (s.type === "lunch") {
      html += `<div class="tl-item" data-key="lunch"><div class="tl-time"><b>${fmtTime(s.start)}</b></div>
        <div class="stop lunch"><span class="num">🍝</span><div><h4>Pausa pranzo</h4><div class="meta"><span>${Math.round(s.end - s.start)} min · trattoria vicina, lontano dai flussi</span></div></div></div></div>`;
      return;
    }
    n++;
    const p = s.place;
    const done = rp && n <= doneCount;
    const tr = s.travel;
    html += `<div class="leg" data-key="leg-${p.id}"><div></div><div>${tr.mode === "mezzi" ? "🚇" : "🚶"} ${tr.minutes} min ${tr.mode === "mezzi" ? "con i mezzi" : "a piedi"} · ${tr.km.toFixed(1).replace(".", ",")} km</div></div>`;
    const why = whyText(s, day);
    html += `<div class="tl-item" data-key="${p.id}" data-testid="stop-${n}">
      <div class="tl-time"><b>${fmtTime(s.start)}</b><small>fino ${fmtTime(s.end)}</small></div>
      <div class="stop ${done ? "done" : ""} ${changedIds.has(p.id) ? "changed" : ""}">
        <span class="num">${n}</span>
        <div><h4>${p.emoji} ${p.name}</h4>
          <div class="meta"><span>⏱ ${p.visitMinutes} min</span><span>⏳ ${Math.round(s.delay)} min di coda</span>${p.bookingRequired ? `<span title="${esc(p.bookingNote)}">🎟️ Prenota la fascia delle ${fmtTime(Math.floor(s.start / 15) * 15)}</span>` : ""}${p.indoor ? "<span>🏠 Al coperto</span>" : ""}</div>
          ${why ? `<div class="why">${why}</div>` : ""}
        </div>
        <span class="crowd ${crowdClass(s.crowd)}" title="Livello di folla previsto (stima dimostrativa)">${crowdLabel(s.crowd)} · ${Math.round(s.crowd)}</span>
      </div></div>`;
  });
  $('[data-testid="timeline"]').innerHTML = html;
  renderWhatIf();
  drawRoute(day, doneCount);
}

function whyText(s, day) {
  const b = day.baseline.stops.find((x) => x.type === "visit" && x.place.id === s.place.id);
  if (s.rainHit) return "☔ All'aperto durante la pioggia";
  if (b && b.crowd - s.crowd >= 15) return `✨ ${Math.round(b.crowd - s.crowd)} punti di folla in meno rispetto alle ${fmtTime(b.start)}`;
  if (s.idle > 5) return `🕗 Arrivi all'apertura, prima dei gruppi`;
  return "";
}

function renderWhatIf() {
  const panel = $('[data-testid="whatif-panel"]');
  const day = state.plan.days[state.day];
  const orig = state.original.days[state.day];
  const firstVisit = orig.stops.find((s) => s.type === "visit");
  const afterFirst = firstVisit ? fmtTime(firstVisit.end) : "";
  const rp = day.replan;
  panel.innerHTML = `
    <h3><span class="live"></span> Imprevisti in tempo reale</h3>
    <p>Simula cosa succede durante il giorno ${state.day + 1}: RomaFlow ricalcola il resto della giornata.</p>
    <div class="whatif-btns">
      <button data-whatif="pioggia" data-testid="whatif-pioggia" class="${state.whatif === "pioggia" ? "on" : ""}"><span>🌧️</span>Sta piovendo</button>
      <button data-whatif="folla" data-testid="whatif-folla" class="${state.whatif === "folla" ? "on" : ""}"><span>👥</span>${firstVisit ? firstVisit.place.name.split(" ")[0] : "Luogo"} affollato ora</button>
      <button data-whatif="ritardo" data-testid="whatif-ritardo" class="${state.whatif === "ritardo" ? "on" : ""}"><span>⏰</span>In ritardo di 45'</button>
    </div>
    ${rp ? `<div class="replan-note" data-testid="replan-note"><span>🔄</span><div><b>Itinerario ricalcolato alle ${fmtTime(rp.nowMin)}.</b><br>${rp.message}${rp.swapped ? `. ${rp.swapped.from.name} → <b>${rp.swapped.to.name}</b> (al coperto)` : ""}${rp.dropped.length ? `. Rimandato: ${rp.dropped.map((p) => p.name).join(", ")}` : ""}${rp.delaySaved ? `. <b>${rp.delaySaved} min di coda evitati</b>` : ""}.</div><button data-testid="whatif-reset">Annulla</button></div>`
      : `<p style="margin:12px 0 0;font-size:12px">Pioggia e ritardo partono dopo la prima tappa (${afterFirst}); la folla imprevista dall'inizio della giornata.</p>`}`;
  $$("[data-whatif]", panel).forEach((b) => (b.onclick = () => whatIf(b.dataset.whatif)));
  const r = $('[data-testid="whatif-reset"]', panel);
  if (r) r.onclick = () => { state.plan = { ...state.plan, days: state.plan.days.map((d, i) => (i === state.day ? state.original.days[i] : d)) }; state.plan.impact = state.original.impact; state.whatif = null; animateReorder(new Set()); toast("Itinerario originale ripristinato"); };
}

async function whatIf(kind) {
  const base = { ...state.original, days: state.original.days };
  const before = state.plan.days[state.day].order.map((p) => p.id);
  const plan = replanDay(base, state.day, kind === "folla" ? 0 : 1, kind, state.data);
  if (!FAST) await overlay(kind === "pioggia" ? "Arriva la pioggia ☔" : kind === "folla" ? "Folla imprevista 👥" : "Sei in ritardo ⏰",
    ["Leggo la situazione attuale", "Ricalcolo il resto della giornata", "Itinerario aggiornato"], 260);
  state.plan = plan; state.whatif = kind;
  const after = plan.days[state.day].order.map((p) => p.id);
  const changed = new Set(after.filter((id, i) => before[i] !== id));
  animateReorder(changed);
  const rp = plan.days[state.day].replan;
  toast(`🔄 ${rp.message}`);
}

/** Animazione FLIP: le tappe scivolano nella nuova posizione. */
function animateReorder(changed) {
  const items = $$('[data-testid="timeline"] .tl-item');
  const first = new Map(items.map((el) => [el.dataset.key, el.getBoundingClientRect().top]));
  renderDay(changed);
  if (FAST) return;
  $$('[data-testid="timeline"] .tl-item').forEach((el, i) => {
    const old = first.get(el.dataset.key);
    const now = el.getBoundingClientRect().top;
    if (old == null) { el.animate([{ opacity: 0, transform: "translateX(24px)" }, { opacity: 1, transform: "none" }], { duration: 500, delay: i * 40, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" }); return; }
    const dy = old - now;
    if (Math.abs(dy) > 1) el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 700, easing: "cubic-bezier(.2,.8,.2,1)" });
  });
}

function initMap() {
  if (!window.L) { $("#map").innerHTML = '<div class="boot">Mappa non disponibile offline</div>'; return; }
  const mc = state.data.config.map || {};
  map = L.map("map", { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView(mc.center || [41.898, 12.48], mc.zoom || 14);
  useTileProvider([mc.provider || "esri-dark", ...(mc.fallback || [])], mc);
  mapLayer = L.layerGroup().addTo(map);
}

// Provider di tile configurabile (config.json -> map) con ripiego automatico:
// se un provider dà errori prima di caricare una tile, o nessuna tile arriva entro 8 s, passa al successivo.
let tileLayers = [];
function useTileProvider(queue, mc) {
  tileLayers.forEach((l) => map.removeLayer(l));
  tileLayers = [];
  const providers = mc.providers || {};
  while (queue.length) {
    const id = queue[0], p = providers[id];
    if (p && (!p.requiresKey || mc.apiKey)) break;
    if (p) console.info(`[mappa] ${id} richiede una chiave API: salto al provider successivo`);
    queue = queue.slice(1);
  }
  if (!queue.length) { console.warn("[mappa] nessun provider di tile disponibile"); return; }
  const id = queue[0], p = providers[id];
  const fill = (u) => u.replace("{apiKey}", encodeURIComponent(mc.apiKey || ""));
  const opts = { attribution: p.attribution || "", maxZoom: p.maxZoom || 19 };
  if (p.subdomains) opts.subdomains = p.subdomains;
  const base = L.tileLayer(fill(p.tileUrl), opts);
  tileLayers.push(base);
  if (p.labelsUrl) tileLayers.push(L.tileLayer(fill(p.labelsUrl), { maxZoom: opts.maxZoom }));
  $("#map").classList.toggle("map-dark-filter", !!p.darkFilter);
  $("#map").dataset.tileProvider = id;
  let ok = false, errors = 0, switched = false;
  const next = (why) => {
    if (ok || switched) return;
    switched = true;
    console.warn(`[mappa] provider ${id} non disponibile (${why}): passo al successivo`);
    useTileProvider(queue.slice(1), mc);
  };
  base.on("tileload", () => { ok = true; });
  base.on("tileerror", () => { if (++errors >= 3) next("errori di caricamento"); });
  setTimeout(() => next("timeout"), 8000);
  tileLayers.forEach((l) => l.addTo(map));
}

function drawRoute(day, doneCount) {
  if (!map) return;
  mapLayer.clearLayers();
  const area = state.data.config.startAreas.find((a) => a.id === state.plan.prefs.startArea);
  const pts = [[area.coordinates.lat, area.coordinates.lng]];
  L.marker(pts[0], { icon: L.divIcon({ className: "", html: '<div class="pin start">⌂</div>', iconSize: [30, 30], iconAnchor: [15, 15] }) }).bindTooltip(`Partenza: ${area.name}`).addTo(mapLayer);
  let n = 0;
  day.stops.filter((s) => s.type === "visit").forEach((s) => {
    n++;
    const ll = [s.place.coordinates.lat, s.place.coordinates.lng];
    pts.push(ll);
    L.marker(ll, { icon: L.divIcon({ className: "", html: `<div class="pin ${n <= doneCount && day.replan ? "done" : ""}">${n}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }) })
      .bindTooltip(`${n}. ${s.place.name} · ${fmtTime(s.start)}`).addTo(mapLayer);
  });
  L.polyline(pts, { color: "#e3b866", weight: 7, opacity: 0.18 }).addTo(mapLayer);
  L.polyline(pts, { color: "#e3b866", weight: 3, opacity: 0.95, className: "route-line" }).addTo(mapLayer);
  map.invalidateSize();
  map.fitBounds(L.latLngBounds(pts).pad(0.15), { animate: !FAST });
}

function countUp() {
  $$("[data-count]").forEach((el) => {
    const target = +el.dataset.count;
    if (FAST) { el.textContent = target; return; }
    const t0 = performance.now(), dur = 1400;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/* ------------------------------------------------------------------ IMPACT */
function renderImpact() {
  const { plan } = state;
  const imp = plan.impact;
  const visits = plan.days.flatMap((d) => d.stops.filter((s) => s.type === "visit").map((s) => ({ s, d, b: d.baseline.stops.find((x) => x.type === "visit" && x.place.id === s.place.id) })));
  const maxDelay = Math.max(1, ...visits.map((v) => Math.max(v.s.delay, v.b?.delay || 0)));
  const rows = [...visits].sort((a, b) => (b.b?.delay || 0) - (b.s.delay) - ((a.b?.delay || 0) - a.s.delay));
  if (!state.heatPlace) state.heatPlace = rows[0]?.s.place.id;
  app.innerHTML = `
  <section class="screen wrap" data-testid="screen-impact">
    <div class="page-head">
      <div><span class="eyebrow">Passo 3 di 3</span><h2>L'impatto di RomaFlow</h2>
      <p>Confronto tra il tuo itinerario e un itinerario standard con gli stessi luoghi: partenza alle 9:30 e ordine "da guida", senza guardare la folla.</p></div>
    </div>
    <div class="impact-hero">
      <div class="card big">
        <span class="eyebrow">Tempo restituito al viaggio</span>
        <div style="margin-top:10px"><span class="counter" data-testid="impact-counter" data-count="${imp.minutesSaved}">0</span><span class="unit">minuti</span></div>
        <p>di coda e di folla evitati in ${plan.days.length} ${plan.days.length === 1 ? "giorno" : "giorni"}: ${imp.baseDelay} min con l'itinerario standard, solo ${imp.optDelay} con RomaFlow.</p>
        <small>Stima basata su livelli di folla dimostrativi.</small>
      </div>
      <div class="mini-kpis">
        <div class="card kpi hl"><small>Folla media</small><b>−<span data-count="${imp.crowdReductionPct}">0</span>%</b></div>
        <div class="card kpi" title="Visite in fascia con folla ≥ 60/100"><small>Visite all'ora di punta</small><b>${imp.peaksOpt} <span style="font-size:16px;color:var(--muted)">invece di ${imp.peaksBase}</span></b></div>
        <div class="card kpi"><small>Luoghi visti</small><b>${visits.length}</b></div>
        <div class="card kpi"><small>Coda per tappa</small><b>${Math.round(imp.optDelay / Math.max(1, visits.length))}′ <span style="font-size:16px;color:var(--muted)">vs ${Math.round(imp.baseDelay / Math.max(1, visits.length))}′</span></b></div>
      </div>
    </div>
    <div class="impact-grid">
      <div class="card compare" data-testid="impact-bars">
        <h3>Minuti in coda, tappa per tappa</h3>
        <p>Stesso luogo, orario diverso.</p>
        <div class="legend"><span><i style="background:var(--red)"></i>Itinerario standard</span><span><i style="background:var(--green)"></i>RomaFlow</span></div>
        <div class="bars">${rows.map(({ s, b }) => `
          <div class="bar-row"><div class="lbl">${s.place.emoji} ${s.place.name}<small>${b ? fmtTime(b.start) : "-"} → ${fmtTime(s.start)}</small></div>
          <div class="bar-pair"><div class="bar base" data-w="${((b?.delay || 0) / maxDelay) * 82}"><em>${Math.round(b?.delay || 0)} min</em></div><div class="bar opt" data-w="${(s.delay / maxDelay) * 82}"><em>${Math.round(s.delay)} min</em></div></div></div>`).join("")}
        </div>
      </div>
      <div class="card heat" data-testid="impact-heat">
        <h3>Quando andare: la mappa della folla</h3>
        <p>Affollamento previsto per giorno e ora (stima dimostrativa).</p>
        <div class="chips">${rows.map(({ s }) => `<button class="chip ${s.place.id === state.heatPlace ? "on" : ""}" data-heat="${s.place.id}" data-testid="heat-${s.place.id}">${s.place.emoji} ${s.place.name.split(" e ")[0]}</button>`).join("")}</div>
        <div id="heat-body"></div>
      </div>
    </div>
    <div class="cta-row">
      <button class="btn-ghost" data-testid="btn-back-plan">← Torna all'itinerario</button>
      <button class="btn-ghost" data-testid="btn-edit-prefs">Modifica preferenze</button>
    </div>
    <p class="footnote">Livelli di affollamento: <b>stime dimostrative</b> (profili tipici per categoria scalati sulla popolarità), non misure reali. Orari di apertura, prenotazioni e visitatori annui (MiC 2024, Musei Vaticani 2024) provengono da fonti pubbliche: dettagli in app/data/SCHEMA.md. Coda stimata = minuti persi al picco × (folla/100)².</p>
  </section>`;
  countUp();
  requestAnimationFrame(() => setTimeout(() => $$(".bar").forEach((b) => (b.style.width = b.dataset.w + "%")), FAST ? 0 : 150));
  renderHeat(visits);
  $$("[data-heat]").forEach((b) => (b.onclick = () => { state.heatPlace = b.dataset.heat; $$("[data-heat]").forEach((x) => x.classList.toggle("on", x === b)); renderHeat(visits); }));
  $('[data-testid="btn-back-plan"]').onclick = () => go("plan");
  $('[data-testid="btn-edit-prefs"]').onclick = () => go("prefs");
}

function renderHeat(visits) {
  const v = visits.find((x) => x.s.place.id === state.heatPlace) || visits[0];
  if (!v) return;
  const p = v.s.place, dk = weekdayKey(v.d.date);
  $("#heat-body").innerHTML = `
    ${heatmap(p, { optDay: dk, optHour: Math.floor(v.s.start / 60), baseHour: v.b ? Math.floor(v.b.start / 60) : null })}
    <div class="legend" style="margin-top:12px"><span><i style="background:var(--green);border-radius:50%"></i>RomaFlow · ${WEEKDAY_LABELS[dk]} ${fmtTime(v.s.start)}</span><span><i style="border:2px dashed #fff;border-radius:50%"></i>Standard · ${v.b ? fmtTime(v.b.start) : "-"}</span></div>
    <div style="margin-top:6px">${dayCurve(p.crowd[dk], v.s.start, v.b?.start)}</div>`;
}

init();
