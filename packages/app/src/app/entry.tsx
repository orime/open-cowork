import App from "./app";
import { GlobalSDKProvider } from "./context/global-sdk";
import { GlobalSyncProvider } from "./context/global-sync";
import { LocalProvider } from "./context/local";
import { ServerProvider } from "./context/server";

export default function AppEntry() {
  const openworkUrl = (import.meta as any).env?.VITE_OPENWORK_URL as string | undefined;
  const normalized = typeof openworkUrl === "string" ? openworkUrl.replace(/\/+$/, "") : "";
  const defaultUrl = normalized ? `${normalized}/opencode` : "http://127.0.0.1:4096";

  return (
    <ServerProvider defaultUrl={defaultUrl}>
      <GlobalSDKProvider>
        <GlobalSyncProvider>
          <LocalProvider>
            <App />
          </LocalProvider>
        </GlobalSyncProvider>
      </GlobalSDKProvider>
    </ServerProvider>
  );
}
