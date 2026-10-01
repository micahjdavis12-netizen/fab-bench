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

export function pairDistance(model, fromId, toId, path, face) {
  const stations = model.stations || [];
  const from = stations.find((s) => s.id === fromId);
  const to = stations.find((s) => s.id === toId);
  if (!from || !to || from.id === to.id) return NaN;
  const od = model.od > 0 ? model.od : 0;
  if (path === "along") {
    const along = Math.abs((from.along || 0) - (to.along || 0));
    const pieces = legsBetween(model.legs, stations, from.id, to.id);
    const inside = along - pieces.reduce((sum, leg) => sum + ((leg.length || 0) - (leg.inside ?? leg.length ?? 0)), 0);
    const outside = along + pieces.reduce((sum, leg) => sum + ((leg.outside ?? leg.length ?? 0) - (leg.length || 0)), 0);
    if (face === "inside") return inside;
    if (face === "outside") return outside;
    return along;
  }
  const d = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  if (face === "inside") return d - od;
  if (face === "outside") return d + od;
  return d;
}

const HIT = 1 / 64 + 1e-6;

export function wrapShopAngle(deg, kind) {
  if (!Number.isFinite(deg)) return 90;
  if (kind === "joint") {
    if (deg > 179) return 179;
    if (deg < -179) return -179;
    return Math.abs(deg) < 0.05 ? 90 : deg;
  }
  let a = deg;
  while (a > 180) a -= 360;
  while (a < -180) a += 360;
  return Math.abs(a) < 0.05 ? 90 : a;
}

function betterFit(x, e, bestX, bestE, prefer) {
  const hit = e <= HIT;
  const bestHit = bestE <= HIT;
  if (hit !== bestHit) return hit;
  if (Math.abs(e - bestE) > 1e-4) return e < bestE;
  return Math.abs(x - prefer) < Math.abs(bestX - prefer);
}

function sampleSolve(measure, target, lo, hi, prefer) {
  const errAt = (x) => {
    const y = measure(x);
    if (!Number.isFinite(y)) return Infinity;
    return Math.abs(y - target);
  };
  let bestX = prefer;
  let bestE = errAt(prefer);
  const pts = [];
  const n = 36;
  for (let i = 0; i <= n; i += 1) pts.push(lo + ((hi - lo) * i) / n);
  if (!pts.some((x) => Math.abs(x - prefer) < 1e-6)) pts.push(prefer);
  pts.sort((a, b) => a - b);
  const signed = [];
  for (const x of pts) {
    const y = measure(x);
    const e = Number.isFinite(y) ? Math.abs(y - target) : Infinity;
    if (betterFit(x, e, bestX, bestE, prefer)) {
      bestE = e;
      bestX = x;
    }
    signed.push({ x, y: Number.isFinite(y) ? y - target : NaN });
  }
  for (let i = 1; i < signed.length; i += 1) {
    const a = signed[i - 1];
    const b = signed[i];
    if (!Number.isFinite(a.y) || !Number.isFinite(b.y) || a.y * b.y > 0) continue;
    let left = a.x;
    let right = b.x;
    for (let k = 0; k < 26; k += 1) {
      const mid = (left + right) / 2;
      const ym = measure(mid) - target;
      const e = Math.abs(ym);
      if (betterFit(mid, e, bestX, bestE, prefer)) {
        bestE = e;
        bestX = mid;
      }
      const yl = measure(left) - target;
      if (yl * ym <= 0) right = mid;
      else left = mid;
    }
  }
  if (bestE > HIT) {
    return { value: prefer, error: errAt(prefer), hit: errAt(prefer) <= HIT };
  }
  return { value: bestX, error: bestE, hit: true };
}

export function solveFitValue(build, parsed, step, fit, target) {
  const field = fit.field === "angle" ? "angle" : "length";
  const found = parsed.steps.find((item) => item.id === step.id);
  if (!found) return null;
  const seed =
    field === "angle"
      ? wrapShopAngle(found.angle, step.type)
      : found.length > 0
        ? found.length
        : 8;
  const lo = field === "angle" ? (step.type === "joint" ? -179 : -359) : 0.125;
  const hi = field === "angle" ? (step.type === "joint" ? 179 : 359) : 240;
  const measure = (value) => {
    if (field === "angle" && Math.abs(value) < 0.05) return NaN;
    const steps = parsed.steps.map((item) => (item.id === step.id ? { ...item, [field]: value } : item));
    return pairDistance(build(steps), fit.from, fit.to, fit.path, fit.face);
  };
  const here = measure(seed);
  const nudged = measure(seed + (field === "angle" ? 2 : 0.5));
  if (!Number.isFinite(here) && !Number.isFinite(nudged)) {
    return { value: seed, error: Infinity, hit: false, dead: true };
  }
  if (Number.isFinite(here) && Number.isFinite(nudged) && Math.abs(here - nudged) < 1e-6) {
    return { value: seed, error: Math.abs(here - target), hit: Math.abs(here - target) <= 1 / 64 + 1e-6, dead: true };
  }
  return sampleSolve(measure, target, lo, hi, seed);
}
