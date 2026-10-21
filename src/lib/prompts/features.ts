import "server-only";
import { z } from "zod";
import type { Answers, Question, TechStack } from "@/db/schema";
import { FEATURE_ICONS } from "@/lib/plan-steps";
import { answersBlock } from "./prd";
import { languageName } from "./questions";

export const FeaturesOutput = z.object({
  features: z
    .array(
      z.object({
        name: z.string().describe("2-4 words, the menu or module name a user would see"),
        summary: z.string().describe("one sentence: who does what with it"),
        icon: z.enum(FEATURE_ICONS),
        phase: z.number().int().min(1).max(4),
        priority: z.enum(["high", "medium", "low"]),
        subFeatures: z
          .array(
            z.object({
              name: z.string().describe("2-5 words, a screen or user action"),
              summary: z.string().describe("one sentence"),
            }),
          )
          .min(2)
          .max(5),
      }),
    )
    .min(3)
    .max(9),
});

export const FEATURES_SYSTEM = `You are a senior product manager turning an app idea into a feature map, before any PRD is written.
The map is what the founder will review and edit: the menus/modules of the app (features) and the screens or actions inside each (sub-features).

Rules:
- 4 to 9 features. Each is something a user would recognise as a menu, module or area of the app, not a technical layer.
  Do not create features like "Backend", "Database", "API" or "Infrastructure".
- Accounts/sign-in is a feature only if the app needs it; put it in the phase where it is first needed.
- 2 to 5 sub-features per feature: concrete screens or actions ("Add expense", "Monthly chart"), not vague capabilities.
- Phases (1-4): phase 1 alone must let a new user reach the first success moment from the answers. Later phases add
  what the founder marked as wanted but not launch-critical. Use as few phases as the scope needs.
- Priority: high = launch blocker, medium = expected soon, low = nice to have.
- Respect the founder's answers: include every capability they marked as a must-have; leave out what they excluded.
  Do not add features the idea and answers do not justify.
- List features in build order (phase 1 first).
- icon: pick the closest from the allowed list.`;

export function featuresPrompt(plan: {
  title: string;
  idea: string;
  language: string;
  techStack: TechStack;
  questions: Question[];
  answers: Answers;
}) {
  return `Product: ${plan.title}

Idea:
"""
${plan.idea}
"""

Founder's answers:
${plan.questions.length ? answersBlock(plan.questions, plan.answers) : "(no questions were asked)"}

Write names and summaries in ${languageName(plan.language)}. Keep JSON keys and enum values in English.`;
}
