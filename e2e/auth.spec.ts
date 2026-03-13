import { test, expect } from "@playwright/test";

test.describe("Login page", () => {
  test("loads with sign in form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test("has link to sign up", async ({ page }) => {
    await page.goto("/login");
    const signUpLink = page.getByRole("link", { name: "Sign up" }).first();
    await expect(signUpLink).toBeVisible({ timeout: 10000 });
    await expect(signUpLink).toHaveAttribute("href", "/signup");
  });
});

test.describe("Signup page", () => {
  test("loads with sign up form", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: /create your account/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel(/email|work email/i)).toBeVisible();
  });
});

test.describe("Protected routes", () => {
  test("unauthenticated /feed redirects to login", async ({ page }) => {
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test("login page preserves next param when redirecting from feed", async ({ page }) => {
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain("next=");
    expect(page.url()).toContain("feed");
  });
});
