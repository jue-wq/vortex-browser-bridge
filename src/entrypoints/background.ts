import { defineBackground } from "wxt/sandbox";
import { HandshakeSchema } from "../protocol/schema";
import { NativeMessagingTransport } from "../transport/NativeMessagingTransport";
import { ConnectionManager } from "../transport/ConnectionManager";

export default defineBackground(() => {
  const transport = new NativeMessagingTransport();
  const connection = new ConnectionManager(transport);

  void connection.connect()
    .then(() => connection.send(HandshakeSchema.parse({
      type: "handshake",
      protocol_version: 1,
      extension_version: browser.runtime.getManifest().version,
      capabilities: ["native_messaging", "batch_chunking", "status_push"]
    })))
    .catch((error: unknown) => {
      console.info("[VortexDM] Native host is not available yet.", error);
    });

  browser.runtime.onStartup.addListener(() => {
    void connection.connect().catch(() => undefined);
  });
});
