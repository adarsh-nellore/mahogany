import { test, expect } from "@playwright/test";

test.describe("Home page", () => {
  test("loads and shows Mahogany branding", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Mahogany").first()).toBeVisible({ timeout: 10000 });
  });

  test("has Get started link to signup", async ({ page }) => {
    await page.goto("/");
    const getStartedLink = page.getByRole("link", { name: /get started/i }).first();
    await expect(getStartedLink).toBeVisible({ timeout: 10000 });
    await expect(getStartedLink).toHaveAttribute("href", "/signup");
  });
});
