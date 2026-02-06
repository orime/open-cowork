import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { Check, Copy, Edit2, Eye, EyeOff, RefreshCw, Trash2 } from "lucide-solid";

import Button from "./button";
import TextInput from "./text-input";
import type { CoworkProvider, CoworkProviderDefaults } from "../lib/openwork-server";
import { testOpenAICompatible } from "../lib/openai-compatible";
import { currentLocale, t } from "../../i18n";

type CoworkProvidersSettingsProps = {
  providers: CoworkProvider[];
  defaults: CoworkProviderDefaults;
  secrets: Record<string, string>;
  source: "server" | "local";
  status: "idle" | "loading" | "error";
  error: string | null;
  onRefresh: (source?: "server" | "local") => void | Promise<void>;
  onSaveProvider: (provider: CoworkProvider) => void | Promise<void>;
  onDeleteProvider: (providerId: string) => void | Promise<void>;
  onSetDefaults: (defaults: CoworkProviderDefaults | undefined) => void | Promise<void>;
  onSetSecret: (providerId: string, apiKey: string) => void | Promise<void>;
  onClearSecret: (providerId: string) => void | Promise<void>;
  buildSnippet: (includeKeys?: boolean) => string;
  onTestProvider?: (input: {
    providerId?: string;
    baseUrl: string;
    apiKey: string;
  }) => Promise<string>;
};

type ProviderDraft = {
  id: string;
  name: string;
  baseUrl: string;
  models: string;
  defaultChat?: string;
  defaultVision?: string;
  defaultImage?: string;
};

const emptyDraft = (): ProviderDraft => ({
  id: "",
  name: "",
  baseUrl: "",
  models: "",
  defaultChat: "",
  defaultVision: "",
  defaultImage: "",
});

const parseModels = (value: string) =>
  value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

const formatModels = (models: string[]) => models.join("\n");

export default function CoworkProvidersSettings(props: CoworkProvidersSettingsProps) {
  const translate = (key: string) => t(key, currentLocale());
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [draft, setDraft] = createSignal<ProviderDraft>(emptyDraft());
  const [apiKeyInput, setApiKeyInput] = createSignal("");
  const [apiKeyVisible, setApiKeyVisible] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [saveMessage, setSaveMessage] = createSignal<string | null>(null);
  const [saveState, setSaveState] = createSignal<"idle" | "success" | "error">("idle");
  const [testing, setTesting] = createSignal(false);
  const [testMessage, setTestMessage] = createSignal<string | null>(null);
  const [testState, setTestState] = createSignal<"idle" | "success" | "error">("idle");
  const [snippetOpen, setSnippetOpen] = createSignal(false);
  const [snippetIncludeKeys, setSnippetIncludeKeys] = createSignal(false);
  const [copiedSnippet, setCopiedSnippet] = createSignal(false);
  const [defaultsBusy, setDefaultsBusy] = createSignal(false);
  const [deleteBusy, setDeleteBusy] = createSignal<string | null>(null);

  const providersSorted = createMemo(() => [...props.providers].sort((a, b) => a.name.localeCompare(b.name)));

  const modelOptions = (providerId: string) => {
    const provider = props.providers.find((item) => item.id === providerId);
    return provider?.modelCatalog ?? [];
  };

  const inferProviderIdForModel = (modelId: string) => {
    const trimmed = modelId.trim();
    if (!trimmed) return "";
    const matches = props.providers
      .filter((provider) => (provider.modelCatalog ?? []).includes(trimmed))
      .map((provider) => provider.id);
    return matches.length === 1 ? matches[0] : "";
  };

  const resetDraft = () => {
    setEditingId(null);
    setDraft(emptyDraft());
    setApiKeyInput("");
    setApiKeyVisible(false);
    setTestMessage(null);
    setTestState("idle");
    setSaveMessage(null);
    setSaveState("idle");
  };

  const loadDraft = (provider: CoworkProvider) => {
    setEditingId(provider.id);
    setDraft({
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      models: formatModels(provider.modelCatalog ?? []),
      defaultChat: provider.defaultModels?.chat ?? "",
      defaultVision: provider.defaultModels?.vision ?? "",
      defaultImage: provider.defaultModels?.image ?? "",
    });
    setApiKeyInput("");
    setApiKeyVisible(false);
    setTestMessage(null);
    setTestState("idle");
    setSaveMessage(null);
    setSaveState("idle");
  };

  const currentApiKey = createMemo(() => {
    const input = apiKeyInput().trim();
    if (input) return input;
    const id = editingId();
    if (!id) return "";
    return props.secrets[id] ?? "";
  });

  const saveProvider = async () => {
    if (saving()) return;
    const providerDraft = draft();
    const id = providerDraft.id.trim();
    const baseUrl = providerDraft.baseUrl.trim();
    const models = parseModels(providerDraft.models);
    if (!id) {
      setSaveState("error");
      setSaveMessage(translate("cowork.providers.id_required"));
      return;
    }
    if (!baseUrl) {
      setSaveState("error");
      setSaveMessage(translate("cowork.providers.base_url_required"));
      return;
    }
    if (!models.length) {
      setSaveState("error");
      setSaveMessage(translate("cowork.providers.models_required"));
      return;
    }
    setSaving(true);
    setTestState("idle");
    setTestMessage(null);
    setSaveState("idle");
    setSaveMessage(null);
    try {
      await props.onSaveProvider({
        id,
        name: providerDraft.name.trim() || id,
        kind: "openai_compatible",
        baseUrl,
        modelCatalog: models,
        defaultModels: {
          chat: providerDraft.defaultChat?.trim() || undefined,
          vision: providerDraft.defaultVision?.trim() || undefined,
          image: providerDraft.defaultImage?.trim() || undefined,
        },
      });
      const key = apiKeyInput().trim();
      if (key) {
        await props.onSetSecret(id, key);
        setApiKeyInput("");
      }
      resetDraft();
      setSaveState("success");
      setSaveMessage(translate("cowork.providers.saved"));
    } catch (error) {
      setSaveState("error");
      setSaveMessage(error instanceof Error ? error.message : translate("cowork.providers.save_failed"));
    } finally {
      setSaving(false);
    }
  };

  const deleteProvider = async (providerId: string) => {
    if (deleteBusy()) return;
    setDeleteBusy(providerId);
    try {
      await props.onDeleteProvider(providerId);
      if (editingId() === providerId) {
        resetDraft();
      }
    } finally {
      setDeleteBusy(null);
    }
  };

  const runTest = async () => {
    if (testing()) return;
    const providerDraft = draft();
    const key = currentApiKey();
    if (!providerDraft.baseUrl.trim() || !key) {
      setTestState("error");
      setTestMessage(translate("cowork.providers.test_requires_key"));
      return;
    }
    setTesting(true);
    setTestState("idle");
    setTestMessage(null);
    setSaveState("idle");
    setSaveMessage(null);
    try {
      const message = props.onTestProvider
        ? await props.onTestProvider({
            providerId: providerDraft.id.trim() || undefined,
            baseUrl: providerDraft.baseUrl.trim(),
            apiKey: key,
          })
        : await testOpenAICompatible(providerDraft.baseUrl.trim(), key);
      setTestState("success");
      setTestMessage(message);
    } catch (error) {
      setTestState("error");
      setTestMessage(error instanceof Error ? error.message : translate("cowork.providers.connection_failed"));
    } finally {
      setTesting(false);
    }
  };

  const openSnippet = () => {
    setSnippetOpen(true);
    setSnippetIncludeKeys(false);
    setCopiedSnippet(false);
  };

  const snippetValue = createMemo(() => props.buildSnippet(snippetIncludeKeys()));

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(snippetValue());
      setCopiedSnippet(true);
      window.setTimeout(() => setCopiedSnippet(false), 1500);
    } catch {
      setCopiedSnippet(false);
    }
  };

  const [chatProvider, setChatProvider] = createSignal("");
  const [chatModel, setChatModel] = createSignal("");
  const [visionProvider, setVisionProvider] = createSignal("");
  const [visionModel, setVisionModel] = createSignal("");
  const [imageProvider, setImageProvider] = createSignal("");
  const [imageModel, setImageModel] = createSignal("");
  const [defaultsSignature, setDefaultsSignature] = createSignal("");

  const normalizeDefaultRef = (value?: { providerId: string; modelId: string }) => {
    if (!value) return undefined;
    const modelId = value.modelId?.trim() ?? "";
    if (!modelId) return undefined;
    const providerId = value.providerId?.trim() ?? "";
    if (providerId) return { providerId, modelId };
    const inferred = inferProviderIdForModel(modelId);
    return inferred ? { providerId: inferred, modelId } : undefined;
  };

  createEffect(() => {
    const defaults = props.defaults ?? {};
    const signature = JSON.stringify(defaults);
    if (signature === defaultsSignature()) return;
    setDefaultsSignature(signature);
    const chatRef = normalizeDefaultRef(defaults.chat);
    const visionRef = normalizeDefaultRef(defaults.vision);
    const imageRef = normalizeDefaultRef(defaults.image);
    setChatProvider(chatRef?.providerId ?? "");
    setChatModel(chatRef?.modelId ?? "");
    setVisionProvider(visionRef?.providerId ?? "");
    setVisionModel(visionRef?.modelId ?? "");
    setImageProvider(imageRef?.providerId ?? "");
    setImageModel(imageRef?.modelId ?? "");
  });

  const applyDefaults = async () => {
    if (defaultsBusy()) return;
    setDefaultsBusy(true);
    try {
      const resolveRef = (providerId: string, modelId: string) => {
        const normalizedModel = modelId.trim();
        if (!normalizedModel) return undefined;
        const normalizedProvider = providerId.trim() || inferProviderIdForModel(normalizedModel);
        if (!normalizedProvider) return undefined;
        return { providerId: normalizedProvider, modelId: normalizedModel };
      };
      await props.onSetDefaults({
        chat: resolveRef(chatProvider(), chatModel()),
        vision: resolveRef(visionProvider(), visionModel()),
        image: resolveRef(imageProvider(), imageModel()),
      });
    } finally {
      setDefaultsBusy(false);
    }
  };

  return (
    <div class="space-y-6">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div class="text-sm font-medium text-gray-12">{translate("cowork.providers.title")}</div>
          <div class="text-xs text-gray-10">
            {translate("cowork.providers.subtitle")}
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" class="text-xs h-8 px-3" onClick={() => props.onRefresh()}>
            <RefreshCw size={14} />
            {translate("cowork.providers.refresh")}
          </Button>
          <Button variant="secondary" class="text-xs h-8 px-3" onClick={openSnippet}>
            <Copy size={14} />
            {translate("cowork.providers.snippet")}
          </Button>
        </div>
      </div>

      <div class="text-xs text-gray-9">
        {translate("cowork.providers.storage_label")}{" "}
        {props.source === "server"
          ? translate("cowork.providers.storage_server")
          : translate("cowork.providers.storage_local")}
      </div>

      <Show when={props.status === "loading"}>
        <div class="text-xs text-gray-9">{translate("cowork.providers.loading")}</div>
      </Show>
      <Show when={props.error}>
        <div class="rounded-xl border border-red-7/30 bg-red-1/40 px-3 py-2 text-xs text-red-11">
          {props.error}
        </div>
      </Show>

      <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
        <div class="text-sm font-medium text-gray-12">{translate("cowork.providers.defaults_title")}</div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="space-y-2">
            <div class="text-xs text-gray-10">{translate("cowork.providers.chat_model")}</div>
            <select
              class="w-full rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-xs"
              value={chatProvider()}
              onChange={(event) => {
                setChatProvider(event.currentTarget.value);
                setChatModel("");
              }}
            >
              <option value="" selected={chatProvider() === ""}>
                {translate("cowork.providers.select_provider")}
              </option>
              <For each={providersSorted()}>
                {(provider) => (
                  <option value={provider.id} selected={chatProvider() === provider.id}>
                    {provider.name}
                  </option>
                )}
              </For>
            </select>
            <select
              class="w-full rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-xs"
              value={chatModel()}
              onChange={(event) => setChatModel(event.currentTarget.value)}
            >
              <option value="" selected={chatModel() === ""}>
                {translate("cowork.providers.select_model")}
              </option>
              <For each={modelOptions(chatProvider())}>
                {(model) => (
                  <option value={model} selected={chatModel() === model}>
                    {model}
                  </option>
                )}
              </For>
            </select>
          </div>
          <div class="space-y-2">
            <div class="text-xs text-gray-10">{translate("cowork.providers.vision_model")}</div>
            <select
              class="w-full rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-xs"
              value={visionProvider()}
              onChange={(event) => {
                setVisionProvider(event.currentTarget.value);
                setVisionModel("");
              }}
            >
              <option value="" selected={visionProvider() === ""}>
                {translate("cowork.providers.select_provider")}
              </option>
              <For each={providersSorted()}>
                {(provider) => (
                  <option value={provider.id} selected={visionProvider() === provider.id}>
                    {provider.name}
                  </option>
                )}
              </For>
            </select>
            <select
              class="w-full rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-xs"
              value={visionModel()}
              onChange={(event) => setVisionModel(event.currentTarget.value)}
            >
              <option value="" selected={visionModel() === ""}>
                {translate("cowork.providers.select_model")}
              </option>
              <For each={modelOptions(visionProvider())}>
                {(model) => (
                  <option value={model} selected={visionModel() === model}>
                    {model}
                  </option>
                )}
              </For>
            </select>
          </div>
          <div class="space-y-2">
            <div class="text-xs text-gray-10">{translate("cowork.providers.image_model")}</div>
            <select
              class="w-full rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-xs"
              value={imageProvider()}
              onChange={(event) => {
                setImageProvider(event.currentTarget.value);
                setImageModel("");
              }}
            >
              <option value="" selected={imageProvider() === ""}>
                {translate("cowork.providers.select_provider")}
              </option>
              <For each={providersSorted()}>
                {(provider) => (
                  <option value={provider.id} selected={imageProvider() === provider.id}>
                    {provider.name}
                  </option>
                )}
              </For>
            </select>
            <select
              class="w-full rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-xs"
              value={imageModel()}
              onChange={(event) => setImageModel(event.currentTarget.value)}
            >
              <option value="" selected={imageModel() === ""}>
                {translate("cowork.providers.select_model")}
              </option>
              <For each={modelOptions(imageProvider())}>
                {(model) => (
                  <option value={model} selected={imageModel() === model}>
                    {model}
                  </option>
                )}
              </For>
            </select>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="secondary" class="text-xs h-8 px-3" onClick={applyDefaults} disabled={defaultsBusy()}>
            {defaultsBusy() ? translate("cowork.providers.saving") : translate("cowork.providers.save_defaults")}
          </Button>
        </div>
      </div>

      <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
        <div class="flex items-center justify-between">
          <div class="text-sm font-medium text-gray-12">
            {editingId() ? translate("cowork.providers.edit_provider") : translate("cowork.providers.add_provider")}
          </div>
          <Show when={editingId()}>
            <Button variant="outline" class="text-xs h-8 px-3" onClick={resetDraft}>
              {translate("cowork.providers.new_provider")}
            </Button>
          </Show>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TextInput
            label={translate("cowork.providers.provider_id")}
            placeholder="nvidia-integrate"
            value={draft().id}
            onInput={(event) => setDraft((current) => ({ ...current, id: event.currentTarget.value }))}
            disabled={Boolean(editingId())}
          />
          <TextInput
            label={translate("cowork.providers.provider_name")}
            placeholder="NVIDIA Integrate"
            value={draft().name}
            onInput={(event) => setDraft((current) => ({ ...current, name: event.currentTarget.value }))}
          />
          <TextInput
            label={translate("cowork.providers.base_url")}
            placeholder="https://integrate.api.nvidia.com/v1"
            value={draft().baseUrl}
            onInput={(event) => setDraft((current) => ({ ...current, baseUrl: event.currentTarget.value }))}
          />
          <TextInput
            label={translate("cowork.providers.api_key")}
            type={apiKeyVisible() ? "text" : "password"}
            placeholder={currentApiKey() ? "••••••••" : "sk-..."}
            value={apiKeyInput()}
            onInput={(event) => setApiKeyInput(event.currentTarget.value)}
          />
        </div>
        <div class="flex items-center gap-2 text-xs text-gray-10">
          <button
            type="button"
            class="flex items-center gap-1 text-gray-10 hover:text-gray-12"
            onClick={() => setApiKeyVisible((value) => !value)}
          >
            {apiKeyVisible() ? <EyeOff size={14} /> : <Eye size={14} />}
            {apiKeyVisible()
              ? translate("cowork.providers.hide_key")
              : translate("cowork.providers.show_key")}{" "}
            {translate("cowork.providers.api_key")}
          </button>
          <Show when={editingId() && props.secrets[editingId() ?? ""]}>
            <span class="flex items-center gap-1 text-green-11">
              <Check size={12} />
              {translate("cowork.providers.key_saved")}
            </span>
            <button
              type="button"
              class="text-red-11 hover:underline"
              onClick={() => props.onClearSecret(editingId() ?? "")}
            >
              {translate("cowork.providers.clear_key")}
            </button>
          </Show>
        </div>
        <label class="block">
          <div class="mb-1 text-xs font-medium text-dls-secondary">
            {translate("cowork.providers.model_catalog")}
          </div>
          <textarea
            class="w-full rounded-lg bg-dls-surface px-3 py-2 text-sm text-dls-text border border-dls-border min-h-[120px]"
            value={draft().models}
            onInput={(event) => setDraft((current) => ({ ...current, models: event.currentTarget.value }))}
          />
        </label>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <TextInput
            label={translate("cowork.providers.default_chat")}
            value={draft().defaultChat ?? ""}
            onInput={(event) => setDraft((current) => ({ ...current, defaultChat: event.currentTarget.value }))}
          />
          <TextInput
            label={translate("cowork.providers.default_vision")}
            value={draft().defaultVision ?? ""}
            onInput={(event) => setDraft((current) => ({ ...current, defaultVision: event.currentTarget.value }))}
          />
          <TextInput
            label={translate("cowork.providers.default_image")}
            value={draft().defaultImage ?? ""}
            onInput={(event) => setDraft((current) => ({ ...current, defaultImage: event.currentTarget.value }))}
          />
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Button variant="secondary" class="text-xs h-8 px-3" onClick={saveProvider} disabled={saving()}>
            {saving()
              ? translate("cowork.providers.saving")
              : editingId()
                ? translate("cowork.providers.save_provider")
                : translate("cowork.providers.add_provider_action")}
          </Button>
          <Button variant="outline" class="text-xs h-8 px-3" onClick={runTest} disabled={testing()}>
            {testing() ? translate("cowork.providers.testing") : translate("cowork.providers.test_connection")}
          </Button>
          <Show when={testMessage()}>
            <div class={`text-xs ${testState() === "error" ? "text-red-11" : "text-green-11"}`}>
              {testMessage()}
            </div>
          </Show>
          <Show when={saveMessage()}>
            <div class={`text-xs ${saveState() === "error" ? "text-red-11" : "text-green-11"}`}>
              {saveMessage()}
            </div>
          </Show>
        </div>
      </div>

      <div class="space-y-3">
        <div class="text-sm font-medium text-gray-12">{translate("cowork.providers.configured")}</div>
        <Show
          when={providersSorted().length}
          fallback={<div class="text-xs text-gray-9">{translate("cowork.providers.none")}</div>}
        >
          <div class="grid grid-cols-1 gap-3">
            <For each={providersSorted()}>
              {(provider) => (
                <div class="border border-gray-6/40 rounded-2xl p-4 bg-gray-2/30 flex flex-col gap-3">
                  <div class="flex items-start justify-between gap-4">
                    <div class="min-w-0">
                      <div class="text-sm font-medium text-gray-12">{provider.name}</div>
                      <div class="text-xs text-gray-9 font-mono truncate">{provider.baseUrl}</div>
                    </div>
                    <div class="flex items-center gap-2">
                      <Button
                        variant="outline"
                        class="text-xs h-7 px-3"
                        onClick={() => loadDraft(provider)}
                        disabled={saving()}
                      >
                        <Edit2 size={12} />
                        {translate("cowork.providers.edit")}
                      </Button>
                      <Button
                        variant="outline"
                        class="text-xs h-7 px-3 text-red-11"
                        onClick={() => deleteProvider(provider.id)}
                        disabled={deleteBusy() === provider.id}
                      >
                        <Trash2 size={12} />
                        {deleteBusy() === provider.id
                          ? translate("cowork.providers.deleting")
                          : translate("cowork.providers.delete")}
                      </Button>
                    </div>
                  </div>
                  <div class="flex flex-wrap gap-2 text-xs text-gray-9">
                    <span>
                      {translate("cowork.providers.models_count").replace(
                        "{count}",
                        String(provider.modelCatalog?.length ?? 0),
                      )}
                    </span>
                    <Show when={props.secrets[provider.id]}>
                      <span class="text-green-11">{translate("cowork.providers.api_key_saved")}</span>
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>

      <Show when={snippetOpen()}>
        <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
          <div class="flex items-center justify-between">
            <div class="text-sm font-medium text-gray-12">{translate("cowork.providers.snippet_title")}</div>
            <Button variant="outline" class="text-xs h-8 px-3" onClick={() => setSnippetOpen(false)}>
              {translate("cowork.providers.close")}
            </Button>
          </div>
          <label class="flex items-center gap-2 text-xs text-gray-10">
            <input
              type="checkbox"
              checked={snippetIncludeKeys()}
              onChange={(event) => setSnippetIncludeKeys(event.currentTarget.checked)}
            />
            {translate("cowork.providers.snippet_include_keys")}
          </label>
          <textarea
            class="w-full rounded-lg bg-dls-surface px-3 py-2 text-xs text-dls-text border border-dls-border min-h-[180px] font-mono"
            value={snippetValue()}
            readOnly
          />
          <div class="flex items-center gap-2">
            <Button variant="secondary" class="text-xs h-8 px-3" onClick={copySnippet}>
              <Copy size={12} />
              {copiedSnippet()
                ? translate("cowork.providers.copied")
                : translate("cowork.providers.copy")}
            </Button>
          </div>
        </div>
      </Show>
    </div>
  );
}
