const EPS = 1e-9;

export function toRad(deg) {
  return (deg * Math.PI) / 180;
}

export function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

function lawOfCosinesAngle(opposite, sideB, sideC) {
  const den = 2 * sideB * sideC;
  if (Math.abs(den) < EPS) return null;
  const cos = (sideB * sideB + sideC * sideC - opposite * opposite) / den;
  if (cos < -1 - 1e-8 || cos > 1 + 1e-8) return null;
  return toDeg(Math.acos(Math.min(1, Math.max(-1, cos))));
}

function lawOfCosinesSide(sideB, sideC, includedDeg) {
  const rad = toRad(includedDeg);
  return Math.sqrt(sideB * sideB + sideC * sideC - 2 * sideB * sideC * Math.cos(rad));
}

function heron(a, b, c) {
  const s = (a + b + c) / 2;
  const area2 = s * (s - a) * (s - b) * (s - c);
  if (area2 <= EPS) return 0;
  return Math.sqrt(area2);
}

export function validSides(a, b, c) {
  return a + b > c + EPS && b + c > a + EPS && c + a > b + EPS;
}

function pack(a, b, c, A, B, C) {
  if ([a, b, c, A, B, C].some((v) => v == null || Number.isNaN(v) || v <= 0)) return null;
  if (A >= 180 || B >= 180 || C >= 180) return null;
  if (!validSides(a, b, c)) return null;
  if (Math.abs(A + B + C - 180) > 0.08) return null;
  return {
    a,
    b,
    c,
    A,
    B,
    C,
    area: heron(a, b, c),
    perimeter: a + b + c,
  };
}

function fromSss(a, b, c) {
  if (!validSides(a, b, c)) {
    return { error: "Those three sides cannot form a triangle. Each pair must add up to more than the remaining side." };
  }
  const A = lawOfCosinesAngle(a, b, c);
  const B = lawOfCosinesAngle(b, a, c);
  const C = lawOfCosinesAngle(c, a, b);
  const tri = pack(a, b, c, A, B, C);
  if (!tri) {
    return { error: "Those three sides cannot form a triangle. Check the lengths and try again." };
  }
  return { solutions: [tri] };
}

function fromSas(sideP, included, sideQ, vertex) {
  if (included <= 0 || included >= 180) {
    return { error: "Angles must be greater than 0° and less than 180°." };
  }
  const opposite = lawOfCosinesSide(sideP, sideQ, included);
  if (vertex === "A") return fromSss(opposite, sideP, sideQ);
  if (vertex === "B") return fromSss(sideP, opposite, sideQ);
  return fromSss(sideP, sideQ, opposite);
}

function completeAngles(A, B, C) {
  const vals = [A, B, C];
  const known = vals.filter((v) => v != null);
  if (known.some((v) => v <= 0 || v >= 180)) {
    return { error: "Angles must be greater than 0° and less than 180°." };
  }
  if (known.length === 2) {
    const missing = 180 - known[0] - known[1];
    if (missing <= 0 || missing >= 180) {
      return { error: "Those angles add up to 180° or more. Reduce an angle so the third can exist." };
    }
    if (A == null) A = missing;
    else if (B == null) B = missing;
    else C = missing;
  }
  if (A == null || B == null || C == null) return { A, B, C };
  if (A + B + C > 180.05) {
    return { error: "Those angles add up to 180° or more. Reduce an angle so the third can exist." };
  }
  if (Math.abs(A + B + C - 180) > 0.08) {
    return { error: "The three angles must add up to 180°." };
  }
  return { A, B, C };
}

function fromAas(A, B, C, a, b, c) {
  const angles = completeAngles(A, B, C);
  if (angles.error) return angles;
  ({ A, B, C } = angles);
  const ratio =
    a != null
      ? a / Math.sin(toRad(A))
      : b != null
        ? b / Math.sin(toRad(B))
        : c / Math.sin(toRad(C));
  const tri = pack(
    a ?? ratio * Math.sin(toRad(A)),
    b ?? ratio * Math.sin(toRad(B)),
    c ?? ratio * Math.sin(toRad(C)),
    A,
    B,
    C
  );
  if (!tri) {
    return { error: "Those angles and that side cannot form a triangle. Check the values and try again." };
  }
  return { solutions: [tri] };
}

function ssa(angleDeg, opposite, adjacent, assign) {
  if (angleDeg <= 0 || angleDeg >= 180) {
    return { error: "Angles must be greater than 0° and less than 180°." };
  }
  if (opposite <= 0 || adjacent <= 0) {
    return { error: "Side lengths must be greater than zero." };
  }

  const height = adjacent * Math.sin(toRad(angleDeg));
  const solutions = [];

  const build = (oppAngle) => {
    const third = 180 - angleDeg - oppAngle;
    if (third <= EPS || third >= 180) return;
    const ratio = opposite / Math.sin(toRad(angleDeg));
    const adjOpp = ratio * Math.sin(toRad(oppAngle));
    const thirdSide = ratio * Math.sin(toRad(third));
    const tri = assign(opposite, adjacent, adjOpp, thirdSide, angleDeg, oppAngle, third);
    if (tri) solutions.push(tri);
  };

  if (angleDeg >= 90) {
    if (opposite <= adjacent + EPS) {
      return { error: "Those two sides and that angle cannot form a triangle. Increase the side opposite the known angle." };
    }
    const B = toDeg(Math.asin(Math.min(1, (adjacent * Math.sin(toRad(angleDeg))) / opposite)));
    build(B);
  } else if (opposite + 1e-8 < height) {
    return { error: "Those two sides and that angle cannot form a triangle. The opposite side is too short." };
  } else if (Math.abs(opposite - height) <= 1e-6) {
    build(90);
  } else {
    const B = toDeg(Math.asin(Math.min(1, (adjacent * Math.sin(toRad(angleDeg))) / opposite)));
    build(B);
    const B2 = 180 - B;
    if (B2 !== B) build(B2);
  }

  if (!solutions.length) {
    return { error: "Those two sides and that angle cannot form a triangle. Check the values and try again." };
  }
  return { solutions, ambiguous: solutions.length > 1 };
}

function assignSsa(kind, opp, adj, adjOpp, thirdSide, ang, oppAng, thirdAng) {
  if (kind === "A-b") return pack(opp, adj, thirdSide, ang, oppAng, thirdAng);
  if (kind === "A-c") return pack(opp, thirdSide, adj, ang, thirdAng, oppAng);
  if (kind === "B-a") return pack(adj, opp, thirdSide, oppAng, ang, thirdAng);
  if (kind === "B-c") return pack(thirdSide, opp, adj, thirdAng, ang, oppAng);
  if (kind === "C-a") return pack(adj, thirdSide, opp, oppAng, thirdAng, ang);
  if (kind === "C-b") return pack(thirdSide, adj, opp, thirdAng, oppAng, ang);
  return null;
}

function solveSsa(known) {
  const { a, b, c, A, B, C } = known;
  if (A != null && a != null && b != null && c == null) {
    return mapSsa(ssa(A, a, b, (...args) => assignSsa("A-b", ...args)));
  }
  if (A != null && a != null && c != null && b == null) {
    return mapSsa(ssa(A, a, c, (...args) => assignSsa("A-c", ...args)));
  }
  if (B != null && b != null && a != null && c == null) {
    return mapSsa(ssa(B, b, a, (...args) => assignSsa("B-a", ...args)));
  }
  if (B != null && b != null && c != null && a == null) {
    return mapSsa(ssa(B, b, c, (...args) => assignSsa("B-c", ...args)));
  }
  if (C != null && c != null && a != null && b == null) {
    return mapSsa(ssa(C, c, a, (...args) => assignSsa("C-a", ...args)));
  }
  if (C != null && c != null && b != null && a == null) {
    return mapSsa(ssa(C, c, b, (...args) => assignSsa("C-b", ...args)));
  }
  return { error: "Enter a combination that can solve a triangle, such as three sides or two sides and an angle." };
}

function mapSsa(result) {
  if (result.error) return result;
  return result;
}

/**
 * known values use sides a,b,c opposite angles A,B,C. Lengths in inches, angles in degrees.
 */
export function solveTriangle(known) {
  const a = known.a ?? null;
  const b = known.b ?? null;
  const c = known.c ?? null;
  const A = known.A ?? null;
  const B = known.B ?? null;
  const C = known.C ?? null;

  const sides = [a, b, c].filter((v) => v != null);
  const angles = [A, B, C].filter((v) => v != null);
  const count = sides.length + angles.length;

  if (count < 3) {
    return {
      error: "Enter exactly three measurements, including at least one side length.",
      incomplete: true,
    };
  }
  if (count > 3) {
    return { error: "Leave exactly three measurements. Clear one extra value to solve." };
  }
  if (sides.length === 0) {
    return { error: "Include at least one side length so the triangle has a real size." };
  }
  if (sides.some((v) => v <= 0)) {
    return { error: "Side lengths must be greater than zero." };
  }
  if (angles.some((v) => v <= 0 || v >= 180)) {
    return { error: "Angles must be greater than 0° and less than 180°." };
  }
  if (angles.length >= 2 && angles.reduce((s, v) => s + v, 0) >= 180) {
    return { error: "Those angles add up to 180° or more. Reduce an angle so the third can exist." };
  }

  if (sides.length === 3) return fromSss(a, b, c);

  if (angles.length >= 2) return fromAas(A, B, C, a, b, c);

  const includedA = A != null && b != null && c != null;
  const includedB = B != null && a != null && c != null;
  const includedC = C != null && a != null && b != null;
  if (includedA) return fromSas(b, A, c, "A");
  if (includedB) return fromSas(a, B, c, "B");
  if (includedC) return fromSas(a, C, b, "C");

  return solveSsa({ a, b, c, A, B, C });
}

export function layoutTriangle(a, b, c, width, height, pad = 28) {
  const A = { x: 0, y: 0 };
  const Bpt = { x: c, y: 0 };
  const Cx = (b * b + c * c - a * a) / (2 * c);
  const Cy = Math.sqrt(Math.max(0, b * b - Cx * Cx));
  const Cpt = { x: Cx, y: -Cy };

  const xs = [A.x, Bpt.x, Cpt.x];
  const ys = [A.y, Bpt.y, Cpt.y];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, EPS);
  const spanY = Math.max(maxY - minY, EPS);
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  const ox = (width - spanX * scale) / 2 - minX * scale;
  const oy = (height - spanY * scale) / 2 - minY * scale;
  const map = (p) => ({ x: p.x * scale + ox, y: p.y * scale + oy });
  return { A: map(A), B: map(Bpt), C: map(Cpt), scale };
}

export function midpoint(p, q) {
  return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
}

export function centroid(A, B, C) {
  return { x: (A.x + B.x + C.x) / 3, y: (A.y + B.y + C.y) / 3 };
}

export function offsetOutward(p, q, center, amount) {
  const mx = (p.x + q.x) / 2;
  const my = (p.y + q.y) / 2;
  let nx = p.y - q.y;
  let ny = q.x - p.x;
  const len = Math.hypot(nx, ny) || 1;
  nx /= len;
  ny /= len;
  const toC = { x: center.x - mx, y: center.y - my };
  if (nx * toC.x + ny * toC.y > 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: mx + nx * amount, y: my + ny * amount };
}

export function outwardPoint(p, center, amount) {
  const vx = p.x - center.x;
  const vy = p.y - center.y;
  const len = Math.hypot(vx, vy) || 1;
  return { x: p.x + (vx / len) * amount, y: p.y + (vy / len) * amount };
}

export function boxesOverlap(a, b, gap = 8) {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

export function unit(x, y) {
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

export function sideOutDir(p, q, center) {
  const mx = (p.x + q.x) / 2;
  const my = (p.y + q.y) / 2;
  let n = unit(p.y - q.y, q.x - p.x);
  if (n.x * (center.x - mx) + n.y * (center.y - my) > 0) {
    n = { x: -n.x, y: -n.y };
  }
  return n;
}

export function vertexOutDir(p, center) {
  return unit(p.x - center.x, p.y - center.y);
}

export function reachToBoxEdge(dir, box) {
  return 1 / Math.max(Math.abs(dir.x) / (box.w / 2), Math.abs(dir.y) / (box.h / 2), 0.001);
}

export function controlAnchors(pts) {
  const { A, B, C } = pts;
  return {
    anchors: {
      a: midpoint(B, C),
      b: midpoint(A, C),
      c: midpoint(A, B),
      A,
      B,
      C,
    },
  };
}

export function placeAttachedChips(pts, box, bounds, gap = 14) {
  const mid = centroid(pts.A, pts.B, pts.C);
  const { anchors } = controlAnchors(pts);
  const dirs = {
    a: sideOutDir(pts.B, pts.C, mid),
    b: sideOutDir(pts.A, pts.C, mid),
    c: sideOutDir(pts.A, pts.B, mid),
    A: vertexOutDir(pts.A, mid),
    B: vertexOutDir(pts.B, mid),
    C: vertexOutDir(pts.C, mid),
  };
  const order = ["C", "c", "A", "B", "a", "b"];
  const placed = {};
  const inset = 8;

  const clamp = (cx, cy) => ({
    cx: Math.min(bounds.w - box.w / 2 - inset, Math.max(box.w / 2 + inset, cx)),
    cy: Math.min(bounds.h - box.h / 2 - inset, Math.max(box.h / 2 + inset, cy)),
  });

  const asRect = (p) => ({
    x: p.cx - box.w / 2,
    y: p.cy - box.h / 2,
    w: box.w,
    h: box.h,
  });

  for (const key of order) {
    const anchor = anchors[key];
    const dir = dirs[key];
    const dist = reachToBoxEdge(dir, box) + gap;
    const raw = clamp(anchor.x + dir.x * dist, anchor.y + dir.y * dist);
    placed[key] = {
      cx: raw.cx,
      cy: raw.cy,
      ax: anchor.x,
      ay: anchor.y,
      dx: dir.x,
      dy: dir.y,
    };
  }

  for (let iter = 0; iter < 80; iter += 1) {
    let moved = false;
    for (let i = 0; i < order.length; i += 1) {
      for (let j = i + 1; j < order.length; j += 1) {
        const a = placed[order[i]];
        const b = placed[order[j]];
        if (!boxesOverlap(asRect(a), asRect(b), 16)) continue;
        const oxp = a.cx - b.cx;
        const oyp = a.cy - b.cy;
        const d = Math.hypot(oxp, oyp) || 0.01;
        const overlapX = (box.w + 16 - Math.abs(oxp)) / 2;
        const overlapY = (box.h + 16 - Math.abs(oyp)) / 2;
        const push = Math.max(overlapX, overlapY, 4) / 2;
        const alongA = clamp(a.cx + a.dx * push * 1.4, a.cy + a.dy * push * 1.4);
        const alongB = clamp(b.cx + b.dx * push * 1.4, b.cy + b.dy * push * 1.4);
        if (Math.hypot(alongA.cx - alongB.cx, alongA.cy - alongB.cy) > d) {
          a.cx = alongA.cx;
          a.cy = alongA.cy;
          b.cx = alongB.cx;
          b.cy = alongB.cy;
        } else {
          const ac = clamp(a.cx + (oxp / d) * push, a.cy + (oyp / d) * push);
          const bc = clamp(b.cx - (oxp / d) * push, b.cy - (oyp / d) * push);
          a.cx = ac.cx;
          a.cy = ac.cy;
          b.cx = bc.cx;
          b.cy = bc.cy;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }

  return placed;
}

export function evaluateCalculation(items) {
  if (!items.length) return { empty: true };
  if (items.some((item) => item.op === "/" && item.value === 0 && items.indexOf(item) > 0)) {
    return { error: "Division by zero isn’t allowed. Change the divisor before calculating." };
  }

  const seq = items.map((item, i) => ({
    value: item.value,
    op: i === 0 ? null : item.op,
  }));

  const muldiv = [];
  for (const token of seq) {
    if (token.op === "*" || token.op === "/") {
      const prev = muldiv.pop();
      if (token.op === "/" && Math.abs(token.value) < EPS) {
        return { error: "Division by zero isn’t allowed. Change the divisor before calculating." };
      }
      const value = token.op === "*" ? prev.value * token.value : prev.value / token.value;
      muldiv.push({ value, op: prev.op });
    } else {
      muldiv.push(token);
    }
  }

  let result = muldiv[0].value;
  for (let i = 1; i < muldiv.length; i += 1) {
    const token = muldiv[i];
    result = token.op === "-" ? result - token.value : result + token.value;
  }
  if (!Number.isFinite(result)) {
    return { error: "That calculation couldn’t be completed. Check the values and try again." };
  }
  return { value: result };
}
