import type {
  CoworkProvider,
  CoworkProviderDefaults,
  CoworkProviderRegistry,
} from "./openwork-server";
import type { ModelRef } from "../types";

const REGISTRY_STORAGE_KEY = "cowork.providers.registry";
const SECRETS_STORAGE_KEY = "cowork.providers.secrets";

export const DEFAULT_PROVIDER_ID = "nvidia-integrate";

export const DEFAULT_PROVIDER: CoworkProvider = {
  id: DEFAULT_PROVIDER_ID,
  name: "NVIDIA Integrate",
  kind: "openai_compatible",
  baseUrl: "https://integrate.api.nvidia.com/v1",
  modelCatalog: [
    "deepseek-ai/deepseek-v3.2",
    "stepfun-ai/step-3.5-flash",
  ],
  defaultModels: {
    chat: "deepseek-ai/deepseek-v3.2",
  },
};

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");

const normalizeModelList = (value: unknown) =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((item) => String(item).trim())
            .filter(Boolean),
        ),
      )
    : [];

export function normalizeCoworkProvider(provider: CoworkProvider): CoworkProvider {
  const id = provider.id.trim();
  const name = provider.name?.trim() || id;
  return {
    id,
    name,
    kind: "openai_compatible",
    baseUrl: normalizeBaseUrl(provider.baseUrl),
    modelCatalog: normalizeModelList(provider.modelCatalog),
    defaultModels: provider.defaultModels
      ? {
          chat: provider.defaultModels.chat?.trim() || undefined,
          vision: provider.defaultModels.vision?.trim() || undefined,
          image: provider.defaultModels.image?.trim() || undefined,
        }
      : undefined,
  };
}

export function normalizeCoworkDefaults(defaults?: CoworkProviderDefaults): CoworkProviderDefaults | undefined {
  if (!defaults) return undefined;
  const normalizeRef = (value?: { providerId: string; modelId: string }) => {
    if (!value) return undefined;
    const providerId = value.providerId?.trim() ?? "";
    const modelId = value.modelId?.trim() ?? "";
    if (!providerId || !modelId) return undefined;
    return { providerId, modelId };
  };
  return {
    chat: normalizeRef(defaults.chat),
    vision: normalizeRef(defaults.vision),
    image: normalizeRef(defaults.image),
  };
}

export function defaultCoworkRegistry(): CoworkProviderRegistry {
  return {
    version: 1,
    updatedAt: Date.now(),
    providers: [DEFAULT_PROVIDER],
    defaults: {
      chat: { providerId: DEFAULT_PROVIDER_ID, modelId: DEFAULT_PROVIDER.defaultModels?.chat ?? "" },
    },
  };
}

export function normalizeCoworkRegistry(input?: CoworkProviderRegistry | null): CoworkProviderRegistry {
  if (!input) return defaultCoworkRegistry();
  const providers = Array.isArray(input.providers)
    ? input.providers.map(normalizeCoworkProvider)
    : [];
  const defaults = normalizeCoworkDefaults(input.defaults);
  return {
    version: typeof input.version === "number" ? input.version : 1,
    updatedAt: typeof input.updatedAt === "number" ? input.updatedAt : undefined,
    providers,
    defaults,
  };
}

export function readLocalCoworkRegistry(): CoworkProviderRegistry {
  if (typeof window === "undefined") return defaultCoworkRegistry();
  try {
    const raw = window.localStorage.getItem(REGISTRY_STORAGE_KEY);
    if (!raw) return defaultCoworkRegistry();
    const parsed = JSON.parse(raw) as CoworkProviderRegistry;
    return normalizeCoworkRegistry(parsed);
  } catch {
    return defaultCoworkRegistry();
  }
}

export function writeLocalCoworkRegistry(next: CoworkProviderRegistry): CoworkProviderRegistry {
  if (typeof window === "undefined") return normalizeCoworkRegistry(next);
  try {
    const normalized = normalizeCoworkRegistry(next);
    window.localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify({ ...normalized, updatedAt: Date.now() }));
    return normalized;
  } catch {
    return normalizeCoworkRegistry(next);
  }
}

export function readLocalCoworkSecrets(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SECRETS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, { apiKey?: string }>;
    return Object.fromEntries(
      Object.entries(parsed ?? {}).map(([key, value]) => [key, String(value?.apiKey ?? "").trim()]).filter(([, val]) => Boolean(val)),
    );
  } catch {
    return {};
  }
}

export function writeLocalCoworkSecrets(next: Record<string, string>): Record<string, string> {
  if (typeof window === "undefined") return next;
  try {
    const payload = Object.fromEntries(
      Object.entries(next).map(([key, value]) => [key, { apiKey: value }]),
    );
    window.localStorage.setItem(SECRETS_STORAGE_KEY, JSON.stringify(payload));
    return next;
  } catch {
    return next;
  }
}

export function resolveDefaultModel(defaults: CoworkProviderDefaults | undefined, fallback?: ModelRef): ModelRef | null {
  const ref = defaults?.chat;
  if (ref?.providerId && ref?.modelId) {
    return { providerID: ref.providerId, modelID: ref.modelId };
  }
  return fallback ?? null;
}

export function buildOpencodeConfigSnippet(
  registry: CoworkProviderRegistry,
  options?: { includeKeys?: boolean; secrets?: Record<string, string> },
): string {
  const providers = registry.providers ?? [];
  const secrets = options?.secrets ?? {};
  const config: Record<string, unknown> = {
    $schema: "https://opencode.ai/config.json",
    provider: {},
  };

  const providerEntries = providers.reduce<Record<string, unknown>>((acc, provider) => {
    const apiKey = options?.includeKeys ? secrets[provider.id] : undefined;
    const baseUrl = normalizeBaseUrl(provider.baseUrl);
    acc[provider.id] = {
      npm: "@ai-sdk/openai-compatible",
      name: provider.name,
      options: {
        baseURL: baseUrl,
        ...(apiKey ? { apiKey } : {}),
      },
      models: Object.fromEntries(
        (provider.modelCatalog ?? []).map((modelId) => [
          modelId,
          { name: modelId },
        ]),
      ),
    };
    return acc;
  }, {});

  config.provider = providerEntries;

  const defaultChat = registry.defaults?.chat;
  if (defaultChat?.providerId && defaultChat?.modelId) {
    config.model = `${defaultChat.providerId}/${defaultChat.modelId}`;
  }

  return JSON.stringify(config, null, 2);
}
