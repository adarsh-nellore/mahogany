import { test, expect } from "@playwright/test";

test.describe("Feed page (authenticated)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login page has next param for feed redirect", async ({ page }) => {
    await page.goto("/login?next=/feed");
    await expect(page).toHaveURL(/\/login\?next=\/feed/);
  });
});

test.describe("Feed API", () => {
  test("GET /api/feed/stories returns JSON with stories array", async ({ request }) => {
    const res = await request.get("/api/feed/stories?per_page=5");
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty("stories");
    expect(Array.isArray(data.stories)).toBe(true);
  });
});
