import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

/**
 * Camada model-agnostic (Vercel AI SDK). O provedor e o modelo vêm de variáveis
 * de ambiente, então trocar Anthropic/OpenAI/Google é mudar env + redeploy, sem
 * tocar código. Este módulo é server-only: nunca importe em componente cliente,
 * e nunca exponha as chaves (elas são lidas automaticamente por cada provider a
 * partir de OPENAI_API_KEY / ANTHROPIC_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY).
 */

export type AiProvider = "openai" | "anthropic" | "google";

/** Erro de configuração de IA — a rota mapeia para 503 com mensagem pt-BR. */
export class AiConfigError extends Error {
  readonly aiConfig = true;
  constructor(message: string) {
    super(message);
    this.name = "AiConfigError";
  }
}

const PROVIDER_KEY_ENV: Record<AiProvider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function isAiEnabled(): boolean {
  return process.env.AI_FEATURES_ENABLED === "true";
}

function resolveProvider(): AiProvider {
  const raw = (process.env.AI_PROVIDER ?? "openai").toLowerCase();
  if (raw === "openai" || raw === "anthropic" || raw === "google") return raw;
  throw new AiConfigError(`Provedor de IA inválido em AI_PROVIDER: "${raw}". Use openai, anthropic ou google.`);
}

function assertKey(provider: AiProvider) {
  const envName = PROVIDER_KEY_ENV[provider];
  if (!process.env[envName]) {
    throw new AiConfigError(`A IA está ativada, mas ${envName} não está configurada para o provedor "${provider}".`);
  }
}

function providerModel(provider: AiProvider, modelId: string): LanguageModel {
  switch (provider) {
    case "openai":
      return openai(modelId);
    case "anthropic":
      return anthropic(modelId);
    case "google":
      return google(modelId);
  }
}

/** Modelo de texto para o bot de dúvidas. */
export function getChatModel(): LanguageModel {
  if (!isAiEnabled()) throw new AiConfigError("As funções de IA estão desativadas (AI_FEATURES_ENABLED).");
  const provider = resolveProvider();
  assertKey(provider);
  const modelId = process.env.AI_MODEL;
  if (!modelId) throw new AiConfigError("Configure AI_MODEL com o id do modelo de texto.");
  return providerModel(provider, modelId);
}

/**
 * Modelo multimodal para o leitor de prints. Exige AI_VISION_MODEL explícito —
 * não cai no AI_MODEL de texto por engano, o que faria um modelo sem visão
 * "alucinar" saldos ignorando a imagem.
 */
export function getVisionModel(): LanguageModel {
  if (!isAiEnabled()) throw new AiConfigError("As funções de IA estão desativadas (AI_FEATURES_ENABLED).");
  const provider = resolveProvider();
  assertKey(provider);
  const modelId = process.env.AI_VISION_MODEL;
  if (!modelId) {
    throw new AiConfigError("Configure AI_VISION_MODEL com um modelo que aceite imagens (visão) para ler os prints.");
  }
  return providerModel(provider, modelId);
}

/** Opções padrão de chamada: timeout duro + no máximo 1 retry, para limitar custo/latência. */
export function aiCallDefaults(): { maxRetries: number; abortSignal: AbortSignal } {
  return {
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(envInt("AI_TIMEOUT_MS", 20000)),
  };
}

/** Limites de upload do leitor de prints, para conter custo de tokens de visão. */
export function aiUploadLimits(): { maxImages: number; maxImageBytes: number } {
  return {
    maxImages: envInt("AI_MAX_IMAGES", 6),
    maxImageBytes: envInt("AI_MAX_IMAGE_BYTES", 8_000_000),
  };
}
