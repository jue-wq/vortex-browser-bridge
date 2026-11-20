import { describe, expect, it, vi } from "vitest";
import { handoffBrowserDownload } from "../../src/capture/handoffBrowserDownload";

const item = { id: 7, url: "https://example.com/file.bin", filename: "file.bin" };

describe("handoffBrowserDownload", () => {
  it("cancels the browser download only after a positive ACK", async () => {
    const send = vi.fn(async () => undefined);
    const cancel = vi.fn(async () => undefined);
    await expect(handoffBrowserDownload(item, true, send, cancel)).resolves.toBe("handed_off");
    expect(send).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledWith(7);
  });

  it("keeps the browser download when the desktop rejects or times out", async () => {
    const send = vi.fn(async () => { throw new Error("ACK timeout"); });
    const cancel = vi.fn(async () => undefined);
    await expect(handoffBrowserDownload(item, true, send, cancel)).resolves.toBe("kept_in_browser");
    expect(cancel).not.toHaveBeenCalled();
  });

  it("does not inspect incognito or disabled downloads", async () => {
    const send = vi.fn(async () => undefined);
    const cancel = vi.fn(async () => undefined);
    await expect(handoffBrowserDownload({ ...item, incognito: true }, true, send, cancel)).resolves.toBe("skipped");
    await expect(handoffBrowserDownload(item, false, send, cancel)).resolves.toBe("skipped");
    expect(send).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("ignores non-HTTP downloads", async () => {
    const send = vi.fn(async () => undefined);
    const cancel = vi.fn(async () => undefined);
    await expect(handoffBrowserDownload({ ...item, url: "blob:https://example.com/id" }, true, send, cancel)).resolves.toBe("skipped");
    expect(send).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });
});
