/** One-time production smoke test against the live Vercel deployment. */
import { chromium } from "playwright";

const base = process.argv[2] ?? "https://inventory-app-jade-alpha.vercel.app";
const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(25000);

try {
  // 1. first signup becomes admin + onboarding
  await page.goto(`${base}/login`);
  await page.click("text=Create account");
  await page.fill('input[name="name"]', "Sanchit Admin");
  await page.fill('input[name="email"]', "admin@inventory.app");
  await page.fill('input[name="password"]', "ChangeMe-Admin-2026!");
  await page.click("text=Create account >> nth=1");
  await page.waitForURL("**/onboarding", { timeout: 40000 });
  console.log("PASS first signup -> onboarding (bootstrap admin)");

  // 2. complete the wizard
  await page.fill('input[name="name"]', "Acme Supply Co.");
  await page.click("text=Continue");
  await page.waitForSelector("text=Your first warehouse");
  await page.fill('input[name="code"]', "MAIN");
  await page.fill('input[name="name"]', "Main Warehouse");
  await page.click("text=Add warehouse");
  await page.waitForSelector("text=Add your items");
  await page.click("text=Add an item manually");
  await page.fill('input[name="name"]', "Launch Widget");
  await page.fill('input[name="sku"]', "SKU-001");
  await page.fill('input[name="openingStock"]', "25");
  await page.fill('input[name="sellingPrice"]', "19.99");
  await page.getByRole("button", { name: /Add item/ }).click();
  await page.waitForSelector("text=You’re all set!");
  await page.click("text=Go to dashboard");
  await page.waitForURL("**/dashboard", { timeout: 40000 });
  console.log("PASS onboarding wizard -> dashboard");

  // 3. item + opening stock visible
  await page.goto(`${base}/items`);
  await page.waitForSelector("text=Launch Widget");
  console.log("PASS item with opening stock visible");

  // 4. first user has admin powers
  await page.goto(`${base}/settings`);
  await page.waitForSelector("text=Full admin access");
  console.log("PASS first user has full admin access");

  console.log("ALL PRODUCTION CHECKS PASSED");
} catch (e) {
  console.error("FAIL:", String(e).slice(0, 400));
  process.exitCode = 1;
} finally {
  await browser.close();
}
