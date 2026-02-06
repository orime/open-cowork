import { chmod, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { ApiError } from "./errors.js";
import { ensureDir, readJsonFile } from "./utils.js";

export type CoworkProviderKind = "openai_compatible";

export type CoworkProvider = {
  id: string;
  name: string;
  kind: CoworkProviderKind;
  baseUrl: string;
  modelCatalog: string[];
  defaultModels?: {
    chat?: string;
    vision?: string;
    image?: string;
  };
};

export type CoworkProviderDefaults = {
  chat?: { providerId: string; modelId: string };
  vision?: { providerId: string; modelId: string };
  image?: { providerId: string; modelId: string };
};

export type CoworkProviderRegistry = {
  version: number;
  updatedAt?: number;
  providers: CoworkProvider[];
  defaults?: CoworkProviderDefaults;
};

export type CoworkProviderSecrets = {
  version: number;
  updatedAt?: number;
  secrets: Record<string, { apiKey: string }>;
};

const DEFAULT_REGISTRY: CoworkProviderRegistry = {
  version: 1,
  providers: [
    {
      id: "nvidia-integrate",
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
    },
  ],
  defaults: {
    chat: { providerId: "nvidia-integrate", modelId: "deepseek-ai/deepseek-v3.2" },
  },
};

const DEFAULT_SECRETS: CoworkProviderSecrets = {
  version: 1,
  secrets: {},
};

const configDir = () => resolve(homedir(), ".config", "my-first-cowork");
const registryPath = () => join(configDir(), "providers.json");
const secretsPath = () => join(configDir(), "secrets.json");

const normalizeId = (value: string) => value.trim();
const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");
const normalizeModelList = (value: unknown) =>
  Array.isArray(value)
    ? Array.from(new Set(value.map((item) => String(item).trim()).filter(Boolean)))
    : [];

const normalizeProvider = (input: CoworkProvider): CoworkProvider => {
  const id = normalizeId(input.id);
  if (!id) {
    throw new ApiError(400, "invalid_provider", "Provider id is required");
  }
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  if (!baseUrl) {
    throw new ApiError(400, "invalid_provider", "Provider baseUrl is required");
  }
  const name = input.name?.trim() || id;
  return {
    id,
    name,
    kind: "openai_compatible",
    baseUrl,
    modelCatalog: normalizeModelList(input.modelCatalog),
    defaultModels: input.defaultModels
      ? {
          chat: input.defaultModels.chat?.trim() || undefined,
          vision: input.defaultModels.vision?.trim() || undefined,
          image: input.defaultModels.image?.trim() || undefined,
        }
      : undefined,
  };
};

const normalizeDefaults = (defaults?: CoworkProviderDefaults): CoworkProviderDefaults | undefined => {
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
};

export async function readCoworkProviderRegistry(): Promise<CoworkProviderRegistry> {
  const data = await readJsonFile<CoworkProviderRegistry>(registryPath());
  if (!data) return { ...DEFAULT_REGISTRY };
  const providers = Array.isArray(data.providers) ? data.providers.map(normalizeProvider) : [];
  const defaults = normalizeDefaults(data.defaults);
  return {
    version: typeof data.version === "number" ? data.version : DEFAULT_REGISTRY.version,
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : undefined,
    providers,
    defaults,
  };
}

export async function writeCoworkProviderRegistry(next: CoworkProviderRegistry): Promise<CoworkProviderRegistry> {
  const normalized: CoworkProviderRegistry = {
    version: typeof next.version === "number" ? next.version : DEFAULT_REGISTRY.version,
    updatedAt: Date.now(),
    providers: Array.isArray(next.providers) ? next.providers.map(normalizeProvider) : [],
    defaults: normalizeDefaults(next.defaults),
  };
  await ensureDir(configDir());
  await writeFile(registryPath(), JSON.stringify(normalized, null, 2) + "\n", "utf8");
  return normalized;
}

export async function upsertCoworkProvider(provider: CoworkProvider): Promise<CoworkProviderRegistry> {
  const registry = await readCoworkProviderRegistry();
  const normalized = normalizeProvider(provider);
  const providers = registry.providers.filter((item) => item.id !== normalized.id);
  providers.push(normalized);
  providers.sort((a, b) => a.name.localeCompare(b.name));
  return writeCoworkProviderRegistry({ ...registry, providers });
}

export async function removeCoworkProvider(id: string): Promise<CoworkProviderRegistry> {
  const registry = await readCoworkProviderRegistry();
  const trimmed = normalizeId(id);
  const providers = registry.providers.filter((item) => item.id !== trimmed);
  const defaults = normalizeDefaults(registry.defaults);
  const clearIfMatches = (value?: { providerId: string; modelId: string }) =>
    value && value.providerId === trimmed ? undefined : value;
  const nextDefaults = defaults
    ? {
        chat: clearIfMatches(defaults.chat),
        vision: clearIfMatches(defaults.vision),
        image: clearIfMatches(defaults.image),
      }
    : undefined;
  return writeCoworkProviderRegistry({ ...registry, providers, defaults: nextDefaults });
}

export async function readCoworkProviderSecrets(): Promise<CoworkProviderSecrets> {
  const data = await readJsonFile<CoworkProviderSecrets>(secretsPath());
  if (!data) return { ...DEFAULT_SECRETS };
  const secrets = typeof data.secrets === "object" && data.secrets ? data.secrets : {};
  return {
    version: typeof data.version === "number" ? data.version : DEFAULT_SECRETS.version,
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : undefined,
    secrets: Object.fromEntries(
      Object.entries(secrets)
        .map(([key, value]) => {
          const apiKey = typeof (value as { apiKey?: string }).apiKey === "string"
            ? (value as { apiKey?: string }).apiKey.trim()
            : "";
          return apiKey ? [key, { apiKey }] : null;
        })
        .filter(Boolean) as Array<[string, { apiKey: string }]>,
    ),
  };
}

export async function writeCoworkProviderSecrets(next: CoworkProviderSecrets): Promise<CoworkProviderSecrets> {
  const normalized: CoworkProviderSecrets = {
    version: typeof next.version === "number" ? next.version : DEFAULT_SECRETS.version,
    updatedAt: Date.now(),
    secrets: typeof next.secrets === "object" && next.secrets ? next.secrets : {},
  };
  await ensureDir(configDir());
  await writeFile(secretsPath(), JSON.stringify(normalized, null, 2) + "\n", "utf8");
  await chmod(secretsPath(), 0o600).catch(() => undefined);
  return normalized;
}

export async function setCoworkProviderSecret(providerId: string, apiKey: string): Promise<CoworkProviderSecrets> {
  const trimmedId = normalizeId(providerId);
  const trimmedKey = apiKey.trim();
  if (!trimmedId || !trimmedKey) {
    throw new ApiError(400, "invalid_secret", "Provider id and apiKey are required");
  }
  const secrets = await readCoworkProviderSecrets();
  return writeCoworkProviderSecrets({
    ...secrets,
    secrets: {
      ...secrets.secrets,
      [trimmedId]: { apiKey: trimmedKey },
    },
  });
}

export async function removeCoworkProviderSecret(providerId: string): Promise<CoworkProviderSecrets> {
  const trimmedId = normalizeId(providerId);
  const secrets = await readCoworkProviderSecrets();
  if (!secrets.secrets[trimmedId]) return secrets;
  const nextSecrets = { ...secrets.secrets };
  delete nextSecrets[trimmedId];
  return writeCoworkProviderSecrets({ ...secrets, secrets: nextSecrets });
}

export async function readCoworkProviderSecretValue(providerId: string): Promise<string | null> {
  const secrets = await readCoworkProviderSecrets();
  const value = secrets.secrets[providerId]?.apiKey?.trim();
  return value || null;
}

export function resolveCoworkConfigDir(): string {
  return configDir();
}
