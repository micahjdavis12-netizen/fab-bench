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
  return tab === "combine" || tab === "pipe" || tab === "triangle" || tab === "distance" ? tab : "triangle";
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

function sanitizePipe(pipe, fallback) {
  if (!pipe || typeof pipe !== "object") return fallback;
  const steps = Array.isArray(pipe.steps)
    ? pipe.steps
        .slice(0, PIPE_STEP_LIMIT)
        .map((step) => {
          if (!step || typeof step !== "object") return null;
          if (step.type === "bend" || step.type === "joint") {
            const next = {
              id: String(step.id || crypto.randomUUID()),
              type: step.type === "joint" ? "joint" : "bend",
              angleRaw: String(step.angleRaw ?? ""),
              rotRaw: String(step.rotRaw ?? "0"),
            };
            if (next.type === "joint") next.raw = String(step.raw ?? "");
            return next;
          }
          return {
            id: String(step.id || crypto.randomUUID()),
            type: "straight",
            raw: String(step.raw ?? ""),
          };
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
    if (!raw) return { ...defaults, bank: [], calc: [], pipe: fallbackPipe, distFrom: "", distTo: "", theme: resolveTheme() };
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
      theme: resolveTheme(data.theme),
      pipe: { ...pipe, yaw: fallbackPipe.yaw, pitch: fallbackPipe.pitch },
    };
  } catch {
    return { ...defaults, bank: [], calc: [], pipe: fallbackPipe, distFrom: "", distTo: "", theme: resolveTheme() };
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
    theme: resolveTheme(partial.theme ?? current.theme),
    pipeVersion: 3,
    pipe: sanitizePipe(partial.pipe ?? current.pipe, current.pipe),
  };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
