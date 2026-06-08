const { chromium } = require('playwright');

const token = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImNtcHdyNWEzOTAwMDIzdm9wNTJ4a2d6ejAiLCJlbWFpbCI6IjIyMzc2MDg2MDJAcXEuY29tIiwicm9sZSI6IlNVUEVSX0FETUlOIiwic2Vzc2lvbklkIjoidGVzdC1zZXNzaW9uLWlkIiwidXNlciI6eyJpZCI6ImNtcHdyNWEzOTAwMDIzdm9wNTJ4a2d6ejAiLCJlbWFpbCI6IjIyMzc2MDg2MDJAcXEuY29tIiwicm9sZSI6IlNVUEVSX0FETUlOIn0sImV4cGlyZXMiOiIyMDI2LTA2LTE1VDA5OjA5OjA3LjYxOFoiLCJpYXQiOjE3ODA5MDk3NDcsImV4cCI6MTc4MTUxNDU0N30.BwFV7Cwb0u5vGWk5-OTv-CMjPGklc2kRFVqoASKXgXc";

async function run() {
  console.log("Launching system Chrome...");
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      channel: "msedge"
    });
  } catch (err) {
    console.log("Could not find chrome channel, attempting default launch...", err.message);
    browser = await chromium.launch({ headless: true });
  }

  const context = await browser.newContext({
    viewport: { width: 375, height: 667 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai"
  });

  await context.addCookies([{
    name: "session",
    value: token,
    domain: "localhost",
    path: "/",
    httpOnly: true,
    sameSite: "Lax"
  }]);

  const page = await context.newPage();

  const logs = [];
  page.on('console', msg => {
    console.log(`[Browser Console ${msg.type()}] ${msg.text()}`);
    logs.push({ type: 'console', level: msg.type(), text: msg.text() });
  });

  page.on('pageerror', exception => {
    console.log(`[Browser PageError] ${exception.toString()}`);
    logs.push({ type: 'pageerror', text: exception.toString(), stack: exception.stack });
  });

  console.log("Navigating to http://localhost:3000/orders...");
  try {
    await page.goto("http://localhost:3000/orders", { waitUntil: "networkidle" });
    console.log("Navigation completed.");
  } catch (err) {
    console.error("Navigation failed:", err);
  }

  await page.waitForTimeout(3000);

  await page.screenshot({ path: "e:/GitHouse/goods/scratch/hydration_test.png" });
  console.log("Screenshot saved to scratch/hydration_test.png");

  console.log("Attempting to click '全部订单'...");
  const allOrdersTab = page.locator('button', { hasText: '全部订单' });
  if (await allOrdersTab.isVisible()) {
    await allOrdersTab.click();
    console.log("Clicked '全部订单'. Waiting for update...");
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "e:/GitHouse/goods/scratch/after_click_all_orders.png" });
    console.log("Screenshot after click saved to scratch/after_click_all_orders.png");
  } else {
    console.log("WARNING: '全部订单' tab button is not visible!");
  }

  await browser.close();
  console.log("Browser closed. Finished.");
}

run().catch(console.error);
