import { For } from "solid-js";
import { ChevronDown, Languages } from "lucide-solid";
import { LANGUAGE_OPTIONS, currentLocale, setLocale, type Language } from "../../i18n";

export default function LanguageDropdown() {
  return (
    <label class="inline-flex items-center gap-2 rounded-lg border border-dls-border bg-dls-surface px-2.5 py-1.5 text-xs text-dls-secondary hover:bg-dls-hover transition-colors">
      <Languages size={14} />
      <div class="relative">
        <select
          aria-label="Language"
          class="appearance-none bg-transparent pr-5 text-xs font-medium text-dls-text focus:outline-none cursor-pointer"
          value={currentLocale()}
          onChange={(event) => setLocale(event.currentTarget.value as Language)}
        >
          <For each={LANGUAGE_OPTIONS}>
            {(option) => <option value={option.value}>{option.nativeName}</option>}
          </For>
        </select>
        <ChevronDown
          size={12}
          class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-dls-secondary"
        />
      </div>
    </label>
  );
}
