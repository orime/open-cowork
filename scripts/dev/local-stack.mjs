import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";

const requiredNodeMajor = 18;
const nodeVersion = process.versions.node;
const nodeMajor = Number(nodeVersion.split(".")[0]);
const hasFetch = typeof globalThis.fetch === "function";

if (!Number.isFinite(nodeMajor) || nodeMajor < requiredNodeMajor || !hasFetch) {
  const reasons = [];
  if (!Number.isFinite(nodeMajor) || nodeMajor < requiredNodeMajor) {
    reasons.push(`Node.js >= ${requiredNodeMajor} required (current: ${nodeVersion})`);
  }
  if (!hasFetch) {
    reasons.push("globalThis.fetch is unavailable");
  }
  process.stderr.write(
    `[stack] Unsupported runtime.\n` +
      `[stack] ${reasons.join("; ")}.\n` +
      `[stack] Please upgrade Node.js to >= ${requiredNodeMajor} (e.g. via nvm or volta) and retry.\n`,
  );
  process.exit(1);
}

const cwd = process.cwd();
const HOST = "127.0.0.1";

function log(message) {
  process.stdout.write(`${message}\n`);
}

function createPrefixedLogger(prefix) {
  let buffer = "";
  return (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      log(`[${prefix}] ${line}`);
    }
  };
}

function findFreePort(host = HOST) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to allocate port")));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function commandExists(command) {
  const probe = spawn(process.platform === "win32" ? "where" : "which", [command], {
    stdio: "ignore",
  });
  const code = await new Promise((resolve) => {
    probe.once("exit", (exitCode) => resolve(exitCode ?? 1));
  });
  return code === 0;
}

async function waitForHealthy(url, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Health check timeout: ${url}`);
}

function spawnProcess(command, args, options) {
  const child = spawn(command, args, {
    cwd,
    env: options?.env ?? process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const handleStdout = createPrefixedLogger(options?.label ?? command);
  const handleStderr = createPrefixedLogger(options?.label ?? command);
  child.stdout?.on("data", handleStdout);
  child.stderr?.on("data", handleStderr);

  return child;
}

const processes = [];
let shuttingDown = false;

function registerProcess(child, label) {
  processes.push({ child, label });
  child.once("exit", (code, signal) => {
    if (shuttingDown) return;
    const reason = code !== null ? `exit ${code}` : `signal ${signal ?? "unknown"}`;
    log(`[stack] ${label} exited unexpectedly (${reason})`);
    shutdown(1);
  });
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const proc of processes) {
    try {
      proc.child.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
  setTimeout(() => {
    for (const proc of processes) {
      try {
        proc.child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }
    process.exit(code);
  }, 800).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const hasOpencode = await commandExists("opencode");
if (!hasOpencode) {
  log("[stack] Missing dependency: opencode");
  log("[stack] Install with: brew install sst/tap/opencode");
  process.exit(1);
}

const openworkBin = path.join(cwd, "packages/server/dist/bin/openwork-server");
try {
  await access(openworkBin);
} catch {
  log(`[stack] Missing binary: ${openworkBin}`);
  log("[stack] Build with: pnpm --filter openwork-server build:bin");
  process.exit(1);
}

const opencodePort = await findFreePort();
const openworkPort = await findFreePort();
const webPort = await findFreePort();
const token = randomUUID();
const hostToken = randomUUID();

log("[stack] Starting local stack...");
log(`[stack] workspace: ${cwd}`);
log(`[stack] opencode: http://${HOST}:${opencodePort}`);
log(`[stack] openwork-server: http://${HOST}:${openworkPort}`);
log(`[stack] web-ui: http://${HOST}:${webPort}`);

const opencodeProc = spawnProcess(
  "opencode",
  ["serve", "--hostname", HOST, "--port", String(opencodePort)],
  { label: "opencode" },
);
registerProcess(opencodeProc, "opencode");
await waitForHealthy(`http://${HOST}:${opencodePort}/health`);

const openworkProc = spawnProcess(
  openworkBin,
  [
    "--host",
    HOST,
    "--port",
    String(openworkPort),
    "--workspace",
    cwd,
    "--opencode-base-url",
    `http://${HOST}:${opencodePort}`,
    "--opencode-directory",
    cwd,
    "--token",
    token,
    "--host-token",
    hostToken,
    "--cors",
    "*",
  ],
  { label: "openwork" },
);
registerProcess(openworkProc, "openwork-server");
await waitForHealthy(`http://${HOST}:${openworkPort}/health`);

const uiEnv = {
  ...process.env,
  VITE_OPENWORK_URL: `http://${HOST}:${openworkPort}`,
  VITE_OPENWORK_PORT: String(openworkPort),
  VITE_OPENWORK_TOKEN: token,
};

const uiProc = spawnProcess(
  "pnpm",
  [
    "--filter",
    "@different-ai/openwork-ui",
    "exec",
    "vite",
    "--host",
    "0.0.0.0",
    "--port",
    String(webPort),
    "--strictPort",
  ],
  { label: "web", env: uiEnv },
);
registerProcess(uiProc, "web-ui");

log("[stack] Ready");
log(`[stack] Open: http://${HOST}:${webPort}`);
log(`[stack] Token: ${token}`);
log(`[stack] Host token: ${hostToken}`);
log("[stack] Press Ctrl+C to stop all processes.");
