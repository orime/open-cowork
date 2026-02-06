import { For, Show, createMemo } from "solid-js";
import { CheckCircle2, Circle, FolderOpen, KeyRound, Rocket, Server } from "lucide-solid";
import type { CoworkProvider } from "../lib/openwork-server";
import Button from "./button";
import { currentLocale, t } from "../../i18n";

type FirstRunWizardProps = {
  open: boolean;
  canSkip: boolean;
  hasWorkspace: boolean;
  hasProviderKey: boolean;
  providers: CoworkProvider[];
  selectedProviderId: string;
  apiKey: string;
  savingProvider: boolean;
  providerError: string | null;
  providerStatus: string | null;
  onSelectedProviderIdChange: (providerId: string) => void;
  onApiKeyChange: (value: string) => void;
  onCreateWorkspace: () => void;
  onCreateRemoteWorkspace: () => void;
  onOpenProviderSettings: () => void;
  onSaveProviderKey: () => void;
  onOpenStudio: () => void;
  onCreateSession: () => void;
  onSkip: () => void;
};

export default function FirstRunWizard(props: FirstRunWizardProps) {
  const translate = (key: string) => t(key, currentLocale());

  const activeProvider = createMemo(
    () => props.providers.find((provider) => provider.id === props.selectedProviderId) ?? null,
  );
  const allDone = createMemo(() => props.hasWorkspace && props.hasProviderKey);

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 backdrop-blur-[2px] px-4">
        <div class="w-full max-w-2xl rounded-2xl border border-gray-6 bg-dls-surface shadow-[0_20px_80px_rgba(0,0,0,0.2)]">
          <div class="border-b border-gray-6 px-5 py-4">
            <div class="flex items-start justify-between gap-4">
              <div>
                <div class="text-sm font-semibold text-gray-12">{translate("setup.title")}</div>
                <div class="mt-1 text-xs text-gray-10">{translate("setup.subtitle")}</div>
              </div>
              <Show when={props.canSkip}>
                <Button variant="ghost" class="text-xs h-7 px-2" onClick={props.onSkip}>
                  {translate("setup.skip")}
                </Button>
              </Show>
            </div>
          </div>

          <div class="space-y-4 px-5 py-4">
            <div class="rounded-xl border border-gray-6/70 bg-gray-2/30 p-4">
              <div class="flex items-center gap-2 text-sm font-medium text-gray-12">
                <Show
                  when={props.hasWorkspace}
                  fallback={<Circle size={14} class="text-gray-8" />}
                >
                  <CheckCircle2 size={14} class="text-green-10" />
                </Show>
                <FolderOpen size={15} class="text-gray-10" />
                <span>{translate("setup.step_workspace_title")}</span>
              </div>
              <div class="mt-1 text-xs text-gray-10">{translate("setup.step_workspace_desc")}</div>
              <div class="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" class="text-xs h-8 px-3" onClick={props.onCreateWorkspace}>
                  {translate("setup.create_workspace")}
                </Button>
                <Button variant="outline" class="text-xs h-8 px-3" onClick={props.onCreateRemoteWorkspace}>
                  <Server size={13} />
                  {translate("setup.add_remote_workspace")}
                </Button>
              </div>
            </div>

            <div class="rounded-xl border border-gray-6/70 bg-gray-2/30 p-4">
              <div class="flex items-center gap-2 text-sm font-medium text-gray-12">
                <Show
                  when={props.hasProviderKey}
                  fallback={<Circle size={14} class="text-gray-8" />}
                >
                  <CheckCircle2 size={14} class="text-green-10" />
                </Show>
                <KeyRound size={15} class="text-gray-10" />
                <span>{translate("setup.step_provider_title")}</span>
              </div>
              <div class="mt-1 text-xs text-gray-10">{translate("setup.step_provider_desc")}</div>
              <div class="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_1.4fr_auto]">
                <select
                  class="w-full rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-xs"
                  value={props.selectedProviderId}
                  onChange={(event) => props.onSelectedProviderIdChange(event.currentTarget.value)}
                >
                  <Show when={props.providers.length} fallback={<option value="">{translate("setup.no_provider_option")}</option>}>
                    <For each={props.providers}>
                      {(provider) => <option value={provider.id}>{provider.name}</option>}
                    </For>
                  </Show>
                </select>
                <input
                  class="w-full rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-xs text-gray-12 placeholder:text-gray-9"
                  type="password"
                  value={props.apiKey}
                  onInput={(event) => props.onApiKeyChange(event.currentTarget.value)}
                  placeholder={translate("setup.api_key_placeholder")}
                />
                <Button
                  variant="secondary"
                  class="text-xs h-8 px-3"
                  onClick={props.onSaveProviderKey}
                  disabled={props.savingProvider || !activeProvider() || !props.apiKey.trim()}
                >
                  {props.savingProvider ? translate("setup.testing") : translate("setup.test_and_save")}
                </Button>
              </div>
              <div class="mt-2 text-[11px] text-gray-9">
                <Show when={activeProvider()}>
                  {(provider) => `${translate("setup.provider_base_url")} ${provider().baseUrl}`}
                </Show>
              </div>
              <Show when={props.providerStatus}>
                <div class="mt-2 text-xs text-green-11">{props.providerStatus}</div>
              </Show>
              <Show when={props.providerError}>
                <div class="mt-2 text-xs text-red-11">{props.providerError}</div>
              </Show>
              <div class="mt-3">
                <Button variant="outline" class="text-xs h-7 px-3" onClick={props.onOpenProviderSettings}>
                  {translate("setup.open_provider_settings")}
                </Button>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-between gap-3 border-t border-gray-6 px-5 py-4">
            <div class="text-xs text-gray-10">
              <Show when={allDone()} fallback={translate("setup.incomplete_hint")}>
                {translate("setup.complete_hint")}
              </Show>
            </div>
            <div class="flex items-center gap-2">
              <Button variant="outline" class="text-xs h-8 px-3" onClick={props.onOpenStudio}>
                {translate("setup.open_studio")}
              </Button>
              <Button
                variant="secondary"
                class="text-xs h-8 px-3"
                onClick={props.onCreateSession}
                disabled={!allDone()}
              >
                <Rocket size={13} />
                {translate("setup.start_session")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
}
