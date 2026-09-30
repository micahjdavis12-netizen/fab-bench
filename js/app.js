import {
  angleConversions,
  formatDecimal,
  formatInchesFraction,
  lengthConversions,
  parseAngle,
  parseDegrees,
  parseLength,
} from "./parse.js?v=20";
import {
  controlAnchors,
  evaluateCalculation,
  layoutTriangle,
  placeAttachedChips,
  solveTriangle,
} from "./solve.js?v=20";
import { buildPipe, defaultPipe, layoutPipePath } from "./pipe.js?v=20";
import { loadState, saveState } from "./storage.js?v=20";

const KEYS = ["a", "b", "c", "A", "B", "C"];
const SIDE_KEYS = ["a", "b", "c"];
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
const viewLabel = document.getElementById("view-label");
const pipeSvg = document.getElementById("pipe");
const pipeWorkspace = document.getElementById("pipe-workspace");
const pipeStepsEl = document.getElementById("pipe-steps");
const pipeResult = document.getElementById("pipe-result");
const pipeMsg = document.getElementById("pipe-msg");
const pipeStatus = document.getElementById("pipe-status");
const pipeClr = document.getElementById("pipe-clr");
const composeName = document.getElementById("compose-name");
const composeValue = document.getElementById("compose-value");

const TAB_LABEL = { triangle: "Triangle", combine: "Combine", pipe: "Pipe" };

const stored = loadState(defaultPipe);

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
  tab: stored.tab,
  composeKind: "length",
  pipe: stored.pipe,
};

precisionEl.value = String(state.precision);

function persist() {
  saveState(
    {
      precision: state.precision,
      bank: state.bank,
      calc: state.calc,
      tab: state.tab,
      pipe: state.pipe,
    },
    defaultPipe
  );
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

  if (state.tab === "triangle") {
    renderControls(ready);
    draw(solved || state.lastShape);
  }
  renderBank();
  renderCalc();
  if (state.tab === "pipe") renderPipe();
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
    boxes: placeAttachedChips(layout, { w: 124, h: 58 }, { w, h, pad: 4 }, 16),
  };
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
  return { w, h, pad: Math.max(96, Math.min(w, h) * 0.26) };
}

function renderControls(ready) {
  const shape = state.solutions[state.solutionIndex] || state.lastShape;
  const { w, h, pad } = viewSize();
  const layout = layoutTriangle(shape.a, shape.b, shape.c, w, h, pad);
  const placed = placeControls(layout);
  if (controlsEl.dataset.ready !== "2") {
    controlsEl.innerHTML = KEYS.map(
      (key) => `
      <div class="measure glass" data-key="${key}">
        <label class="lab" for="in-${key}">${LABELS[key]}</label>
        <div class="measure-row">
          <input id="in-${key}" data-key="${key}" autocomplete="off" spellcheck="false"
            inputmode="${SIDE_KEYS.includes(key) ? "text" : "decimal"}"
            aria-label="${LABELS[key]}" placeholder="${SIDE_KEYS.includes(key) ? "12 3/8" : "45"}"
            title="${SIDE_KEYS.includes(key) ? "Side length. Try 12 3/8 or 250 mm." : "Angle in degrees."}" />
          <button class="glass plus" type="button" data-save="${key}" aria-label="Save ${LABELS[key]}" title="Save ${LABELS[key]}" disabled>+</button>
        </div>
      </div>`
    ).join("");
    controlsEl.dataset.ready = "2";
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
    el.style.width = "124px";
    el.classList.toggle("is-user", state.source[key] === "user");
    el.classList.toggle("is-calc", state.source[key] === "calc");
    input.readOnly = state.source[key] === "calc";
    if (document.activeElement !== input) input.value = state.raw[key];
    const save = el.querySelector("[data-save]");
    save.disabled = !ready;
  }

  state._placed = placed;
  state._layout = layout;
}

function edgeToward(cx, cy, w, h, ax, ay) {
  const dx = ax - cx;
  const dy = ay - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const t = Math.min((w / 2) / Math.abs(dx || 1e-6), (h / 2) / Math.abs(dy || 1e-6));
  return { x: cx + dx * t, y: cy + dy * t };
}

function draw(shape) {
  const { w, h, pad } = viewSize();
  const layout = layoutTriangle(shape.a, shape.b, shape.c, w, h, pad);
  const { A, B, C } = layout;
  const { anchors } = controlAnchors(layout);
  const wr = workspace.getBoundingClientRect();
  const leaders = KEYS.map((key) => {
    const el = controlsEl.querySelector(`[data-key="${key}"]`);
    if (!el) return "";
    const r = el.getBoundingClientRect();
    const cx = r.left - wr.left + r.width / 2;
    const cy = r.top - wr.top + r.height / 2;
    const anchor = anchors[key];
    const attach = svgToWorkspace(anchor.x, anchor.y);
    const edge = edgeToward(cx, cy, r.width, r.height, attach.x, attach.y);
    const end = workspaceToSvg(edge.x, edge.y);
    return `<line class="leader" x1="${anchor.x}" y1="${anchor.y}" x2="${end.x}" y2="${end.y}" />`;
  }).join("");

  svg.innerHTML = `
      <path class="triangle-fill" d="M ${A.x} ${A.y} L ${B.x} ${B.y} L ${C.x} ${C.y} Z" />
      ${leaders}
      <circle class="vertex" cx="${A.x}" cy="${A.y}" r="4" />
      <circle class="vertex" cx="${B.x}" cy="${B.y}" r="4" />
      <circle class="vertex" cx="${C.x}" cy="${C.y}" r="4" />
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
  setTab("combine");
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

document.getElementById("clear").addEventListener("click", () => {
  state.raw = { a: "", b: "", c: "", A: "", B: "", C: "" };
  KEYS.forEach((key) => parseKey(key, ""));
  state.solutions = [];
  state.solutionIndex = 0;
  state.lastShape = { a: 9, b: 12, c: 15 };
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

function setTab(tab) {
  state.tab = tab;
  persist();
  viewLabel.textContent = TAB_LABEL[tab];
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.setAttribute("aria-selected", String(btn.dataset.tab === tab));
  });
  document.getElementById("view-triangle").hidden = tab !== "triangle";
  document.getElementById("view-combine").hidden = tab !== "combine";
  document.getElementById("view-pipe").hidden = tab !== "pipe";
  if (tab === "triangle") refresh();
  if (tab === "combine") renderCalc();
  if (tab === "pipe") renderPipe();
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => setTab(btn.dataset.tab));
});

document.querySelectorAll(".kind").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.composeKind = btn.dataset.kind;
    document.querySelectorAll(".kind").forEach((el) => {
      el.setAttribute("aria-pressed", String(el === btn));
    });
    composeValue.placeholder = state.composeKind === "length" ? "12 3/8" : "45";
    composeValue.setAttribute("inputmode", state.composeKind === "length" ? "text" : "decimal");
  });
});

document.getElementById("compose-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const raw = composeValue.value.trim();
  const parsed = state.composeKind === "length" ? parseLength(raw) : parseAngle(raw);
  if (parsed.empty || parsed.error) {
    toast(parsed.error || "Enter a measurement.");
    return;
  }
  const kind = state.composeKind;
  const value = kind === "length" ? parsed.inches : parsed.degrees;
  if (state.calc.length && state.calc[0].kind !== kind) {
    toast(
      kind === "angle"
        ? "Combine is using lengths. Clear it before adding an angle."
        : "Combine is using angles. Clear it before adding a length."
    );
    return;
  }
  const name =
    composeName.value.trim() ||
    (kind === "length"
      ? lengthConversions(value, state.precision).fractionalInches
      : angleConversions(value).degrees);
  state.calc.push({
    id: crypto.randomUUID(),
    name,
    kind,
    value,
    op: state.calc.length ? "+" : null,
  });
  persist();
  composeValue.value = "";
  renderCalc();
  toast("Added to Combine");
});

function parsedPipeSteps() {
  const clr = parseLength(state.pipe.clrRaw);
  const steps = [];
  const errors = [];
  if (clr.error || !(clr.inches > 0)) errors.push("Enter a centerline radius.");
  let bendN = 0;
  state.pipe.steps.forEach((step, i) => {
    if (step.type === "straight") {
      const len = parseLength(step.raw);
      if (len.error || !(len.inches > 0)) {
        errors.push(`Straight ${i + 1} needs a length.`);
        steps.push({ ...step, length: 0 });
        return;
      }
      steps.push({ ...step, length: len.inches });
      return;
    }
    bendN += 1;
    const ang = parseDegrees(step.angleRaw);
    const rot = step.rotRaw.trim() ? parseDegrees(step.rotRaw) : { degrees: 0 };
    if (ang.empty || ang.error || !Number.isFinite(ang.degrees) || Math.abs(ang.degrees) < 1e-9) {
      errors.push(`Bend ${bendN} needs an angle.`);
      steps.push({ ...step, angle: 0, rotation: 0, radius: clr.inches });
      return;
    }
    if (Math.abs(ang.degrees) >= 360) {
      errors.push(`Bend ${bendN} must be less than 360°.`);
      steps.push({ ...step, angle: ang.degrees, rotation: 0, radius: clr.inches });
      return;
    }
    if (rot.error || !Number.isFinite(rot.degrees)) {
      errors.push(`Bend ${bendN} rotation isn’t recognized.`);
      steps.push({ ...step, angle: ang.degrees, rotation: 0, radius: clr.inches });
      return;
    }
    steps.push({
      ...step,
      angle: ang.degrees,
      rotation: rot.degrees ?? 0,
      radius: clr.inches,
    });
  });
  return { clr: clr.inches, steps, errors };
}

function renderPipe() {
  if (!pipeClr) return;
  if (document.activeElement !== pipeClr) pipeClr.value = state.pipe.clrRaw;
  const parsed = parsedPipeSteps();
  const model = buildPipe(parsed.clr || 3, parsed.steps);
  const msgs = [...parsed.errors, ...model.errors];
  pipeMsg.textContent = msgs[0] || "";
  pipeStatus.textContent = msgs[0]
    ? msgs[0]
    : "Drag the cage to turn it. Rotation is the clock between bends.";

  const w = Math.max(320, pipeWorkspace.clientWidth);
  const h = Math.max(320, pipeWorkspace.clientHeight);
  pipeSvg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  const laid = layoutPipePath(model, w, h, state.pipe.yaw, state.pipe.pitch, 40);
  const dots = laid.marks
    .map((m) => {
      const r = m.kind === "start" || m.kind === "end" ? 5 : 3.25;
      const cls = m.kind === "end" ? "pipe-dot end" : "pipe-dot";
      return `<circle class="${cls}" cx="${m.x}" cy="${m.y}" r="${r}" />`;
    })
    .join("");
  pipeSvg.innerHTML = laid.d
    ? `<path class="tube" d="${laid.d}" /><path class="tube-soft" d="${laid.d}" />${dots}`
    : "";

  let straightN = 0;
  let bendN = 0;
  const editing = pipeStepsEl.contains(document.activeElement);
  if (!editing) {
    pipeStepsEl.innerHTML = state.pipe.steps
    .map((step) => {
      if (step.type === "straight") {
        straightN += 1;
        return `<li class="cage-card" data-id="${step.id}">
          <header>
            <h3>Start / straight ${straightN}</h3>
            <button class="icon-btn" type="button" data-drop="${step.id}" aria-label="Remove straight">×</button>
          </header>
          <div class="cage-fields single">
            <label>Length
              <input data-straight="${step.id}" value="${escapeHtml(step.raw)}" placeholder="12" inputmode="text" />
            </label>
          </div>
        </li>`;
      }
      bendN += 1;
      return `<li class="cage-card" data-id="${step.id}">
        <header>
          <h3>Bend ${bendN}</h3>
          <button class="icon-btn" type="button" data-drop="${step.id}" aria-label="Remove bend">×</button>
        </header>
        <div class="cage-fields">
          <label>Angle
            <input data-angle="${step.id}" value="${escapeHtml(step.angleRaw)}" placeholder="90" inputmode="decimal" />
          </label>
          <label>Rotation
            <input data-rot="${step.id}" value="${escapeHtml(step.rotRaw)}" placeholder="0" inputmode="decimal" />
          </label>
        </div>
      </li>`;
    })
    .join("");
  }

  if (msgs.length) {
    pipeResult.innerHTML = `<p class="err">${msgs[0]}</p>`;
    return;
  }
  const conv = lengthConversions(model.developed, state.precision);
  const reach = lengthConversions(model.reach, state.precision);
  pipeResult.innerHTML = `<div class="total">
    <p class="equation">${model.bendCount} bend${model.bendCount === 1 ? "" : "s"} · drag to inspect the cage</p>
    <div class="total-main"><span>Developed</span><strong>${conv.fractionalInches}</strong></div>
    <div class="alts">
      <span>${conv.mm}</span>
      <span>End reach ${reach.fractionalInches}</span>
    </div>
  </div>`;
}

pipeStepsEl.addEventListener("input", (event) => {
  const straight = event.target.closest("[data-straight]");
  const angle = event.target.closest("[data-angle]");
  const rot = event.target.closest("[data-rot]");
  if (straight) {
    const step = state.pipe.steps.find((item) => item.id === straight.dataset.straight);
    if (step) step.raw = straight.value;
  }
  if (angle) {
    const step = state.pipe.steps.find((item) => item.id === angle.dataset.angle);
    if (step) step.angleRaw = angle.value;
  }
  if (rot) {
    const step = state.pipe.steps.find((item) => item.id === rot.dataset.rot);
    if (step) step.rotRaw = rot.value;
  }
  persist();
  renderPipe();
});

pipeStepsEl.addEventListener("click", (event) => {
  const drop = event.target.closest("[data-drop]");
  if (!drop) return;
  if (state.pipe.steps.length <= 1) {
    toast("Leave at least one piece in the cage.");
    return;
  }
  state.pipe.steps = state.pipe.steps.filter((step) => step.id !== drop.dataset.drop);
  persist();
  renderPipe();
});

pipeClr.addEventListener("input", () => {
  state.pipe.clrRaw = pipeClr.value;
  persist();
  renderPipe();
});

document.getElementById("add-straight").addEventListener("click", () => {
  state.pipe.steps.push({ id: crypto.randomUUID(), type: "straight", raw: "8" });
  persist();
  renderPipe();
});

document.getElementById("add-bend").addEventListener("click", () => {
  state.pipe.steps.push({
    id: crypto.randomUUID(),
    type: "bend",
    angleRaw: "90",
    rotRaw: "0",
  });
  persist();
  renderPipe();
});

document.getElementById("clear-pipe").addEventListener("click", () => {
  state.pipe = defaultPipe();
  persist();
  renderPipe();
});

let pipeDrag = null;
pipeWorkspace.addEventListener("pointerdown", (event) => {
  pipeDrag = { x: event.clientX, y: event.clientY, yaw: state.pipe.yaw, pitch: state.pipe.pitch };
  pipeWorkspace.classList.add("is-drag");
  pipeWorkspace.setPointerCapture(event.pointerId);
});
pipeWorkspace.addEventListener("pointermove", (event) => {
  if (!pipeDrag) return;
  state.pipe.yaw = pipeDrag.yaw + (event.clientX - pipeDrag.x) * 0.45;
  state.pipe.pitch = Math.max(-80, Math.min(80, pipeDrag.pitch + (event.clientY - pipeDrag.y) * 0.35));
  renderPipe();
});
const endPipeDrag = () => {
  if (!pipeDrag) return;
  pipeDrag = null;
  pipeWorkspace.classList.remove("is-drag");
  persist();
};
pipeWorkspace.addEventListener("pointerup", endPipeDrag);
pipeWorkspace.addEventListener("pointercancel", endPipeDrag);

window.addEventListener("resize", () => {
  if (state.tab === "pipe") renderPipe();
  else refresh();
});

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
    const reg = await navigator.serviceWorker.register("./sw.js?v=20");
    const ready = await navigator.serviceWorker.ready;
    if (ready.active || reg.active) installBtn.textContent = "Ready";
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data === "ready") installBtn.textContent = "Offline ready";
    });
  } catch {
    installBtn.textContent = "Install";
  }
}

setupPwa();
setTab(state.tab);
refresh();
