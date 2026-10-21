// Deterministic PRD checks: exact, instant and free. The AI review covers what needs judgment.
import { splitSections } from "./prd-parse";

export type Finding = {
  rule: string;
  severity: "error" | "warning" | "info";
  section: number | null;
  targetRef: string;
  message: string;
  suggestion: string;
  source: "rule" | "ai";
};

export const SECTION_COUNT = 12;

// Words that make a requirement untestable. English plus Indonesian, matched as whole words.
const VAGUE = [
  "fast", "quick", "quickly", "easy", "easily", "simple", "user-friendly", "intuitive", "seamless", "seamlessly",
  "robust", "efficient", "flexible", "modern", "scalable", "appropriate", "adequate", "etc",
  "cepat", "mudah", "sederhana", "ramah pengguna", "intuitif", "efisien", "fleksibel", "memadai", "dll",
];
// Words contain only letters, spaces and "-", which are literal outside a character class (no escaping needed with the u flag).
const VAGUE_RE = new RegExp(`(^|[^\\p{L}-])(${VAGUE.join("|")})(?=$|[^\\p{L}-])`, "iu");
const HAS_NUMBER = /\d/;

const DEF_RE = (prefix: string) => new RegExp(`^\\s*(?:[-*]\\s+|\\d+\\.\\s+)?\\**(${prefix}-\\d+)\\b`);

function idsIn(text: string, prefix: string) {
  return [...new Set(text.match(new RegExp(`\\b${prefix}-\\d+\\b`, "g")) ?? [])];
}

function definitions(text: string, prefix: string) {
  const re = DEF_RE(prefix);
  return text.split("\n").flatMap((l) => {
    const m = re.exec(l);
    return m ? [m[1]] : [];
  });
}

type FeatureBlock = { id: string; name: string; text: string };

function featureBlocks(section5: string): FeatureBlock[] {
  const out: FeatureBlock[] = [];
  let cur: FeatureBlock | null = null;
  for (const line of section5.split("\n")) {
    const m = /^####\s+(F\d+)\.?\s+(.*)$/.exec(line);
    if (m) {
      if (cur) out.push(cur);
      cur = { id: m[1], name: m[2].replace(/\s*\(priority[^)]*\)\s*$/i, "").trim(), text: "" };
    } else if (cur) {
      if (/^#{1,3}\s/.test(line)) {
        out.push(cur);
        cur = null;
      } else cur.text += line + "\n";
    }
  }
  if (cur) out.push(cur);
  return out;
}

function acceptanceCount(block: string) {
  const lines = block.split("\n");
  const at = lines.findIndex((l) => /done when|acceptance|selesai (bila|jika|ketika)|kriteria/i.test(l));
  if (at < 0) return -1;
  const base = lines[at].search(/\S/);
  let n = 0;
  for (const l of lines.slice(at + 1)) {
    if (!l.trim()) continue;
    const indent = l.search(/\S/);
    if (/^\s*([-*]|\d+\.)\s+/.test(l) && indent >= base) n++;
    else if (indent <= base) break;
  }
  return n;
}

export type MapEntry = { code: string; name: string };

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** `map` is the agreed feature map; when given, section 5 must match it feature for feature. */
export function runRuleChecks(md: string, map: MapEntry[] = []): Finding[] {
  const findings: Finding[] = [];
  const add = (f: Omit<Finding, "source">) => findings.push({ ...f, source: "rule" });
  const { sections } = splitSections(md);
  const byNum = new Map(sections.map((s) => [s.num, s]));

  for (let n = 1; n <= SECTION_COUNT; n++) {
    if (!byNum.has(n)) {
      add({
        rule: "missing-section",
        severity: "error",
        section: n,
        targetRef: `Section ${n}`,
        message: `Section ${n} is missing.`,
        suggestion: `Write section ${n} following the PRD template.`,
      });
    }
  }

  const s4 = byNum.get(4)?.text ?? "";
  const s5 = byNum.get(5)?.text ?? "";

  for (const prefix of ["FR", "NFR"]) {
    const defs = definitions(s4, prefix);
    const dupes = [...new Set(defs.filter((d, i) => defs.indexOf(d) !== i))];
    for (const d of dupes) {
      add({ rule: "duplicate-id", severity: "error", section: 4, targetRef: d, message: `${d} is defined more than once.`, suggestion: "Renumber so every requirement ID is unique." });
    }
  }

  const frDefined = new Set(definitions(s4, "FR"));
  const frCovered = new Set(idsIn(s5, "FR"));
  for (const fr of frDefined) {
    if (!frCovered.has(fr)) {
      add({
        rule: "uncovered-requirement",
        severity: "error",
        section: 5,
        targetRef: fr,
        message: `${fr} is not covered by any feature.`,
        suggestion: `Add ${fr} to the "Covers:" line of the feature that implements it, or add a feature for it.`,
      });
    }
  }
  for (const fr of frCovered) {
    if (frDefined.size && !frDefined.has(fr)) {
      add({ rule: "unknown-reference", severity: "warning", section: 5, targetRef: fr, message: `Features reference ${fr}, which is not defined in Requirements.`, suggestion: `Define ${fr} in section 4 or remove the reference.` });
    }
  }

  const features = featureBlocks(s5);
  const featureIds = features.map((f) => f.id);
  for (const d of [...new Set(featureIds.filter((d, i) => featureIds.indexOf(d) !== i))]) {
    add({ rule: "duplicate-id", severity: "error", section: 5, targetRef: d, message: `Feature ${d} appears more than once.`, suggestion: "Give every feature a unique F-number." });
  }
  if (byNum.has(5) && features.length === 0) {
    add({ rule: "no-features", severity: "error", section: 5, targetRef: "Section 5", message: "No features in the \"#### F<n>. Name\" format were found.", suggestion: "List each feature as a level-4 heading with its F-number." });
  }
  if (map.length && byNum.has(5)) {
    const prdByCode = new Map(features.map((f) => [f.id, f]));
    for (const m of map) {
      const p = prdByCode.get(m.code);
      if (!p) {
        add({
          rule: "map-mismatch",
          severity: "error",
          section: 5,
          targetRef: `${m.code} ${m.name}`,
          message: `${m.code} "${m.name}" is in the feature map but missing from Core Features.`,
          suggestion: "Add it to section 5 with its sub-features, Covers and Done when, or remove it from the map.",
        });
      } else if (norm(p.name) !== norm(m.name)) {
        add({
          rule: "map-mismatch",
          severity: "warning",
          section: 5,
          targetRef: m.code,
          message: `${m.code} is "${p.name}" in the PRD but "${m.name}" in the feature map.`,
          suggestion: "Use the feature map's name, or rename it on the map and rewrite the PRD.",
        });
      }
    }
    const mapCodes = new Set(map.map((m) => m.code));
    for (const f of features) {
      if (!mapCodes.has(f.id)) {
        add({
          rule: "map-mismatch",
          severity: "warning",
          section: 5,
          targetRef: `${f.id} ${f.name}`,
          message: `${f.id} "${f.name}" is in the PRD but not on the feature map.`,
          suggestion: "Remove it from section 5, or add it to the map first so the scope stays agreed.",
        });
      }
    }
  }

  for (const f of features) {
    const n = acceptanceCount(f.text);
    if (n < 3) {
      add({
        rule: "weak-acceptance",
        severity: "warning",
        section: 5,
        targetRef: `${f.id} ${f.name}`,
        message: n < 0 ? `${f.id} has no "Done when" acceptance criteria.` : `${f.id} has only ${n} acceptance criteri${n === 1 ? "on" : "a"}.`,
        suggestion: "Give it 3–6 testable criteria that a tester could check with a yes or no.",
      });
    }
  }

  // Vague wording in requirements, metrics and acceptance criteria, unless a number makes it concrete.
  const seen = new Set<string>();
  for (const num of [2, 4, 5]) {
    for (const line of (byNum.get(num)?.text ?? "").split("\n")) {
      if (!/^\s*([-*]|\d+\.|\|)/.test(line) || HAS_NUMBER.test(line.replace(/\b(N?FR|F|A)-\d+\b/g, ""))) continue;
      const m = VAGUE_RE.exec(line);
      if (!m) continue;
      const ref = /\b(N?FR-\d+)\b/.exec(line)?.[1] ?? line.replace(/^\s*([-*]|\d+\.|\|)\s*/, "").slice(0, 60);
      if (seen.has(ref)) continue;
      seen.add(ref);
      add({
        rule: "vague-wording",
        severity: "warning",
        section: num,
        targetRef: ref,
        message: `"${m[2]}" is not testable here: "${line.trim().replace(/^[-*|]\s*/, "").slice(0, 140)}"`,
        suggestion: "Replace it with a measurable threshold (time, count, size, percentage) or a concrete behaviour.",
      });
    }
  }

  const mermaidIn = (n: number, kind: RegExp) => new RegExp("```mermaid\\s*\\n\\s*" + kind.source).test(byNum.get(n)?.text ?? "");
  if (byNum.has(7) && !mermaidIn(7, /sequenceDiagram/)) {
    add({ rule: "missing-diagram", severity: "warning", section: 7, targetRef: "Architecture", message: "Architecture has no Mermaid sequence diagram.", suggestion: "Add a sequenceDiagram for the core (first win) flow." });
  }
  if (byNum.has(8) && !mermaidIn(8, /erDiagram/)) {
    add({ rule: "missing-diagram", severity: "warning", section: 8, targetRef: "Data Model", message: "Data Model has no Mermaid ER diagram.", suggestion: "Add an erDiagram with every table and relationship." });
  }

  return findings;
}
