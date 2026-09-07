const UNICODE_FRACTIONS = {
  "¼": "1/4",
  "½": "1/2",
  "¾": "3/4",
  "⅐": "1/7",
  "⅑": "1/9",
  "⅒": "1/10",
  "⅓": "1/3",
  "⅔": "2/3",
  "⅕": "1/5",
  "⅖": "2/5",
  "⅗": "3/5",
  "⅘": "4/5",
  "⅙": "1/6",
  "⅚": "5/6",
  "⅛": "1/8",
  "⅜": "3/8",
  "⅝": "5/8",
  "⅞": "7/8",
};

const MAX_INCHES = 120000;

function gcd(a, b) {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a || 1;
}

export function reduceFraction(n, d) {
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

function replaceUnicode(text) {
  let out = text;
  for (const [glyph, ascii] of Object.entries(UNICODE_FRACTIONS)) {
    out = out.split(glyph).join(ascii);
  }
  return out;
}

function normalizeMarks(text) {
  return text
    .replace(/[‘’′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/–|—/g, "-");
}

function normalizeUnitWords(text) {
  return text
    .replace(/\b(feet|foot)\b/gi, "ft")
    .replace(/\b(inches|inch)\b/gi, "in")
    .replace(/\b(millimetres|millimeters|millimetre|millimeter)\b/gi, "mm")
    .replace(/\b(centimetres|centimeters|centimetre|centimeter)\b/gi, "cm")
    .replace(/\b(metres|meters|metre|meter)\b/gi, "m")
    .replace(/\bdegrees?\b/gi, "deg")
    .replace(/°/g, " deg");
}

export function normalizeInput(raw) {
  return normalizeUnitWords(normalizeMarks(replaceUnicode(String(raw || ""))))
    .trim()
    .replace(/\s+/g, " ");
}

function parseNumberToken(token) {
  const t = token.trim();
  if (!t) return { error: "Enter a measurement." };
  const mixed = t.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const den = Number(mixed[3]);
    if (den === 0) return { error: "A fraction cannot have a denominator of zero." };
    return { value: Number(mixed[1]) + Number(mixed[2]) / den };
  }
  const dashed = t.match(/^(-?\d+)-(\d+)\s*\/\s*(\d+)$/);
  if (dashed) {
    const den = Number(dashed[3]);
    if (den === 0) return { error: "A fraction cannot have a denominator of zero." };
    return { value: Number(dashed[1]) + Number(dashed[2]) / den };
  }
  const frac = t.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const den = Number(frac[2]);
    if (den === 0) return { error: "A fraction cannot have a denominator of zero." };
    return { value: Number(frac[1]) / den };
  }
  if (/^-?\d*\.\d+$|^-?\d+$/.test(t)) return { value: Number(t) };
  return { error: "That measurement isn’t recognized. Try 12 3/8, 3' 4\", or 250 mm." };
}

function finishInches(inches, error) {
  if (error) return { error };
  if (!Number.isFinite(inches)) {
    return { error: "That measurement isn’t recognized. Try 12 3/8, 3' 4\", or 250 mm." };
  }
  if (inches <= 0) return { error: "Side lengths must be greater than zero." };
  if (inches > MAX_INCHES) {
    return { error: "That length is too large to use. Check the number and unit." };
  }
  return { inches };
}

export function parseLength(raw) {
  const text = normalizeInput(raw);
  if (!text) return { empty: true };

  const mm = text.match(/^(.+?)\s*mm$/i);
  if (mm) {
    const n = parseNumberToken(mm[1]);
    if (n.error) return n;
    return finishInches(n.value / 25.4);
  }
  const cm = text.match(/^(.+?)\s*cm$/i);
  if (cm) {
    const n = parseNumberToken(cm[1]);
    if (n.error) return n;
    return finishInches(n.value / 2.54);
  }
  const meters = text.match(/^(.+?)\s*m$/i);
  if (meters) {
    const n = parseNumberToken(meters[1]);
    if (n.error) return n;
    return finishInches(n.value / 0.0254);
  }

  const ftIn = text.match(
    /^(\d+(?:\.\d+)?|\d+\s+\d+\s*\/\s*\d+|\d+-\d+\s*\/\s*\d+|\d+\s*\/\s*\d+)\s*(?:'|ft)\s*[-]?\s*(.*)$/i
  );
  if (ftIn && /'|\bft\b/i.test(text)) {
    const feet = parseNumberToken(ftIn[1]);
    if (feet.error) return feet;
    let rest = ftIn[2].replace(/"|in/gi, "").trim();
    let inches = 0;
    if (rest) {
      const inchPart = parseNumberToken(rest);
      if (inchPart.error) return inchPart;
      inches = inchPart.value;
    }
    return finishInches(feet.value * 12 + inches);
  }

  if (/\bft\b/i.test(text) || /'\s*$/.test(text)) {
    const n = parseNumberToken(text.replace(/ft|'|"|in/gi, "").trim());
    if (n.error) return n;
    return finishInches(n.value * 12);
  }

  const inchesText = text.replace(/"|in$/i, "").trim();
  const n = parseNumberToken(inchesText);
  if (n.error) return n;
  return finishInches(n.value);
}

export function parseAngle(raw) {
  const text = normalizeInput(raw);
  if (!text) return { empty: true };
  const n = parseNumberToken(text.replace(/\bdeg\b/gi, "").trim());
  if (n.error) {
    return { error: "Enter the angle in degrees, such as 45 or 22.5." };
  }
  if (!Number.isFinite(n.value)) {
    return { error: "Enter the angle in degrees, such as 45 or 22.5." };
  }
  if (n.value <= 0 || n.value >= 180) {
    return { error: "Angles must be greater than 0° and less than 180°." };
  }
  return { degrees: n.value };
}

export function inchesToFractionParts(inches, denom) {
  const sign = inches < 0 ? -1 : 1;
  const abs = Math.abs(inches);
  const total = Math.round(abs * denom);
  const whole = Math.floor(total / denom);
  let num = total % denom;
  let d = denom;
  if (num === 0) return { sign, whole, n: 0, d: 1 };
  const reduced = reduceFraction(num, d);
  return { sign, whole, n: reduced.n, d: reduced.d };
}

export function formatInchesFraction(inches, denom = 16) {
  const { sign, whole, n, d } = inchesToFractionParts(inches, denom);
  const prefix = sign < 0 ? "-" : "";
  if (n === 0) return `${prefix}${whole}`;
  if (whole === 0) return `${prefix}${n}/${d}`;
  return `${prefix}${whole} ${n}/${d}`;
}

export function formatFeetInches(inches, denom = 16) {
  const sign = inches < 0 ? "-" : "";
  const abs = Math.abs(inches);
  const feet = Math.floor(abs / 12 + 1e-12);
  const rem = abs - feet * 12;
  const frac = formatInchesFraction(rem, denom);
  if (feet === 0) return `${sign}${frac}"`;
  if (Number(rem.toFixed(6)) === 0) return `${sign}${feet}' 0"`;
  return `${sign}${feet}' ${frac}"`;
}

export function formatDecimal(value, digits = 3) {
  if (!Number.isFinite(value)) return "";
  return String(Number(value.toFixed(digits)));
}

export function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

export function formatRadians(deg, digits = 4) {
  return formatDecimal(toRadians(deg), digits);
}

export function lengthConversions(inches, denom = 16) {
  return {
    fractionalInches: `${formatInchesFraction(inches, denom)}"`,
    decimalInches: `${formatDecimal(inches, 3)} in`,
    feetInches: formatFeetInches(inches, denom),
    decimalFeet: `${formatDecimal(inches / 12, 4)} ft`,
    mm: `${formatDecimal(inches * 25.4, 2)} mm`,
    cm: `${formatDecimal(inches * 2.54, 2)} cm`,
    m: `${formatDecimal(inches * 0.0254, 4)} m`,
  };
}

export function angleConversions(degrees) {
  return {
    degrees: `${formatDecimal(degrees, 2)}°`,
    radians: `${formatRadians(degrees)} rad`,
  };
}
