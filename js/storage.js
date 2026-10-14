const KEY = "fab-bench-v1";
const BANK_LIMIT = 200;
const CALC_LIMIT = 100;
const PIPE_STEP_LIMIT = 40;

const defaults = {
  precision: 16,
  bank: [],
  calc: [],
  tab: "triangle",
  pipe: null,
  theme: "light",
};

function sanitizeCalc(items) {
  if (!Array.isArray(items)) return [];
  return items
    .slice(0, CALC_LIMIT)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      if (typeof item.expr === "string" && Number.isFinite(Number(item.value))) {
        return {
          id: String(item.id || crypto.randomUUID()),
          kind: item.kind === "angle" ? "angle" : "length",
          expr: String(item.expr).slice(0, 240),
          value: Number(item.value),
        };
      }
      return null;
    })
    .filter(Boolean);
}

function sanitizeTab(tab) {
  return tab === "combine" || tab === "pipe" || tab === "triangle" || tab === "distance" || tab === "weld"
    ? tab
    : "triangle";
}

function sanitizeWeld(weld) {
  const metals = new Set(["steel", "ss304", "ss316", "al6061"]);
  const joints = new Set(["butt", "tjoint", "lap", "corner", "edge"]);
  const positions = new Set(["flat", "vertical", "overhead"]);
  const src = weld && typeof weld === "object" ? weld : {};
  const mapMetal = (id) => {
    if (id === "stainless") return "ss304";
    if (id === "aluminum") return "al6061";
    return metals.has(id) ? id : "steel";
  };
  const mapJoint = (id) => {
    if (id === "fillet") return "tjoint";
    if (id === "groove" || id === "pipe") return "butt";
    return joints.has(id) ? id : "tjoint";
  };
  const process = src.process === "mig" || src.process === "stick" ? src.process : "tig";
  return {
    process,
    metalA: mapMetal(src.metalA),
    metalB: mapMetal(src.metalB),
    thickA: String(src.thickA ?? "1/8").slice(0, 24),
    thickB: String(src.thickB ?? "1/8").slice(0, 24),
    joint: mapJoint(src.joint),
    position: positions.has(src.position) ? src.position : "flat",
  };
}

function sanitizeTheme(theme) {
  return theme === "dark" || theme === "light" ? theme : "";
}

function resolveTheme(saved) {
  const explicit = sanitizeTheme(saved);
  if (explicit) return explicit;
  if (typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

function sanitizeDistGeom(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const out = [];
  for (const item of items.slice(0, PIPE_STEP_LIMIT)) {
    if (!item || typeof item !== "object") continue;
    const from = String(item.from || "").slice(0, 8);
    const to = String(item.to || "").slice(0, 8);
    if (!from || !to || from === to) continue;
    const path = item.path === "along" ? "along" : "space";
    const a = from < to ? from : to;
    const b = from < to ? to : from;
    const key = `${a}|${b}|${path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ from, to, path });
  }
  return out;
}

function sanitizeFit(fit) {
  if (!fit || typeof fit !== "object") return null;
  const field = fit.field === "angle" ? "angle" : "length";
  const path = fit.path === "along" ? "along" : "space";
  const from = String(fit.from || "").slice(0, 8);
  const to = String(fit.to || "").slice(0, 8);
  const raw = String(fit.raw ?? "").slice(0, 48);
  if (!from || !to || from === to) return null;
  const base = Number(fit.base);
  return {
    field,
    path,
    from,
    to,
    raw,
    ...(Number.isFinite(base) ? { base } : {}),
  };
}

function sanitizePipe(pipe, fallback) {
  if (!pipe || typeof pipe !== "object") return fallback;
  const steps = Array.isArray(pipe.steps)
    ? pipe.steps
        .slice(0, PIPE_STEP_LIMIT)
        .map((step) => {
          if (!step || typeof step !== "object") return null;
          const fit = sanitizeFit(step.fit);
          if (step.type === "bend" || step.type === "joint") {
            const next = {
              id: String(step.id || crypto.randomUUID()),
              type: step.type === "joint" ? "joint" : "bend",
              angleRaw: String(step.angleRaw ?? ""),
              rotRaw: String(step.rotRaw ?? "0"),
            };
            if (next.type === "joint") next.raw = String(step.raw ?? "");
            if (fit) next.fit = fit;
            return next;
          }
          const straight = {
            id: String(step.id || crypto.randomUUID()),
            type: "straight",
            raw: String(step.raw ?? ""),
          };
          if (fit) straight.fit = fit;
          return straight;
        })
        .filter(Boolean)
    : [];
  return {
    clrRaw: String(pipe.clrRaw ?? fallback.clrRaw),
    odRaw: String(pipe.odRaw ?? fallback.odRaw),
    startAngleRaw: String(pipe.startAngleRaw ?? fallback.startAngleRaw ?? "0"),
    startRotRaw: String(pipe.startRotRaw ?? fallback.startRotRaw ?? "0"),
    yaw: Number.isFinite(pipe.yaw) ? pipe.yaw : fallback.yaw,
    pitch: Number.isFinite(pipe.pitch) ? pipe.pitch : fallback.pitch,
    zoom: Number.isFinite(pipe.zoom) ? Math.min(8, Math.max(0.4, pipe.zoom)) : 1,
    panX: Number.isFinite(pipe.panX) ? pipe.panX : 0,
    panY: Number.isFinite(pipe.panY) ? pipe.panY : 0,
    steps,
  };
}

function facingCamera(pipe, fallback) {
  const next = sanitizePipe(pipe, fallback);
  const oldIso = Math.abs(next.yaw - 38) < 0.6 && Math.abs(next.pitch - 24) < 0.6;
  if (oldIso) {
    next.yaw = fallback.yaw;
    next.pitch = fallback.pitch;
  }
  return next;
}

export function loadState(makePipe) {
  const fallbackPipe = makePipe
    ? makePipe()
    : { clrRaw: "3", odRaw: "1 1/2", startAngleRaw: "0", startRotRaw: "0", yaw: 0, pitch: 22, zoom: 1, panX: 0, panY: 0, steps: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults, bank: [], calc: [], pipe: fallbackPipe, distFrom: "", distTo: "", distFace: "center", distGeom: [], weld: sanitizeWeld(null), theme: resolveTheme() };
    const data = JSON.parse(raw);
    const precision = [16, 32, 64].includes(data.precision) ? data.precision : 16;
    const bank = Array.isArray(data.bank) ? data.bank.slice(0, BANK_LIMIT) : [];
    const calc = Array.isArray(data.calc) ? data.calc.slice(0, CALC_LIMIT) : [];
    const pipe =
      data.pipeVersion === 3
        ? facingCamera(data.pipe, fallbackPipe)
        : fallbackPipe;
    return {
      precision,
      bank,
      calc,
      tab: sanitizeTab(data.tab),
      distFrom: typeof data.distFrom === "string" ? data.distFrom : "",
      distTo: typeof data.distTo === "string" ? data.distTo : "",
      distFace: data.distFace === "inside" || data.distFace === "outside" ? data.distFace : "center",
      distGeom: sanitizeDistGeom(data.distGeom),
      weld: sanitizeWeld(data.weld),
      theme: resolveTheme(data.theme),
      pipe: { ...pipe, yaw: fallbackPipe.yaw, pitch: fallbackPipe.pitch },
    };
  } catch {
    return { ...defaults, bank: [], calc: [], pipe: fallbackPipe, distFrom: "", distTo: "", distFace: "center", distGeom: [], weld: sanitizeWeld(null), theme: resolveTheme() };
  }
}

export function saveState(partial, makePipe) {
  const current = loadState(makePipe);
  const next = {
    precision: partial.precision ?? current.precision,
    bank: (partial.bank ?? current.bank).slice(0, BANK_LIMIT),
    calc: sanitizeCalc(partial.calc ?? current.calc),
    tab: sanitizeTab(partial.tab ?? current.tab),
    distFrom: String(partial.distFrom ?? current.distFrom ?? "").slice(0, 8),
    distTo: String(partial.distTo ?? current.distTo ?? "").slice(0, 8),
    distFace: partial.distFace === "inside" || partial.distFace === "outside" || partial.distFace === "center"
      ? partial.distFace
      : current.distFace === "inside" || current.distFace === "outside"
        ? current.distFace
        : "center",
    distGeom: sanitizeDistGeom(partial.distGeom ?? current.distGeom),
    weld: sanitizeWeld(partial.weld ?? current.weld),
    theme: resolveTheme(partial.theme ?? current.theme),
    pipeVersion: 3,
    pipe: sanitizePipe(partial.pipe ?? current.pipe, current.pipe),
  };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
