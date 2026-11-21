import { describe, expect, it, vi } from "vitest";
import { handoffBrowserDownload } from "../../src/capture/handoffBrowserDownload";

const item = { id: 7, url: "https://example.com/file.bin", filename: "file.bin", state: "in_progress" };

describe("handoffBrowserDownload", () => {
  it("pauses first and cancels only after a positive ACK", async () => {
    const order: string[] = [];
    const send = vi.fn(async () => { order.push("send"); });
    const pause = vi.fn(async () => { order.push("pause"); });
    const resume = vi.fn(async () => { order.push("resume"); });
    const cancel = vi.fn(async () => { order.push("cancel"); });
    await expect(handoffBrowserDownload(item, true, send, pause, resume, cancel)).resolves.toBe("handed_off");
    expect(order).toEqual(["pause", "send", "cancel"]);
    expect(cancel).toHaveBeenCalledWith(7);
    expect(resume).not.toHaveBeenCalled();
  });

  it("resumes the browser download when the desktop rejects or times out", async () => {
    const send = vi.fn(async () => { throw new Error("ACK timeout"); });
    const pause = vi.fn(async () => undefined);
    const resume = vi.fn(async () => undefined);
    const cancel = vi.fn(async () => undefined);
    await expect(handoffBrowserDownload(item, true, send, pause, resume, cancel)).resolves.toBe("kept_in_browser");
    expect(pause).toHaveBeenCalledWith(7);
    expect(resume).toHaveBeenCalledWith(7);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("does not resume after a positive ACK if cancelling the browser copy fails", async () => {
    const send = vi.fn(async () => undefined);
    const pause = vi.fn(async () => undefined);
    const resume = vi.fn(async () => undefined);
    const cancel = vi.fn(async () => { throw new Error("cancel failed"); });
    await expect(handoffBrowserDownload(item, true, send, pause, resume, cancel)).resolves.toBe("accepted_cancel_failed");
    expect(send).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledWith(7);
    expect(resume).not.toHaveBeenCalled();
  });

  it("leaves completed, incognito, disabled, or non-HTTP downloads untouched", async () => {
    const send = vi.fn(async () => undefined);
    const pause = vi.fn(async () => undefined);
    const resume = vi.fn(async () => undefined);
    const cancel = vi.fn(async () => undefined);
    await expect(handoffBrowserDownload({ ...item, incognito: true }, true, send, pause, resume, cancel)).resolves.toBe("skipped");
    await expect(handoffBrowserDownload({ ...item, state: "complete" }, true, send, pause, resume, cancel)).resolves.toBe("skipped");
    await expect(handoffBrowserDownload(item, false, send, pause, resume, cancel)).resolves.toBe("skipped");
    await expect(handoffBrowserDownload({ ...item, url: "blob:https://example.com/id" }, true, send, pause, resume, cancel)).resolves.toBe("skipped");
    expect(send).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("does not send when the browser cannot pause the original download", async () => {
    const send = vi.fn(async () => undefined);
    const pause = vi.fn(async () => { throw new Error("cannot pause"); });
    const resume = vi.fn(async () => undefined);
    const cancel = vi.fn(async () => undefined);
    await expect(handoffBrowserDownload(item, true, send, pause, resume, cancel)).resolves.toBe("skipped");
    expect(send).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("forwards only a basename, never the local absolute path", async () => {
    const send = vi.fn(async () => undefined);
    const pause = vi.fn(async () => undefined);
    const resume = vi.fn(async () => undefined);
    const cancel = vi.fn(async () => undefined);
    await handoffBrowserDownload({ ...item, filename: "C:\\Users\\me\\Downloads\\file.bin" }, true, send, pause, resume, cancel);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ filename: "file.bin" }));
  });
});
