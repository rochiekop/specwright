import "server-only";
import { z } from "zod";
import type { Finding } from "@/lib/quality-rules";
import { languageName } from "./questions";

export const REVIEW_RULES = [
  "traceability", // requirement ↔ feature ↔ flow links that are wrong or missing
  "testability", // criteria or metrics a tester could not check yes/no
  "consistency", // two parts of the PRD disagree
  "completeness", // a needed behaviour, state, role or edge case is missing
  "data-model", // tables/fields missing for a requirement, or unused tables
  "scope", // contradicts non-goals, or phase 1 cannot deliver the first win
  "assumption", // a decision presented as fact that the founder never made
] as const;

export const ReviewOutput = z.object({
  findings: z
    .array(
      z.object({
        rule: z.enum(REVIEW_RULES),
        severity: z.enum(["error", "warning", "info"]),
        section: z.number().int().min(1).max(12).describe("the section that should change to fix it"),
        targetRef: z.string().describe("the ID or short name it is about, e.g. FR-3, F2, users table"),
        message: z.string().describe("the problem in one or two sentences, quoting the PRD where useful"),
        suggestion: z.string().describe("the concrete change that fixes it"),
      }),
    )
    .max(12),
});

export const REVIEW_SYSTEM = `You are a demanding reviewer of PRDs that an AI coding agent will implement without asking questions.
Find the problems that would make the agent build the wrong thing, get stuck, or ship something untestable.

Check:
- traceability: each functional requirement is delivered by a feature and appears in a flow; features don't add unrequested scope.
- testability: every "Done when" item and metric can be checked yes/no by a tester.
- consistency: names, numbers, limits, roles and states agree across sections (e.g. a status in a flow exists in the data model).
- completeness: missing error/empty states, permissions, deletion/editing, notifications, limits the requirements imply.
- data-model: every requirement's data has a table/field; no orphan tables; keys and relations make sense.
- scope: nothing contradicts the non-goals; phase 1 alone delivers the first win.
- assumption: choices stated as decided that the founder never made (they belong under Assumptions).

Rules:
- Report at most 12 findings, most important first. Prefer fewer, sharper findings over many small ones.
- "error" = the agent would build something wrong or be blocked; "warning" = likely rework; "info" = polish.
- Do not repeat issues already found by the automatic checks (listed in the prompt).
- Do not ask for features beyond the stated scope. Do not comment on writing style.
- An empty list is a valid answer for a strong PRD.`;

export function reviewPrompt(prd: string, ruleFindings: Finding[], language: string) {
  const known = ruleFindings.length
    ? ruleFindings.map((f) => `- [${f.rule}] ${f.targetRef}: ${f.message}`).join("\n")
    : "(none)";
  return `PRD to review:
"""
${prd}
"""

Already found by automatic checks (do not repeat):
${known}

Write "message" and "suggestion" in ${languageName(language)}.`;
}

export const FixOutput = z.object({
  sections: z
    .array(
      z.object({
        num: z.number().int().min(1).max(12),
        markdown: z.string().describe('the complete rewritten section, starting with its "## <n>. <title>" heading'),
      }),
    )
    .min(1)
    .max(3),
  summary: z.string().describe("one sentence describing what changed"),
});

export const FIX_SYSTEM = `You fix one reported problem in a PRD by rewriting the smallest set of sections needed (usually one, at most three).

Rules:
- Return each changed section complete, starting with its exact original heading line ("## <n>. <title>").
- Change only what the fix requires. Keep every other sentence, ID, number, table and diagram as it was.
- Keep IDs stable (FR-n, NFR-n, F<n>, A-n). New items take the next free number.
- Keep the labels "Covers:", "Sub-features:" and "Done when:" in English.
- Don't invent founder decisions: if the fix needs one, add it as an assumption (A-n) in section 10 and say so.
- Keep Mermaid diagrams valid if you touch them.
- Write in the PRD's language.`;

export function fixPrompt(prd: string, f: { rule: string; section: number | null; targetRef: string; message: string; suggestion: string }, language: string) {
  return `Full PRD (for context):
"""
${prd}
"""

Problem to fix:
- type: ${f.rule}
- about: ${f.targetRef}
- in section: ${f.section ?? "unknown"}
- problem: ${f.message}
- suggested fix: ${f.suggestion}

Rewrite only the section(s) needed. The PRD language is ${languageName(language)}.`;
}
