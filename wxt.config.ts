import { defineConfig } from "wxt";

export default defineConfig({
  modules: [],
  srcDir: "src",
  manifest: {
    name: "VortexDM Browser Bridge",
    short_name: "VortexDM",
    description: "Connect your browser to VortexDM for reliable downloads and media extraction.",
    version: "0.1.0",
    permissions: ["nativeMessaging", "storage"],
    optional_permissions: ["cookies", "downloads", "webRequest", "contextMenus", "activeTab", "tabs"],
    optional_host_permissions: ["<all_urls>", "http://127.0.0.1/*"],
    browser_specific_settings: {
      gecko: {
        id: "browser-bridge@vortexdm.app",
        strict_min_version: "128.0"
      }
    }
  }
});
