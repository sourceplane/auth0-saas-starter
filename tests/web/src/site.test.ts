import { afterEach, describe, expect, it, vi } from "vitest";

describe("site identity (apps/web/app/site.ts)", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    vi.resetModules();
  });

  it("names the site and links its source repository", async () => {
    const { SITE_NAME, SOURCE_URL } = await import("app/site");
    expect(SITE_NAME.trim()).not.toBe("");
    expect(SOURCE_URL).toMatch(/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[a-z0-9-]+$/);
  });

  it("takes its origin from NEXT_PUBLIC_SITE_URL, else localhost", async () => {
    expect((await import("app/site")).SITE_URL).toBe("http://localhost:3000");
    vi.resetModules();
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";
    expect((await import("app/site")).SITE_URL).toBe("https://app.example.com");
  });

  it("derives one slug from the name, for the domain-verification record", async () => {
    const { SITE_NAME, SITE_SLUG } = await import("app/site");
    expect(SITE_SLUG).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(SITE_SLUG).toBe(
      SITE_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "site",
    );
    const { DOMAIN_VERIFICATION_RECORD_IDENTIFIER } = await import("lib/constants");
    expect(DOMAIN_VERIFICATION_RECORD_IDENTIFIER).toBe(`${SITE_SLUG}-domain-verification`);
  });
});
