import 'server-only';

/**
 * Default model: gpt-6-luna, OpenAI's most cost-efficient current model
 * ($0.10 / 1M input, $0.50 / 1M output, https://platform.openai.com/docs/pricing).
 * Override with OPENAI_MODEL (e.g. gpt-5.6-luna, gpt-5-mini).
 */
export const DEFAULT_OPENAI_MODEL = 'gpt-6-luna';

export function getOpenAIConfig(): { apiKey: string; model: string } | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return { apiKey, model: process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL };
}
