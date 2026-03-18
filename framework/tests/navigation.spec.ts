import { test, expect } from "../src/test-fixture.js";
import { homePage } from "./pages/home.js";
import { aboutPage } from "./pages/about.js";

test.describe("Navigation and page structure", () => {
  test("home page loads by default", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("header")).toBeVisible();
    await expect(page.locator("header")).toContainText("GeneralStore");
    await expect(page.locator("footer")).toBeVisible();
    // Verify home content is visible (product table present on home view)
    const home = homePage(page);
    await expect(await home.productTable.locator()).toBeVisible();
  });

  test("click About link shows about view", async ({ page }) => {
    await page.goto("/");
    await page.locator("nav").getByText("About").click();

    const about = aboutPage(page);
    await expect(await about.aboutText.locator()).toBeVisible();
    const text = await about.aboutText.read();
    expect(text).toContain("GeneralStore");
    expect(text).toContain("one-stop shop");
  });

  test("click Home link restores home view", async ({ page }) => {
    // Navigate to about first using the app's own URL scheme
    await page.goto("/");
    const aboutHref = await page.locator("nav").getByText("About").getAttribute("href");
    await page.goto(aboutHref!);
    await page.locator("nav").getByText("Home").click();
    const home = homePage(page);
    const about = aboutPage(page);
    await expect(await home.productTable.locator()).toBeVisible();
    await expect(await about.aboutText.locator()).toBeHidden();
  });

  test("direct navigation to about shows about view", async ({ page }) => {
    // Discover the app's about URL from its nav link (routing varies: #about, #/about, /about)
    await page.goto("/");
    const href = await page.locator("nav").getByText("About").getAttribute("href");
    await page.goto(href!);
    const about = aboutPage(page);
    const home = homePage(page);
    await expect(await about.aboutText.locator()).toBeVisible();
    await expect(await home.productTable.locator()).toBeHidden();
  });

  test("nav has Home and About links", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("nav");
    await expect(nav.getByText("Home")).toBeVisible();
    await expect(nav.getByText("About")).toBeVisible();
  });

  test("footer contains copyright text", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("footer")).toContainText("GeneralStore");
  });

  test("browser back from about returns to home", async ({ page }) => {
    await page.goto("/");
    await page.locator("nav").getByText("About").click();
    const about = aboutPage(page);
    await expect(await about.aboutText.locator()).toBeVisible();

    await page.goBack();
    const home = homePage(page);
    await expect(await home.productTable.locator()).toBeVisible({ timeout: 5_000 });
  });

  test("browser forward from home restores about", async ({ page }) => {
    await page.goto("/");
    await page.locator("nav").getByText("About").click();
    const about = aboutPage(page);
    await expect(await about.aboutText.locator()).toBeVisible();

    await page.goBack();
    const home = homePage(page);
    await expect(await home.productTable.locator()).toBeVisible({ timeout: 5_000 });

    await page.goForward();
    await expect(await about.aboutText.locator()).toBeVisible({ timeout: 5_000 });
  });
});
