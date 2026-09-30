import {
  angleConversions,
  formatDecimal,
  formatInchesFraction,
  lengthConversions,
  parseAngle,
  parseDegrees,
  parseLength,
} from "./parse.js?v=38";
import {
  controlAnchors,
  evaluateCalculation,
  layoutTriangle,
  placeAnchoredBoxes,
  placeAttachedChips,
  solveTriangle,
  unit as vecUnit,
} from "./solve.js?v=38";
import { buildPipe, defaultPipe, layoutPipePath } from "./pipe.js?v=38";
import { loadState, saveState } from "./storage.js?v=38";

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
const pipeChips = document.getElementById("pipe-chips");
const pipeClr = document.getElementById("pipe-clr");
const pipeOd = document.getElementById("pipe-od");
const pipeClrConv = document.getElementById("pipe-clr-conv");
const pipeOdConv = document.getElementById("pipe-od-conv");
const confirmDialog = document.getElementById("confirm-dialog");
const confirmMsg = document.getElementById("confirm-msg");
const confirmOk = document.getElementById("confirm-ok");
const confirmCancel = document.getElementById("confirm-cancel");
const composeName = document.getElementById("compose-name");
const composeValue = document.getElementById("compose-value");
const composeUnit = document.getElementById("compose-unit");
const composeConv = document.getElementById("compose-conv");

const TAB_LABEL = { triangle: "Triangle", combine: "Calculator", pipe: "Pipe" };

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
  pipe: { ...defaultPipe(), ...stored.pipe },
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

let confirmResolve = null;

function askConfirm(message, actionLabel = "Clear") {
  return new Promise((resolve) => {
    if (confirmResolve) confirmResolve(false);
    confirmResolve = resolve;
    confirmMsg.textContent = message;
    confirmOk.textContent = actionLabel;
    const finish = (ok) => {
      const done = confirmResolve;
      confirmResolve = null;
      confirmOk.onclick = null;
      confirmCancel.onclick = null;
      if (confirmDialog.open) confirmDialog.close();
      if (done) done(ok);
    };
    confirmOk.onclick = () => finish(true);
    confirmCancel.onclick = () => finish(false);
    confirmDialog.showModal();
    confirmDialog.style.position = "fixed";
    confirmDialog.style.top = "50%";
    confirmDialog.style.left = "50%";
    confirmDialog.style.transform = "translate(-50%, -50%)";
  });
}

confirmDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  if (confirmResolve) {
    const done = confirmResolve;
    confirmResolve = null;
    confirmDialog.close();
    done(false);
  }
});

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
  if (state.tab === "pipe") renderPipe(true);
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
    boxes: placeAttachedChips(layout, { w: 152, h: 82 }, { w, h, pad: 4 }, 28),
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
  return { w, h, pad: Math.max(112, Math.min(w, h) * 0.3) };
}

function renderControls(ready) {
  const shape = state.solutions[state.solutionIndex] || state.lastShape;
  const { w, h, pad } = viewSize();
  const layout = layoutTriangle(shape.a, shape.b, shape.c, w, h, pad);
  const placed = placeControls(layout);
  if (controlsEl.dataset.ready !== "3") {
    controlsEl.innerHTML = KEYS.map(
      (key) => `
      <div class="measure glass" data-key="${key}">
        <label class="lab" for="in-${key}">${LABELS[key]} · ${SIDE_KEYS.includes(key) ? "in" : "deg"}</label>
        <div class="measure-row">
          <input id="in-${key}" data-key="${key}" autocomplete="off" spellcheck="false"
            inputmode="${SIDE_KEYS.includes(key) ? "text" : "decimal"}"
            aria-label="${LABELS[key]}" placeholder="${SIDE_KEYS.includes(key) ? "12 3/8 in" : "45 deg"}"
            title="${SIDE_KEYS.includes(key) ? "Side length. Try 12 3/8 or 250 mm." : "Angle in degrees."}" />
          <span class="unit">${SIDE_KEYS.includes(key) ? "in" : "°"}</span>
          <button class="glass plus" type="button" data-save="${key}" aria-label="Save ${LABELS[key]}" title="Save ${LABELS[key]}" disabled>+</button>
        </div>
        <p class="conv" hidden></p>
      </div>`
    ).join("");
    controlsEl.dataset.ready = "3";
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
    el.style.width = "152px";
    el.classList.toggle("is-user", state.source[key] === "user");
    el.classList.toggle("is-calc", state.source[key] === "calc");
    input.readOnly = state.source[key] === "calc";
    if (document.activeElement !== input) input.value = state.raw[key];
    const convEl = el.querySelector(".conv");
    if (state.parsed[key] != null && !state.parseError[key]) {
      convEl.hidden = false;
      convEl.textContent = SIDE_KEYS.includes(key)
        ? lengthConvLine(state.parsed[key])
        : angleConvLine(state.parsed[key]);
    } else {
      convEl.hidden = true;
      convEl.textContent = "";
    }
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

function lengthConvLine(inches) {
  if (!Number.isFinite(inches)) return "";
  const conv = lengthConversions(inches, state.precision);
  return `${conv.fractionalInches} · ${conv.feetInches} · ${conv.decimalInches} · ${conv.mm}`;
}

function angleConvLine(degrees) {
  if (!Number.isFinite(degrees)) return "";
  const conv = angleConversions(degrees);
  return `${conv.degrees} · ${formatDecimal(degrees, 3)} deg · ${conv.radians}`;
}

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
          <p class="meta">${item.kind === "length" ? lengthConvLine(item.value) : angleConvLine(item.value)}</p>
        </div>
        <div class="saved-actions" style="display:flex;align-items:center;gap:8px">
          <button class="use" type="button" data-add="${item.id}" aria-label="Add ${escapeHtml(item.name)} to Calculator">Add</button>
          <button class="icon-btn" type="button" data-del="${item.id}" aria-label="Delete ${escapeHtml(item.name)}">×</button>
        </div>
      </li>`;
    })
    .join("");
}

bankEl.addEventListener("click", async (event) => {
  const add = event.target.closest("[data-add]");
  const del = event.target.closest("[data-del]");
  if (add) addToCalc(add.dataset.add);
  if (del) {
    const ok = await askConfirm("Remove this saved measurement?", "Remove");
    if (!ok) return;
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
        ? "Calculator is using lengths. Clear it before adding an angle."
        : "Calculator is using angles. Clear it before adding a length."
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
  toast("Added to Calculator");
}

function shownAlt(item) {
  return item.kind === "length" ? lengthConvLine(item.value) : angleConvLine(item.value);
}

function normalizeCalcOps() {
  state.calc.forEach((item, i) => {
    item.op = i === 0 ? null : item.op || "+";
  });
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
        <div class="tape-copy">
          <span class="tape-name">${escapeHtml(item.name)}</span>
          <span class="tape-val">${shown}</span>
          <span class="conv">${shownAlt(item)}</span>
        </div>
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

calcList.addEventListener("click", async (event) => {
  if (calcDrag?.moved) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
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
    const ok = await askConfirm("Remove this value from Calculator?", "Remove");
    if (!ok) return;
    state.calc = state.calc.filter((item) => item.id !== remove.dataset.remove);
    if (state.calc[0]) state.calc[0].op = null;
    persist();
    renderCalc();
  }
});

let calcDrag = null;

function calcRowAtY(clientY) {
  const rows = [...calcList.querySelectorAll(".tape-row")];
  for (let i = 0; i < rows.length; i += 1) {
    const box = rows[i].getBoundingClientRect();
    if (clientY < box.top + box.height / 2) return i;
  }
  return Math.max(0, rows.length - 1);
}

function placeCalcRow(row, to) {
  const rows = [...calcList.querySelectorAll(".tape-row")];
  const from = rows.indexOf(row);
  if (from < 0 || from === to) return;
  const target = rows[to];
  if (from < to) target.after(row);
  else target.before(row);
}

function commitCalcOrder() {
  const ids = [...calcList.querySelectorAll(".tape-row")].map((el) => el.dataset.id);
  state.calc = ids.map((id) => state.calc.find((item) => item.id === id)).filter(Boolean);
  normalizeCalcOps();
  persist();
  renderCalc();
}

calcList.addEventListener("pointerdown", (event) => {
  if (event.target.closest("[data-op], [data-remove]")) return;
  const row = event.target.closest(".tape-row");
  if (!row || state.calc.length < 2) return;
  calcDrag = {
    id: row.dataset.id,
    y: event.clientY,
    pointerId: event.pointerId,
    moved: false,
    row,
  };
});

window.addEventListener("pointermove", (event) => {
  if (!calcDrag) return;
  if (Math.abs(event.clientY - calcDrag.y) < 6 && !calcDrag.moved) return;
  if (!calcDrag.moved) {
    calcDrag.moved = true;
    calcDrag.row.classList.add("is-dragging");
    try {
      calcDrag.row.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  }
  placeCalcRow(calcDrag.row, calcRowAtY(event.clientY));
});

function endCalcDrag() {
  if (!calcDrag) return;
  const moved = calcDrag.moved;
  calcDrag.row.classList.remove("is-dragging");
  if (moved) commitCalcOrder();
  window.setTimeout(() => {
    calcDrag = null;
  }, 0);
}

window.addEventListener("pointerup", endCalcDrag);
window.addEventListener("pointercancel", endCalcDrag);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

document.getElementById("clear").addEventListener("click", async () => {
  const ok = await askConfirm("Clear all triangle measurements?", "Clear");
  if (!ok) return;
  state.raw = { a: "", b: "", c: "", A: "", B: "", C: "" };
  KEYS.forEach((key) => parseKey(key, ""));
  state.solutions = [];
  state.solutionIndex = 0;
  state.lastShape = { a: 9, b: 12, c: 15 };
  refresh();
});

document.getElementById("clear-bank").addEventListener("click", async () => {
  const ok = await askConfirm("Remove every saved measurement?", "Clear");
  if (!ok) return;
  state.bank = [];
  persist();
  renderBank();
});

document.getElementById("clear-calc").addEventListener("click", async () => {
  const ok = await askConfirm("Clear every value in Calculator?", "Clear");
  if (!ok) return;
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
  if (tab === "pipe") renderPipe(true);
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => setTab(btn.dataset.tab));
});

function setComposeKind(kind) {
  state.composeKind = kind === "angle" ? "angle" : "length";
  document.querySelectorAll(".kind").forEach((el) => {
    el.setAttribute("aria-pressed", String(el.dataset.kind === state.composeKind));
  });
  composeValue.placeholder = state.composeKind === "length" ? "12 3/8 or 145" : "45";
  composeValue.setAttribute("inputmode", state.composeKind === "length" ? "text" : "decimal");
  if (composeUnit) composeUnit.textContent = state.composeKind === "length" ? "in" : "°";
  updateComposePreview();
}

document.querySelectorAll(".kind").forEach((btn) => {
  btn.addEventListener("click", () => setComposeKind(btn.dataset.kind));
});

function addCompose() {
  const raw = composeValue.value.trim();
  const kind = state.composeKind;
  const parsed = kind === "length" ? parseLength(raw) : parseAngle(raw);
  if (parsed.empty || parsed.error) {
    toast(parsed.error || "Enter a measurement.");
    return;
  }
  const value = kind === "length" ? parsed.inches : parsed.degrees;
  if (state.calc.length && state.calc[0].kind !== kind) {
    toast(
      kind === "angle"
        ? "Calculator is using lengths. Clear it before adding an angle."
        : "Calculator is using angles. Clear it before adding a length."
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
  updateComposePreview();
  renderCalc();
  toast("Added to Calculator");
}

function updateComposePreview() {
  if (!composeConv) return;
  const raw = composeValue.value.trim();
  if (!raw) {
    composeConv.textContent = "";
    return;
  }
  const parsed = state.composeKind === "length" ? parseLength(raw) : parseAngle(raw);
  if (parsed.empty || parsed.error) {
    composeConv.textContent = parsed.error || "";
    return;
  }
  composeConv.textContent =
    state.composeKind === "length"
      ? lengthConvLine(parsed.inches)
      : angleConvLine(parsed.degrees);
}

composeValue.addEventListener("input", updateComposePreview);

document.getElementById("compose-form").addEventListener("submit", (event) => {
  event.preventDefault();
  addCompose();
});

document.getElementById("compose-add").addEventListener("click", (event) => {
  event.preventDefault();
  addCompose();
});

function miterLine(step) {
  const deflection = Math.abs(step.angle);
  const miter = Number.isFinite(step.miter) ? step.miter : deflection / 2;
  const included = 180 - deflection;
  return `Miter ${formatDecimal(miter, 2)}° each · included ${formatDecimal(included, 2)}°`;
}

function sitDegrees(raw, label) {
  const text = String(raw || "").trim();
  if (!text) return { degrees: 0 };
  const parsed = parseDegrees(text);
  if (parsed.empty) return { degrees: 0 };
  if (parsed.error) return { error: `${label} isn’t recognized.`, degrees: 0 };
  return { degrees: parsed.degrees };
}

function parsedPipeSteps() {
  const clr = parseLength(state.pipe.clrRaw);
  const od = parseLength(state.pipe.odRaw);
  const startA = sitDegrees(state.pipe.startAngleRaw, "Start angle");
  const startR = sitDegrees(state.pipe.startRotRaw, "Start rotation");
  const steps = [];
  const errors = [];
  const hasBend = state.pipe.steps.some((step) => step.type === "bend");
  if (hasBend && (clr.error || !(clr.inches > 0))) errors.push("Enter a centerline radius.");
  if (od.error || !(od.inches > 0)) errors.push("Enter a pipe diameter.");
  if (hasBend && clr.inches > 0 && od.inches > 0 && clr.inches + 1e-9 < od.inches / 2) {
    errors.push("Centerline radius is smaller than the pipe radius.");
  }
  if (startA.error) errors.push(startA.error);
  if (startR.error) errors.push(startR.error);
  let bendN = 0;
  let jointN = 0;
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
    const isJoint = step.type === "joint";
    if (isJoint) jointN += 1;
    else bendN += 1;
    const name = isJoint ? `Joint ${jointN}` : `Bend ${bendN}`;
    const ang = parseDegrees(step.angleRaw);
    const rot = step.rotRaw.trim() ? parseDegrees(step.rotRaw) : { degrees: 0 };
    if (ang.empty || ang.error || !Number.isFinite(ang.degrees) || Math.abs(ang.degrees) < 1e-9) {
      errors.push(`${name} needs an angle.`);
      steps.push({ ...step, angle: 0, rotation: 0, radius: clr.inches, miter: 0 });
      return;
    }
    if (isJoint && Math.abs(ang.degrees) >= 180) {
      errors.push(`${name} must be less than 180°.`);
      steps.push({ ...step, angle: ang.degrees, rotation: 0, radius: 0, miter: Math.abs(ang.degrees) / 2 });
      return;
    }
    if (!isJoint && Math.abs(ang.degrees) >= 360) {
      errors.push(`${name} must be less than 360°.`);
      steps.push({ ...step, angle: ang.degrees, rotation: 0, radius: clr.inches, miter: 0 });
      return;
    }
    if (rot.error || !Number.isFinite(rot.degrees)) {
      errors.push(`${name} clock isn’t recognized.`);
      steps.push({ ...step, angle: ang.degrees, rotation: 0, radius: isJoint ? 0 : clr.inches, miter: Math.abs(ang.degrees) / 2 });
      return;
    }
    steps.push({
      ...step,
      angle: ang.degrees,
      rotation: rot.degrees ?? 0,
      radius: isJoint ? 0 : clr.inches,
      miter: Math.abs(ang.degrees) / 2,
    });
  });
  return {
    clr: clr.inches,
    od: od.inches,
    startAngle: startA.degrees || 0,
    startRot: startR.degrees || 0,
    steps,
    errors,
  };
}

function pipeSvgToWorkspace(x, y) {
  const pt = pipeSvg.createSVGPoint();
  pt.x = x;
  pt.y = y;
  const ctm = pipeSvg.getScreenCTM();
  if (!ctm) return { x, y };
  const screen = pt.matrixTransform(ctm);
  const rect = pipeWorkspace.getBoundingClientRect();
  return { x: screen.x - rect.left, y: screen.y - rect.top };
}

function pipeWorkspaceToSvg(x, y) {
  const rect = pipeWorkspace.getBoundingClientRect();
  const pt = pipeSvg.createSVGPoint();
  pt.x = rect.left + x;
  pt.y = rect.top + y;
  const ctm = pipeSvg.getScreenCTM();
  if (!ctm) return { x, y };
  return pt.matrixTransform(ctm.inverse());
}

function updatePipeStepConvs(parsed) {
  if (pipeClrConv) {
    pipeClrConv.textContent = parsed.clr > 0 ? lengthConvLine(parsed.clr) : "";
  }
  if (pipeOdConv) {
    pipeOdConv.textContent = parsed.od > 0 ? lengthConvLine(parsed.od) : "";
  }
  pipeStepsEl.querySelectorAll("[data-straight]").forEach((input) => {
    const step = parsed.steps.find((s) => s.id === input.dataset.straight);
    const conv = input.closest("label")?.querySelector(".conv");
    if (conv) conv.textContent = step?.length ? lengthConvLine(step.length) : "";
  });
  pipeStepsEl.querySelectorAll("[data-angle]").forEach((input) => {
    const step = parsed.steps.find((s) => s.id === input.dataset.angle);
    const label = input.closest("label");
    const conv = label?.querySelector(".conv");
    if (conv) conv.textContent = step?.angle ? angleConvLine(step.angle) : "";
    const miter = label?.querySelector(".miter");
    if (miter) miter.textContent = step?.type === "joint" && step.angle ? miterLine(step) : "";
  });
  pipeStepsEl.querySelectorAll("[data-rot]").forEach((input) => {
    const step = parsed.steps.find((s) => s.id === input.dataset.rot);
    const conv = input.closest("label")?.querySelector(".conv");
    if (conv) conv.textContent = Number.isFinite(step?.rotation) ? angleConvLine(step.rotation) : "";
  });
  const startAng = pipeStepsEl.querySelector("[data-start-angle]");
  if (startAng) {
    const conv = startAng.closest("label")?.querySelector(".conv");
    if (conv) conv.textContent = angleConvLine(parsed.startAngle || 0);
  }
  const startRot = pipeStepsEl.querySelector("[data-start-rot]");
  if (startRot) {
    const conv = startRot.closest("label")?.querySelector(".conv");
    if (conv) conv.textContent = angleConvLine(parsed.startRot || 0);
  }
}

function degField(label, attr, value, shown) {
  return `<label>${label}
    <div class="unit-field">
      <input ${attr} value="${escapeHtml(value)}" placeholder="0" inputmode="decimal" />
      <span class="unit">°</span>
    </div>
    <p class="conv">${shown || ""}</p>
  </label>`;
}

function renderPipeList(parsed) {
  let straightN = 0;
  let bendN = 0;
  let jointN = 0;
  pipeStepsEl.innerHTML = state.pipe.steps
    .map((step, index) => {
      const found = parsed.steps.find((s) => s.id === step.id);
      const first = index === 0;
      const sitAng = degField(
        first && step.type === "straight" ? "Angle" : "Facing",
        "data-start-angle",
        state.pipe.startAngleRaw || "0",
        angleConvLine(parsed.startAngle || 0)
      );
      const sitRot = degField(
        "Start rotation",
        "data-start-rot",
        state.pipe.startRotRaw || "0",
        angleConvLine(parsed.startRot || 0)
      );
      if (step.type === "straight") {
        straightN += 1;
        return `<li class="cage-card" data-id="${step.id}">
          <header>
            <h3>Straight ${straightN}</h3>
            <button class="icon-btn" type="button" data-drop="${step.id}" aria-label="Remove straight ${straightN}">×</button>
          </header>
          <div class="cage-fields${first ? "" : " single"}">
            <label>Length
              <div class="unit-field">
                <input data-straight="${step.id}" value="${escapeHtml(step.raw)}" placeholder="12" inputmode="text" />
                <span class="unit">in</span>
              </div>
              <p class="conv">${found?.length ? lengthConvLine(found.length) : ""}</p>
            </label>
            ${first ? sitAng : ""}
          </div>
        </li>`;
      }
      const isJoint = step.type === "joint";
      if (isJoint) jointN += 1;
      else bendN += 1;
      const n = isJoint ? jointN : bendN;
      const name = isJoint ? `Joint ${n}` : `Bend ${n}`;
      return `<li class="cage-card" data-id="${step.id}">
        <header>
          <h3>${name}</h3>
          <button class="icon-btn" type="button" data-drop="${step.id}" aria-label="Remove ${name}">×</button>
        </header>
        <div class="cage-fields">
          ${first ? sitAng : ""}
          ${first ? sitRot : ""}
          <label>${isJoint ? "Joint" : "Bend"}
            <div class="unit-field">
              <input data-angle="${step.id}" value="${escapeHtml(step.angleRaw)}" placeholder="90" inputmode="decimal" />
              <span class="unit">°</span>
            </div>
            <p class="conv">${found?.angle ? angleConvLine(found.angle) : ""}</p>
            ${isJoint ? `<p class="conv miter">${found?.angle ? miterLine(found) : ""}</p>` : ""}
          </label>
          <label>Clock
            <div class="unit-field">
              <input data-rot="${step.id}" value="${escapeHtml(step.rotRaw)}" placeholder="0" inputmode="decimal" />
              <span class="unit">°</span>
            </div>
            <p class="conv">${Number.isFinite(found?.rotation) ? angleConvLine(found.rotation) : ""}</p>
          </label>
        </div>
      </li>`;
    })
    .join("");
}

function renderPipePreview(parsed) {
  const od = parsed.od > 0 ? parsed.od : 0;
  const first = state.pipe.steps[0];
  const firstTurn = first?.type === "bend" || first?.type === "joint";
  const model = buildPipe(parsed.clr || 3, parsed.steps, od, {
    angle: parsed.startAngle || 0,
    rotation: firstTurn ? parsed.startRot || 0 : 0,
    firstBend: firstTurn,
  });
  const msgs = [...parsed.errors, ...model.errors];
  pipeMsg.textContent = msgs[0] || "";
  pipeStatus.textContent = msgs[0]
    ? msgs[0]
    : "Drag the cage to turn it. Clock rolls around the incoming pipe. Start rotation tilts from the ground.";

  const w = Math.max(320, pipeWorkspace.clientWidth);
  const h = Math.max(320, pipeWorkspace.clientHeight);
  pipeSvg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  const laid = layoutPipePath(model, w, h, state.pipe.yaw, state.pipe.pitch, 20, od);
  const px = laid.scale || 1;
  const outline = 1.5;
  const stroke = Math.max(outline, od * px);
  const inner = Math.max(0, stroke - outline * 2);
  const dotR = Math.max(outline, stroke / 2);
  const dots = laid.marks
    .map((m) => {
      if (m.kind === "weld") {
        const s = Math.max(3.5, stroke * 0.28);
        return `<polygon class="pipe-dot weld" points="${m.x},${m.y - s} ${m.x + s},${m.y} ${m.x},${m.y + s} ${m.x - s},${m.y}" />`;
      }
      const r = m.kind === "start" || m.kind === "end" ? dotR : Math.max(1.25, Math.min(dotR * 0.45, 3));
      const cls = m.kind === "end" ? "pipe-dot end" : "pipe-dot";
      return `<circle class="${cls}" cx="${m.x}" cy="${m.y}" r="${r}" />`;
    })
    .join("");

  const mid = laid.marks.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 }
  );
  const nMarks = laid.marks.length || 1;
  const center = { x: mid.x / nMarks, y: mid.y / nMarks };
  const chipItems = (laid.labels || []).map((item, i) => {
    let dir = vecUnit(item.x - center.x, item.y - center.y);
    if (Math.hypot(dir.x, dir.y) < 0.2) {
      dir = vecUnit(Math.cos((i * 2.3) + 0.4), Math.sin((i * 2.3) + 0.4));
    }
    return {
      id: `lab-${i}`,
      ax: item.x,
      ay: item.y,
      dir,
      text: item.text,
      detail: "",
    };
  });
  const placed = placeAnchoredBoxes(chipItems, { w: 118, h: 46 }, { w, h }, 26);

  if (pipeChips) {
    pipeChips.innerHTML = placed
      .map(
        (box) =>
          `<div class="measure glass pipe-tag" data-pipe-tag="${box.id}">
            <p class="lab">${escapeHtml(box.text)}</p>
          </div>`
      )
      .join("");
    placed.forEach((box) => {
      const el = pipeChips.querySelector(`[data-pipe-tag="${box.id}"]`);
      if (!el) return;
      const pixel = pipeSvgToWorkspace(box.cx, box.cy);
      el.style.left = `${pixel.x}px`;
      el.style.top = `${pixel.y}px`;
    });
  }

  const wr = pipeWorkspace.getBoundingClientRect();
  const leaders = placed
    .map((box) => {
      const el = pipeChips?.querySelector(`[data-pipe-tag="${box.id}"]`);
      if (!el) return "";
      const r = el.getBoundingClientRect();
      const cx = r.left - wr.left + r.width / 2;
      const cy = r.top - wr.top + r.height / 2;
      const attach = pipeSvgToWorkspace(box.ax, box.ay);
      const edge = edgeToward(cx, cy, r.width, r.height, attach.x, attach.y);
      const end = pipeWorkspaceToSvg(edge.x, edge.y);
      return `<line class="leader" x1="${box.ax}" y1="${box.ay}" x2="${end.x}" y2="${end.y}" />`;
    })
    .join("");

  const floor = laid.floor
    ? `<path class="floor-fill" d="${laid.floor.fill}" /><path class="floor-grid" d="${laid.floor.grid}" /><path class="floor-edge" d="${laid.floor.edge}" />`
    : "";
  pipeSvg.innerHTML = laid.d
    ? `${floor}${leaders}<path class="tube" d="${laid.d}" style="stroke-width:${stroke.toFixed(2)}" />${inner > 0.25 ? `<path class="tube-soft" d="${laid.d}" style="stroke-width:${inner.toFixed(2)}" />` : ""}${dots}`
    : `${floor}${leaders}`;

  if (msgs.length) {
    pipeResult.innerHTML = `<p class="err">${msgs[0]}</p>`;
    return;
  }
  if (!state.pipe.steps.length) {
    pipeResult.innerHTML = "";
    return;
  }
  const conv = lengthConversions(model.developed, state.precision);
  const inside = lengthConversions(model.developedInside, state.precision);
  const outside = lengthConversions(model.developedOutside, state.precision);
  const reach = lengthConversions(model.reach, state.precision);
  const odConv = lengthConversions(od, state.precision);
  pipeResult.innerHTML = `<div class="total">
    <p class="equation">${model.bendCount} bend${model.bendCount === 1 ? "" : "s"} · ${model.jointCount} joint${model.jointCount === 1 ? "" : "s"} · ${odConv.fractionalInches} diameter</p>
    <div class="total-main"><span>Centerline</span><strong>${conv.fractionalInches}</strong></div>
    <div class="alts">
      <span>${conv.feetInches}</span>
      <span>${conv.decimalInches}</span>
      <span>${conv.mm}</span>
      <span>Inside ${inside.fractionalInches}</span>
      <span>Outside ${outside.fractionalInches}</span>
      <span>End reach ${reach.fractionalInches}</span>
    </div>
  </div>`;
}

function renderPipe(rebuildList = false) {
  if (!pipeClr) return;
  const parsed = parsedPipeSteps();
  if (document.activeElement !== pipeClr) pipeClr.value = state.pipe.clrRaw;
  if (pipeOd && document.activeElement !== pipeOd) pipeOd.value = state.pipe.odRaw || "";
  updatePipeStepConvs(parsed);
  if (rebuildList) {
    if (pipeStepsEl.contains(document.activeElement)) document.activeElement.blur();
    renderPipeList(parsed);
  }
  renderPipePreview(parsed);
}

pipeStepsEl.addEventListener("input", (event) => {
  const straight = event.target.closest("[data-straight]");
  const angle = event.target.closest("[data-angle]");
  const rot = event.target.closest("[data-rot]");
  const startAng = event.target.closest("[data-start-angle]");
  const startRotEl = event.target.closest("[data-start-rot]");
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
  if (startAng) state.pipe.startAngleRaw = startAng.value;
  if (startRotEl) state.pipe.startRotRaw = startRotEl.value;
  persist();
  renderPipe(false);
});

let cageDrag = null;

pipeStepsEl.addEventListener("click", async (event) => {
  if (cageDrag?.moved) return;
  const drop = event.target.closest("[data-drop]");
  if (!drop) return;
  const id = drop.dataset.drop;
  const ok = await askConfirm("Remove this piece from the cage?", "Remove");
  if (!ok) return;
  state.pipe.steps = state.pipe.steps.filter((step) => step.id !== id);
  persist();
  renderPipe(true);
});

function cageCardAtY(clientY) {
  const cards = [...pipeStepsEl.querySelectorAll(".cage-card")];
  for (let i = 0; i < cards.length; i += 1) {
    const box = cards[i].getBoundingClientRect();
    if (clientY < box.top + box.height / 2) return i;
  }
  return Math.max(0, cards.length - 1);
}

function placeCageCard(card, to) {
  const cards = [...pipeStepsEl.querySelectorAll(".cage-card")];
  const from = cards.indexOf(card);
  if (from < 0 || from === to) return;
  const target = cards[to];
  if (from < to) target.after(card);
  else target.before(card);
}

function commitCageOrder() {
  const ids = [...pipeStepsEl.querySelectorAll(".cage-card")].map((el) => el.dataset.id);
  state.pipe.steps = ids.map((id) => state.pipe.steps.find((step) => step.id === id)).filter(Boolean);
  persist();
  renderPipe(true);
}

pipeStepsEl.addEventListener("pointerdown", (event) => {
  if (event.target.closest("input, button, .unit-field")) return;
  const card = event.target.closest(".cage-card");
  if (!card || state.pipe.steps.length < 2) return;
  cageDrag = {
    id: card.dataset.id,
    y: event.clientY,
    moved: false,
    card,
  };
});

window.addEventListener("pointermove", (event) => {
  if (!cageDrag) return;
  if (Math.abs(event.clientY - cageDrag.y) < 6 && !cageDrag.moved) return;
  if (!cageDrag.moved) {
    cageDrag.moved = true;
    cageDrag.card.classList.add("is-dragging");
    try {
      cageDrag.card.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  }
  placeCageCard(cageDrag.card, cageCardAtY(event.clientY));
});

function endCageDrag() {
  if (!cageDrag) return;
  const moved = cageDrag.moved;
  cageDrag.card.classList.remove("is-dragging");
  if (moved) commitCageOrder();
  window.setTimeout(() => {
    cageDrag = null;
  }, 0);
}

window.addEventListener("pointerup", endCageDrag);
window.addEventListener("pointercancel", endCageDrag);

pipeClr.addEventListener("input", () => {
  state.pipe.clrRaw = pipeClr.value;
  persist();
  renderPipe(false);
});

if (pipeOd) {
  pipeOd.addEventListener("input", () => {
    state.pipe.odRaw = pipeOd.value;
    persist();
    renderPipe(false);
  });
}

document.getElementById("add-straight").addEventListener("click", () => {
  state.pipe.steps.push({ id: crypto.randomUUID(), type: "straight", raw: "8" });
  persist();
  renderPipe(true);
});

document.getElementById("add-bend").addEventListener("click", () => {
  state.pipe.steps.push({
    id: crypto.randomUUID(),
    type: "bend",
    angleRaw: "90",
    rotRaw: "0",
  });
  persist();
  renderPipe(true);
});

document.getElementById("add-joint").addEventListener("click", () => {
  state.pipe.steps.push({
    id: crypto.randomUUID(),
    type: "joint",
    angleRaw: "90",
    rotRaw: "0",
  });
  persist();
  renderPipe(true);
});

document.getElementById("clear-pipe").addEventListener("click", async () => {
  const ok = await askConfirm("Delete every piece in the cage?", "Reset");
  if (!ok) return;
  state.pipe = defaultPipe();
  persist();
  renderPipe(true);
});

let pipeDrag = null;
function pipeDragTarget(event) {
  return (
    event.target === pipeWorkspace ||
    event.target === pipeSvg ||
    event.target.closest?.("#pipe") ||
    event.target.closest?.(".tube") ||
    event.target.closest?.(".tube-soft")
  );
}
pipeWorkspace.addEventListener("pointerdown", (event) => {
  if (event.target.closest?.(".pipe-tag")) return;
  if (!pipeDragTarget(event) && event.target !== pipeWorkspace) return;
  pipeDrag = { x: event.clientX, y: event.clientY, yaw: state.pipe.yaw, pitch: state.pipe.pitch };
  pipeWorkspace.classList.add("is-drag");
  try {
    pipeWorkspace.setPointerCapture(event.pointerId);
  } catch {
    /* ignore */
  }
});
window.addEventListener("pointermove", (event) => {
  if (!pipeDrag) return;
  state.pipe.yaw = pipeDrag.yaw + (event.clientX - pipeDrag.x) * 0.45;
  state.pipe.pitch = Math.max(-80, Math.min(80, pipeDrag.pitch + (event.clientY - pipeDrag.y) * 0.35));
  renderPipePreview(parsedPipeSteps());
});
const endPipeDrag = () => {
  if (!pipeDrag) return;
  pipeDrag = null;
  pipeWorkspace.classList.remove("is-drag");
  persist();
};
window.addEventListener("pointerup", endPipeDrag);
window.addEventListener("pointercancel", endPipeDrag);
pipeWorkspace.addEventListener("pointerup", endPipeDrag);
pipeWorkspace.addEventListener("pointercancel", endPipeDrag);

window.addEventListener("resize", () => {
  if (state.tab === "pipe") renderPipe(false);
  else if (state.tab === "triangle") refresh();
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
    const reg = await navigator.serviceWorker.register("./sw.js?v=38");
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
