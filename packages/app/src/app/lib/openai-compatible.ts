export type OpenAICompatibleMessage = {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
};

export type StreamDelta = {
  content?: string;
  reasoning?: string;
};

type ImageGenerationResponse = {
  data?: Array<{ b64_json?: string; url?: string }>;
  output_images?: string[];
  task_id?: string;
  task_status?: string;
  message?: string;
  error?: string;
};

type ApiErrorPayload = {
  code?: string;
  message?: string;
  error?: string;
  details?: unknown;
};

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");

const resolveApiBase = (baseUrl: string) => {
  const trimmed = normalizeBaseUrl(baseUrl);
  if (trimmed.endsWith("/v1")) return trimmed;
  return `${trimmed}/v1`;
};

const isModelScopeEndpoint = (baseUrl: string) => /modelscope\.cn/i.test(baseUrl);

const buildOpenworkHeaders = (token?: string, hostToken?: string) => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (hostToken) {
    headers["X-OpenWork-Host-Token"] = hostToken;
  }
  return headers;
};

const extractErrorMessage = (text: string, fallback: string) => {
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  try {
    const payload = JSON.parse(trimmed) as ApiErrorPayload;
    const code = typeof payload.code === "string" ? payload.code.trim() : "";
    const message = typeof payload.message === "string"
      ? payload.message.trim()
      : typeof payload.error === "string"
        ? payload.error.trim()
        : "";
    if (code && message) return `${code}:${message}`;
    if (message) return message;
    if (code) return code;
  } catch {
    // fall through to raw text
  }
  return trimmed || fallback;
};

const parseImageResponse = (json: ImageGenerationResponse) => {
  const images = (json.data ?? [])
    .map((item) => {
      if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
      if (item.url) return item.url;
      return null;
    })
    .filter(Boolean) as string[];

  for (const imageUrl of json.output_images ?? []) {
    if (typeof imageUrl === "string" && imageUrl.trim()) {
      images.push(imageUrl);
    }
  }

  if (!images.length) {
    throw new Error("No image data returned");
  }
  return images;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function pollModelScopeTask(options: {
  apiBase: string;
  apiKey: string;
  taskId: string;
  maxAttempts?: number;
  intervalMs?: number;
}) {
  const maxAttempts = options.maxAttempts ?? 40;
  const intervalMs = options.intervalMs ?? 1500;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(`${options.apiBase}/tasks/${encodeURIComponent(options.taskId)}`, {
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "X-ModelScope-Task-Type": "image_generation",
      },
    });
    const text = await response.text().catch(() => "");
    let payload: ImageGenerationResponse = {};
    if (text) {
      try {
        payload = JSON.parse(text) as ImageGenerationResponse;
      } catch {
        payload = {};
      }
    }
    if (!response.ok) {
      throw new Error(extractErrorMessage(text, response.statusText || "Failed to poll image generation task"));
    }
    if (payload.task_status === "SUCCEED") {
      return payload;
    }
    if (payload.task_status === "FAILED") {
      throw new Error(payload.error || payload.message || "Image generation failed");
    }
    if (attempt < maxAttempts - 1) {
      await sleep(intervalMs);
    }
  }

  throw new Error("Image generation timeout");
}

export async function testOpenAICompatible(baseUrl: string, apiKey: string): Promise<string> {
  const apiBase = resolveApiBase(baseUrl);
  const response = await fetch(`${apiBase}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(extractErrorMessage(text, response.statusText || "Connection failed"));
  }
  return "Connected";
}

export async function testOpenAICompatibleViaOpenwork(options: {
  proxyUrl: string;
  token?: string;
  hostToken?: string;
  providerId?: string;
  baseUrl?: string;
  apiKey?: string;
}): Promise<string> {
  const response = await fetch(`${options.proxyUrl.replace(/\/+$/, "")}/providers/test`, {
    method: "POST",
    headers: buildOpenworkHeaders(options.token, options.hostToken),
    body: JSON.stringify({
      providerId: options.providerId,
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
    }),
  });
  const text = await response.text().catch(() => "");
  let json: { message?: string } | null = null;
  if (text) {
    try {
      json = JSON.parse(text) as { message?: string };
    } catch {
      json = null;
    }
  }
  if (!response.ok) {
    const message = json?.message ?? extractErrorMessage(text, response.statusText || "Connection failed");
    throw new Error(message || response.statusText);
  }
  return json?.message ?? "Connected";
}

export async function streamChatCompletion(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: OpenAICompatibleMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  signal?: AbortSignal;
  onDelta: (delta: StreamDelta) => void;
}) {
  const apiBase = resolveApiBase(options.baseUrl);
  const response = await fetch(`${apiBase}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.8,
      top_p: options.top_p ?? 0.9,
      max_tokens: options.max_tokens ?? 1024,
      stream: true,
    }),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(extractErrorMessage(text, response.statusText || "Failed to start stream"));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    if (buffer.includes("\r\n")) {
      buffer = buffer.replace(/\r\n/g, "\n");
    }

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const lines = chunk.split(/\r?\n/);
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.replace(/^data:\s*/, "").trim();
        if (!data) continue;
        if (data === "[DONE]") {
          return;
        }
        try {
          const json = JSON.parse(data) as any;
          const delta = json?.choices?.[0]?.delta ?? {};
          const reasoning = delta?.reasoning_content ?? delta?.reasoning ?? "";
          const content = delta?.content ?? "";
          if (reasoning) {
            options.onDelta({ reasoning });
          }
          if (content) {
            options.onDelta({ content });
          }
        } catch {
          // ignore malformed chunk
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
}

export async function streamChatCompletionViaOpenwork(options: {
  proxyUrl: string;
  token?: string;
  hostToken?: string;
  providerId: string;
  baseUrl?: string;
  apiKey?: string;
  model: string;
  messages: OpenAICompatibleMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  signal?: AbortSignal;
  onDelta: (delta: StreamDelta) => void;
}) {
  const response = await fetch(`${options.proxyUrl.replace(/\/+$/, "")}/cowork/chat`, {
    method: "POST",
    headers: buildOpenworkHeaders(options.token, options.hostToken),
    body: JSON.stringify({
      providerId: options.providerId,
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      model: options.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.8,
      top_p: options.top_p ?? 0.9,
      max_tokens: options.max_tokens ?? 1024,
      stream: true,
    }),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(extractErrorMessage(text, response.statusText || "Failed to start stream"));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    if (buffer.includes("\r\n")) {
      buffer = buffer.replace(/\r\n/g, "\n");
    }

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const lines = chunk.split(/\r?\n/);
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.replace(/^data:\s*/, "").trim();
        if (!data) continue;
        if (data === "[DONE]") {
          return;
        }
        try {
          const json = JSON.parse(data) as any;
          const delta = json?.choices?.[0]?.delta ?? {};
          const reasoning = delta?.reasoning_content ?? delta?.reasoning ?? "";
          const content = delta?.content ?? "";
          if (reasoning) {
            options.onDelta({ reasoning });
          }
          if (content) {
            options.onDelta({ content });
          }
        } catch {
          // ignore malformed chunk
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
}

export async function generateImage(options: {
  baseUrl: string;
  apiKey: string;
  model?: string;
  prompt: string;
  size?: string;
  n?: number;
}) {
  const apiBase = resolveApiBase(options.baseUrl);
  const modelscope = isModelScopeEndpoint(options.baseUrl);
  const payload: Record<string, unknown> = {
    model: options.model,
    prompt: options.prompt,
  };
  if (!modelscope) {
    payload.n = options.n ?? 1;
    payload.size = options.size ?? "1024x1024";
    payload.response_format = "b64_json";
  } else {
    if (typeof options.n === "number") payload.n = options.n;
    if (options.size) payload.size = options.size;
  }
  const response = await fetch(`${apiBase}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`,
      ...(modelscope ? { "X-ModelScope-Async-Mode": "true" } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(extractErrorMessage(text, response.statusText || "Failed to generate image"));
  }

  const json = (await response.json()) as ImageGenerationResponse;
  if (json.task_id) {
    const taskResult = await pollModelScopeTask({
      apiBase,
      apiKey: options.apiKey,
      taskId: json.task_id,
    });
    return parseImageResponse(taskResult);
  }
  return parseImageResponse(json);
}

export async function generateImageViaOpenwork(options: {
  proxyUrl: string;
  token?: string;
  hostToken?: string;
  providerId: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  prompt: string;
  size?: string;
  n?: number;
}) {
  const response = await fetch(`${options.proxyUrl.replace(/\/+$/, "")}/cowork/images`, {
    method: "POST",
    headers: buildOpenworkHeaders(options.token, options.hostToken),
    body: JSON.stringify({
      providerId: options.providerId,
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      model: options.model,
      prompt: options.prompt,
      size: options.size,
      n: options.n,
    }),
  });

  const text = await response.text().catch(() => "");
  let json: ImageGenerationResponse = {};
  if (text) {
    try {
      json = JSON.parse(text) as ImageGenerationResponse;
    } catch {
      json = {};
    }
  }
  if (!response.ok) {
    throw new Error(extractErrorMessage(text, response.statusText || "Failed to generate image"));
  }
  return parseImageResponse(json ?? {});
}
