import { execSync, spawnSync } from "node:child_process";

function parseArgs(argv) {
  const out = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--") continue;
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out.set(key, next);
      i += 1;
    } else {
      out.set(key, "true");
    }
  }
  return out;
}

function asBoolean(input, fallback) {
  if (input == null) return fallback;
  const value = String(input).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  throw new Error(`Invalid boolean value: ${input}`);
}

function normalizeTag(input) {
  const raw = (input ?? "").trim();
  if (!raw) throw new Error("Missing --tag (expected vX.Y.Z)");
  const tag = raw.startsWith("v") ? raw : `v${raw}`;
  if (!/^v\d+\.\d+\.\d+([.-][0-9A-Za-z.-]+)?$/.test(tag)) {
    throw new Error(`Invalid tag: ${tag} (expected vX.Y.Z)`);
  }
  return tag;
}

function detectRepo() {
  try {
    const remote = execSync("git config --get remote.origin.url", {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    if (!remote) return null;
    const scp = remote.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/);
    return scp?.[1] ?? null;
  } catch {
    return null;
  }
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

const args = parseArgs(process.argv.slice(2));

if (args.has("help")) {
  console.log(
    [
      "Usage:",
      "  pnpm release:desktop -- --tag v0.1.2 [--repo owner/repo] [--notarize true] [--draft false] [--prerelease false] [--watch true]",
      "",
      "Notes:",
      "- Triggers GitHub Actions workflow: Release App",
      "- Builds macOS + Windows + Linux installers from CI matrix",
      "- Default repo is resolved from git remote.origin.url",
    ].join("\n"),
  );
  process.exit(0);
}

const tag = normalizeTag(args.get("tag"));
const repo = (args.get("repo") ?? detectRepo() ?? "").trim();
if (!repo) {
  throw new Error("Unable to resolve repo. Pass --repo owner/repo");
}

const notarize = asBoolean(args.get("notarize"), true);
const draft = asBoolean(args.get("draft"), false);
const prerelease = asBoolean(args.get("prerelease"), false);
const publishSidecars = asBoolean(args.get("publish_sidecars"), true);
const publishNpm = asBoolean(args.get("publish_npm"), true);
const watch = asBoolean(args.get("watch"), false);

const workflowArgs = [
  "workflow",
  "run",
  "Release App",
  "--repo",
  repo,
  "-f",
  `tag=${tag}`,
  "-f",
  `notarize=${String(notarize)}`,
  "-f",
  `draft=${String(draft)}`,
  "-f",
  `prerelease=${String(prerelease)}`,
  "-f",
  `publish_sidecars=${String(publishSidecars)}`,
  "-f",
  `publish_npm=${String(publishNpm)}`,
];

console.log(
  `Triggering Release App for ${repo} ${tag} (notarize=${notarize}, draft=${draft}, prerelease=${prerelease})`,
);
run("gh", workflowArgs);

if (watch) {
  console.log("Watching latest Release App run...");
  run("gh", ["run", "watch", "--repo", repo]);
} else {
  console.log(`Next: gh run list --repo ${repo} --workflow "Release App" --limit 5`);
}
