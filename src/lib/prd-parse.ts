// Pure helpers for the fixed PRD layout ("## <n>. <title>" top-level sections). Safe on client and server.

export type PrdSection = { num: number; heading: string; text: string };

const SECTION_RE = /^## (\d+)\.\s+(.*)$/;

/** Splits a PRD into the text before section 1 and its numbered sections (each including its heading line). */
export function splitSections(md: string): { preamble: string; sections: PrdSection[] } {
  const lines = md.split("\n");
  const sections: PrdSection[] = [];
  const pre: string[] = [];
  let current: { num: number; heading: string; lines: string[] } | null = null;
  let inFence = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const m = !inFence && SECTION_RE.exec(line);
    if (m) {
      if (current) sections.push({ num: current.num, heading: current.heading, text: current.lines.join("\n") });
      current = { num: Number(m[1]), heading: m[2].trim(), lines: [line] };
    } else if (current) {
      current.lines.push(line);
    } else {
      pre.push(line);
    }
  }
  if (current) sections.push({ num: current.num, heading: current.heading, text: current.lines.join("\n") });
  return { preamble: pre.join("\n"), sections };
}

/** The "#### F<n>. ..." block of one feature in section 5, or null when the PRD doesn't contain it. */
export function featureBlock(md: string, code: string): string | null {
  const s5 = splitSections(md).sections.find((s) => s.num === 5)?.text ?? "";
  const start = s5.search(new RegExp(`^####\\s+${code}\\.`, "m"));
  return start >= 0 ? s5.slice(start).split(/\n(?=####\s|###\s)/)[0].trim() : null;
}

/** IDs listed on a feature's "Covers:" line, e.g. ["FR-1", "FR-4"]. */
export function coveredRequirements(block: string | null): string[] {
  const line = block?.split("\n").find((l) => /covers:/i.test(l));
  return line ? [...new Set(line.match(/\bN?FR-\d+\b/g) ?? [])] : [];
}

/** Replaces (or inserts, in number order) whole sections and returns the new document. */
export function replaceSections(md: string, replacements: { num: number; markdown: string }[]): string {
  const { preamble, sections } = splitSections(md);
  const byNum = new Map(sections.map((s) => [s.num, s.text]));
  for (const r of replacements) {
    let text = r.markdown.trim();
    // Guard: the model must return the section with its own heading.
    if (!SECTION_RE.test(text.split("\n")[0])) {
      const old = sections.find((s) => s.num === r.num);
      text = `${old ? old.text.split("\n")[0] : `## ${r.num}.`}\n\n${text}`;
    }
    byNum.set(r.num, text + "\n");
  }
  const ordered = [...byNum.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t.replace(/\n+$/, ""));
  return [preamble.replace(/\n+$/, ""), ...ordered].filter(Boolean).join("\n\n") + "\n";
}
