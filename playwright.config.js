// Browser tests: npx playwright install chromium (once), then npm test. No internet needed: every source answers from tests/web-fixtures.
const { defineConfig } = require('@playwright/test');
const PORT = 42051;
module.exports = defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.js/,
  timeout: 90000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:' + PORT + '/', launchOptions: process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME, args: ['--no-sandbox'] } : {} },
  webServer: { command: 'node tools/serve.js ' + PORT, url: 'http://127.0.0.1:' + PORT + '/index.html', reuseExistingServer: false }
});
