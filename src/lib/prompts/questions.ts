import "server-only";
import { z } from "zod";
import type { Answers, Question, TechStack } from "@/db/schema";
import { LANGUAGES } from "@/lib/plan-steps";

const QuestionSchema = z.object({
  id: z.string().describe("short kebab-case id, unique within the list"),
  type: z.enum(["text", "single_choice", "multi_choice"]),
  question: z.string(),
  options: z.array(z.string()).optional().describe("4-6 options for choice questions; omit for text"),
  why: z.string().describe("one sentence: how the answer changes the PRD"),
});

export const QuestionsOutput = z.object({ questions: z.array(QuestionSchema).min(3).max(6) });

export const FollowupsOutput = z.object({
  assessment: z.string().describe("one or two sentences on whether the answers are enough to write a solid PRD"),
  followups: z.array(QuestionSchema).max(3),
});

export function languageName(code: string) {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

function stackLines(s: TechStack) {
  return Object.entries(s)
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
}

export const QUESTIONS_SYSTEM = `You are a senior product manager preparing to write a PRD that an AI coding agent will implement.
Before writing, you ask the founder the few questions whose answers most change the PRD.

Cover, in this order, only what the idea leaves unclear:
1. The target user and what they do today instead (their current workaround).
2. The first success moment: the one thing a new user must complete to feel the product works.
3. Must-have scope for the first release, versus later.
4. Why it is better than the current workaround (the reason to switch).
5. Hard constraints (platform, channel, data/privacy, region, deadline).

Rules:
- 3 to 6 questions. Skip anything the idea already answers clearly.
- Prefer single_choice or multi_choice with 4-6 concrete, mutually distinct options drawn from this specific idea.
  Include an option like "Not decided yet" where the founder may genuinely not know.
- Use type "text" only where any list of options would be a guess.
- For multi_choice scope questions, phrase it so the founder picks only true must-haves (e.g. "only what you would delay launch for").
- Do not ask about the tech stack; it is already fixed.
- "why" tells the founder, in one plain sentence, what part of the PRD the answer decides.`;

export function questionsPrompt(plan: { title: string; idea: string; language: string; techStack: TechStack }) {
  return `Product: ${plan.title}

Idea from the founder:
"""
${plan.idea}
"""

Fixed tech stack:
${stackLines(plan.techStack)}

Write the questions, options and "why" in ${languageName(plan.language)}. Keep JSON keys and "type" values in English.`;
}

export const FOLLOWUPS_SYSTEM = `You are a senior product manager reviewing a founder's answers before writing a PRD.
Decide whether the answers are specific enough to write requirements, acceptance criteria and a data model.

Ask 0 to 3 follow-up questions, only when an answer is:
- too vague to act on (e.g. "everyone", "it's easy", one or two words for an open question),
- contradictory with another answer or the idea, or
- skipped, but the PRD cannot reasonably assume a default for it.

If a skipped or vague answer can be covered by a sensible default, do NOT ask; the PRD will record it as an assumption.
Return an empty followups list when the answers are good enough. Same question rules as before: prefer concrete choices,
4-6 options, "why" in one sentence. Follow-up ids must start with "f-".`;

export function followupsPrompt(
  plan: { title: string; idea: string; language: string },
  questions: Question[],
  answers: Answers,
) {
  const qa = questions
    .map((q) => {
      const a = answers[q.id];
      const shown = a == null ? "(skipped)" : Array.isArray(a) ? (a.length ? a.join("; ") : "(nothing selected)") : a || "(empty)";
      return `Q (${q.id}): ${q.question}\nA: ${shown}`;
    })
    .join("\n\n");
  return `Product: ${plan.title}

Idea:
"""
${plan.idea}
"""

Questions and answers:
${qa}

Write any follow-up questions and the assessment in ${languageName(plan.language)}. Keep JSON keys and "type" values in English.`;
}

/** Makes model-written ids safe and unique, and tags the round. */
export function normalizeQuestions(qs: z.infer<typeof QuestionSchema>[], round: number, taken: Set<string>): Question[] {
  return qs.map((q, i) => {
    let id =
      q.id
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "") || `q${i + 1}`;
    if (round > 1 && !id.startsWith("f-")) id = `f-${id}`;
    while (taken.has(id)) id = `${id}-2`;
    taken.add(id);
    const options = q.type === "text" ? undefined : (q.options ?? []).filter(Boolean);
    return { id, type: options && options.length ? q.type : "text", question: q.question, options, why: q.why, round };
  });
}
