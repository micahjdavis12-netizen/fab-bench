export const WELD_PROCESSES = [
  { id: "tig", label: "TIG", code: "GTAW" },
  { id: "mig", label: "MIG", code: "GMAW" },
  { id: "stick", label: "Stick", code: "SMAW" },
];

export const WELD_METALS = [
  { id: "steel", label: "Mild steel", family: "steel" },
  { id: "ss304", label: "304 stainless", family: "stainless" },
  { id: "ss316", label: "316L stainless", family: "stainless" },
  { id: "al6061", label: "6061 aluminum", family: "aluminum" },
];

export const WELD_JOINTS = [
  { id: "butt", label: "Butt", kind: "Groove weld", hint: "Square groove · same plane", callout: "Groove" },
  { id: "tjoint", label: "T-joint", kind: "Fillet weld", hint: "Stem on plate · triangle bead", callout: "Fillet" },
  { id: "lap", label: "Lap", kind: "Fillet weld", hint: "Overlap · weld the edge", callout: "Fillet" },
  { id: "corner", label: "Corner", kind: "Fillet weld", hint: "L-joint · inside corner", callout: "Fillet" },
  { id: "edge", label: "Edge", kind: "Edge weld", hint: "Flanged edges · light sheet", callout: "Edge" },
];

export const WELD_THICK_CHIPS = [
  { id: "1/16", label: "1/16" },
  { id: "3/32", label: "3/32" },
  { id: "1/8", label: "1/8" },
  { id: "3/16", label: "3/16" },
  { id: "16 ga", label: "16 ga" },
  { id: "14 ga", label: "14 ga" },
  { id: "11 ga", label: "11 ga" },
];

export const WELD_POSITIONS = [
  { id: "flat", label: "Flat / horizontal fillet" },
  { id: "vertical", label: "Vertical" },
  { id: "overhead", label: "Overhead" },
];

const GAUGE = {
  steel: { 16: 0.0598, 14: 0.0747, 11: 0.1196, 12: 0.1046, 18: 0.0478, 20: 0.0359, 10: 0.1345 },
  stainless: { 16: 0.0595, 14: 0.0781, 11: 0.125, 12: 0.1094, 18: 0.05, 20: 0.0375, 10: 0.1406 },
  aluminum: { 16: 0.0508, 14: 0.0641, 11: 0.0907, 12: 0.0808, 18: 0.0403, 20: 0.032, 10: 0.1019 },
};

const CHIP_INCHES = {
  "1/16": 1 / 16,
  "3/32": 3 / 32,
  "1/8": 1 / 8,
  "3/16": 3 / 16,
};

const TIG_STEEL = [
  [0.031, 25, 45],
  [0.0625, 50, 80],
  [0.094, 70, 110],
  [0.125, 90, 130],
  [0.188, 125, 175],
  [0.25, 170, 220],
  [0.375, 225, 300],
];

const MIG_STEEL = [
  [0.031, 40, 70],
  [0.0625, 60, 95],
  [0.094, 80, 120],
  [0.125, 100, 145],
  [0.188, 140, 190],
  [0.25, 170, 230],
];

const STICK_STEEL = [
  [0.0625, 40, 70],
  [0.094, 70, 100],
  [0.125, 90, 140],
  [0.188, 120, 170],
  [0.25, 140, 190],
];

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function roundTo(n, step) {
  return Math.round(n / step) * step;
}

function metalRow(id) {
  if (id === "stainless") return WELD_METALS.find((item) => item.id === "ss304");
  if (id === "aluminum") return WELD_METALS.find((item) => item.id === "al6061");
  return WELD_METALS.find((item) => item.id === id) || WELD_METALS[0];
}

function jointRow(id) {
  if (id === "fillet") return WELD_JOINTS.find((item) => item.id === "tjoint");
  if (id === "groove" || id === "pipe") return WELD_JOINTS.find((item) => item.id === "butt");
  return WELD_JOINTS.find((item) => item.id === id) || WELD_JOINTS[0];
}

function familyOf(id) {
  return metalRow(id).family;
}

function processRow(id) {
  return WELD_PROCESSES.find((item) => item.id === id) || WELD_PROCESSES[0];
}

function positionRow(id) {
  return WELD_POSITIONS.find((item) => item.id === id) || WELD_POSITIONS[0];
}

export function weldGaugeInches(raw, metalId) {
  const text = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/"/g, "");
  const ga = text.match(/^(\d+)\s*(?:ga|gauge)$/);
  if (!ga) return null;
  const inches = GAUGE[familyOf(metalId)]?.[Number(ga[1])];
  return inches || null;
}

export function chipInches(chipId, metalId) {
  if (CHIP_INCHES[chipId]) return CHIP_INCHES[chipId];
  return weldGaugeInches(chipId, metalId);
}

export function chipMatches(raw, chipId, metalId) {
  const text = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/"/g, "");
  if (text === chipId.toLowerCase()) return true;
  return false;
}

function lerpRange(table, inches) {
  if (inches <= table[0][0]) return { lo: table[0][1], hi: table[0][2] };
  for (let i = 1; i < table.length; i += 1) {
    const [t1, lo1, hi1] = table[i];
    const [t0, lo0, hi0] = table[i - 1];
    if (inches <= t1) {
      const u = (inches - t0) / (t1 - t0);
      return {
        lo: roundTo(lo0 + (lo1 - lo0) * u, 5),
        hi: roundTo(hi0 + (hi1 - hi0) * u, 5),
      };
    }
  }
  const last = table[table.length - 1];
  return { lo: last[1], hi: last[2] };
}

function scaleAmps(range, factor) {
  return {
    lo: roundTo(clamp(range.lo * factor, 20, 350), 5),
    hi: roundTo(clamp(range.hi * factor, 30, 400), 5),
  };
}

function heatFactor(family) {
  if (family === "aluminum") return 1.35;
  if (family === "stainless") return 0.9;
  return 1;
}

function tungstenFor(family, inches) {
  if (family === "aluminum") return inches <= 0.1 ? "3/32 in" : "1/8 in";
  if (inches <= 0.08) return "1/16 in";
  if (inches <= 0.16) return "3/32 in";
  return "1/8 in";
}

function fillerDia(inches) {
  if (inches <= 0.07) return "1/16 in";
  if (inches <= 0.14) return "3/32 in";
  return "1/8 in";
}

function migWireSize(inches) {
  if (inches <= 0.07) return ".023 in";
  if (inches <= 0.125) return ".030 in";
  return ".035 in";
}

function stickRod(inches) {
  if (inches <= 0.1) return "3/32 in";
  if (inches <= 0.188) return "1/8 in";
  return "5/32 in";
}

function fillerMetal(process, a, b) {
  const fa = familyOf(a);
  const fb = familyOf(b);
  if (fa === "aluminum" || fb === "aluminum") {
    if (fa !== fb) return { text: "Not a shop fusion weld — use a bimetal transition or mechanical joint.", bad: true };
    if (process === "stick") return { text: "Stick isn't typical on 6061 — use TIG or MIG.", bad: true };
    return { text: process === "mig" ? "4043 / 5356" : "4043 or 5356", bad: false };
  }
  if (fa !== fb) return { text: process === "stick" ? "E309L-16" : "ER309L", bad: false };
  if (a === "ss316" || b === "ss316") return { text: process === "stick" ? "E316L-16" : process === "mig" ? "ER316LSi" : "ER316L", bad: false };
  if (fa === "stainless") return { text: process === "stick" ? "E308L-16" : process === "mig" ? "ER308LSi" : "ER308L", bad: false };
  if (process === "stick") return { text: inchesHint(process), bad: false };
  return { text: process === "mig" ? "ER70S-6" : "ER70S-2", bad: false };
}

function inchesHint(process) {
  return process === "stick" ? "E7018" : "ER70S-2";
}

function polarityFor(process, family) {
  if (process === "tig") return family === "aluminum" ? "AC · high-frequency start" : "DCEN";
  if (process === "stick") return "DCEP";
  return "DCEP";
}

function shielding(process, family) {
  if (process === "stick") {
    return { mix: "None · electrode coating", lo: null, hi: null, note: "Flux on the rod makes its own shield — skip the bottle." };
  }
  if (process === "tig") {
    return {
      mix: "100% argon",
      lo: 15,
      hi: 20,
      note: "Miller torch-shielding starting point. Drafty shop: add 2–5 CFH.",
    };
  }
  if (family === "aluminum") {
    return { mix: "100% argon", lo: 25, hi: 35, note: "Use a Teflon liner and keep stick-out short." };
  }
  if (family === "stainless") {
    return { mix: "98% argon / 2% CO₂", lo: 20, hi: 25, note: "Tri-mix also works. Skip 100% CO₂ on stainless." };
  }
  return { mix: "75% argon / 25% CO₂ (C25)", lo: 20, hi: 25, note: "Short-circuit indoors. Spray on thicker plate wants 30–40 CFH." };
}

function positionNote(position) {
  if (position === "vertical") return "Keep a tight arc and a smaller puddle on vertical.";
  if (position === "overhead") return "Overhead: drop travel speed and use a smaller rod or filler if the puddle sags.";
  return "";
}

export function adviseWeld({ process, metalA, metalB, thickA, thickB, joint, position }) {
  const proc = processRow(process).id;
  const a = metalRow(metalA);
  const b = metalRow(metalB);
  const jointInfo = jointRow(joint);
  const pos = positionRow(position);
  const tA = Number(thickA);
  const tB = Number(thickB);
  const t = Math.min(tA, tB);
  const tMax = Math.max(tA, tB);
  const mismatch = tMax - t > 0.02;
  const family = familyOf(a.id) === "aluminum" || familyOf(b.id) === "aluminum" ? "aluminum" : familyOf(a.id);
  const table = proc === "mig" ? MIG_STEEL : proc === "stick" ? STICK_STEEL : TIG_STEEL;
  const amps = scaleAmps(lerpRange(table, t), heatFactor(family));
  const gas = shielding(proc, family);
  const filler = fillerMetal(proc, a.id, b.id);
  const noWeld = filler.bad;
  const cards = [];
  if (!noWeld) {
    cards.push({ label: "Current", value: `${amps.lo}–${amps.hi} A` });
    cards.push({ label: "Polarity", value: polarityFor(proc, family) });
    cards.push({ label: "Shielding gas", value: gas.mix });
    cards.push({
      label: proc === "stick" ? "Gas flow" : proc === "tig" ? "Argon flow" : "Gas flow",
      value: gas.lo == null ? "—" : `${gas.lo}–${gas.hi} CFH`,
    });
    if (proc === "tig") {
      cards.push({ label: "Tungsten", value: `${tungstenFor(family, t)} 2% lanthanated` });
      cards.push({ label: "Cup", value: t <= 0.1 ? "#5–#6" : t <= 0.2 ? "#7–#8" : "#8–#10" });
      cards.push({ label: "Filler", value: filler.text });
      cards.push({ label: "Filler diameter", value: fillerDia(t) });
    } else if (proc === "mig") {
      cards.push({ label: "Wire", value: filler.text });
      cards.push({ label: "Wire diameter", value: migWireSize(t) });
    } else {
      cards.push({ label: "Electrode", value: filler.text });
      cards.push({ label: "Electrode diameter", value: stickRod(t) });
    }
  }
  const notes = [];
  if (gas.note && !noWeld) notes.push(gas.note);
  if (mismatch && !noWeld) notes.push("Use the thinner plate for amps. Dwell on the thick side so you don't blow through.");
  if (family === "stainless" && (jointInfo.id === "butt" || jointInfo.id === "edge") && proc === "tig") {
    notes.push("Back-purge stainless with argon so the root stays bright.");
  }
  const posNote = positionNote(pos.id);
  if (posNote) notes.push(posNote);
  return {
    process: proc,
    processName: processRow(proc).label,
    metalA: a.id,
    metalB: b.id,
    joint: jointInfo,
    position: pos,
    thin: t,
    thick: tMax,
    mismatch,
    noWeld,
    filler: filler.text,
    cards,
    notes,
  };
}

function inchCaption(inches) {
  if (!(inches > 0)) return "";
  const known = Object.entries(CHIP_INCHES).find(([, value]) => Math.abs(value - inches) < 0.0015);
  const frac = known ? known[0] : inches.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return `≈ ${frac} in / ${inches.toFixed(4)} in`;
}

function platePath(d) {
  return `<path class="weld-plate" d="${d}" />`;
}

function beadPath(d) {
  return `<path class="weld-bead" d="${d}" />`;
}

function labels(joint, inchesA, inchesB, mini) {
  if (mini) return "";
  const a = inchCaption(inchesA);
  const b = inchCaption(inchesB);
  const caps = `${
    a ? `<text class="weld-cap" x="24" y="182">A · ${a}</text>` : ""
  }${b ? `<text class="weld-cap" x="24" y="198">B · ${b}</text>` : ""}`;
  if (joint === "butt") {
    return `<text class="weld-mark" x="78" y="96">A</text><text class="weld-mark" x="196" y="96">B</text>
      <path class="weld-guide" d="M150 92 150 68H210" />
      <text class="weld-callout" x="214" y="72">Groove</text>${caps}`;
  }
  if (joint === "tjoint") {
    return `<text class="weld-mark" x="75" y="118">A</text><text class="weld-mark" x="128" y="73">B</text>
      <path class="weld-guide" d="M179 117 224 75H272" />
      <text class="weld-callout" x="226" y="69">Fillet</text>${caps}`;
  }
  if (joint === "lap") {
    return `<text class="weld-mark" x="58" y="134">A</text><text class="weld-mark" x="210" y="92">B</text>
      <path class="weld-guide" d="M104 112 70 78H28" />
      <text class="weld-callout" x="28" y="72">Fillet</text>${caps}`;
  }
  if (joint === "corner") {
    return `<text class="weld-mark" x="96" y="118">A</text><text class="weld-mark" x="48" y="108">B</text>
      <path class="weld-guide" d="M70 58 48 36H20" />
      <text class="weld-callout" x="20" y="30">Fillet</text>${caps}`;
  }
  return `<text class="weld-mark" x="96" y="118">A</text><text class="weld-mark" x="182" y="118">B</text>
    <path class="weld-guide" d="M145 52 145 28H210" />
    <text class="weld-callout" x="214" y="32">Edge</text>${caps}`;
}

const ART = {
  butt: `${platePath("M35 102H146V123.125H35Z")}${platePath("M154 102H265V123.125H154Z")}${beadPath("M143 102Q150 92 157 102L154 114H146Z")}`,
  tjoint: `${platePath("M35 125H265V146.125H35Z")}${platePath("M139.4375 45H160.5625V125H139.4375Z")}${beadPath("M160.5625 104Q168.5625 120 182.5625 125H160.5625Z")}`,
  lap: `${platePath("M35 120H205V141.125H35Z")}${platePath("M123 98.875H265V120H123Z")}${beadPath("M123 98.875Q116 115 101.875 120H123Z")}`,
  corner: `${platePath("M62 69H83.125V140H62Z")}${platePath("M83.125 47.875H265V69H83.125Z")}${beadPath("M62 69H83.125V47.875Q61 44 62 69Z")}`,
  edge: `${platePath("M113 72H143V147H113Z")}${platePath("M147 72H177V147H147Z")}${beadPath("M112 72Q145 44 178 72Z")}`,
};

export function jointGraphic(id, mini = false, spec = {}) {
  const joint = jointRow(id);
  const vb = mini ? "20 28 260 130" : "0 0 300 215";
  return `<svg class="weld-svg" viewBox="${vb}" role="img" aria-label="${joint.label} joint: ${joint.kind}">
    ${ART[joint.id] || ART.butt}
    ${labels(joint.id, spec.inchesA, spec.inchesB, mini)}
  </svg>`;
}

export function defaultWeld() {
  return {
    process: "tig",
    metalA: "steel",
    metalB: "steel",
    thickA: "1/8",
    thickB: "1/8",
    joint: "tjoint",
    position: "flat",
  };
}
