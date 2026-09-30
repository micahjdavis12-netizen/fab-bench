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
};

function sanitizeTab(tab) {
  return tab === "combine" || tab === "pipe" || tab === "triangle" ? tab : "triangle";
}

function sanitizePipe(pipe, fallback) {
  if (!pipe || typeof pipe !== "object") return fallback;
  const steps = Array.isArray(pipe.steps)
    ? pipe.steps
        .slice(0, PIPE_STEP_LIMIT)
        .map((step) => {
          if (!step || typeof step !== "object") return null;
          if (step.type === "bend") {
            return {
              id: String(step.id || crypto.randomUUID()),
              type: "bend",
              angleRaw: String(step.angleRaw ?? ""),
              rotRaw: String(step.rotRaw ?? "0"),
            };
          }
          return {
            id: String(step.id || crypto.randomUUID()),
            type: "straight",
            raw: String(step.raw ?? ""),
          };
        })
        .filter(Boolean)
    : fallback.steps;
  return {
    clrRaw: String(pipe.clrRaw ?? fallback.clrRaw),
    yaw: Number.isFinite(pipe.yaw) ? pipe.yaw : fallback.yaw,
    pitch: Number.isFinite(pipe.pitch) ? pipe.pitch : fallback.pitch,
    steps: steps.length ? steps : fallback.steps,
  };
}

export function loadState(makePipe) {
  const fallbackPipe = makePipe ? makePipe() : { clrRaw: "3", yaw: 38, pitch: 24, steps: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults, bank: [], calc: [], pipe: fallbackPipe };
    const data = JSON.parse(raw);
    const precision = [16, 32, 64].includes(data.precision) ? data.precision : 16;
    const bank = Array.isArray(data.bank) ? data.bank.slice(0, BANK_LIMIT) : [];
    const calc = Array.isArray(data.calc) ? data.calc.slice(0, CALC_LIMIT) : [];
    return {
      precision,
      bank,
      calc,
      tab: sanitizeTab(data.tab),
      pipe: sanitizePipe(data.pipe, fallbackPipe),
    };
  } catch {
    return { ...defaults, bank: [], calc: [], pipe: fallbackPipe };
  }
}

export function saveState(partial, makePipe) {
  const current = loadState(makePipe);
  const next = {
    precision: partial.precision ?? current.precision,
    bank: (partial.bank ?? current.bank).slice(0, BANK_LIMIT),
    calc: (partial.calc ?? current.calc).slice(0, CALC_LIMIT),
    tab: sanitizeTab(partial.tab ?? current.tab),
    pipe: sanitizePipe(partial.pipe ?? current.pipe, current.pipe),
  };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
