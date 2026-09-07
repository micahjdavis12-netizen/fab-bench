import {
  angleConversions,
  formatDecimal,
  formatInchesFraction,
  lengthConversions,
  parseAngle,
  parseLength,
} from "./parse.js";
import {
  evaluateCalculation,
  layoutTriangle,
  placeAttachedChips,
  solveTriangle,
} from "./solve.js";
import { loadState, saveState } from "./storage.js";

const KEYS = ["a", "b", "c", "A", "B", "C"];
const SIDE_KEYS = ["a", "b", "c"];
const CHIP = { a: "a", b: "b", c: "c", A: "∠A", B: "∠B", C: "∠C" };
const LABELS = {
  a: "Side a",
  b: "Side b",
  c: "Side c",
  A: "Angle A",
  B: "Angle B",
  C: "Angle C",
};
const OPS = ["+", "-", "*", "/"];
const OP_MARK = { "+": "+", "-": "−", "*": "×", "/": "÷" };

const controlsEl = document.getElementById("controls");
const svg = document.getElementById("tri");
const workspace = document.getElementById("workspace");
const statusEl = document.getElementById("status");
const msgEl = document.getElementById("diagram-msg");
const ssaEl = document.getElementById("ssa");
const bankEl = document.getElementById("bank");
const bankEmpty = document.getElementById("bank-empty");
const calcList = document.getElementById("calc-list");
const calcEmpty = document.getElementById("calc-empty");
const calcResult = document.getElementById("calc-result");
const dialog = document.getElementById("save-dialog");
const saveMeta = document.getElementById("save-meta");
const saveName = document.getElementById("save-name");
const toastEl = document.getElementById("toast");
const installBtn = document.getElementById("install");
const precisionEl = document.getElementById("precision");

const stored = loadState();

const state = {
  raw: { a: "", b: "", c: "", A: "", B: "", C: "" },
  parsed: { a: null, b: null, c: null, A: null, B: null, C: null },
  parseError: { a: null, b: null, c: null, A: null, B: null, C: null },
  source: { a: null, b: null, c: null, A: null, B: null, C: null },
  solutions: [],
  solutionIndex: 0,
  precision: stored.precision,
  bank: stored.bank,
  calc: stored.calc,
  saveTarget: null,
  lastShape: { a: 9, b: 12, c: 15 },
};

precisionEl.value = String(state.precision);

function persist() {
  saveState({
    precision: state.precision,
    bank: state.bank,
    calc: state.calc,
  });
}

function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.add("show");
  window.clearTimeout(toastEl._t);
  toastEl._t = window.setTimeout(() => toastEl.classList.remove("show"), 2200);
}

function currentKnown() {
  const known = {};
  for (const key of KEYS) {
    if (state.source[key] === "user" && state.parsed[key] != null) {
      known[key] = state.parsed[key];
    }
  }
  return known;
}

function userCount() {
  return KEYS.filter((k) => state.source[k] === "user").length;
}

function parseKey(key, raw) {
  state.raw[key] = raw;
  if (!raw.trim()) {
    state.parsed[key] = null;
    state.parseError[key] = null;
    state.source[key] = null;
    return;
  }
  const result = SIDE_KEYS.includes(key) ? parseLength(raw) : parseAngle(raw);
  if (result.empty) {
    state.parsed[key] = null;
    state.parseError[key] = null;
    state.source[key] = null;
    return;
  }
  if (result.error) {
    state.parsed[key] = null;
    state.parseError[key] = result.error;
    state.source[key] = "user";
    return;
  }
  state.parseError[key] = null;
  state.parsed[key] = result.inches ?? result.degrees;
  state.source[key] = "user";
}

function displayFor(key, value, solved) {
  if (state.source[key] === "user") return state.raw[key];
  if (!solved || value == null) return "";
  if (SIDE_KEYS.includes(key)) return `${formatInchesFraction(value, state.precision)}"`;
  return `${formatDecimal(value, 1)}°`;
}

function firstParseError() {
  return KEYS.map((k) => state.parseError[k]).find(Boolean) || null;
}

function refresh() {
  const known = currentKnown();
  const count = userCount();
  const parseErr = firstParseError();
  let solved = null;
  let error = parseErr;

  if (!parseErr) {
    const result = solveTriangle(known);
    if (result.incomplete) {
      error = count === 0 ? "" : result.error;
      state.solutions = [];
    } else if (result.error) {
      error = result.error;
      state.solutions = [];
    } else {
      state.solutions = result.solutions;
      if (state.solutionIndex >= state.solutions.length) state.solutionIndex = 0;
      solved = state.solutions[state.solutionIndex];
      error = "";
    }
  } else {
    state.solutions = [];
  }

  for (const key of KEYS) {
    if (state.source[key] !== "user") {
      if (solved) {
        state.parsed[key] = solved[key];
        state.source[key] = "calc";
        state.raw[key] = displayFor(key, solved[key], true);
      } else {
        state.parsed[key] = null;
        state.source[key] = null;
        if (document.activeElement?.dataset.key !== key) state.raw[key] = "";
      }
    }
  }

  if (solved) state.lastShape = { a: solved.a, b: solved.b, c: solved.c };

  const ready = Boolean(solved);
  statusEl.textContent = ready
    ? `3 of 3 inputs · Triangle solved${state.solutions.length > 1 ? ` · Solution ${state.solutionIndex + 1} of ${state.solutions.length}` : ""}`
    : `${count} of 3 inputs · ${error || "Need three measurements, including one side"}`;

  msgEl.textContent = ready
    ? ""
    : error ||
      "Enter any 3 values — include at least one side.";

  ssaEl.hidden = state.solutions.length < 2;
  ssaEl.classList.toggle("is-open", state.solutions.length > 1);
  [...ssaEl.querySelectorAll("[data-sol]")].forEach((btn) => {
    btn.setAttribute("aria-pressed", String(Number(btn.dataset.sol) === state.solutionIndex));
  });

  renderControls(ready);
  draw(solved || state.lastShape, error && !ready);
  renderBank();
  renderCalc();
}

function svgToWorkspace(x, y) {
  const pt = svg.createSVGPoint();
  pt.x = x;
  pt.y = y;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x, y };
  const screen = pt.matrixTransform(ctm);
  const rect = workspace.getBoundingClientRect();
  return { x: screen.x - rect.left, y: screen.y - rect.top };
}

function placeControls(layout) {
  const { w, h } = viewSize();
  return {
    boxes: placeAttachedChips(layout, { w: 100, h: 56 }, { w, h, pad: 4 }, 14),
  };
}

function unstackDom() {
  const wr = workspace.getBoundingClientRect();
  const nodes = KEYS.map((key) => ({
    key,
    el: controlsEl.querySelector(`[data-key="${key}"]`),
  }));
  const gap = 12;
  for (let iter = 0; iter < 50; iter += 1) {
    let moved = false;
    const rects = nodes.map((n) => {
      const r = n.el.getBoundingClientRect();
      return {
        ...n,
        x: r.left - wr.left,
        y: r.top - wr.top,
        w: r.width,
        h: r.height,
        cx: r.left - wr.left + r.width / 2,
        cy: r.top - wr.top + r.height / 2,
      };
    });
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i];
        const b = rects[j];
        if (
          a.x + a.w + gap <= b.x ||
          b.x + b.w + gap <= a.x ||
          a.y + a.h + gap <= b.y ||
          b.y + b.h + gap <= a.y
        ) {
          continue;
        }
        const dx = a.cx - b.cx;
        const dy = a.cy - b.cy;
        const dist = Math.hypot(dx, dy) || 0.01;
        const overlapX = (a.w + b.w) / 2 + gap - Math.abs(dx);
        const overlapY = (a.h + b.h) / 2 + gap - Math.abs(dy);
        const push = Math.max(overlapX, overlapY, 8) / 2;
        const nx = dx / dist;
        const ny = dy / dist;
        const acx = Math.min(wr.width - a.w / 2 - 4, Math.max(a.w / 2 + 4, a.cx + nx * push));
        const acy = Math.min(wr.height - a.h / 2 - 4, Math.max(a.h / 2 + 4, a.cy + ny * push));
        const bcx = Math.min(wr.width - b.w / 2 - 4, Math.max(b.w / 2 + 4, b.cx - nx * push));
        const bcy = Math.min(wr.height - b.h / 2 - 4, Math.max(b.h / 2 + 4, b.cy - ny * push));
        a.el.style.left = `${acx}px`;
        a.el.style.top = `${acy}px`;
        b.el.style.left = `${bcx}px`;
        b.el.style.top = `${bcy}px`;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function workspaceToSvg(x, y) {
  const rect = workspace.getBoundingClientRect();
  const pt = svg.createSVGPoint();
  pt.x = rect.left + x;
  pt.y = rect.top + y;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x, y };
  return pt.matrixTransform(ctm.inverse());
}

function viewSize() {
  const w = Math.max(320, workspace.clientWidth);
  const h = Math.max(320, workspace.clientHeight);
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  return { w, h, pad: Math.max(80, Math.min(w, h) * 0.18) };
}

function renderControls(ready) {
  const shape = state.solutions[state.solutionIndex] || state.lastShape;
  const { w, h, pad } = viewSize();
  const layout = layoutTriangle(shape.a, shape.b, shape.c, w, h, pad);
  const placed = placeControls(layout);
  if (!controlsEl.dataset.ready) {
    controlsEl.innerHTML = KEYS.map(
      (key) => `
      <div class="measure glass" data-key="${key}">
        <label class="lab" for="in-${key}">${CHIP[key]}</label>
        <input id="in-${key}" data-key="${key}" autocomplete="off" spellcheck="false"
          inputmode="${SIDE_KEYS.includes(key) ? "text" : "decimal"}"
          aria-label="${LABELS[key]}" placeholder="${SIDE_KEYS.includes(key) ? "12 3/8" : "45"}"
          title="${SIDE_KEYS.includes(key) ? "Side length. Try 12 3/8 or 250 mm." : "Angle in degrees."}" />
        <button class="glass plus" type="button" data-save="${key}" aria-label="Save ${LABELS[key]}" title="Save ${LABELS[key]}" disabled>+</button>
      </div>`
    ).join("");
    controlsEl.dataset.ready = "1";
    controlsEl.querySelectorAll("input").forEach((input) => {
      input.addEventListener("focus", () => {
        input.closest(".measure").classList.add("is-on");
      });
      input.addEventListener("blur", () => {
        input.closest(".measure").classList.remove("is-on");
        refresh();
      });
      input.addEventListener("input", () => {
        parseKey(input.dataset.key, input.value);
        refresh();
      });
    });
    controlsEl.querySelectorAll("[data-save]").forEach((btn) => {
      btn.addEventListener("click", () => openSave(btn.dataset.save));
    });
  }

  for (const key of KEYS) {
    const box = placed.boxes[key];
    const el = controlsEl.querySelector(`[data-key="${key}"]`);
    const input = el.querySelector("input");
    const pixel = svgToWorkspace(box.cx, box.cy);
    el.style.left = `${pixel.x}px`;
    el.style.top = `${pixel.y}px`;
    el.style.width = "88px";
    el.classList.toggle("is-user", state.source[key] === "user");
    el.classList.toggle("is-calc", state.source[key] === "calc");
    input.readOnly = state.source[key] === "calc";
    if (document.activeElement !== input) input.value = state.raw[key];
    const save = el.querySelector("[data-save]");
    save.disabled = !ready;
  }
  unstackDom();

  state._placed = placed;
  state._layout = layout;
}

function draw(shape, hideTriangle) {
  const { w, h, pad } = viewSize();
  const layout = layoutTriangle(shape.a, shape.b, shape.c, w, h, pad);
  const placed = placeControls(layout);
  const { A, B, C } = layout;
  const leaders = KEYS.map((key) => {
    const p = placed.boxes[key];
    const el = controlsEl.querySelector(`[data-key="${key}"]`);
    const wr = workspace.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const end = workspaceToSvg(r.left - wr.left + r.width / 2, r.top - wr.top + r.height / 2);
    const dist = Math.hypot(end.x - p.ax, end.y - p.ay);
    if (p.ax == null || dist < 18) return "";
    return `<line class="leader" x1="${p.ax}" y1="${p.ay}" x2="${end.x}" y2="${end.y}" />`;
  }).join("");

  svg.innerHTML = hideTriangle
    ? leaders
    : `
      <path class="triangle-fill" d="M ${A.x} ${A.y} L ${B.x} ${B.y} L ${C.x} ${C.y} Z" />
      ${leaders}
      <circle class="vertex" cx="${A.x}" cy="${A.y}" r="5" />
      <circle class="vertex" cx="${B.x}" cy="${B.y}" r="5" />
      <circle class="vertex" cx="${C.x}" cy="${C.y}" r="5" />
    `;
}

function openSave(key) {
  const solved = state.solutions[state.solutionIndex];
  if (!solved) return;
  const kind = SIDE_KEYS.includes(key) ? "length" : "angle";
  const value = solved[key];
  state.saveTarget = { key, kind, value };
  saveMeta.textContent =
    kind === "length"
      ? `${LABELS[key]} · ${lengthConversions(value, state.precision).fractionalInches}`
      : `${LABELS[key]} · ${angleConversions(value).degrees}`;
  saveName.value = LABELS[key];
  dialog.showModal();
  dialog.style.position = "fixed";
  dialog.style.top = "50%";
  dialog.style.left = "50%";
  dialog.style.right = "auto";
  dialog.style.bottom = "auto";
  dialog.style.margin = "0";
  dialog.style.transform = "translate(-50%, -50%)";
  saveName.focus();
  saveName.select();
}

document.getElementById("save-cancel").addEventListener("click", () => dialog.close());

document.getElementById("save-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!state.saveTarget) return;
  const name = saveName.value.trim();
  if (!name) return;
  state.bank.unshift({
    id: crypto.randomUUID(),
    name,
    kind: state.saveTarget.kind,
    key: state.saveTarget.key,
    value: state.saveTarget.value,
  });
  persist();
  dialog.close();
  toast("Saved to this device");
  renderBank();
});

function shownValue(item) {
  return item.kind === "length"
    ? lengthConversions(item.value, state.precision).fractionalInches
    : angleConversions(item.value).degrees;
}

function renderBank() {
  bankEmpty.hidden = state.bank.length > 0;
  document.getElementById("clear-bank").hidden = state.bank.length === 0;
  bankEl.innerHTML = state.bank
    .map((item) => {
      const conv =
        item.kind === "length"
          ? lengthConversions(item.value, state.precision)
          : angleConversions(item.value);
      const secondary = item.kind === "length" ? conv.mm : conv.radians;
      return `<li class="saved" style="display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;column-gap:12px">
        <div class="saved-info" style="min-width:0">
          <h3>${escapeHtml(item.name)}</h3>
          <strong>${item.kind === "length" ? conv.fractionalInches : conv.degrees}</strong>
          <p class="meta">${secondary}</p>
        </div>
        <div class="saved-actions" style="display:flex;align-items:center;gap:8px">
          <button class="use" type="button" data-add="${item.id}" aria-label="Add ${escapeHtml(item.name)} to Combine">Add</button>
          <button class="icon-btn" type="button" data-del="${item.id}" aria-label="Delete ${escapeHtml(item.name)}">×</button>
        </div>
      </li>`;
    })
    .join("");
}

bankEl.addEventListener("click", (event) => {
  const add = event.target.closest("[data-add]");
  const del = event.target.closest("[data-del]");
  if (add) addToCalc(add.dataset.add);
  if (del) {
    state.bank = state.bank.filter((item) => item.id !== del.dataset.del);
    persist();
    renderBank();
  }
});

function addToCalc(id) {
  const item = state.bank.find((entry) => entry.id === id);
  if (!item) return;
  if (state.calc.length && state.calc[0].kind !== item.kind) {
    toast(
      item.kind === "angle"
        ? "Combine is using lengths. Clear it before adding an angle."
        : "Combine is using angles. Clear it before adding a length."
    );
    return;
  }
  state.calc.push({
    id: crypto.randomUUID(),
    name: item.name,
    kind: item.kind,
    value: item.value,
    op: state.calc.length ? "+" : null,
  });
  persist();
  renderCalc();
  toast("Added to Combine");
}

function renderCalc() {
  calcEmpty.hidden = state.calc.length > 0;
  document.getElementById("clear-calc").hidden = state.calc.length === 0;
  calcList.innerHTML = state.calc
    .map((item, i) => {
      const shown = shownValue(item);
      return `<li class="tape-row" data-id="${item.id}">
        ${
          i === 0
            ? `<span class="op-slot" aria-hidden="true"></span>`
            : `<button class="op-btn" type="button" data-op="${item.id}" aria-label="Change operation, currently ${OP_MARK[item.op]}" title="Tap to switch +, −, ×, ÷">${OP_MARK[item.op]}</button>`
        }
        <span class="tape-name">${escapeHtml(item.name)}</span>
        <span class="tape-val">${shown}</span>
        <button class="icon-btn" type="button" data-remove="${item.id}" aria-label="Remove ${escapeHtml(item.name)}">×</button>
      </li>`;
    })
    .join("");

  const result = evaluateCalculation(state.calc);
  if (result.empty) {
    calcResult.innerHTML = "";
    return;
  }
  if (result.error) {
    calcResult.innerHTML = `<p class="err">${result.error}</p>`;
    return;
  }
  const kind = state.calc[0].kind;
  const expr = state.calc
    .map((item, i) => `${i === 0 ? "" : ` ${OP_MARK[item.op]} `}${shownValue(item)}`)
    .join("");
  if (kind === "length") {
    const conv = lengthConversions(result.value, state.precision);
    calcResult.innerHTML = `<div class="total">
      <p class="equation">${expr} = ${conv.fractionalInches}</p>
      <div class="total-main"><span>Total</span><strong>${conv.fractionalInches}</strong></div>
      <div class="alts">
        <span>${conv.feetInches}</span>
        <span>${conv.decimalInches}</span>
        <span>${conv.mm}</span>
      </div>
    </div>`;
  } else {
    const conv = angleConversions(result.value);
    calcResult.innerHTML = `<div class="total">
      <p class="equation">${expr} = ${conv.degrees}</p>
      <div class="total-main"><span>Total</span><strong>${conv.degrees}</strong></div>
      <div class="alts"><span>${conv.radians}</span></div>
    </div>`;
  }
}

calcList.addEventListener("click", (event) => {
  const opBtn = event.target.closest("[data-op]");
  const remove = event.target.closest("[data-remove]");
  if (opBtn) {
    const item = state.calc.find((entry) => entry.id === opBtn.dataset.op);
    if (item) {
      const i = OPS.indexOf(item.op);
      item.op = OPS[(i + 1) % OPS.length];
      persist();
      renderCalc();
    }
    return;
  }
  if (remove) {
    state.calc = state.calc.filter((item) => item.id !== remove.dataset.remove);
    if (state.calc[0]) state.calc[0].op = null;
    persist();
    renderCalc();
  }
});

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

document.getElementById("example").addEventListener("click", () => {
  state.raw = { a: "9", b: "12", c: "15", A: "", B: "", C: "" };
  KEYS.forEach((key) => parseKey(key, state.raw[key]));
  state.solutionIndex = 0;
  refresh();
});

document.getElementById("clear").addEventListener("click", () => {
  state.raw = { a: "", b: "", c: "", A: "", B: "", C: "" };
  KEYS.forEach((key) => parseKey(key, ""));
  state.solutions = [];
  state.solutionIndex = 0;
  refresh();
});

document.getElementById("clear-bank").addEventListener("click", () => {
  state.bank = [];
  persist();
  renderBank();
});

document.getElementById("clear-calc").addEventListener("click", () => {
  state.calc = [];
  persist();
  renderCalc();
});

precisionEl.addEventListener("change", () => {
  state.precision = Number(precisionEl.value);
  persist();
  refresh();
});

ssaEl.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-sol]");
  if (!btn) return;
  state.solutionIndex = Number(btn.dataset.sol);
  refresh();
});

window.addEventListener("resize", () => refresh());

let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  installBtn.textContent = "Install";
});

installBtn.addEventListener("click", async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt = null;
    return;
  }
  toast("In Safari, open Share and choose Add to Home Screen.");
});

async function setupPwa() {
  if (!("serviceWorker" in navigator)) {
    installBtn.textContent = "Browser only";
    return;
  }
  const loopback =
    location.hostname === "127.0.0.1" || location.hostname === "localhost";
  const secure = location.protocol === "https:";
  if (loopback || !secure) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((reg) => reg.unregister()));
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    installBtn.textContent = "Install";
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register("./sw.js?v=15");
    const ready = await navigator.serviceWorker.ready;
    if (ready.active || reg.active) installBtn.textContent = "Offline ready";
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data === "ready") installBtn.textContent = "Offline ready";
    });
  } catch {
    installBtn.textContent = "Install";
  }
}

setupPwa();
refresh();
