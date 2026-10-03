import { defineConfig, devices } from '@playwright/test';

const iphone = (name: string) => ({ ...devices[name], browserName: 'chromium' as const, defaultBrowserType: 'chromium' as const });

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4173/chess-coach/', trace: 'retain-on-failure' },
  projects: [
    { name: 'iphone-se', use: iphone('iPhone SE') },
    { name: 'iphone-14', use: iphone('iPhone 14') },
    { name: 'iphone-15-pro-max', use: iphone('iPhone 15 Pro Max') },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/chess-coach/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
