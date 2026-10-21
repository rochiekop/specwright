import "server-only";
import type { Answers, Question, TechStack } from "@/db/schema";
import { languageName } from "./questions";

/**
 * Fixed section order. Later steps (quality check, features, tasks) rely on these numbers,
 * so headings are always "## <n>. <title>" with the title translated to the plan language.
 */
export const PRD_SECTIONS = [
  "Overview",
  "Goals & Success Metrics",
  "Non-goals",
  "Requirements",
  "Core Features",
  "User Flows",
  "Architecture",
  "Data Model",
  "Tech Stack",
  "Risks & Assumptions",
  "Open Questions",
  "Glossary",
] as const;

export const PRD_SYSTEM = `You are a senior product manager writing a PRD that an AI coding agent will implement feature by feature.
The founder has already agreed a feature map (features = menus/modules, sub-features = screens/actions, with phases).
The PRD is written around that map. It must be specific enough to build from, honest about what is undecided, and SHORT:
include only what an engineer needs to build and test. Target 1,500-2,500 words in total.

Write GitHub-flavored Markdown with exactly this structure (translate the section titles, keep the numbers):

# PRD: <product name>

## 1. Overview  (max ~120 words)
Problem (who has it, what they do today, why that fails), the solution in one or two sentences, target users,
and the first success moment ("first win").

## 2. Goals & Success Metrics
3-4 goals, each with one measurable metric and target (e.g. "median time to log an expense < 10 s"). A table is fine.

## 3. Non-goals
3-6 bullets: what v1 deliberately does not do.

## 4. Requirements
### Functional
FR-1, FR-2, ... one testable sentence each: "<actor> can <action> <object> <condition>". Only what the map needs.
### Non-functional
NFR-1, ... only the ones that change how it is built, each with a measurable threshold.

## 5. Core Features
Use EXACTLY the features of the feature map: same F-numbers, names, phases, priorities and sub-features, in the same order.
Do not add, drop, rename, merge or re-phase features or sub-features.
Group by phase ("### Phase 1 — <theme>", ...). Each feature: "#### F<n>. <name> (priority: <priority>)" then
- "Covers: FR-x, FR-y" (every FR must be covered by at least one feature),
- "Sub-features:" the sub-feature names from the map, one bullet each (no descriptions),
- "Done when:" 3-5 testable acceptance criteria for the feature.
Do not repeat the map's summaries. Keep the labels "Covers:", "Sub-features:" and "Done when:" in English in every language; tools read them.

## 6. User Flows
Only the main flows (2-4) plus one error/edge path each. Numbered steps naming the actor; reference features by F-number.

## 7. Architecture
3-6 bullets on components and how they talk, then ONE fenced \`\`\`mermaid sequenceDiagram for the first-win flow.
Keep participant names short and avoid special characters in messages.

## 8. Data Model
Each table as one compact line or small table: name, purpose, key fields with types, PK/FK.
Then ONE fenced \`\`\`mermaid erDiagram covering all tables and relationships, using only simple attribute types
(uuid, string, text, int, decimal, bool, datetime, json) and plain attribute names.

## 9. Tech Stack
The fixed stack from the founder in a short list, plus anything it implies (e.g. auth library). No alternatives.

## 10. Risks & Assumptions
### Assumptions
Every question the founder skipped or answered vaguely becomes an explicit assumption:
"A-1: <assumed default> (because <question> was not answered)". Add other assumptions you made.
### Risks
Top 3-5 risks, each with a one-line mitigation.

## 11. Open Questions
Only decisions that block building, each with what it blocks. Write "None." if there are none.

## 12. Glossary
Only terms that could be misread; one line each. Write "None." if there are none.

Rules:
- Use only facts from the idea, answers and feature map; when you must fill a gap, record it under Assumptions.
- No marketing language, no repetition between sections, no restating the question answers. Bullets over prose.
- Keep IDs stable and unique (FR-n, NFR-n, F<n>, A-n).
- Output only the Markdown document, with no preface or closing remarks.`;

function stackLines(s: TechStack) {
  return Object.entries(s)
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
}

export function answersBlock(questions: Question[], answers: Answers) {
  return questions
    .map((q) => {
      const a = answers[q.id];
      const shown =
        a === undefined ? "(not answered)" : a === null ? "(skipped)" : Array.isArray(a) ? a.join("; ") || "(nothing selected)" : a || "(empty)";
      return `- ${q.question}\n  Answer: ${shown}`;
    })
    .join("\n");
}

export function prdPrompt(
  plan: {
    title: string;
    idea: string;
    language: string;
    techStack: TechStack;
    questions: Question[];
    answers: Answers;
  },
  featureMap: string,
) {
  return `Product name: ${plan.title}

Idea from the founder:
"""
${plan.idea}
"""

Founder's answers to clarifying questions:
${plan.questions.length ? answersBlock(plan.questions, plan.answers) : "(no questions were asked)"}

Agreed feature map (use exactly these features and sub-features in section 5):
${featureMap || "(no feature map yet: derive 4-9 features yourself, phase 1 delivering the first win)"}

Fixed tech stack:
${stackLines(plan.techStack)}

Write the whole PRD in ${languageName(plan.language)} (Mermaid keywords stay in English).`;
}
