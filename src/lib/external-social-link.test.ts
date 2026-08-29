import { describe, expect, it } from "vitest";
import { detectSocialPlatform, normalizeExternalUrl } from "./external-social-link";

describe("external social links", () => {
  it("canonicalizes Instagram and removes tracking", () => {
    expect(normalizeExternalUrl("instagram.com/p/ABC/?igsh=xyz&utm_source=share#x").toString())
      .toBe("https://www.instagram.com/p/ABC/");
  });

  it("unwraps Meta redirect links", () => {
    const wrapped = "https://l.instagram.com/?u=" + encodeURIComponent("https://instagram.com/reel/ABC/?utm_medium=copy_link");
    expect(normalizeExternalUrl(wrapped).toString()).toBe("https://www.instagram.com/reel/ABC/");
  });

  it("does not mistake lookalike domains for Instagram", () => {
    expect(detectSocialPlatform("https://instagram.com.example.org/p/ABC")).toBeNull();
  });

  it("rejects unsafe protocols", () => {
    expect(() => normalizeExternalUrl("javascript:alert(1)")).toThrow();
  });
});
