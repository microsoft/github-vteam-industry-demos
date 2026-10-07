import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

const origin = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";
const deployedPublicDemo = Boolean(
  process.env.PLAYWRIGHT_BASE_URL && !process.env.PLAYWRIGHT_BASE_URL.startsWith("http://127.0.0.1"),
);
const widths = [320, 360, 375, 768, 1024, 1280, 1440];
const readinessPaths = [
  "/health/ready",
  "/api/v1/bootstrap",
  "/api/v1/overview",
  "/api/v1/actions",
  "/api/v1/system/status",
];
const diagnosticsByPage = new WeakMap<Page, {
  console: string[];
  failedRequests: string[];
  errorResponses: string[];
}>();

const mutationRequestHeaders = {
  Origin: origin,
  "Sec-Fetch-Site": "same-origin",
  "Content-Type": "application/json",
};

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  const diagnostics = {
    console: [] as string[],
    failedRequests: [] as string[],
    errorResponses: [] as string[],
  };
  diagnosticsByPage.set(page, diagnostics);
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      diagnostics.console.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("requestfailed", (request) => {
    diagnostics.failedRequests.push(
      `${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "unknown failure"}`,
    );
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      diagnostics.errorResponses.push(
        `${response.status()} ${response.request().method()} ${response.url()}`,
      );
    }
  });
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  const body = await page.locator("body").innerText().catch(() => "Body was unavailable.");
  await testInfo.attach("application-diagnostics", {
    body: JSON.stringify({ ...diagnosticsByPage.get(page), body }, null, 2),
    contentType: "application/json",
  });
});

function etag(headers: Record<string, string>): string {
  const value = headers.etag;
  expect(value).toBeTruthy();
  return value!;
}

async function expectApiReady(
  request: APIRequestContext,
  paths: readonly string[] = readinessPaths,
) {
  for (const path of paths) {
    await expect.poll(
      async () => {
        try {
          return (await request.get(path, { timeout: 15_000 })).status();
        } catch {
          return 0;
        }
      },
      { message: `Expected ${path} to be ready`, timeout: 30_000 },
    ).toBe(200);
  }
}

async function expectApplicationReady(page: Page) {
  await expect(page.locator('[data-app-state="ready"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[aria-label="Loading content"]')).toHaveCount(0);
}

async function resetForSetup(request: APIRequestContext) {
  await expectApiReady(request);
  const bootstrap = await request.get("/api/v1/bootstrap");
  const response = await request.post("/api/v1/demo/reset", {
    headers: {
      ...mutationRequestHeaders,
      "If-Match": etag(bootstrap.headers()),
      "Idempotency-Key": `browser-setup-${crypto.randomUUID()}`,
    },
    data: { reason: "Restore browser test scenario." },
  });
  expect(response.status()).toBe(200);
}

async function expectUsableControl(control: Locator, page: Page) {
  await expect(control).toBeVisible({ timeout: 30_000 });
  await expect(control).toBeEnabled({ timeout: 30_000 });
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeInViewport();
  await control.focus();
  await expect(control).toBeFocused();
  expect(await control.evaluate((element) => element.tabIndex)).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate(() => document.activeElement?.tagName)).toMatch(/BUTTON|INPUT|SELECT/);
}

async function expectNavigationUsable(page: Page) {
  for (const name of ["Overview", "Workspace", "History"]) {
    await expectUsableControl(page.getByRole("button", { name }), page);
  }
}

async function openHero(page: Page) {
  const heroRow = page
    .getByRole("row")
    .filter({ hasText: "HL-KNT-EVD-FGN-M" })
    .filter({ hasText: "Dublin Grafton Street" });
  await expect(heroRow).toContainText("12 units", { timeout: 30_000 });
  await expect(heroRow).toContainText("1.5d");
  const investigate = heroRow.getByRole("button", { name: "Investigate" });
  await expectUsableControl(investigate, page);
  await investigate.click();
  await expect(
    page.getByRole("heading", { name: "Everyday Knit — Forest Green — Size M" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("12 available · 8/day demand")).toBeVisible();
  const corkOption = page.locator(".option-card").filter({ hasText: "Cork Patrick Street" });
  await expect(corkOption).toContainText("32");
  await expect(corkOption).toContainText("12.0d");
  return corkOption;
}

async function confirmResetThroughUi(page: Page) {
  await page.getByRole("button", { name: "History" }).click();
  const reset = page.getByRole("button", { name: "Reset shared demo state" });
  await expectUsableControl(reset, page);
  await reset.click();
  await expect(page.getByText("Clear shared synthetic actions and audit history?")).toBeVisible();
  await expect(page.getByText("This affects every visitor")).toBeVisible();
  const confirm = page.getByRole("button", { name: "Confirm shared reset" });
  await expectUsableControl(confirm, page);
  await confirm.click();
  await expect(page.getByRole("heading", { name: "Availability exceptions" })).toBeVisible();
}

async function expectNoDocumentOverflow(page: Page) {
  await expect.poll(() =>
    page.evaluate(
      () => document.documentElement.scrollWidth === document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

test("uses visible keyboard controls for reject and approve branches", async ({ page, request }) => {
  await resetForSetup(request);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expectApplicationReady(page);

  await expect(page.getByText("Public synthetic demo — no sign-in")).toBeVisible();
  if (deployedPublicDemo) {
    await expect(page.getByText("Anonymous Public Demo Actor (synthetic)")).toBeVisible();
  }
  expect(await page.context().cookies()).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);

  let corkOption = await openHero(page);
  const investigationCard = page
    .locator(".ai-card")
    .filter({ hasText: "Inventory Investigation" });
  const investigateAi = investigationCard.getByRole("button", { name: "Run AI" });
  await expectUsableControl(investigateAi, page);
  await investigateAi.click();
  await expect(investigationCard.locator(".status-chip, .inline-error")).toBeVisible({
    timeout: 30_000,
  });
  await expect(investigationCard.getByRole("button")).toBeEnabled();
  await expectApiReady(request, ["/health/ready", "/api/v1/actions"]);

  const proposal = corkOption.getByRole("button", { name: "Simulate proposal" });
  await expectUsableControl(proposal, page);
  await proposal.click();
  await expect(page.getByText("Approval or rejection remains a separate explicit step.")).toBeVisible();

  const rejection = page.getByRole("button", { name: "Simulate rejection" });
  await expectUsableControl(rejection, page);
  await rejection.click();
  await expect(page.getByText("Reset required")).toBeVisible();
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.locator(".status-chip", { hasText: "rejected" })).toBeVisible();
  await expect(page.getByText("SIMULATED", { exact: true })).toBeVisible();
  await confirmResetThroughUi(page);

  corkOption = await openHero(page);
  const secondProposal = corkOption.getByRole("button", { name: "Simulate proposal" });
  await expectUsableControl(secondProposal, page);
  await secondProposal.click();

  const approval = page.getByRole("button", { name: "Simulate approval" });
  await expectUsableControl(approval, page);
  await approval.click();
  await expect(page.getByText("Mitigation scheduled", { exact: true })).toBeVisible();
  await expect(page.getByText("Approval reserves stock. It is not dispatch or receipt.")).toBeVisible();
  await expect(page.locator(".status-chip", { hasText: "approved" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Simulate receipt" })).toHaveCount(0);

  const dispatch = page.getByRole("button", { name: "Simulate dispatch" });
  await expectUsableControl(dispatch, page);
  await dispatch.click();
  const receipt = page.getByRole("button", { name: "Simulate receipt" });
  await expectUsableControl(receipt, page);
  await receipt.click();

  await page.getByRole("button", { name: "History" }).click();
  await expect(page.locator(".status-chip", { hasText: "received" })).toBeVisible();
  await expect(page.locator(".timeline li")).toHaveCount(4);
  if (deployedPublicDemo) {
    await expect(
      page.getByText("Anonymous public demo simulated planner approval; mitigation scheduled and stock reserved."),
    ).toBeVisible();
    await expect(page.getByText("unauthenticated synthetic actor").first()).toBeVisible();
  }
  await confirmResetThroughUi(page);
});

test("has no document overflow on every page at the demo width matrix", async ({
  page,
  request,
}) => {
  await resetForSetup(request);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expectApplicationReady(page);
    await expect(page.getByRole("heading", { name: "Availability exceptions" })).toBeVisible();
    const tableScroll = page.locator(".table-scroll");
    await expect(tableScroll).toBeVisible({ timeout: 30_000 });

    await expectNoDocumentOverflow(page);
    await expectNavigationUsable(page);
    for (const name of ["Store", "Category", "Risk", "Minimum exposure"]) {
      await expectUsableControl(page.getByLabel(name), page);
    }
    const tableBounds = await tableScroll.boundingBox();
    expect(tableBounds).not.toBeNull();
    expect(tableBounds!.x).toBeGreaterThanOrEqual(0);
    expect(tableBounds!.x + tableBounds!.width).toBeLessThanOrEqual(width);
    if (width < 1040) {
      expect(await tableScroll.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    }

    await openHero(page);
    await expectNavigationUsable(page);
    const runAiControls = page.getByRole("button", { name: "Run AI" });
    for (let index = 0; index < await runAiControls.count(); index += 1) {
      await expectUsableControl(runAiControls.nth(index), page);
    }
    await expectUsableControl(page.getByRole("button", { name: "Simulate proposal" }), page);
    await expectNoDocumentOverflow(page);
    await page.getByRole("button", { name: "History" }).click();
    await expect(page.getByRole("heading", { name: "Action history" })).toBeVisible();
    await expectNavigationUsable(page);
    await expectUsableControl(page.getByRole("button", { name: "Reset shared demo state" }), page);
    await expectNoDocumentOverflow(page);

    for (const name of ["Overview", "Workspace", "History"]) {
      const navigation = page.getByRole("button", { name });
      await expect(navigation).toBeVisible();
      const bounds = await navigation.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    }
  }
});
