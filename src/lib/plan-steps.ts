import type { PlanStep } from "@/db/schema";

export const PLAN_STEPS: { id: PlanStep; label: string }[] = [
  { id: "idea", label: "Idea" },
  { id: "questions", label: "Questions" },
  // The feature map comes before the PRD so the PRD is written around agreed features (menus/modules).
  { id: "features", label: "Feature map" },
  { id: "prd", label: "PRD" },
  { id: "tasks", label: "Tasks" },
];

export function stepIndex(step: PlanStep) {
  return PLAN_STEPS.findIndex((s) => s.id === step);
}

export const FEATURE_ICONS = [
  "dashboard", "list", "plus", "wallet", "tag", "bell", "chart", "message", "user", "users", "settings",
  "file", "box", "calendar", "lock", "card", "upload", "search", "shield", "home", "cart", "map", "camera", "star",
] as const;
export type FeatureIcon = (typeof FEATURE_ICONS)[number];

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "ms", label: "Bahasa Melayu" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "ja", label: "日本語" },
];
