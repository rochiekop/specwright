import type { z } from "zod";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type GenerateArgs = {
  system?: string;
  prompt: string;
  maxTokens?: number;
  // Only Claude uses this; other providers ignore it.
  effort?: Effort;
  // Cancels the upstream request (e.g. when the user presses Stop) so no further tokens are billed.
  signal?: AbortSignal;
};

export type Usage = { inputTokens?: number; outputTokens?: number };

export type TextResult = { text: string; usage: Usage };
export type ObjectResult<T> = { object: T; raw: string; usage: Usage };

export interface LlmAdapter {
  generateText(model: string, args: GenerateArgs): Promise<TextResult>;
  streamText(model: string, args: GenerateArgs, onUsage: (u: Usage) => void): AsyncGenerator<string>;
  generateObject<T>(model: string, schema: z.ZodType<T>, args: GenerateArgs): Promise<ObjectResult<T>>;
  listModels(): Promise<string[]>;
}
