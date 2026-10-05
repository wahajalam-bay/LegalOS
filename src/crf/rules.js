// THE CLIENT'S COPY OF THE CONDITION EVALUATOR — for VISIBILITY ONLY.
//
// The server decides whether a request is complete (api/crf-schemas.js holds
// the authoritative evaluator and api/contract-requests.js does the ruling).
// The browser needs the same answers instantly, to show and hide fields as
// somebody types, so the evaluator is mirrored here and nowhere else. It is a
// dozen lines and it is kept identical on purpose: if the two ever disagree,
// the server wins and submission is refused with the reason.
export function evalCond(cond, values) {
  if (!cond) return true;
  if (Array.isArray(cond.any)) return cond.any.some((c) => evalCond(c, values));
  if (Array.isArray(cond.all)) return cond.all.every((c) => evalCond(c, values));
  const v = values ? values[cond.field] : undefined;
  const has = v !== undefined && v !== null && String(v).trim() !== ""
    && !(Array.isArray(v) && v.length === 0);
  if (cond.truthy) return has;
  if (cond.falsy) return !has;
  if (cond.eq !== undefined) return String(v == null ? "" : v) === String(cond.eq);
  if (cond.ne !== undefined) return String(v == null ? "" : v) !== String(cond.ne);
  if (Array.isArray(cond.in)) return cond.in.map(String).includes(String(v == null ? "" : v));
  return has;
}

export const isBlank = (v) => v === undefined || v === null
  || (typeof v === "string" && v.trim() === "")
  || (Array.isArray(v) && v.length === 0);

export const visibleFields = (section, scope) =>
  (section.fields || []).filter((f) => !f.showIf || evalCond(f.showIf, scope));

export const isRequired = (f, scope) =>
  !!(f.required || (f.requiredIf && evalCond(f.requiredIf, scope)));

/* AUTO-CALCULATIONS. The inputs and the result are both kept: a calculated
   total is shown read-only beside the numbers it came from, and no figure the
   user typed is ever overwritten by one of these. */
const num = (v) => { const n = Number(String(v == null ? "" : v).replace(/[, ]/g, "")); return Number.isFinite(n) ? n : 0; };

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function under1000(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
  return ONES[Math.floor(n / 100)] + " hundred" + (n % 100 ? " and " + under1000(n % 100) : "");
}
/* The Pakistani scale, because the figure is in rupees and "twelve lakh" is
   what the reader checking it will be expecting. */
export function amountInWords(v) {
  let n = Math.floor(num(v));
  if (!n) return "";
  const parts = [];
  const push = (unit, size) => { const q = Math.floor(n / size); if (q) { parts.push(under1000(q) + " " + unit); n %= size; } };
  push("crore", 10000000); push("lakh", 100000); push("thousand", 1000);
  if (n) parts.push(under1000(n));
  return (parts.join(" ") + " only").replace(/^\w/, (c) => c.toUpperCase());
}

export function computeField(f, scope, allValues) {
  const c = f.calc;
  if (!c) return undefined;
  if (c.multiply) return c.multiply.reduce((acc, k) => acc * num(scope[k]), 1) || "";
  if (c.sumGrid) {
    const [gridKey, col] = c.sumGrid;
    const rows = (allValues && allValues[gridKey]) || [];
    return rows.reduce((t, r) => t + num(r[col]), 0) || "";
  }
  if (c.words) return amountInWords(scope[c.words]);
  if (c.rateByArea) {
    const [rateKey, areaKey, lumpKey, basisKey] = c.rateByArea;
    if (String(scope[basisKey]) === "Lump Sum") return num(scope[lumpKey]) || "";
    const area = num(scope[areaKey]) || num((allValues.projectSpec || {})[areaKey]);
    return num(scope[rateKey]) * area || "";
  }
  return undefined;
}
