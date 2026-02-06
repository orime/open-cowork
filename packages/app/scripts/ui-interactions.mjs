import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");

const readAppFile = async (relativePath) => {
  return readFile(path.join(appRoot, relativePath), "utf8");
};

const studioSource = await readAppFile("src/app/pages/studio.tsx");
const sessionSource = await readAppFile("src/app/pages/session.tsx");
const settingsSource = await readAppFile("src/app/pages/settings.tsx");
const skillsSource = await readAppFile("src/app/pages/skills.tsx");
const providerSettingsSource = await readAppFile("src/app/components/cowork-providers-settings.tsx");
const wizardSource = await readAppFile("src/app/components/first-run-wizard.tsx");
const appSource = await readAppFile("src/app/app.tsx");
const zhLocaleSource = await readAppFile("src/i18n/locales/zh.ts");
const enLocaleSource = await readAppFile("src/i18n/locales/en.ts");
const messageListSource = await readAppFile("src/app/components/session/message-list.tsx");

assert.match(
  studioSource,
  /const handlePromptKeyDown = \(event: KeyboardEvent\) => \{/,
  "studio textarea should have a keydown handler",
);
assert.match(studioSource, /if \(event\.key !== "Enter"\) return;/, "studio keydown should gate on Enter");
assert.match(studioSource, /if \(event\.isComposing\) return;/, "studio keydown should guard IME composing");
assert.match(studioSource, /if \(event\.shiftKey\) return;/, "studio keydown should allow Shift\\+Enter newline");
assert.match(studioSource, /void sendMessage\(\);/, "studio Enter should trigger sendMessage");

assert.match(
  sessionSource,
  /type SessionDiagnosticsViewModel = \{/,
  "session page should expose diagnostics view model",
);
assert.match(
  sessionSource,
  /type SessionStallHeuristic = \{/,
  "session page should include stall heuristic type",
);
assert.match(
  sessionSource,
  /diagnosticsModel\(\)\.heuristic\.isStalled/,
  "session page should render stalled-state diagnostics",
);
assert.match(
  sessionSource,
  /会话诊断/,
  "session page should render diagnostics panel title in zh locale context",
);
assert.match(
  sessionSource,
  /const thinkingPanel = createMemo/,
  "session page should keep a persisted thinking snapshot panel",
);
assert.match(
  sessionSource,
  /runFooterVisible\(\)/,
  "session footer should stay visible for persisted thinking snapshots",
);
assert.match(
  sessionSource,
  /session\.engine_required_title/,
  "session page should explain OpenCode dependency when disconnected",
);

assert.match(
  settingsSource,
  /settings\.updater\.action_install_restart/,
  "settings updater should use install-and-restart copy key",
);
assert.match(
  settingsSource,
  /settings\.updater\.toolbar_description/,
  "settings updater should show explanatory description copy",
);
assert.match(
  zhLocaleSource,
  /"settings\.updater\.action_install_restart":\s*"安装并重启"/,
  "zh locale should include install-and-restart copy",
);
assert.match(
  zhLocaleSource,
  /"session\.thinking_snapshot_hint":/,
  "zh locale should include persisted thinking hint copy",
);
assert.match(
  enLocaleSource,
  /"session\.thinking_snapshot_hint":/,
  "en locale should include persisted thinking hint copy",
);
assert.match(
  messageListSource,
  /session\.reasoning_only_hint/,
  "session message list should render a reasoning-only fallback hint",
);
assert.match(
  studioSource,
  /studio\.error_image_model_unsupported/,
  "studio should map provider image-model mismatch to friendly copy",
);
assert.match(
  providerSettingsSource,
  /cowork\.providers\.id_required/,
  "provider settings should validate missing provider id",
);
assert.match(
  providerSettingsSource,
  /cowork\.providers\.models_required/,
  "provider settings should validate empty model catalog",
);
assert.match(
  skillsSource,
  /skills\.new_skill/,
  "skills page should use translated 'new skill' key",
);
assert.match(
  skillsSource,
  /skills\.recommended/,
  "skills page should use translated 'recommended' key",
);
assert.match(
  zhLocaleSource,
  /"skills\.new_skill":/,
  "zh locale should include skills.new_skill",
);
assert.match(
  enLocaleSource,
  /"skills\.new_skill":/,
  "en locale should include skills.new_skill",
);
assert.match(
  appSource,
  /openwork\.firstRunWizardDismissed\.v1/,
  "app should persist first-run wizard dismissal",
);
assert.match(
  appSource,
  /const firstRunSetupComplete = createMemo/,
  "app should derive first-run completion state",
);
assert.match(
  appSource,
  /<FirstRunWizard/,
  "app should render first-run wizard",
);
assert.match(
  wizardSource,
  /setup\.step_workspace_title/,
  "first-run wizard should render workspace setup copy",
);
assert.match(
  wizardSource,
  /setup\.step_provider_title/,
  "first-run wizard should render provider setup copy",
);
assert.match(
  zhLocaleSource,
  /"setup\.title":/,
  "zh locale should include first-run setup copy",
);
assert.match(
  enLocaleSource,
  /"setup\.title":/,
  "en locale should include first-run setup copy",
);

console.log(
  JSON.stringify({
    ok: true,
    checks: [
      "studio_enter_send_shift_enter_newline",
      "session_diagnostics_drawer_and_stall_heuristic",
      "updater_copy_install_restart_explanation",
      "provider_form_validation_and_feedback",
      "skills_i18n_keys_present",
      "first_run_wizard_guides_workspace_and_provider_setup",
    ],
  }),
);
