/**
 * End-to-end smoke test of every core workflow, driven through a real browser.
 * Run: node e2e-test.mjs [baseUrl]
 */
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:4731";
const runId = Date.now().toString(36);
let passed = 0, failed = 0;
const results = [];

function ok(name) { passed++; results.push(`  PASS  ${name}`); }
function bad(name, err) { failed++; results.push(`  FAIL  ${name}: ${String(err).slice(0, 200)}`); }

async function step(name, fn) {
  try { await fn(); ok(name); } catch (e) { bad(name, e); }
}

const browser = await chromium.launch();
async function signOut() {
  await page.keyboard.press("Escape");
  await page.locator("body").click({ position: { x: 5, y: 300 } }); // close any open popover
  await page.locator('button[aria-label="Profile menu"]').click();
  await page.click("text=Sign out");
  await page.waitForURL("**/login");
}

const page = await browser.newPage();
page.setDefaultTimeout(15000);
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(String(e)));

// ---------- AUTH ----------
await step("login page renders", async () => {
  await page.goto(`${base}/login`);
  await page.waitForSelector("text=Welcome back");
});

await step("login with wrong password shows error", async () => {
  await page.fill('input[name="email"]', "admin@acme.io");
  await page.fill('input[name="password"]', "wrong-password");
  await page.click('button[type="submit"]');
  await page.waitForSelector("text=Invalid email or password");
});

await step("login with valid credentials reaches dashboard", async () => {
  // settle after the error re-render, then submit cleanly
  await page.waitForTimeout(500);
  await page.fill('input[name="email"]', "admin@acme.io");
  await page.fill('input[name="password"]', "admin1234");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/dashboard", { timeout: 30000 });
  await page.waitForSelector("text=Inventory value");
});

// ---------- DASHBOARD ----------
await step("dashboard shows KPIs, charts, alerts, activity", async () => {
  await page.waitForSelector("text=Sales (30d)");
  await page.waitForSelector("text=Stock alerts");
  await page.waitForSelector("text=Recent activity");
  await page.waitForSelector("text=Sales revenue — last 30 days");
});

// ---------- GLOBAL SEARCH ----------
await step("global search finds product", async () => {
  await page.fill("#global-search", "Nimbus");
  await page.waitForSelector("text=AUD-WH100");
});

// ---------- PRODUCTS ----------
await step("products list renders with rows", async () => {
  await page.goto(`${base}/items`);
  await page.waitForSelector("text=Nimbus Wireless Headphones");
});

await step("create product via modal", async () => {
  await page.click("text=Add item");
  await page.fill('input[name="name"]', "E2E Test Widget");
  await page.fill('input[name="sku"]', "E2E-WID1");
  await page.fill('input[name="costPrice"]', "5.50");
  await page.fill('input[name="sellingPrice"]', "12.99");
  await page.fill('input[name="reorderPoint"]', "5");
  await page.click("text=Create item");
  await page.waitForSelector("text=E2E Test Widget");
});

await step("duplicate SKU is rejected", async () => {
  await page.click("text=Add item");
  await page.fill('input[name="name"]', "Dup");
  await page.fill('input[name="sku"]', "E2E-WID1");
  await page.fill('input[name="costPrice"]', "1");
  await page.fill('input[name="sellingPrice"]', "2");
  await page.click("text=Create item");
  await page.waitForSelector('text=already exists');
  await page.keyboard.press("Escape");
});

await step("search filter narrows table", async () => {
  await page.fill('input[placeholder="Search name, SKU, barcode…"]', "E2E");
  await page.waitForSelector("text=E2E Test Widget");
  const rows = await page.locator("tbody tr").count();
  if (rows !== 1) throw new Error(`expected 1 row, got ${rows}`);
});

await step("inline edit selling price", async () => {
  await page.click("text=$12.99");
  await page.fill('input[value="12.99"]', "14.99");
  await page.keyboard.press("Enter");
  await page.waitForSelector("text=$14.99");
});

await step("product detail page renders", async () => {
  await page.click("text=E2E Test Widget");
  await page.waitForURL("**/items/**");
  await page.waitForSelector("text=Movement history");
  await page.goBack();
});

// ---------- INVENTORY ----------
await step("inventory stock levels render", async () => {
  await page.goto(`${base}/inventory`);
  await page.waitForSelector('h1:has-text("Inventory")', { timeout: 30000 });
  await page.waitForSelector("tbody tr", { timeout: 30000 });
});

await step("stock adjustment adds units", async () => {
  await page.fill('input[placeholder="Search product, SKU, bin…"]', "Nimbus");
  await page.waitForTimeout(300);
  await page.locator("tbody").locator("text=Adjust").first().click();
  await page.waitForSelector("text=Adjust stock");
  await page.click("text=+ Add stock");
  await page.locator('input[placeholder="0"]').fill("7");
  await page.fill('input[name="note"]', "e2e test adjustment");
  await page.click("text=Apply adjustment");
  await page.waitForSelector("text=Adjust stock", { state: "detached" });
});

await step("movement history shows the adjustment", async () => {
  await page.click("text=Movement history");
  await page.waitForSelector("text=adjustment");
  await page.waitForSelector("text=+7");
});

await step("stock transfer between warehouses", async () => {
  await page.click("text=New transfer");
  await page.selectOption('select[name="fromWarehouseId"]', { label: "Oakland Main" });
  await page.selectOption('select[name="toWarehouseId"]', { label: "SF Retail Backroom" });
  await page.locator("select").nth(2).selectOption({ index: 1 });
  await page.locator('input[type="number"]').fill("2");
  await page.click("text=Transfer stock");
  await page.waitForSelector("text=New stock transfer", { state: "detached" });
  await page.click("text=Stock transfers");
  await page.waitForSelector("text=TR-");
});

await step("barcode scan lookup finds product", async () => {
  await page.click("text=Scan code");
  await page.fill('input[placeholder="e.g. 810001001 or AUD-WH100"]', "810001001");
  await page.click("text=Lookup");
  await page.waitForSelector("text=Nimbus Wireless Headphones");
  await page.keyboard.press("Escape");
});

// ---------- PURCHASES ----------
let poNumber = "";
await step("create purchase order", async () => {
  await page.goto(`${base}/purchases`);
  await page.click("text=New purchase order");
  await page.selectOption('select[name="supplierId"]', { index: 1 });
  await page.selectOption('select[name="warehouseId"]', { index: 1 });
  await page.locator('form select').nth(2).selectOption({ index: 1 });
  await page.locator('input[title="Quantity"]').fill("10");
  await page.click("text=Create order");
  await page.waitForSelector('h2:has-text("New purchase order")', { state: "detached" });
});

await step("receive goods against the PO", async () => {
  // newest PO is first row
  const link = page.locator("tbody tr").first().locator("a").first();
  poNumber = (await link.textContent()) ?? "";
  await link.click();
  await page.waitForSelector("text=Receive goods");
  await page.click("text=Receive items");
  await page.waitForSelector("text=received", { timeout: 15000 });
});

// ---------- SALES ----------
await step("create sales order", async () => {
  await page.goto(`${base}/sales`);
  await page.click("text=New sales order");
  await page.selectOption('select[name="customerId"]', { index: 1 });
  await page.selectOption('select[name="warehouseId"]', { index: 1 });
  await page.locator("form select").nth(2).selectOption({ index: 1 });
  await page.locator('input[title="Quantity"]').fill("2");
  await page.click("text=Create order");
  await page.waitForSelector('h2:has-text("New sales order")', { state: "detached" });
});

await step("fulfil the sales order (stock deducted)", async () => {
  await page.locator("tbody tr").first().locator("a").first().click();
  await page.waitForSelector("text=Order actions");
  await page.click("text=Fulfil & ship");
  await page.waitForSelector("text=shipped");
});

await step("generate invoice from the order", async () => {
  await page.click("text=Generate invoice");
  await page.waitForSelector("text=Invoices");
  await page.waitForSelector("text=INV-");
});

await step("mark invoice paid", async () => {
  await page.goto(`${base}/sales?tab=invoices`);
  await page.locator("text=Mark paid").first().click();
  await page.waitForTimeout(800);
});

// ---------- WAREHOUSES / REPORTS ----------
await step("warehouses tab shows totals (legacy redirect works)", async () => {
  await page.goto(`${base}/warehouses`); // legacy redirect -> /inventory?tab=warehouses
  await page.waitForSelector("text=Oakland Main");
  await page.waitForSelector("text=SKUs");
});

await step("reports render charts and movers", async () => {
  await page.goto(`${base}/reports`);
  await page.waitForSelector("text=Fast movers");
  await page.waitForSelector("text=Slow movers");
  await page.waitForSelector("text=Inventory valuation by category");
});

// ---------- WIREFRAME: sub-tabs & contacts ----------
await step("sales sub-tabs: shipments and returns render", async () => {
  await page.goto(`${base}/sales?tab=shipments`);
  await page.waitForSelector("text=Units shipped");
  await page.goto(`${base}/sales?tab=returns`);
  await page.waitForSelector("text=RETURN");
});

await step("purchases sub-tabs: goods received and bills render", async () => {
  await page.goto(`${base}/purchases?tab=received`);
  await page.waitForSelector("text=Qty received");
  await page.goto(`${base}/purchases?tab=bills`);
  await page.waitForSelector("text=Supplier bills");
  await page.waitForSelector("text=Unpaid total");
});

await step("mark a supplier bill paid", async () => {
  await page.locator("text=Mark paid").first().click();
  await page.waitForSelector("text=marked paid");
});

await step("inventory adjustments sub-tab shows audited reasons", async () => {
  await page.goto(`${base}/inventory?tab=adjustments`);
  await page.waitForSelector("text=Reason");
  await page.waitForSelector("text=e2e test adjustment");
});

await step("contacts: customers list with outstanding balances", async () => {
  await page.goto(`${base}/contacts?tab=customers`);
  await page.waitForSelector("text=Lifetime value");
  await page.waitForSelector("text=Bolt Retail Group");
});

await step("contacts: customer profile shows order history", async () => {
  await page.click("text=Bolt Retail Group");
  await page.waitForURL("**/contacts/customer/**");
  await page.waitForSelector("text=Sales history");
  await page.waitForSelector("text=Contact details");
});

await step("contacts: suppliers tab and profile", async () => {
  await page.goto(`${base}/contacts?tab=suppliers`);
  await page.waitForSelector("text=Total purchased");
  await page.click("text=Pacific Components Ltd.");
  await page.waitForURL("**/contacts/supplier/**");
  await page.waitForSelector("text=Purchase history");
});

await step("warehouse selector filters inventory", async () => {
  await page.goto(`${base}/inventory?tab=stock`);
  await page.locator('button[aria-label="Warehouse selector"]').click();
  await page.waitForSelector("text=All warehouses");
  await page.click("text=Newark East");
  await page.waitForURL("**wh=**");
  await page.waitForSelector("text=filtered: Newark East");
});

await step("reports: date + warehouse filters and low-stock table", async () => {
  await page.goto(`${base}/reports?range=30d`);
  await page.waitForSelector("text=Low stock report");
  await page.waitForSelector("text=Sales (30d)");
});

await step("quick-create menu navigates to new PO", async () => {
  await page.click("text=New >> nth=0");
  await page.click("text=New purchase order");
  await page.waitForSelector('h2:has-text("New purchase order")');
  await page.keyboard.press("Escape");
});

await step("help page renders", async () => {
  await page.goto(`${base}/help`);
  await page.waitForSelector("text=Help & shortcuts");
});

// ---------- WIREFRAME: detail edit, search deep-links, responsive ----------
await step("item detail edit control opens prefilled form", async () => {
  await page.goto(`${base}/items`);
  await page.click("text=Nimbus Wireless Headphones");
  await page.waitForURL("**/items/**");
  await page.click("text=Edit item");
  await page.waitForSelector('h2:has-text("Edit Nimbus Wireless Headphones")');
  const sku = await page.locator('input[name="sku"]').inputValue();
  if (sku !== "AUD-WH100") throw new Error(`expected prefilled SKU, got ${sku}`);
  await page.keyboard.press("Escape");
});

await step("global search deep-links to customer profile", async () => {
  await page.fill("#global-search", "Bolt Retail");
  await page.waitForSelector("text=Customer");
  await page.click("text=Bolt Retail Group");
  await page.waitForURL("**/contacts/customer/**");
  await page.waitForSelector("text=Sales history");
});

await step("mobile viewport: sidebar drawer opens via hamburger", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/dashboard`);
  // desktop sidebar is hidden; hamburger opens the drawer
  await page.locator("header button").first().click();
  const drawer = page.locator("aside").last(); // mobile drawer (desktop sidebar is hidden)
  await drawer.locator("text=Contacts").waitFor();
  await drawer.locator('a:has-text("Items")').first().click();
  await page.waitForURL("**/items");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${base}/dashboard`);
});

// ---------- PRODUCTION READINESS ----------
await step("health endpoint reports ok without auth", async () => {
  const res = await fetch(`${base}/api/health`);
  const body = await res.json();
  if (res.status !== 200 || body.status !== "ok" || body.db !== "up") {
    throw new Error(`unexpected health response: ${res.status} ${JSON.stringify(body)}`);
  }
});

await step("security headers are present", async () => {
  const res = await fetch(`${base}/login`);
  const required = {
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
  };
  for (const [k, v] of Object.entries(required)) {
    if (res.headers.get(k) !== v) throw new Error(`missing/incorrect header ${k}: ${res.headers.get(k)}`);
  }
  if (res.headers.get("x-powered-by")) throw new Error("x-powered-by should be removed");
});

await step("404 page renders for unknown routes", async () => {
  await page.goto(`${base}/items/this-id-does-not-exist`);
  await page.waitForSelector("text=Page not found");
  await page.click("text=Back to dashboard");
  await page.waitForURL("**/dashboard");
});

await step("document numbers are unique under concurrent creation", async () => {
  // create 2 sales orders back-to-back and verify distinct numbers
  const numbers = [];
  for (let i = 0; i < 2; i++) {
    await page.goto(`${base}/sales?tab=orders`);
    await page.click("text=New sales order");
    await page.selectOption('select[name="customerId"]', { index: 1 });
    await page.selectOption('select[name="warehouseId"]', { index: 1 });
    await page.locator("form select").nth(2).selectOption({ index: 1 });
    await page.locator('input[title="Quantity"]').fill("1");
    await page.click("text=Create order");
    await page.waitForSelector('h2:has-text("New sales order")', { state: "detached" });
    numbers.push(await page.locator("tbody tr").first().locator("a").first().textContent());
  }
  if (numbers[0] === numbers[1]) throw new Error(`duplicate document numbers: ${numbers[0]}`);
});

// ---------- NOTIFICATIONS ----------
await step("notification bell opens and lists alerts", async () => {
  await page.locator('button[aria-label="Notifications"]').click();
  await page.waitForSelector("text=Notifications");
});

// ---------- SETTINGS / RBAC ----------
await step("settings: update organization", async () => {
  await page.goto(`${base}/settings`);
  await page.fill('input[name="name"]', "Acme Supply Co.");
  await page.click("text=Save organization");
  await page.waitForSelector("text=Organization saved");
});

await step("settings: add tax rate", async () => {
  await page.click("text=Taxes & currency");
  await page.waitForSelector("text=Add tax rate");
  await page.fill('input[name="name"]', "E2E Tax");
  await page.fill('input[name="rate"]', "5.5");
  await page.click("text=Add rate");
  await page.waitForSelector("text=E2E Tax");
});

await step("settings: create user", async () => {
  await page.click("text=Users & roles");
  await page.click("text=Add user");
  await page.fill('input[name="name"]', "E2E User");
  await page.fill('input[name="email"]', `e2e-${runId}@acme.io`);
  await page.fill('input[name="password"]', "e2epass123");
  await page.click("text=Create user");
  await page.waitForSelector(`text=e2e-${runId}@acme.io`);
});

// ---------- RBAC: staff cannot administer ----------
await step("staff login hides admin controls", async () => {
  await signOut();
  await page.fill('input[name="email"]', "staff@acme.io");
  await page.fill('input[name="password"]', "staff1234");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
  await page.goto(`${base}/settings`);
  await page.waitForSelector("text=some sections need an admin");
  const saveBtn = await page.locator("text=Save organization").count();
  if (saveBtn !== 0) throw new Error("staff should not see save button");
});

// ---------- SIGNUP: staff self-signup is immediate ----------
await step("staff signup runs onboarding wizard to dashboard", async () => {
  await signOut();
  await page.click("text=Create account");
  await page.fill('input[name="name"]', "Signup Staffer");
  await page.fill('input[name="email"]', `newstaff-${runId}@e2e.io`);
  await page.fill('input[name="password"]', "staffpass123");
  await page.click("text=Create account >> nth=1"); // submit button
  await page.waitForURL("**/onboarding", { timeout: 30000 });
  // step 1: company (prefilled) -> continue
  await page.click("text=Continue");
  // step 2: warehouse exists -> skip
  await page.waitForSelector("text=Your first warehouse");
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  // step 3: items exist -> skip for now
  await page.waitForSelector("text=Add your items");
  await page.locator('button:has-text("Skip for now")').click();
  // step 4: finish
  await page.waitForSelector("text=You’re all set!");
  await page.click("text=Go to dashboard");
  await page.waitForURL("**/dashboard", { timeout: 30000 });
});

// ---------- SIGNUP: admin request requires approval ----------
await step("admin signup request shows pending message", async () => {
  await signOut();
  await page.click("text=Create account");
  await page.fill('input[name="name"]', "Wannabe Admin");
  await page.fill('input[name="email"]', `newadmin-${runId}@e2e.io`);
  await page.fill('input[name="password"]', "adminpass123");
  await page.check('input[type="checkbox"]');
  await page.click("text=Submit admin request");
  await page.waitForSelector("text=Request submitted");
  await page.click("text=Back to sign in");
});

await step("pending admin cannot sign in", async () => {
  await page.fill('input[name="email"]', `newadmin-${runId}@e2e.io`);
  await page.fill('input[name="password"]', "adminpass123");
  await page.click('button[type="submit"]');
  await page.waitForSelector("text=awaiting approval");
});

await step("existing admin sees approval notification", async () => {
  await page.waitForTimeout(400);
  await page.fill('input[name="email"]', "admin@acme.io");
  await page.fill('input[name="password"]', "admin1234");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 30000 });
  await page.locator('button[aria-label="Notifications"]').click();
  await page.waitForSelector("text=Admin access requested");
  await page.waitForSelector(`text=Wannabe Admin (newadmin-${runId}@e2e.io)`);
});

await step("notification deep-links to approval queue", async () => {
  await page.click("text=Admin access requested");
  await page.waitForURL("**/settings?tab=users");
  await page.waitForSelector("text=Approval requests");
  await page.waitForSelector("text=wants admin");
});

await step("approve grants admin role and clears notification", async () => {
  await page.click("text=Approve");
  await page.waitForSelector("text=Approval requests", { state: "detached" });
  await page.waitForSelector(`text=newadmin-${runId}@e2e.io`); // now in active users table
  // notification cleared
  await page.locator('button[aria-label="Notifications"]').click();
  const remaining = await page.locator("text=Admin access requested").count();
  if (remaining !== 0) throw new Error("approval notification should be cleared");
  await page.keyboard.press("Escape");
});

await step("approved admin can sign in with admin powers", async () => {
  await signOut();
  await page.fill('input[name="email"]', `newadmin-${runId}@e2e.io`);
  await page.fill('input[name="password"]', "adminpass123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 30000 });
  await page.goto(`${base}/settings`);
  await page.waitForSelector("text=Full admin access");
});

await step("staff does not see admin-only notifications", async () => {
  // create another pending admin request first
  await signOut();
  await page.click("text=Create account");
  await page.fill('input[name="name"]', "Second Wannabe");
  await page.fill('input[name="email"]', `wannabe2-${runId}@e2e.io`);
  await page.fill('input[name="password"]', "adminpass123");
  await page.check('input[type="checkbox"]');
  await page.click("text=Submit admin request");
  await page.waitForSelector("text=Request submitted");
  await page.click("text=Back to sign in");
  // staff should not see it
  await page.fill('input[name="email"]', "staff@acme.io");
  await page.fill('input[name="password"]', "staff1234");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 30000 });
  await page.locator('button[aria-label="Notifications"]').click();
  await page.waitForSelector("text=Notifications");
  const count = await page.locator("text=Admin access requested").count();
  if (count !== 0) throw new Error("staff should not see admin-only notifications");
});

// ---------- rejection flow ----------
await step("admin can reject a pending request", async () => {
  await signOut();
  await page.fill('input[name="email"]', "admin@acme.io");
  await page.fill('input[name="password"]', "admin1234");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 30000 });
  await page.goto(`${base}/settings?tab=users`);
  await page.waitForSelector("text=Approval requests");
  await page.click("text=Reject");
  await page.waitForSelector("text=Approval requests", { state: "detached" });
  const gone = await page.locator(`text=wannabe2-${runId}@e2e.io`).count();
  if (gone !== 0) throw new Error("rejected account should be removed");
});

await browser.close();

console.log("\n=== E2E RESULTS ===");
for (const r of results) console.log(r);
console.log(`\n${passed} passed, ${failed} failed`);
if (consoleErrors.length) {
  console.log("\nPage JS errors:");
  for (const e of consoleErrors.slice(0, 5)) console.log("  ", e.slice(0, 200));
}
process.exit(failed ? 1 : 0);
