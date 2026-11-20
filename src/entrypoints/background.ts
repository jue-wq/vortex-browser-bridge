import { defineBackground } from "wxt/utils/define-background";
import { HandshakeSchema } from "../protocol/schema";
import { NativeMessagingTransport } from "../transport/NativeMessagingTransport";
import { ConnectionManager } from "../transport/ConnectionManager";
import { ConnectionSupervisor } from "../transport/ConnectionSupervisor";

const RECONNECT_ALARM = "vortex-native-reconnect";

export default defineBackground(() => {
  const transport = new NativeMessagingTransport();
  const connection = new ConnectionManager(transport);
  const scheduler = {
    schedule(delayMs: number): void {
      void browser.alarms.clear(RECONNECT_ALARM).then(() => {
        return browser.alarms.create(RECONNECT_ALARM, {
          delayInMinutes: Math.max(0.5, delayMs / 60_000)
        });
      });
    },
    cancel(): void {
      void browser.alarms.clear(RECONNECT_ALARM);
    }
  };

  const supervisor = new ConnectionSupervisor(
    connection,
    () => HandshakeSchema.parse({
      type: "handshake",
      protocol_version: 1,
      extension_version: browser.runtime.getManifest().version,
      capabilities: ["native_messaging", "batch_chunking", "status_push", "reconnect"]
    }),
    scheduler,
    (state, reason) => {
      console.info(`[VortexDM] Native host ${state}.`, reason ?? "");
    }
  );

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === RECONNECT_ALARM) void supervisor.retry();
  });

  supervisor.start();

  browser.runtime.onStartup.addListener(() => supervisor.start());
  browser.runtime.onInstalled.addListener(() => supervisor.start());
});
