import { expect, test } from '@playwright/test';
import { setupSettingsFixture } from './settings-fixture';

for (const language of ['zh', 'en']) {
    test(`model pricing sync and manual override (${language})`, async ({ page }) => {
        await page.addInitScript({
            content: `(${setupSettingsFixture.toString()})(${JSON.stringify({ language })});`,
        });
        await page.goto('/settings');
        await page.getByRole('tab', { name: language === 'zh' ? '配额与模型' : 'Quota & Models', exact: true }).click();

        const section = page.locator('section[aria-labelledby="model-pricing-settings-title"]');
        await expect(section).toBeVisible();

        // Trigger manual sync from models.dev
        await section.getByRole('button', { name: language === 'zh' ? '立即同步' : 'Sync Now' }).click();
        await expect.poll(async () => page.evaluate(() =>
            (window as any).__settingsFixture.calls.some((c: any) => c.command === 'sync_api_pricing'),
        )).toBe(true);

        // Add manual model price (input, output, cache read)
        await section.getByPlaceholder(language === 'zh' ? '如 gemini-2.5-flash 或自定义模型' : 'e.g. gemini-2.5-flash or custom model').fill('custom-test-model');
        await section.getByPlaceholder('0.30').fill('1.25');
        await section.getByPlaceholder('2.50').fill('5.5');
        await section.getByPlaceholder('0.03').fill('0.15');
        await section.getByRole('button', { name: language === 'zh' ? '保存' : 'Save' }).click();

        const table = section.getByRole('table');
        await expect(table).toContainText('custom-test-model');
        await expect(table).toContainText('$1.25');
        await expect(table).toContainText('$5.5');
        await expect(table).toContainText('$0.15');

        // Verify persisted in config
        await expect.poll(async () => page.evaluate(() => (window as any).__settingsFixture.general().model_pricing?.manual_prices)).toEqual([
            { model: 'custom-test-model', input: 1.25, output: 5.5, cached: 0.15 },
        ]);

        // Toggle auto sync off
        await section.getByRole('checkbox', { name: language === 'zh' ? '自动同步' : 'Auto-sync' }).uncheck();
        await expect.poll(async () => page.evaluate(() => (window as any).__settingsFixture.general().model_pricing?.auto_sync_models_dev)).toBe(false);

        // Delete manual price
        await section.getByRole('button', { name: language === 'zh' ? '删除 custom-test-model 的手动价格' : 'Delete manual price for custom-test-model' }).click();
        await expect(table).toHaveCount(0);
    });
}
