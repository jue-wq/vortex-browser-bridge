import browser from "webextension-polyfill";

export type ThemeMode = "sync" | "modern-dark" | "pure-oled" | "modern-light";

export interface BridgeSettings {
  autoCapture: boolean;
  minimumFileSizeBytes: number;
  skipShortcut: "Alt" | "Ctrl+Shift";
  incognitoMode: "allow" | "block";
  theme: ThemeMode;
  httpFallbackEnabled: boolean;
  httpFallbackUrl: string;
  httpFallbackApiKey: string;
}

export const DEFAULT_SETTINGS: BridgeSettings = {
  autoCapture: false,
  minimumFileSizeBytes: 1024 * 1024,
  skipShortcut: "Alt",
  incognitoMode: "block",
  theme: "sync",
  httpFallbackEnabled: false,
  httpFallbackUrl: "http://127.0.0.1:8765",
  httpFallbackApiKey: ""
};

const SETTINGS_KEY = "vortex.settings";

export async function getSettings(): Promise<BridgeSettings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  const value = stored[SETTINGS_KEY];
  return { ...DEFAULT_SETTINGS, ...(typeof value === "object" && value !== null ? value : {}) } as BridgeSettings;
}

export async function saveSettings(settings: BridgeSettings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function saveSessionState<T>(key: string, value: T): Promise<void> {
  if (!browser.storage.session) throw new Error("storage.session is not supported in this browser");
  await browser.storage.session.set({ [key]: value });
}

export async function readSessionState<T>(key: string): Promise<T | undefined> {
  if (!browser.storage.session) return undefined;
  const stored = await browser.storage.session.get(key);
  return stored[key] as T | undefined;
}
