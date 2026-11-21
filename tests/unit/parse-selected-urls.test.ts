import { describe, expect, it } from "vitest";
import { parseSelectedUrls } from "../../src/capture/parseSelectedUrls";

describe("parseSelectedUrls", () => {
  it("extracts unique HTTP and HTTPS links from selected text", () => {
    expect(parseSelectedUrls("See https://a.example/x and http://b.example/y. https://a.example/x"))
      .toEqual(["https://a.example/x", "http://b.example/y"]);
  });
  it("ignores malformed and non-web URLs", () => {
    expect(parseSelectedUrls("file:///tmp/a https:// bad https://ok.example"))
      .toEqual(["https://ok.example/"]);
  });
  it("enforces a positive limit", () => {
    expect(() => parseSelectedUrls("https://a.example", 0)).toThrow(RangeError);
    expect(parseSelectedUrls("https://a.example https://b.example", 1)).toHaveLength(1);
  });
});
