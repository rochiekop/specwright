import "server-only";

export type ProviderKind = "anthropic" | "openai-compatible";

export type ProviderDef = {
  id: string;
  label: string;
  kind: ProviderKind;
  apiKeyEnv: string;
  defaultBaseUrl?: string;
  // Local servers such as Ollama accept any key.
  keyOptional?: boolean;
};

// Every non-Anthropic provider here exposes an OpenAI-compatible Chat Completions API.
// Each base URL can be overridden with <ID>_BASE_URL (e.g. OPENROUTER_BASE_URL).
export const PROVIDERS: ProviderDef[] = [
  { id: "anthropic", label: "Anthropic (Claude)", kind: "anthropic", apiKeyEnv: "ANTHROPIC_API_KEY" },
  { id: "openai", label: "OpenAI", kind: "openai-compatible", apiKeyEnv: "OPENAI_API_KEY", defaultBaseUrl: "https://api.openai.com/v1" },
  { id: "gemini", label: "Google Gemini", kind: "openai-compatible", apiKeyEnv: "GEMINI_API_KEY", defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/" },
  { id: "deepseek", label: "DeepSeek", kind: "openai-compatible", apiKeyEnv: "DEEPSEEK_API_KEY", defaultBaseUrl: "https://api.deepseek.com" },
  { id: "openrouter", label: "OpenRouter (many models)", kind: "openai-compatible", apiKeyEnv: "OPENROUTER_API_KEY", defaultBaseUrl: "https://openrouter.ai/api/v1" },
  { id: "moonshot", label: "Moonshot (Kimi)", kind: "openai-compatible", apiKeyEnv: "MOONSHOT_API_KEY", defaultBaseUrl: "https://api.moonshot.ai/v1" },
  { id: "groq", label: "Groq", kind: "openai-compatible", apiKeyEnv: "GROQ_API_KEY", defaultBaseUrl: "https://api.groq.com/openai/v1" },
  { id: "ollama", label: "Ollama (local)", kind: "openai-compatible", apiKeyEnv: "OLLAMA_API_KEY", defaultBaseUrl: "http://localhost:11434/v1", keyOptional: true },
  { id: "custom", label: "Custom OpenAI-compatible", kind: "openai-compatible", apiKeyEnv: "CUSTOM_API_KEY", keyOptional: true },
];

export type ProviderConfig = ProviderDef & {
  apiKey?: string;
  baseUrl?: string;
  configured: boolean;
};

export function getProvider(id: string): ProviderConfig {
  const def = PROVIDERS.find((p) => p.id === id);
  if (!def) throw new Error(`Unknown provider "${id}". Known: ${PROVIDERS.map((p) => p.id).join(", ")}`);
  const apiKey = process.env[def.apiKeyEnv] || undefined;
  const baseUrlEnv = process.env[`${def.id.toUpperCase()}_BASE_URL`] || undefined;
  const baseUrl = baseUrlEnv || def.defaultBaseUrl;
  // Keyless providers (Ollama, custom) count as configured only once their URL is set explicitly.
  const configured =
    def.kind === "anthropic" ? Boolean(apiKey) : Boolean(baseUrl) && (Boolean(apiKey) || (Boolean(def.keyOptional) && Boolean(baseUrlEnv)));
  return { ...def, apiKey, baseUrl, configured };
}

export function listProviders(): ProviderConfig[] {
  return PROVIDERS.map((p) => getProvider(p.id));
}

/** "provider:model". Model ids may themselves contain ":" (e.g. "llama3.1:8b"). */
export function parseModelSpec(spec: string): { provider: string; model: string } {
  const i = spec.indexOf(":");
  if (i <= 0 || i === spec.length - 1) throw new Error(`Model "${spec}" must look like provider:model, e.g. anthropic:claude-opus-5-5`);
  return { provider: spec.slice(0, i), model: spec.slice(i + 1) };
}
