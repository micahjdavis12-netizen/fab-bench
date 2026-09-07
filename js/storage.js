const KEY = "fab-bench-v1";
const BANK_LIMIT = 200;
const CALC_LIMIT = 100;

const defaults = {
  precision: 16,
  bank: [],
  calc: [],
};

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults, bank: [], calc: [] };
    const data = JSON.parse(raw);
    const precision = [16, 32, 64].includes(data.precision) ? data.precision : 16;
    const bank = Array.isArray(data.bank) ? data.bank.slice(0, BANK_LIMIT) : [];
    const calc = Array.isArray(data.calc) ? data.calc.slice(0, CALC_LIMIT) : [];
    return { precision, bank, calc };
  } catch {
    return { ...defaults, bank: [], calc: [] };
  }
}

export function saveState(partial) {
  const current = loadState();
  const next = {
    precision: partial.precision ?? current.precision,
    bank: (partial.bank ?? current.bank).slice(0, BANK_LIMIT),
    calc: (partial.calc ?? current.calc).slice(0, CALC_LIMIT),
  };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
