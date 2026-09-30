const EPS = 1e-9;

function v(x, y, z) {
  return { x, y, z };
}

function add(a, b) {
  return v(a.x + b.x, a.y + b.y, a.z + b.z);
}

function sub(a, b) {
  return v(a.x - b.x, a.y - b.y, a.z - b.z);
}

function scale(a, s) {
  return v(a.x * s, a.y * s, a.z * s);
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
  return v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

function hypot3(a) {
  return Math.hypot(a.x, a.y, a.z);
}

function unit(a) {
  const len = hypot3(a) || 1;
  return scale(a, 1 / len);
}

function rot(vec, axis, deg) {
  const k = unit(axis);
  const ang = (deg * Math.PI) / 180;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const d = dot(k, vec);
  const kxv = cross(k, vec);
  return add(add(scale(vec, c), scale(kxv, s)), scale(k, d * (1 - c)));
}

export function defaultPipe() {
  return {
    clrRaw: "3",
    yaw: 38,
    pitch: 24,
    steps: [
      { id: crypto.randomUUID(), type: "straight", raw: "10" },
      { id: crypto.randomUUID(), type: "bend", angleRaw: "90", rotRaw: "0" },
      { id: crypto.randomUUID(), type: "straight", raw: "18" },
      { id: crypto.randomUUID(), type: "bend", angleRaw: "90", rotRaw: "90" },
      { id: crypto.randomUUID(), type: "straight", raw: "10" },
      { id: crypto.randomUUID(), type: "bend", angleRaw: "90", rotRaw: "0" },
      { id: crypto.randomUUID(), type: "straight", raw: "12" },
    ],
  };
}

export function projectPoint(p, yaw, pitch) {
  const cy = Math.cos((yaw * Math.PI) / 180);
  const sy = Math.sin((yaw * Math.PI) / 180);
  const cp = Math.cos((pitch * Math.PI) / 180);
  const sp = Math.sin((pitch * Math.PI) / 180);
  const x1 = p.x * cy - p.z * sy;
  const z1 = p.x * sy + p.z * cy;
  return {
    x: x1,
    y: p.y * cp - z1 * sp,
  };
}

export function buildPipe(clr, steps) {
  const pts = [];
  const marks = [];
  const labels = [];
  let pos = v(0, 0, 0);
  let T = v(1, 0, 0);
  let N = v(0, 0, 1);
  let developed = 0;
  let bendCount = 0;
  const errors = [];

  pts.push({ ...pos, kind: "start" });
  marks.push({ ...pos, kind: "start" });

  steps.forEach((step, index) => {
    if (step.type === "straight") {
      const len = step.length;
      if (!(len > 0)) {
        errors.push(`Straight ${index + 1} needs a length greater than zero.`);
        return;
      }
      developed += len;
      const next = add(pos, scale(T, len));
      const n = labels.filter((item) => item.kind === "straight").length + 1;
      labels.push({
        kind: "straight",
        text: `Straight ${n}`,
        at: add(pos, scale(T, len / 2)),
      });
      pts.push({ ...next, kind: "straight" });
      pos = next;
      marks.push({ ...pos, kind: "joint" });
      return;
    }

    const angle = step.angle;
    const rotation = step.rotation || 0;
    const radius = step.radius > 0 ? step.radius : clr;
    if (!(radius > 0)) {
      errors.push("Centerline radius must be greater than zero.");
      return;
    }
    if (!Number.isFinite(angle) || Math.abs(angle) < EPS) {
      errors.push(`Bend ${bendCount + 1} needs an angle.`);
      return;
    }
    if (Math.abs(angle) >= 360) {
      errors.push("Bend angles must be less than 360°.");
      return;
    }

    N = rot(N, T, rotation);
    N = unit(N);
    const toCenter = unit(cross(N, T));
    const C = add(pos, scale(toCenter, radius));
    const rel0 = sub(pos, C);
    const segs = Math.max(8, Math.round(Math.abs(angle) / 6));
    for (let i = 1; i <= segs; i += 1) {
      const a = (angle * i) / segs;
      const p = add(C, rot(rel0, N, a));
      pts.push({ ...p, kind: "bend" });
    }
    T = unit(rot(T, N, angle));
    pos = add(C, rot(rel0, N, angle));
    developed += radius * Math.abs((angle * Math.PI) / 180);
    bendCount += 1;
    labels.push({
      kind: "bend",
      text: `Bend ${bendCount}`,
      at: add(C, rot(rel0, N, angle / 2)),
    });
    marks.push({ ...pos, kind: "bend" });
  });

  marks[marks.length - 1] = { ...pos, kind: "end" };

  const span = boundingSpan(pts);
  return {
    pts,
    marks,
    labels,
    developed,
    bendCount,
    end: pos,
    reach: hypot3(pos),
    errors,
    empty: steps.length === 0,
    span,
  };
}

function boundingSpan(pts) {
  if (!pts.length) return 1;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  pts.forEach((p) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
    maxZ = Math.max(maxZ, p.z);
  });
  return Math.max(maxX - minX, maxY - minY, maxZ - maxZ, 1);
}

export function layoutPipePath(model, width, height, yaw, pitch, pad = 36) {
  const projected = model.pts.map((p) => projectPoint(p, yaw, pitch));
  const marks = model.marks.map((p) => projectPoint(p, yaw, pitch));
  const labels = (model.labels || []).map((item) => ({
    ...projectPoint(item.at, yaw, pitch),
    text: item.text,
    kind: item.kind,
  }));
  if (!projected.length) {
    return { d: "", marks: [], labels: [], width, height };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  projected.forEach((p) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  });
  const spanX = Math.max(maxX - minX, 0.01);
  const spanY = Math.max(maxY - minY, 0.01);
  const scaleN = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  const ox = (width - spanX * scaleN) / 2 - minX * scaleN;
  const oy = (height - spanY * scaleN) / 2 - minY * scaleN;
  const map = (p) => ({ x: p.x * scaleN + ox, y: p.y * scaleN + oy });
  const mapped = projected.map(map);
  const d = mapped
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  return {
    d,
    marks: marks.map((p, i) => ({ ...map(p), kind: model.marks[i].kind })),
    labels: labels.map((item) => ({ ...map(item), text: item.text, kind: item.kind })),
    width,
    height,
  };
}
