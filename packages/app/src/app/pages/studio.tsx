import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { ImagePlus, MessageCircle, Paperclip, Sparkles, Trash2 } from "lucide-solid";
import type { CoworkProvider, CoworkProviderDefaults } from "../lib/openwork-server";
import type { OpenAICompatibleMessage } from "../lib/openai-compatible";
import {
  generateImage,
  generateImageViaOpenwork,
  streamChatCompletion,
  streamChatCompletionViaOpenwork,
} from "../lib/openai-compatible";
import Button from "../components/button";
import { currentLocale, t } from "../../i18n";

type StudioViewProps = {
  providers: CoworkProvider[];
  defaults: CoworkProviderDefaults;
  secrets: Record<string, string>;
  providerSource: "server" | "local";
  proxy: {
    enabled: boolean;
    baseUrl: string;
    token?: string;
    hostToken?: string;
  };
};

type StudioAttachment = {
  id: string;
  name: string;
  mime: string;
  dataUrl: string;
};

type StudioMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  attachments?: StudioAttachment[];
};

type ImageResult = {
  id: string;
  url: string;
  prompt: string;
  model?: string;
  createdAt: number;
};

const workflowTemplateKeys = [
  "studio.template.react_storybook",
  "studio.template.tailwind_from_design",
  "studio.template.fix_ts",
  "studio.template.extract_hooks",
  "studio.template.performance_audit",
];

const randomId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read attachment"));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  });

const buildUserContent = (text: string, attachments: StudioAttachment[]): OpenAICompatibleMessage["content"] => {
  if (!attachments.length) return text;
  const parts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
  if (text.trim()) {
    parts.push({ type: "text", text: text.trim() });
  }
  for (const attachment of attachments) {
    parts.push({ type: "image_url", image_url: { url: attachment.dataUrl } });
  }
  return parts;
};

export default function StudioView(props: StudioViewProps) {
  const translate = (key: string) => t(key, currentLocale());
  const workflowTemplates = createMemo(() => workflowTemplateKeys.map((key) => translate(key)));
  const [messages, setMessages] = createSignal<StudioMessage[]>([]);
  const [prompt, setPrompt] = createSignal("");
  const [attachments, setAttachments] = createSignal<StudioAttachment[]>([]);
  const [chatBusy, setChatBusy] = createSignal(false);
  const [chatError, setChatError] = createSignal<string | null>(null);
  const [showReasoning, setShowReasoning] = createSignal(false);

  const [chatProvider, setChatProvider] = createSignal("");
  const [chatModel, setChatModel] = createSignal("");
  const [imageProvider, setImageProvider] = createSignal("");
  const [imageModel, setImageModel] = createSignal("");

  const [imagePrompt, setImagePrompt] = createSignal("");
  const [imageSize, setImageSize] = createSignal("1024x1024");
  const [imageBusy, setImageBusy] = createSignal(false);
  const [imageError, setImageError] = createSignal<string | null>(null);
  const [images, setImages] = createSignal<ImageResult[]>([]);

  const providersMap = createMemo(() => new Map(props.providers.map((provider) => [provider.id, provider])));
  const proxyEnabled = createMemo(() => props.proxy?.enabled && Boolean(props.proxy.baseUrl));

  const isCorsError = (error: unknown) => {
    if (error instanceof TypeError) return true;
    if (error instanceof Error) {
      return /Failed to fetch|CORS|NetworkError/i.test(error.message);
    }
    return false;
  };

  const normalizeProviderError = (error: unknown) => {
    const message = error instanceof Error ? error.message.trim() : "";
    if (!message) return "";
    let normalized = message.replace(/\s+/g, " ");
    if (normalized.startsWith("{") && normalized.endsWith("}")) {
      try {
        const payload = JSON.parse(normalized) as { code?: string; message?: string };
        const code = typeof payload.code === "string" ? payload.code : "";
        const detail = typeof payload.message === "string" ? payload.message : "";
        if (code && detail) {
          normalized = `${code}:${detail}`;
        } else if (detail) {
          normalized = detail;
        }
      } catch {
        // keep original text when payload is not valid json
      }
    }
    if (normalized.startsWith("provider_image_failed:")) {
      const detail = normalized.slice("provider_image_failed:".length).trim().toLowerCase();
      if (detail === "not found" || detail.includes("model")) {
        return translate("studio.error_image_model_unsupported");
      }
      return translate("studio.error_provider_image_failed").replace("{detail}", detail || "unknown");
    }
    if (normalized.startsWith("provider_auth_failed:")) {
      return translate("studio.error_provider_auth_failed");
    }
    return normalized;
  };

  const resolvedChatProvider = createMemo(() => {
    const fallback = props.providers[0]?.id ?? "";
    return chatProvider() || props.defaults.chat?.providerId || fallback;
  });

  const resolvedChatModel = createMemo(() => {
    const providerId = resolvedChatProvider();
    const provider = providersMap().get(providerId);
    return (
      chatModel() ||
      props.defaults.chat?.modelId ||
      provider?.defaultModels?.chat ||
      provider?.modelCatalog?.[0] ||
      ""
    );
  });

  const resolvedImageProvider = createMemo(() => {
    const fallback = props.providers[0]?.id ?? "";
    return imageProvider() || props.defaults.image?.providerId || fallback;
  });

  const resolvedImageModel = createMemo(() => {
    const providerId = resolvedImageProvider();
    const provider = providersMap().get(providerId);
    return (
      imageModel() ||
      props.defaults.image?.modelId ||
      provider?.defaultModels?.image ||
      provider?.modelCatalog?.[0] ||
      ""
    );
  });

  createEffect(() => {
    if (!chatProvider() && resolvedChatProvider()) setChatProvider(resolvedChatProvider());
    if (!chatModel() && resolvedChatModel()) setChatModel(resolvedChatModel());
    if (!imageProvider() && resolvedImageProvider()) setImageProvider(resolvedImageProvider());
    if (!imageModel() && resolvedImageModel()) setImageModel(resolvedImageModel());
  });

  const chatProviderData = createMemo(() => providersMap().get(resolvedChatProvider()));
  const imageProviderData = createMemo(() => providersMap().get(resolvedImageProvider()));

  const chatApiKey = createMemo(() => props.secrets[resolvedChatProvider()] ?? "");
  const imageApiKey = createMemo(() => props.secrets[resolvedImageProvider()] ?? "");

  const handleFileSelect = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (!files.length) return;
    const newAttachments: StudioAttachment[] = [];
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const dataUrl = await fileToDataUrl(file);
        if (!dataUrl) continue;
        newAttachments.push({
          id: randomId(),
          name: file.name,
          mime: file.type,
          dataUrl,
        });
      } catch {
        // ignore
      }
    }
    if (newAttachments.length) {
      setAttachments((current) => [...current, ...newAttachments]);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((current) => current.filter((item) => item.id !== id));
  };

  const handlePromptKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter") return;
    if (event.isComposing) return;
    if (event.shiftKey) return;
    event.preventDefault();
    if (chatBusy()) return;
    void sendMessage();
  };

  const sendMessage = async () => {
    if (chatBusy()) return;
    const text = prompt().trim();
    if (!text && attachments().length === 0) return;
    const provider = chatProviderData();
    if (!provider?.baseUrl) {
      setChatError(translate("studio.error_pick_provider"));
      return;
    }
    if (!chatApiKey() && !proxyEnabled()) {
      setChatError(translate("studio.error_missing_key"));
      return;
    }
    const model = resolvedChatModel();
    if (!model) {
      setChatError(translate("studio.error_pick_model"));
      return;
    }

    setChatError(null);
    setChatBusy(true);

    const previousMessages = messages();
    const userMessage: StudioMessage = {
      id: randomId(),
      role: "user",
      content: text,
      attachments: attachments(),
    };
    const assistantId = randomId();
    setMessages([
      ...previousMessages,
      userMessage,
      { id: assistantId, role: "assistant", content: "", reasoning: "" },
    ]);
    setPrompt("");
    setAttachments([]);

    try {
      const apiMessages: OpenAICompatibleMessage[] = previousMessages.map((message) => {
        if (message.role === "assistant") {
          return { role: "assistant", content: message.content };
        }
        return {
          role: "user",
          content: buildUserContent(message.content, message.attachments ?? []),
        };
      });
      apiMessages.push({
        role: "user",
        content: buildUserContent(userMessage.content, userMessage.attachments ?? []),
      });

      if (proxyEnabled()) {
        await streamChatCompletionViaOpenwork({
          proxyUrl: props.proxy.baseUrl,
          token: props.proxy.token,
          hostToken: props.proxy.hostToken,
          providerId: resolvedChatProvider(),
          baseUrl: provider.baseUrl,
          apiKey: chatApiKey(),
          model,
          messages: apiMessages,
          onDelta: (delta) => {
            setMessages((current) =>
              current.map((message) => {
                if (message.id !== assistantId) return message;
                return {
                  ...message,
                  content: message.content + (delta.content ?? ""),
                  reasoning: (message.reasoning ?? "") + (delta.reasoning ?? ""),
                };
              }),
            );
          },
        });
      } else {
        await streamChatCompletion({
          baseUrl: provider.baseUrl,
          apiKey: chatApiKey(),
          model,
          messages: apiMessages,
          onDelta: (delta) => {
            setMessages((current) =>
              current.map((message) => {
                if (message.id !== assistantId) return message;
                return {
                  ...message,
                  content: message.content + (delta.content ?? ""),
                  reasoning: (message.reasoning ?? "") + (delta.reasoning ?? ""),
                };
              }),
            );
          },
        });
      }

      // Some providers may finish the stream without returning any visible token.
      // Keep the bubble informative instead of leaving an indefinite ellipsis.
      setMessages((current) =>
        current.map((message) => {
          if (message.id !== assistantId) return message;
          const hasContent = Boolean(message.content.trim());
          const hasReasoning = Boolean((message.reasoning ?? "").trim());
          if (hasContent || hasReasoning) return message;
          return { ...message, content: translate("studio.empty_response") };
        }),
      );
    } catch (error) {
      if (!proxyEnabled() && isCorsError(error)) {
        setChatError(translate("studio.cors_error"));
      } else {
        const mapped = normalizeProviderError(error);
        setChatError(mapped || translate("studio.error_chat_failed"));
      }
    } finally {
      setChatBusy(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setPrompt("");
    setAttachments([]);
    setChatError(null);
  };

  const handleGenerateImage = async () => {
    if (imageBusy()) return;
    const provider = imageProviderData();
    const key = imageApiKey();
    const promptText = imagePrompt().trim();
    if (!provider?.baseUrl) {
      setImageError(translate("studio.error_pick_image_provider"));
      return;
    }
    if (!key && !proxyEnabled()) {
      setImageError(translate("studio.error_missing_key"));
      return;
    }
    if (!promptText) return;
    setImageBusy(true);
    setImageError(null);
    try {
      const results = proxyEnabled()
        ? await generateImageViaOpenwork({
            proxyUrl: props.proxy.baseUrl,
            token: props.proxy.token,
            hostToken: props.proxy.hostToken,
            providerId: resolvedImageProvider(),
            baseUrl: provider.baseUrl,
            apiKey: key,
            model: resolvedImageModel() || undefined,
            prompt: promptText,
            size: imageSize(),
          })
        : await generateImage({
            baseUrl: provider.baseUrl,
            apiKey: key,
            model: resolvedImageModel() || undefined,
            prompt: promptText,
            size: imageSize(),
          });
      const next = results.map((url) => ({
        id: randomId(),
        url,
        prompt: promptText,
        model: resolvedImageModel() || undefined,
        createdAt: Date.now(),
      }));
      setImages((current) => [...next, ...current]);
    } catch (error) {
      if (!proxyEnabled() && isCorsError(error)) {
        setImageError(translate("studio.cors_error"));
      } else {
        const mapped = normalizeProviderError(error);
        setImageError(mapped || translate("studio.error_image_failed"));
      }
    } finally {
      setImageBusy(false);
    }
  };

  const insertImageToChat = (url: string) => {
    setAttachments((current) => [
      ...current,
      { id: randomId(), name: "generated.png", mime: "image/png", dataUrl: url },
    ]);
  };

  return (
    <div class="space-y-8">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <div class="text-sm font-medium text-gray-12 flex items-center gap-2">
                <MessageCircle size={16} />
                {translate("studio.direct_title")}
              </div>
              <div class="text-xs text-gray-9">{translate("studio.direct_subtitle")}</div>
            </div>
            <Button variant="outline" class="text-xs h-8 px-3" onClick={clearChat}>
              {translate("studio.clear")}
            </Button>
          </div>
          <Show when={!props.providers.length}>
            <div class="text-xs text-amber-11">{translate("studio.no_providers")}</div>
          </Show>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <select
              class="w-full rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-xs"
              value={resolvedChatProvider()}
              onChange={(event) => {
                setChatProvider(event.currentTarget.value);
                setChatModel("");
              }}
            >
              <For each={props.providers}>
                {(provider) => <option value={provider.id}>{provider.name}</option>}
              </For>
            </select>
            <select
              class="w-full rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-xs"
              value={resolvedChatModel()}
              onChange={(event) => setChatModel(event.currentTarget.value)}
            >
              <For each={chatProviderData()?.modelCatalog ?? []}>
                {(model) => <option value={model}>{model}</option>}
              </For>
            </select>
          </div>

          <div class="space-y-3">
            <div class="space-y-3 max-h-[320px] overflow-auto pr-2">
              <Show when={messages().length === 0}>
                <div class="text-xs text-gray-9">{translate("studio.quick_start")}</div>
              </Show>
              <For each={messages()}>
                {(message) => (
                  <div class={`rounded-xl px-3 py-2 text-sm ${message.role === "user" ? "bg-gray-1" : "bg-gray-1/60"}`}>
                    <div class="text-[10px] uppercase tracking-wide text-gray-9">
                      {message.role === "user"
                        ? translate("studio.role_user")
                        : translate("studio.role_assistant")}
                    </div>
                    <div class="text-sm whitespace-pre-wrap text-gray-12">{message.content || "…"}</div>
                    <Show when={showReasoning() && message.reasoning}>
                      <div class="mt-2 rounded-lg bg-gray-2/50 border border-gray-6/50 px-2 py-1 text-xs text-gray-10 whitespace-pre-wrap">
                        {message.reasoning}
                      </div>
                    </Show>
                    <Show when={message.attachments?.length}>
                      <div class="mt-2 flex flex-wrap gap-2">
                        <For each={message.attachments}>
                          {(attachment) => (
                            <img
                              src={attachment.dataUrl}
                              alt={attachment.name}
                              class="h-16 w-16 rounded-lg border border-gray-6 object-cover"
                            />
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                )}
              </For>
            </div>

            <Show when={chatError()}>
              <div class="text-xs text-red-11">{chatError()}</div>
            </Show>

            <div class="flex items-center gap-2 text-xs text-gray-9">
              <button
                type="button"
                class="flex items-center gap-1 text-gray-9 hover:text-gray-12"
                onClick={() => setShowReasoning((value) => !value)}
              >
                <Sparkles size={12} />
                {showReasoning()
                  ? translate("studio.thinking_hide")
                  : translate("studio.thinking_show")}
              </button>
              <span class="text-[11px] text-gray-8">
                {translate("studio.provider_storage")}{" "}
                {props.providerSource === "server"
                  ? translate("studio.storage_host")
                  : translate("studio.storage_browser")}
              </span>
            </div>

            <div class="space-y-2">
              <textarea
                class="w-full rounded-lg bg-dls-surface px-3 py-2 text-sm text-dls-text border border-dls-border min-h-[80px]"
                value={prompt()}
                onInput={(event) => setPrompt(event.currentTarget.value)}
                onKeyDown={handlePromptKeyDown}
                placeholder={translate("studio.prompt_placeholder")}
              />
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <label class="flex items-center gap-1 text-xs text-gray-9 cursor-pointer">
                    <Paperclip size={14} />
                    {translate("studio.add_image")}
                    <input type="file" accept="image/*" class="hidden" onChange={handleFileSelect} />
                  </label>
                  <Show when={attachments().length}>
                    <span class="text-[11px] text-gray-9">
                      {translate("studio.attachments_count").replace(
                        "{count}",
                        String(attachments().length),
                      )}
                    </span>
                  </Show>
                </div>
                <Button variant="secondary" class="text-xs h-8 px-3" onClick={sendMessage} disabled={chatBusy()}>
                  {chatBusy() ? translate("studio.sending") : translate("studio.send")}
                </Button>
              </div>
              <Show when={attachments().length}>
                <div class="flex flex-wrap gap-2">
                  <For each={attachments()}>
                    {(attachment) => (
                      <div class="relative">
                        <img
                          src={attachment.dataUrl}
                          alt={attachment.name}
                          class="h-16 w-16 rounded-lg border border-gray-6 object-cover"
                        />
                        <button
                          type="button"
                          class="absolute -top-2 -right-2 bg-gray-12 text-white rounded-full p-1"
                          onClick={() => removeAttachment(attachment.id)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        </div>

        <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <div class="text-sm font-medium text-gray-12 flex items-center gap-2">
                <ImagePlus size={16} />
                {translate("studio.image_title")}
              </div>
              <div class="text-xs text-gray-9">{translate("studio.image_subtitle")}</div>
            </div>
          </div>
          <Show when={!props.providers.length}>
            <div class="text-xs text-amber-11">{translate("studio.no_image_providers")}</div>
          </Show>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <select
              class="w-full rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-xs"
              value={resolvedImageProvider()}
              onChange={(event) => {
                setImageProvider(event.currentTarget.value);
                setImageModel("");
              }}
            >
              <For each={props.providers}>
                {(provider) => <option value={provider.id}>{provider.name}</option>}
              </For>
            </select>
            <select
              class="w-full rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-xs"
              value={resolvedImageModel()}
              onChange={(event) => setImageModel(event.currentTarget.value)}
            >
              <For each={imageProviderData()?.modelCatalog ?? []}>
                {(model) => <option value={model}>{model}</option>}
              </For>
            </select>
          </div>

          <textarea
            class="w-full rounded-lg bg-dls-surface px-3 py-2 text-sm text-dls-text border border-dls-border min-h-[80px]"
            value={imagePrompt()}
            onInput={(event) => setImagePrompt(event.currentTarget.value)}
            placeholder={translate("studio.image_prompt_placeholder")}
          />
          <div class="flex items-center justify-between gap-2">
            <select
              class="rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-xs"
              value={imageSize()}
              onChange={(event) => setImageSize(event.currentTarget.value)}
            >
              <option value="512x512">512x512</option>
              <option value="768x768">768x768</option>
              <option value="1024x1024">1024x1024</option>
            </select>
            <Button variant="secondary" class="text-xs h-8 px-3" onClick={handleGenerateImage} disabled={imageBusy()}>
              {imageBusy() ? translate("studio.generating") : translate("studio.generate")}
            </Button>
          </div>
          <Show when={imageError()}>
            <div class="text-xs text-red-11">{imageError()}</div>
          </Show>
          <div class="space-y-3">
            <Show when={!images().length}>
              <div class="text-xs text-gray-9">{translate("studio.image_empty")}</div>
            </Show>
            <For each={images()}>
              {(image) => (
                <div class="rounded-xl border border-gray-6/50 bg-gray-1 p-3 space-y-2">
                  <img src={image.url} alt={image.prompt} class="w-full rounded-lg border border-gray-6 object-cover" />
                  <div class="text-xs text-gray-9">{image.prompt}</div>
                  <div class="flex items-center gap-2">
                    <Button
                      variant="outline"
                      class="text-xs h-7 px-3"
                      onClick={() => insertImageToChat(image.url)}
                    >
                      {translate("studio.insert_into_chat")}
                    </Button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>

      <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
        <div class="text-sm font-medium text-gray-12">{translate("studio.templates_title")}</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <For each={workflowTemplates()}>
            {(template) => (
              <button
                type="button"
                class="text-left rounded-xl border border-gray-6 bg-gray-1 px-4 py-3 text-sm text-gray-12 hover:border-gray-7 hover:bg-gray-2"
                onClick={() => setPrompt(template)}
              >
                {template}
              </button>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
