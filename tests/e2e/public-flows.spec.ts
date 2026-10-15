import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Flows that do not need Firebase: they run against the built app without credentials.
 * The real Google sign-in needs the Firebase Auth emulator (Java + Firebase CLI) and is a pending gap.
 */
test.describe("login screen", () => {
  test("shows the sign-in card in Spanish", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { level: 1, name: "Únete a la misión" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeEnabled();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
  });

  test("does not overflow horizontally", async ({ page }) => {
    await page.goto("/login");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("keeps touch targets at 44px or more", async ({ page }) => {
    await page.goto("/login");

    const box = await page.getByRole("button", { name: "Continuar con Google" }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test("has no accessibility violations, including real color contrast", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("heading", { level: 1 }).waitFor();

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });

  test("uses the Design System dark palette", async ({ page }) => {
    await page.goto("/login");

    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).toBe("rgb(10, 15, 36)"); // #0a0f24
  });
});

test.describe("protected routes without a session", () => {
  for (const path of ["/dashboard", "/onboarding", "/squad", "/staff", "/scan", "/pass", "/map", "/missions", "/odyssey", "/achievements", "/minigame/ai-quiz", "/red", "/escenario", "/staff/serve/lunch-1", "/admin", "/admin/team", "/admin/qr", "/admin/qr/talk-keynote", "/admin/puestos", "/admin/charlas", "/admin/charlas/nueva", "/admin/misiones", "/admin/mapa", "/admin/rangos", "/admin/odisea", "/admin/economia", "/admin/creditos-escuadron", "/admin/logros", "/admin/minijuegos", "/admin/escenario", "/admin/sorteo", "/admin/logros/nueva", "/admin/logros/primer-salto", "/admin/odisea/nueva", "/admin/odisea/ai-senal", "/admin/mapa/plano", "/admin/mapa/cuadrantes/nuevo", "/admin/mapa/cuadrantes/ai", "/admin/misiones/nueva", "/admin/misiones/sugerir", "/admin/misiones/ai-quiz", "/admin/escuadrones", "/admin/escuadrones/nuevo", "/admin/escuadrones/gemini", "/admin/evento"]) {
    test(`${path} sends the visitor to /login`, async ({ page }) => {
      await page.goto(path);

      await expect(page).toHaveURL(/\/login$/);
    });
  }

  test("the root ends on /login", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/login$/);
  });

  test("a stale session cookie ends on /login without a redirect loop", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "__session", value: "garbage", url: baseURL! }]);

    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeVisible();
  });
});

test.describe("system pages", () => {
  test("an unknown route shows the not-found page with a way home", async ({ page }) => {
    const response = await page.goto("/no-such-planet");

    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Este planeta no existe" })).toBeVisible();
    await page.getByRole("link", { name: "Volver al inicio" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
