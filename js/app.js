import {
  angleConversions,
  formatDecimal,
  formatInchesFraction,
  lengthConversions,
  parseAngle,
  parseDegrees,
  parseLength,
} from "./parse.js?v=68";
import {
  controlAnchors,
  evaluateCalculation,
  layoutTriangle,
  placeAnchoredBoxes,
  placeAttachedChips,
  solveTriangle,
  unit as vecUnit,
} from "./solve.js?v=68";
import { buildPipe, defaultPipe, layoutPipePath } from "./pipe.js?v=68";
import { loadState, saveState } from "./storage.js?v=68";

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
const OP_MARK = { "+": "+", "-": "−", "*": "×", "/": "÷" };

function formatCalc(kind, value, precision) {
  return kind === "length"
    ? lengthConversions(value, precision).fractionalInches
    : angleConversions(value).degrees;
}

function migrateCalc(items, precision) {
  if (!Array.isArray(items) || !items.length) return [];
  if (items.some((item) => item && typeof item.expr === "string")) {
    return items
      .filter((item) => item && typeof item.expr === "string" && Number.isFinite(item.value))
      .map((item) => ({
        id: String(item.id || crypto.randomUUID()),
        kind: item.kind === "angle" ? "angle" : "length",
        expr: String(item.expr),
        value: Number(item.value),
      }));
  }
  const tape = items.filter((item) => item && Number.isFinite(item.value));
  if (!tape.length) return [];
  const result = evaluateCalculation(tape);
  if (result.empty || result.error || !Number.isFinite(result.value)) return [];
  const kind = tape[0].kind === "angle" ? "angle" : "length";
  const expr = tape
    .map((item, i) => `${i === 0 ? "" : ` ${OP_MARK[item.op] || "+"} `}${formatCalc(kind, item.value, precision)}`)
    .join("");
  return [
    {
      id: crypto.randomUUID(),
      kind,
      expr: `${expr} = ${formatCalc(kind, result.value, precision)}`,
      value: result.value,
    },
  ];
}

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
const calcEntry = document.getElementById("calc-entry");
const calcExpr = document.getElementById("calc-expr");
const calcConv = document.getElementById("calc-conv");
const calcUnit = document.getElementById("calc-unit");
const calcPad = document.getElementById("calc-pad");
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
const pipeEngage = document.getElementById("pipe-engage");
const pipeDone = document.getElementById("pipe-done");
const pipeClr = document.getElementById("pipe-clr");
const pipeOd = document.getElementById("pipe-od");
const pipeClrConv = document.getElementById("pipe-clr-conv");
const pipeOdConv = document.getElementById("pipe-od-conv");
const confirmDialog = document.getElementById("confirm-dialog");
const confirmMsg = document.getElementById("confirm-msg");
const confirmOk = document.getElementById("confirm-ok");
const confirmCancel = document.getElementById("confirm-cancel");
const distFromEl = document.getElementById("dist-from");
const distToEl = document.getElementById("dist-to");
const distResult = document.getElementById("dist-result");
const distWork = document.getElementById("dist-work");
const distWorkPanel = document.getElementById("dist-work-panel");
const distPickBtn = document.getElementById("dist-pick-btn");
const pipeRecenter = document.getElementById("pipe-recenter");
const cageSortBtn = document.getElementById("cage-sort");
const themeToggle = document.getElementById("theme-toggle");
const themeColorMeta = document.querySelector('meta[name="theme-color"]');

const TAB_LABEL = { triangle: "Triangle", combine: "Calculator", pipe: "Pipe", distance: "Distance" };

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
  calc: migrateCalc(stored.calc, stored.precision),
  saveTarget: null,
  lastShape: { a: 9, b: 12, c: 15 },
  tab: stored.tab,
  distFrom: stored.distFrom || "",
  distTo: stored.distTo || "",
  theme: stored.theme === "dark" ? "dark" : "light",
  pipe: { ...defaultPipe(), ...stored.pipe },
};

const desk = {
  kind: "length",
  acc: null,
  op: null,
  entry: "",
  expr: "",
  fresh: true,
};

let pickDist = false;
let pickIds = [];

precisionEl.value = String(state.precision);

function persist() {
  saveState(
    {
      precision: state.precision,
      bank: state.bank,
      calc: state.calc,
      tab: state.tab,
      distFrom: state.distFrom,
      distTo: state.distTo,
      theme: state.theme,
      pipe: state.pipe,
    },
    defaultPipe
  );
}

function applyTheme(theme) {
  const next = theme === "dark" ? "dark" : "light";
  state.theme = next;
  document.documentElement.setAttribute("data-theme", next);
  document.documentElement.style.colorScheme = next;
  if (themeColorMeta) themeColorMeta.content = next === "dark" ? "#161513" : "#eceae4";
  if (themeToggle) {
    themeToggle.setAttribute("aria-pressed", String(next === "dark"));
    themeToggle.setAttribute("aria-label", next === "dark" ? "Use light mode" : "Use dark mode");
  }
}

applyTheme(state.theme);
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    applyTheme(state.theme === "dark" ? "light" : "dark");
    persist();
  });
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
          <button class="icon-btn" type="button" data-del="${item.id}" aria-label="Delete ${escapeHtml(item.name)}">×</button>
        </div>
      </li>`;
    })
    .join("");
}

bankEl.addEventListener("click", async (event) => {
  const del = event.target.closest("[data-del]");
  if (del) {
    const ok = await askConfirm("Remove this saved measurement?", "Remove");
    if (!ok) return;
    state.bank = state.bank.filter((item) => item.id !== del.dataset.del);
    persist();
    renderBank();
  }
});

function shownAlt(item) {
  return item.kind === "length" ? lengthConvLine(item.value) : angleConvLine(item.value);
}

function resetDesk() {
  desk.acc = null;
  desk.op = null;
  desk.entry = "";
  desk.expr = "";
  desk.fresh = true;
}

function parseDesk() {
  const raw = desk.entry.trim();
  if (!raw) {
    if (desk.acc != null) return { value: desk.acc };
    return { empty: true };
  }
  if (desk.kind === "length") {
    const parsed = parseLength(raw);
    if (!parsed.error && !parsed.empty) return { value: parsed.inches };
    if (parsed.empty) return desk.acc != null ? { value: desk.acc } : { empty: true };
    const loose = parseDegrees(raw);
    if (!loose.error && Number.isFinite(loose.degrees)) return { value: loose.degrees };
    return { error: parsed.error };
  }
  const parsed = parseDegrees(raw);
  if (parsed.empty) return desk.acc != null ? { value: desk.acc } : { empty: true };
  if (parsed.error) return parsed;
  return { value: parsed.degrees };
}

function applyOp(a, op, b) {
  if (op === "/" && Math.abs(b) < 1e-12) return { error: "Division by zero isn’t allowed." };
  const value = op === "+" ? a + b : op === "-" ? a - b : op === "*" ? a * b : a / b;
  if (!Number.isFinite(value)) return { error: "That calculation couldn’t be completed." };
  return { value };
}

function pushRecent(expr, value) {
  state.calc.unshift({
    id: crypto.randomUUID(),
    kind: desk.kind,
    expr,
    value,
  });
  state.calc = state.calc.slice(0, 100);
  persist();
}

function deskConvText() {
  const parsed = parseDesk();
  if (parsed.empty || parsed.error || !Number.isFinite(parsed.value)) return parsed.error || "";
  return desk.kind === "length" ? lengthConvLine(parsed.value) : angleConvLine(parsed.value);
}

function renderDesk() {
  if (calcExpr) calcExpr.textContent = desk.expr;
  if (calcUnit) calcUnit.textContent = desk.kind === "length" ? "in" : "°";
  if (calcEntry && document.activeElement !== calcEntry) {
    calcEntry.value = desk.entry || "0";
  } else if (calcEntry && desk.fresh && document.activeElement !== calcEntry) {
    calcEntry.value = desk.entry || "0";
  }
  if (calcConv) calcConv.textContent = deskConvText();
  document.querySelectorAll(".kind").forEach((el) => {
    el.setAttribute("aria-pressed", String(el.dataset.kind === desk.kind));
  });
}

function renderCalc() {
  renderDesk();
  calcEmpty.hidden = state.calc.length > 0;
  document.getElementById("clear-calc").hidden = state.calc.length === 0;
  calcList.innerHTML = state.calc
    .map((item) => {
      const shown = formatCalc(item.kind, item.value, state.precision);
      return `<li class="tape-row" data-id="${item.id}">
        <div class="tape-copy">
          <span class="tape-expr">${escapeHtml(item.expr)}</span>
          <span class="tape-val">${shown}</span>
          <span class="conv">${shownAlt(item)}</span>
        </div>
        <button class="icon-btn" type="button" data-remove="${item.id}" aria-label="Remove calculation">×</button>
      </li>`;
    })
    .join("");
}

function typeKey(ch) {
  if (desk.fresh) desk.entry = ch === "." ? "0." : ch;
  else desk.entry += ch;
  desk.fresh = false;
}

function pressOp(op) {
  const parsed = parseDesk();
  if (parsed.empty) {
    if (desk.acc != null) {
      desk.op = op;
      desk.expr = `${formatCalc(desk.kind, desk.acc, state.precision)} ${OP_MARK[op]}`;
      desk.fresh = true;
      renderCalc();
    }
    return;
  }
  if (parsed.error) {
    toast(parsed.error);
    return;
  }
  if (desk.op && desk.acc != null && !desk.fresh) {
    const next = applyOp(desk.acc, desk.op, parsed.value);
    if (next.error) {
      toast(next.error);
      return;
    }
    desk.acc = next.value;
  } else {
    desk.acc = parsed.value;
  }
  desk.op = op;
  desk.entry = formatCalc(desk.kind, desk.acc, state.precision);
  desk.expr = `${desk.entry} ${OP_MARK[op]}`;
  desk.fresh = true;
  renderCalc();
}

function pressEquals() {
  const parsed = parseDesk();
  if (parsed.empty) return;
  if (parsed.error) {
    toast(parsed.error);
    return;
  }
  if (desk.op && desk.acc != null) {
    const next = applyOp(desk.acc, desk.op, parsed.value);
    if (next.error) {
      toast(next.error);
      return;
    }
    const left = formatCalc(desk.kind, desk.acc, state.precision);
    const right = formatCalc(desk.kind, parsed.value, state.precision);
    const shown = formatCalc(desk.kind, next.value, state.precision);
    const expr = `${left} ${OP_MARK[desk.op]} ${right} = ${shown}`;
    desk.acc = next.value;
    desk.op = null;
    desk.entry = shown;
    desk.expr = expr;
    desk.fresh = true;
    pushRecent(expr, next.value);
    renderCalc();
    return;
  }
  desk.acc = parsed.value;
  desk.entry = formatCalc(desk.kind, parsed.value, state.precision);
  desk.fresh = true;
  renderCalc();
}

function pressAc() {
  resetDesk();
  if (calcEntry) calcEntry.value = "0";
  renderCalc();
}

function pressBk() {
  if (desk.fresh) return;
  desk.entry = desk.entry.slice(0, -1);
  if (!desk.entry) desk.fresh = true;
  renderCalc();
}

calcList.addEventListener("click", async (event) => {
  const remove = event.target.closest("[data-remove]");
  if (remove) {
    const ok = await askConfirm("Remove this calculation?", "Remove");
    if (!ok) return;
    state.calc = state.calc.filter((item) => item.id !== remove.dataset.remove);
    persist();
    renderCalc();
    return;
  }
  const row = event.target.closest(".tape-row");
  if (!row) return;
  const item = state.calc.find((entry) => entry.id === row.dataset.id);
  if (!item) return;
  setCalcKind(item.kind, true);
  desk.acc = item.value;
  desk.op = null;
  desk.entry = formatCalc(item.kind, item.value, state.precision);
  desk.expr = item.expr;
  desk.fresh = true;
  renderCalc();
});

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
  const ok = await askConfirm("Clear recent calculations?", "Clear");
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
  if (tab !== "pipe") setPipeLive(false);
  persist();
  viewLabel.textContent = TAB_LABEL[tab];
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.setAttribute("aria-selected", String(btn.dataset.tab === tab));
  });
  document.getElementById("view-triangle").hidden = tab !== "triangle";
  document.getElementById("view-combine").hidden = tab !== "combine";
  document.getElementById("view-pipe").hidden = tab !== "pipe";
  document.getElementById("view-distance").hidden = tab !== "distance";
  document.querySelector(".app")?.classList.toggle("is-calc", tab === "combine");
  if (tab === "triangle") refresh();
  if (tab === "combine") renderCalc();
  if (tab === "pipe") renderPipe(true);
  if (tab === "distance") renderDistance();
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => setTab(btn.dataset.tab));
});

if (distFromEl) {
  distFromEl.addEventListener("change", () => {
    state.distFrom = distFromEl.value;
    persist();
    renderDistance();
  });
}
if (distToEl) {
  distToEl.addEventListener("change", () => {
    state.distTo = distToEl.value;
    persist();
    renderDistance();
  });
}

function setCalcKind(kind, keep = false) {
  const next = kind === "angle" ? "angle" : "length";
  if (next !== desk.kind && !keep) resetDesk();
  desk.kind = next;
  if (calcEntry) calcEntry.setAttribute("inputmode", next === "length" ? "text" : "decimal");
  renderDesk();
}

document.querySelectorAll(".kind").forEach((btn) => {
  btn.addEventListener("click", () => setCalcKind(btn.dataset.kind));
});

calcPad.addEventListener("click", (event) => {
  const btn = event.target.closest("button");
  if (!btn) return;
  if (btn.dataset.act === "ac") pressAc();
  else if (btn.dataset.act === "bk") pressBk();
  else if (btn.dataset.act === "eq") pressEquals();
  else if (btn.dataset.op) pressOp(btn.dataset.op);
  else if (btn.dataset.key != null) {
    typeKey(btn.dataset.key);
    if (calcEntry) calcEntry.value = desk.entry || "0";
    renderCalc();
  }
});

calcEntry.addEventListener("input", () => {
  desk.entry = calcEntry.value;
  desk.fresh = false;
  if (calcConv) calcConv.textContent = deskConvText();
});

calcEntry.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    pressEquals();
  }
});

calcEntry.addEventListener("focus", () => {
  if (desk.fresh && (!desk.entry || calcEntry.value === "0")) {
    calcEntry.select();
  }
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
    const jointLen = isJoint ? parseLength(step.raw) : null;
    const length = jointLen && !jointLen.error && jointLen.inches > 0 ? jointLen.inches : 0;
    if (isJoint && (jointLen.error || !(jointLen.inches > 0))) {
      errors.push(`${name} needs a length.`);
    }
    if (ang.empty || ang.error || !Number.isFinite(ang.degrees) || Math.abs(ang.degrees) < 1e-9) {
      errors.push(`${name} needs an angle.`);
      steps.push({ ...step, length, angle: 0, rotation: 0, radius: clr.inches, miter: 0 });
      return;
    }
    if (isJoint && Math.abs(ang.degrees) >= 180) {
      errors.push(`${name} must be less than 180°.`);
      steps.push({ ...step, length, angle: ang.degrees, rotation: 0, radius: 0, miter: Math.abs(ang.degrees) / 2 });
      return;
    }
    if (!isJoint && Math.abs(ang.degrees) >= 360) {
      errors.push(`${name} must be less than 360°.`);
      steps.push({ ...step, angle: ang.degrees, rotation: 0, radius: clr.inches, miter: 0 });
      return;
    }
    if (rot.error || !Number.isFinite(rot.degrees)) {
      errors.push(`${name} clock isn’t recognized.`);
      steps.push({ ...step, length, angle: ang.degrees, rotation: 0, radius: isJoint ? 0 : clr.inches, miter: Math.abs(ang.degrees) / 2 });
      return;
    }
    steps.push({
      ...step,
      length,
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
  pipeStepsEl.querySelectorAll("[data-straight], [data-len]").forEach((input) => {
    const id = input.dataset.straight || input.dataset.len;
    const step = parsed.steps.find((s) => s.id === id);
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
            <button class="icon-btn cage-handle" type="button" aria-label="Drag straight ${straightN}" tabindex="-1">
              <span class="sort-lines" aria-hidden="true"></span>
            </button>
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
          <button class="icon-btn cage-handle" type="button" aria-label="Drag ${name}" tabindex="-1">
            <span class="sort-lines" aria-hidden="true"></span>
          </button>
          <h3>${name}</h3>
          <button class="icon-btn" type="button" data-drop="${step.id}" aria-label="Remove ${name}">×</button>
        </header>
        <div class="cage-fields">
          ${first ? sitAng : ""}
          ${first ? sitRot : ""}
          ${
            isJoint
              ? `<label class="cage-span">Length
              <div class="unit-field">
                <input data-len="${step.id}" value="${escapeHtml(step.raw || "")}" placeholder="2" inputmode="text" />
                <span class="unit">in</span>
              </div>
              <p class="conv">${found?.length ? lengthConvLine(found.length) : ""}</p>
            </label>`
              : ""
          }
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
  syncCageSort();
}

function setPickDist(on) {
  pickDist = Boolean(on);
  if (!pickDist) pickIds = [];
  if (distPickBtn) distPickBtn.setAttribute("aria-pressed", String(pickDist));
  if (pipeWorkspace) pipeWorkspace.classList.toggle("is-picking", pickDist);
  renderPipe(false);
}

function pickStation(id) {
  if (!pickDist || !id) return;
  if (pickIds.includes(id)) {
    pickIds = [];
    renderPipe(false);
    return;
  }
  if (!pickIds.length) {
    pickIds = [id];
    renderPipe(false);
    return;
  }
  state.distFrom = pickIds[0];
  state.distTo = id;
  pickDist = false;
  pickIds = [];
  if (distPickBtn) distPickBtn.setAttribute("aria-pressed", "false");
  if (pipeWorkspace) pipeWorkspace.classList.remove("is-picking");
  persist();
  setTab("distance");
}

function nearestStationAt(clientX, clientY) {
  const nodes = pipeSvg?.querySelectorAll("[data-station]");
  if (!nodes?.length) return null;
  let best = null;
  let bestD = Infinity;
  nodes.forEach((el) => {
    const box = el.getBoundingClientRect();
    const d = Math.hypot(clientX - (box.left + box.width / 2), clientY - (box.top + box.height / 2));
    if (d < bestD) {
      bestD = d;
      best = el.dataset.station;
    }
  });
  const limit = pickDist ? 32 : 22;
  return bestD <= limit ? best : null;
}

function pipeView() {
  return {
    zoom: Math.max(0.4, Math.min(8, Number(state.pipe.zoom) || 1)),
    panX: Number.isFinite(state.pipe.panX) ? state.pipe.panX : 0,
    panY: Number.isFinite(state.pipe.panY) ? state.pipe.panY : 0,
  };
}

function pipeViewOffFrame() {
  const view = pipeView();
  return Math.abs(view.zoom - 1) > 0.03 || Math.hypot(view.panX, view.panY) > 8;
}

function syncPipeFrameBtn() {
  if (pipeRecenter) pipeRecenter.hidden = !pipeViewOffFrame();
}

function applyPipeView(next, save = false) {
  state.pipe.zoom = next.zoom;
  state.pipe.panX = next.panX;
  state.pipe.panY = next.panY;
  renderPipePreview(parsedPipeSteps());
  if (save) persist();
}

function zoomPipeFrom(view, sx, sy, nextZoom) {
  const z0 = view.zoom;
  const z1 = Math.max(0.4, Math.min(8, nextZoom));
  if (Math.abs(z1 - z0) < 1e-6) {
    return { zoom: z1, panX: view.panX, panY: view.panY };
  }
  const k = z1 / z0;
  const w = Math.max(320, pipeWorkspace.clientWidth);
  const h = Math.max(320, pipeWorkspace.clientHeight);
  return {
    zoom: z1,
    panX: (1 - k) * (sx - w / 2) + k * view.panX,
    panY: (1 - k) * (sy - h / 2) + k * view.panY,
  };
}

function zoomPipeAt(sx, sy, nextZoom) {
  return zoomPipeFrom(pipeView(), sx, sy, nextZoom);
}

function recenterPipe() {
  applyPipeView({ zoom: 1, panX: 0, panY: 0 }, true);
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
  if (msgs[0]) {
    pipeStatus.textContent = msgs[0];
  } else if (pickDist) {
    pipeStatus.textContent = pickIds.length
      ? `Point ${pickIds[0]} selected. Tap a second point, or tap ${pickIds[0]} again to cancel.`
      : "Tap the first named point on the cage.";
  } else if (!pipeLive) {
    pipeStatus.textContent = "Tap the cube to move the view.";
  } else {
    pipeStatus.textContent =
      "One finger turns · two fingers move · pinch to zoom.";
  }

  const w = Math.max(320, pipeWorkspace.clientWidth);
  const h = Math.max(320, pipeWorkspace.clientHeight);
  pipeSvg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  const laid = layoutPipePath(model, w, h, state.pipe.yaw, state.pipe.pitch, 20, od, {
    zoom: state.pipe.zoom,
    panX: state.pipe.panX,
    panY: state.pipe.panY,
  });
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
  const stationMarks = [...(laid.stations || [])]
    .sort((a, b) => (b.z ?? 0) - (a.z ?? 0))
    .map((s) => {
      const r = Math.max(pickDist ? 12 : 8, Math.min(pickDist ? 15 : 11, dotR + (pickDist ? 5 : 2)));
      const hit = pickDist ? 26 : 18;
      const picked = pickDist && pickIds.includes(s.id);
      return `<g class="station${picked ? " is-picked" : ""}" data-station="${escapeHtml(s.id)}" transform="translate(${Number(s.x).toFixed(1)} ${Number(s.y).toFixed(1)})">
        <circle class="station-hit" r="${hit}" />
        <circle class="station-halo" r="${r.toFixed(1)}" />
        <text class="station-lab" dy="0.35em">${escapeHtml(s.name)}</text>
      </g>`;
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
  const placed = placeAnchoredBoxes(chipItems, { w: 72, h: 22 }, { w, h }, 18);

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
    ? `${floor}${leaders}<path class="tube" d="${laid.d}" style="stroke-width:${stroke.toFixed(2)}" />${inner > 0.25 ? `<path class="tube-soft" d="${laid.d}" style="stroke-width:${inner.toFixed(2)}" />` : ""}${dots}${stationMarks}`
    : `${floor}${leaders}`;
  syncPipeFrameBtn();

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
    <div class="total-main"><span>Center to center</span><strong>${conv.fractionalInches}</strong></div>
    <div class="alts">
      <span>${conv.feetInches}</span>
      <span>${conv.decimalInches}</span>
      <span>${conv.mm}</span>
      <span>Inside to inside ${inside.fractionalInches}</span>
      <span>Outside to outside ${outside.fractionalInches}</span>
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
  renderDistance();
}

function currentPipeModel() {
  const parsed = parsedPipeSteps();
  const od = parsed.od > 0 ? parsed.od : 0;
  const first = state.pipe.steps[0];
  const firstTurn = first?.type === "bend" || first?.type === "joint";
  return buildPipe(parsed.clr || 3, parsed.steps, od, {
    angle: parsed.startAngle || 0,
    rotation: firstTurn ? parsed.startRot || 0 : 0,
    firstBend: firstTurn,
  });
}

function currentStations() {
  return currentPipeModel().stations || [];
}

function inchMark(value) {
  return lengthConversions(value, state.precision).fractionalInches;
}

function signedInch(value) {
  if (!(Math.abs(value) > 1e-9)) return inchMark(0);
  return `${value < 0 ? "−" : ""}${inchMark(Math.abs(value))}`;
}

function distMeasure(inches, alts = false) {
  if (!Number.isFinite(inches) || inches < -1e-9) {
    return { main: "—", alts: "" };
  }
  const conv = lengthConversions(Math.max(0, inches), state.precision);
  return {
    main: conv.fractionalInches,
    alts: alts
      ? `<div class="alts">
          <span>${conv.feetInches}</span>
          <span>${conv.decimalInches}</span>
          <span>${conv.mm}</span>
        </div>`
      : "",
  };
}

function distRow(label, inches, alts = false) {
  const shown = distMeasure(inches, alts);
  return `<div class="total-main"><span>${label}</span><strong>${shown.main}</strong></div>${shown.alts}`;
}

function legsBetween(legs, stations, fromId, toId) {
  const ids = stations.map((s) => s.id);
  const i = ids.indexOf(fromId);
  const j = ids.indexOf(toId);
  if (i < 0 || j < 0 || i === j) return [];
  const lo = Math.min(i, j);
  const hi = Math.max(i, j);
  const span = new Set(ids.slice(lo, hi + 1));
  return (legs || []).filter((leg) => span.has(leg.from) && span.has(leg.to) && (leg.length || 0) > 1e-9);
}

function renderDistance() {
  if (!distFromEl || !distToEl) return;
  const model = currentPipeModel();
  const stations = model.stations || [];
  const ids = new Set(stations.map((s) => s.id));
  if (!ids.has(state.distFrom)) state.distFrom = stations[0]?.id || "";
  if (!ids.has(state.distTo)) state.distTo = stations[stations.length - 1]?.id || "";
  if (stations.length > 1 && state.distFrom === state.distTo) {
    state.distTo = stations.find((s) => s.id !== state.distFrom)?.id || state.distTo;
  }
  const opts = stations.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
  distFromEl.innerHTML = opts;
  distToEl.innerHTML = opts;
  if (state.distFrom) distFromEl.value = state.distFrom;
  if (state.distTo) distToEl.value = state.distTo;
  const from = stations.find((s) => s.id === state.distFrom);
  const to = stations.find((s) => s.id === state.distTo);
  if (!from || !to || from.id === to.id) {
    if (distResult) {
      distResult.innerHTML = stations.length < 2 ? `<p class="empty">Need at least two named points on the cage.</p>` : "";
    }
    if (distWork) distWork.innerHTML = "";
    if (distWorkPanel) distWorkPanel.hidden = true;
    return;
  }
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const straight = Math.hypot(dx, dy, dz);
  const od = model.od > 0 ? model.od : 0;
  const alongA = from.along || 0;
  const alongB = to.along || 0;
  const along = Math.abs(alongA - alongB);
  const sumSq = dx * dx + dy * dy + dz * dz;
  const pieces = legsBetween(model.legs, stations, from.id, to.id);
  const alongInside = along - pieces.reduce((sum, leg) => sum + ((leg.length || 0) - (leg.inside ?? leg.length ?? 0)), 0);
  const alongOutside = along + pieces.reduce((sum, leg) => sum + ((leg.outside ?? leg.length ?? 0) - (leg.length || 0)), 0);
  const pieceRows = pieces
    .map((leg) => {
      const note =
        leg.kind === "bend"
          ? `${inchMark(leg.radius)} CLR · inside ${inchMark(leg.inside)} · outside ${inchMark(leg.outside)}`
          : "";
      return `<div class="work-row">
        <span>${escapeHtml(leg.from)}→${escapeHtml(leg.to)}</span>
        <span class="work-note">${escapeHtml(leg.label)}${note ? ` · ${escapeHtml(note)}` : ""}</span>
        <span>${inchMark(leg.length)}</span>
      </div>`;
    })
    .join("");
  distResult.innerHTML = `<div class="total">
    <p class="equation">${from.name} to ${to.name}</p>
    <p class="dist-kind">Straight-line · through space</p>
    ${distRow("Center to center", straight, true)}
    ${distRow("Inside to inside", straight - od)}
    ${distRow("Outside to outside", straight + od)}
    <p class="dist-kind">Along pipe</p>
    ${distRow("Center to center", along, true)}
    ${distRow("Inside to inside", alongInside)}
    ${distRow("Outside to outside", alongOutside)}
  </div>`;
  if (distWork) {
    distWork.innerHTML = `<p class="equation">${escapeHtml(from.name)} to ${escapeHtml(to.name)}</p>
      <div class="work">
        <p class="work-kicker">Straight-line</p>
        <p class="work-line">ΔX = ${signedInch(dx)}</p>
        <p class="work-line">ΔY = ${signedInch(dy)}</p>
        <p class="work-line">ΔZ = ${signedInch(dz)}</p>
        <p class="work-line">Center to center d = √(ΔX² + ΔY² + ΔZ²)</p>
        <p class="work-line">= √(${formatDecimal(dx, 3)}² + ${formatDecimal(dy, 3)}² + ${formatDecimal(dz, 3)}²)</p>
        <p class="work-line">= √(${formatDecimal(dx * dx, 3)} + ${formatDecimal(dy * dy, 3)} + ${formatDecimal(dz * dz, 3)})</p>
        <p class="work-line">= √${formatDecimal(sumSq, 3)} = ${formatDecimal(straight, 3)} in</p>
        <p class="work-line">OD = ${inchMark(od)}</p>
        <p class="work-line">Inside to inside = d − OD = ${straight - od < -1e-9 ? "—" : inchMark(straight - od)}</p>
        <p class="work-line">Outside to outside = d + OD = ${inchMark(straight + od)}</p>
      </div>
      <div class="work">
        <p class="work-kicker">Along pipe</p>
        <p class="work-line">Center to center at ${escapeHtml(from.name)} = ${inchMark(alongA)}</p>
        <p class="work-line">Center to center at ${escapeHtml(to.name)} = ${inchMark(alongB)}</p>
        <p class="work-line">|${inchMark(alongB)} − ${inchMark(alongA)}| = ${inchMark(along)}</p>
        <p class="work-line">Inside to inside = ${inchMark(alongInside)}</p>
        <p class="work-line">Outside to outside = ${inchMark(alongOutside)}</p>
        ${
          pieceRows
            ? `<div class="work-pieces">${pieceRows}<div class="work-row work-sum"><span></span><span>Center to center</span><span>${inchMark(along)}</span></div>
            <div class="work-row work-sum"><span></span><span>Inside to inside</span><span>${inchMark(alongInside)}</span></div>
            <div class="work-row work-sum"><span></span><span>Outside to outside</span><span>${inchMark(alongOutside)}</span></div></div>`
            : ""
        }
      </div>`;
  }
  if (distWorkPanel) distWorkPanel.hidden = false;
}

pipeStepsEl.addEventListener("input", (event) => {
  const straight = event.target.closest("[data-straight]");
  const jointLen = event.target.closest("[data-len]");
  const angle = event.target.closest("[data-angle]");
  const rot = event.target.closest("[data-rot]");
  const startAng = event.target.closest("[data-start-angle]");
  const startRotEl = event.target.closest("[data-start-rot]");
  if (straight) {
    const step = state.pipe.steps.find((item) => item.id === straight.dataset.straight);
    if (step) step.raw = straight.value;
  }
  if (jointLen) {
    const step = state.pipe.steps.find((item) => item.id === jointLen.dataset.len);
    if (step) step.raw = jointLen.value;
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

function cageSorting() {
  return pipeStepsEl?.classList.contains("is-sorting");
}

function syncCageSort() {
  if (!cageSortBtn || !pipeStepsEl) return;
  const canSort = state.pipe.steps.length > 1;
  if (!canSort) pipeStepsEl.classList.remove("is-sorting");
  cageSortBtn.disabled = !canSort;
  cageSortBtn.setAttribute("aria-pressed", String(canSort && cageSorting()));
}

if (cageSortBtn) {
  cageSortBtn.addEventListener("click", () => {
    if (state.pipe.steps.length < 2) return;
    pipeStepsEl.classList.toggle("is-sorting");
    syncCageSort();
  });
}

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
  if (!cageSorting()) return;
  if (event.target.closest("input, [data-drop], .unit-field")) return;
  const card = event.target.closest(".cage-card");
  if (!card || state.pipe.steps.length < 2) return;
  event.preventDefault();
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
    raw: "2",
    angleRaw: "90",
    rotRaw: "0",
  });
  persist();
  renderPipe(true);
});

if (distPickBtn) {
  distPickBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    setPickDist(!pickDist);
  });
}

if (pipeRecenter) {
  pipeRecenter.addEventListener("click", (event) => {
    event.stopPropagation();
    recenterPipe();
  });
}

document.getElementById("clear-pipe").addEventListener("click", async () => {
  const ok = await askConfirm("Delete every piece in the cage?", "Reset");
  if (!ok) return;
  state.pipe = defaultPipe();
  persist();
  renderPipe(true);
});

const pipeHands = new Map();
let pipeRotate = null;
let pipeTwo = null;
let pipeTap = null;
let pipeBlockRotate = false;
let pipeZoomSave = 0;
let pipeLive = false;

function setPipeLive(on) {
  const next = Boolean(on);
  const changed = next !== pipeLive;
  pipeLive = next;
  pipeWorkspace?.classList.toggle("is-live", pipeLive);
  if (pipeEngage) pipeEngage.hidden = pipeLive;
  if (pipeDone) pipeDone.hidden = !pipeLive;
  if (!pipeLive) {
    pipeRotate = null;
    pipeTwo = null;
    pipeTap = null;
    pipeHands.clear();
    pipeBlockRotate = false;
    pipeWorkspace?.classList.remove("is-drag");
  }
  if (changed && state.tab === "pipe") renderPipePreview(parsedPipeSteps());
}

function pipeChromeHit(target) {
  return target?.closest?.("#dist-pick-btn, #pipe-recenter, #pipe-engage, #pipe-done");
}

function pipeDragTarget(event) {
  return (
    event.target === pipeWorkspace ||
    event.target === pipeSvg ||
    event.target.closest?.("#pipe") ||
    event.target.closest?.(".tube") ||
    event.target.closest?.(".tube-soft") ||
    event.target.closest?.(".station")
  );
}

function pipeClientToSvg(clientX, clientY) {
  const rect = pipeWorkspace.getBoundingClientRect();
  return pipeWorkspaceToSvg(clientX - rect.left, clientY - rect.top);
}

function pipePair(points) {
  const a = points[0];
  const b = points[1];
  return {
    dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
    mid: pipeClientToSvg((a.x + b.x) / 2, (a.y + b.y) / 2),
  };
}

function startPipeTwo(points) {
  const pose = pipePair(points);
  const view = pipeView();
  pipeTwo = { ...pose, zoom: view.zoom, panX: view.panX, panY: view.panY, pinched: false };
  pipeRotate = null;
  pipeTap = null;
  pipeBlockRotate = true;
  pipeWorkspace.classList.remove("is-drag");
}

function movePipeTwo(points) {
  if (!pipeTwo || points.length < 2) return;
  const pose = pipePair(points);
  const ratio = pose.dist / pipeTwo.dist;
  if (!pipeTwo.pinched && Math.abs(ratio - 1) > 0.04) pipeTwo.pinched = true;
  const zoomed = zoomPipeFrom(
    { zoom: pipeTwo.zoom, panX: pipeTwo.panX, panY: pipeTwo.panY },
    pipeTwo.mid.x,
    pipeTwo.mid.y,
    pipeTwo.pinched ? pipeTwo.zoom * ratio : pipeTwo.zoom
  );
  applyPipeView({
    zoom: zoomed.zoom,
    panX: zoomed.panX + (pose.mid.x - pipeTwo.mid.x),
    panY: zoomed.panY + (pose.mid.y - pipeTwo.mid.y),
  });
}

function pipeTouchPoints(event) {
  return [...event.touches].map((touch) => ({
    x: touch.clientX,
    y: touch.clientY,
    id: touch.identifier,
  }));
}

function rotatePipeBy(x, y) {
  if (!pipeRotate) return;
  if (Math.hypot(x - pipeRotate.x, y - pipeRotate.y) > 6) pipeRotate.moved = true;
  state.pipe.yaw = pipeRotate.yaw + (x - pipeRotate.x) * 0.45;
  state.pipe.pitch = Math.max(-80, Math.min(80, pipeRotate.pitch + (y - pipeRotate.y) * 0.35));
  pipeWorkspace.classList.add("is-drag");
  renderPipePreview(parsedPipeSteps());
}

pipeWorkspace.addEventListener(
  "touchstart",
  (event) => {
    if (pipeChromeHit(event.target)) return;
    if (pickDist && event.touches.length === 1) {
      const touch = event.touches[0];
      const id = nearestStationAt(touch.clientX, touch.clientY);
      if (id) {
        pipeTap = {
          id,
          x: touch.clientX,
          y: touch.clientY,
          pointerId: touch.identifier,
        };
        if (event.cancelable) event.preventDefault();
        return;
      }
    }
    if (!pipeLive) return;
    if (event.cancelable) event.preventDefault();
    const points = pipeTouchPoints(event);
    if (points.length >= 2) {
      startPipeTwo(points);
      return;
    }
    if (pipeBlockRotate || !points.length) return;
    pipeRotate = {
      x: points[0].x,
      y: points[0].y,
      yaw: state.pipe.yaw,
      pitch: state.pipe.pitch,
      moved: false,
    };
  },
  { passive: false }
);

window.addEventListener(
  "touchmove",
  (event) => {
    if (!pipeTwo && !pipeRotate && !pipeTap) return;
    if (event.cancelable) event.preventDefault();
    const points = pipeTouchPoints(event);
    if (points.length >= 2) {
      if (!pipeTwo) startPipeTwo(points);
      movePipeTwo(points);
      return;
    }
    if (pipeTap && points.length === 1) {
      if (Math.hypot(points[0].x - pipeTap.x, points[0].y - pipeTap.y) > 14) pipeTap = null;
      return;
    }
    if (pipeBlockRotate || !pipeRotate || !points.length) return;
    rotatePipeBy(points[0].x, points[0].y);
  },
  { passive: false, capture: true }
);

function onPipeTouchEnd(event) {
  if (!pipeTwo && !pipeRotate && !pipeTap && !pipeBlockRotate) return;
  const points = pipeTouchPoints(event);
  if (pipeTap && points.length === 0) {
    const touch = event.changedTouches[0];
    if (touch && Math.hypot(touch.clientX - pipeTap.x, touch.clientY - pipeTap.y) < 14) {
      pickStation(pipeTap.id);
    }
    pipeTap = null;
  }
  if (points.length >= 2) {
    startPipeTwo(points);
    return;
  }
  pipeTwo = null;
  pipeRotate = null;
  pipeWorkspace.classList.remove("is-drag");
  if (points.length === 0) {
    pipeBlockRotate = false;
    persist();
  }
}

window.addEventListener("touchend", onPipeTouchEnd, { passive: false, capture: true });
window.addEventListener("touchcancel", onPipeTouchEnd, { passive: false, capture: true });

["gesturestart", "gesturechange", "gestureend"].forEach((type) => {
  pipeWorkspace.addEventListener(type, (event) => {
    if (pipeLive && event.cancelable) event.preventDefault();
  });
});

pipeEngage?.addEventListener("click", (event) => {
  event.stopPropagation();
  setPipeLive(true);
});
pipeDone?.addEventListener("click", (event) => {
  event.stopPropagation();
  setPipeLive(false);
});

pipeWorkspace.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "touch") return;
  if (pipeChromeHit(event.target)) return;
  if (pickDist) {
    const id = nearestStationAt(event.clientX, event.clientY);
    if (id) {
      event.preventDefault();
      pipeTap = {
        id,
        x: event.clientX,
        y: event.clientY,
        pointerId: event.pointerId,
      };
      return;
    }
  }
  if (!pipeLive) return;
  if (event.target.closest?.(".pipe-tag")) return;
  if (!pipeDragTarget(event) && event.target !== pipeWorkspace) return;
  pipeHands.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pipeHands.size >= 2) {
    startPipeTwo([...pipeHands.values()]);
    return;
  }
  pipeRotate = {
    x: event.clientX,
    y: event.clientY,
    yaw: state.pipe.yaw,
    pitch: state.pipe.pitch,
    moved: false,
  };
});

window.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch") return;
  if (pipeHands.has(event.pointerId)) {
    pipeHands.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }
  if (pipeTwo && pipeHands.size >= 2) {
    movePipeTwo([...pipeHands.values()]);
    return;
  }
  if (!pipeRotate || pipeBlockRotate) return;
  rotatePipeBy(event.clientX, event.clientY);
});

function endPipePointer(event) {
  if (event.pointerType === "touch") return;
  if (endPipePointer._last === event.pointerId && event.timeStamp === endPipePointer._t) return;
  endPipePointer._last = event.pointerId;
  endPipePointer._t = event.timeStamp;
  const tap = pipeTap && pipeTap.pointerId === event.pointerId ? pipeTap : null;
  pipeHands.delete(event.pointerId);
  if (tap && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) < 14) {
    pickStation(tap.id);
  }
  if (pipeTap && pipeTap.pointerId === event.pointerId) pipeTap = null;
  if (pipeHands.size >= 2) {
    startPipeTwo([...pipeHands.values()]);
    return;
  }
  pipeTwo = null;
  if (!pipeHands.size) {
    pipeRotate = null;
    pipeBlockRotate = false;
    pipeWorkspace.classList.remove("is-drag");
    persist();
  } else {
    pipeRotate = null;
    pipeWorkspace.classList.remove("is-drag");
  }
}

pipeWorkspace.addEventListener("pointerup", endPipePointer);
pipeWorkspace.addEventListener("pointercancel", endPipePointer);

pipeWorkspace.addEventListener(
  "wheel",
  (event) => {
    if (!pipeLive) return;
    event.preventDefault();
    const svg = pipeClientToSvg(event.clientX, event.clientY);
    applyPipeView(zoomPipeAt(svg.x, svg.y, pipeView().zoom * Math.exp(-event.deltaY * 0.0018)));
    window.clearTimeout(pipeZoomSave);
    pipeZoomSave = window.setTimeout(() => persist(), 180);
  },
  { passive: false }
);

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
    const reg = await navigator.serviceWorker.register("./sw.js?v=68");
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
