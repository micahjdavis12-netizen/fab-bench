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
    odRaw: "1 1/2",
    startAngleRaw: "0",
    startRotRaw: "0",
    yaw: 0,
    pitch: 22,
    steps: [],
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

function worldUp() {
  return v(0, -1, 0);
}

function yawFacing(T, N, deg) {
  if (!deg) return { T, N };
  const up = worldUp();
  return { T: unit(rot(T, up, deg)), N: unit(rot(N, up, deg)) };
}

function rollClock(T, N, deg) {
  if (!deg) return { T, N };
  return { T, N: unit(rot(N, T, deg)) };
}

function pitchFromGround(T, N, deg) {
  if (!deg) return { T, N };
  const axis = cross(T, worldUp());
  if (hypot3(axis) < 1e-6) return { T, N };
  const a = unit(axis);
  return { T: unit(rot(T, a, deg)), N: unit(rot(N, a, deg)) };
}

export function buildPipe(clr, steps, od = 0, start = { angle: 0, rotation: 0, firstBend: false }) {
  const pts = [];
  const marks = [];
  const labels = [];
  let pos = v(0, 0, 0);
  let T = v(1, 0, 0);
  let N = v(0, 0, 1);
  const sitA = Number.isFinite(start.angle) ? start.angle : 0;
  const sitR = Number.isFinite(start.rotation) ? start.rotation : 0;
  if (start.firstBend) {
    ({ T, N } = yawFacing(T, N, sitA));
    ({ T, N } = pitchFromGround(T, N, sitR));
  } else {
    ({ T, N } = pitchFromGround(T, N, sitA));
  }
  let developed = 0;
  let developedInside = 0;
  let developedOutside = 0;
  let bendCount = 0;
  let jointCount = 0;
  const errors = [];
  const pipeR = od > 0 ? od / 2 : 0;

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
      developedInside += len;
      developedOutside += len;
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
    if (step.type === "joint") {
      if (!Number.isFinite(angle) || Math.abs(angle) < EPS) {
        errors.push(`Joint ${jointCount + 1} needs an angle.`);
        return;
      }
      if (Math.abs(angle) >= 180) {
        errors.push(`Joint ${jointCount + 1} must be less than 180°.`);
        return;
      }
      ({ T, N } = rollClock(T, N, rotation));
      N = unit(N);
      T = unit(rot(T, N, angle));
      jointCount += 1;
      labels.push({
        kind: "joint",
        text: `Joint ${jointCount}`,
        at: { ...pos },
      });
      marks.push({ ...pos, kind: "weld" });
      pts.push({ ...pos, kind: "joint" });
      return;
    }

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

    ({ T, N } = rollClock(T, N, rotation));
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
    const arc = radius * Math.abs((angle * Math.PI) / 180);
    const innerR = Math.max(0, radius - pipeR);
    const outerR = radius + pipeR;
    developed += arc;
    developedInside += innerR * Math.abs((angle * Math.PI) / 180);
    developedOutside += outerR * Math.abs((angle * Math.PI) / 180);
    bendCount += 1;
    labels.push({
      kind: "bend",
      text: `Bend ${bendCount}`,
      at: add(C, rot(rel0, N, angle / 2)),
    });
    marks.push({ ...pos, kind: "bend" });
  });

  if (marks.length && marks[marks.length - 1].kind !== "weld") {
    marks[marks.length - 1] = { ...pos, kind: "end" };
  }

  const span = boundingSpan(pts);
  return {
    pts,
    marks,
    labels,
    developed,
    developedInside,
    developedOutside,
    od,
    bendCount,
    jointCount,
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

function niceGridStep(span) {
  const raw = span / 8;
  const steps = [0.5, 1, 2, 3, 4, 6, 8, 12, 18, 24, 36, 48, 60, 96, 120];
  return steps.find((step) => step >= raw) || Math.ceil(raw / 12) * 12;
}

function makeFloor(pts, od = 0, frame) {
  const source = pts.length ? pts : [v(0, 0, 0)];
  let floorY = -Infinity;
  source.forEach((p) => {
    floorY = Math.max(floorY, p.y);
  });
  floorY += od > 0 ? od / 2 : 0;
  const cx = frame.c.x;
  const cz = frame.c.z;
  const half = Math.max(frame.r * 1.2, 2);
  const minX = cx - half;
  const maxX = cx + half;
  const minZ = cz - half;
  const maxZ = cz + half;
  const step = niceGridStep(half * 2);
  const lines = [];
  for (let x = minX; x <= maxX + 1e-6; x += step) {
    lines.push({ a: v(x, floorY, minZ), b: v(x, floorY, maxZ) });
  }
  for (let z = minZ; z <= maxZ + 1e-6; z += step) {
    lines.push({ a: v(minX, floorY, z), b: v(maxX, floorY, z) });
  }
  return {
    y: floorY,
    corners: [v(minX, floorY, minZ), v(maxX, floorY, minZ), v(maxX, floorY, maxZ), v(minX, floorY, maxZ)],
    lines,
  };
}

function worldFrame(pts, od = 0) {
  const source = pts.length ? pts : [v(0, 0, 0)];
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  source.forEach((p) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
    maxZ = Math.max(maxZ, p.z);
  });
  const c = v((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  let r = 0;
  source.forEach((p) => {
    r = Math.max(r, Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z));
  });
  return { c, r: Math.max(r, 0.75) + (od > 0 ? od / 2 : 0) };
}

export function layoutPipePath(model, width, height, yaw, pitch, pad = 36, od = 0) {
  const projected = model.pts.map((p) => projectPoint(p, yaw, pitch));
  const marks = model.marks.map((p) => projectPoint(p, yaw, pitch));
  const labels = (model.labels || []).map((item) => ({
    ...projectPoint(item.at, yaw, pitch),
    text: item.text,
    kind: item.kind,
  }));
  if (!projected.length) {
    return { d: "", marks: [], labels: [], floor: null, scale: 1, width, height };
  }
  const frame = worldFrame(model.pts, od);
  const floor = makeFloor(model.pts, od, frame);
  const floorCorners = floor.corners.map((p) => projectPoint(p, yaw, pitch));
  const floorLines = floor.lines.map((line) => ({
    a: projectPoint(line.a, yaw, pitch),
    b: projectPoint(line.b, yaw, pitch),
  }));
  const scaleN = (Math.min(width, height) - pad * 2) / (2 * frame.r);
  const mid = projectPoint(frame.c, yaw, pitch);
  const ox = width / 2 - mid.x * scaleN;
  const oy = height / 2 - mid.y * scaleN;
  const map = (p) => ({ x: p.x * scaleN + ox, y: p.y * scaleN + oy });
  const mapped = projected.map(map);
  const mappedCorners = floorCorners.map(map);
  const d = mapped
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  const fill = mappedCorners
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ")
    .concat(" Z");
  const grid = floorLines
    .map((line) => {
      const a = map(line.a);
      const b = map(line.b);
      return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} L ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
    })
    .join(" ");
  const edge = fill;
  return {
    d,
    marks: marks.map((p, i) => ({ ...map(p), kind: model.marks[i].kind })),
    labels: labels.map((item) => ({ ...map(item), text: item.text, kind: item.kind })),
    floor: { fill, grid, edge },
    scale: scaleN,
    width,
    height,
  };
}
