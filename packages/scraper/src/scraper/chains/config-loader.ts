import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ChainConfig {
  scrape_days: number;
  enabled: boolean;
}

export interface ScraperConfig {
  chains: Record<string, ChainConfig>;
  defaults: ChainConfig;
}

let cachedConfig: ScraperConfig | null = null;
let cachedConfigPath: string | null = null;

export function loadScraperConfig(configPath?: string): ScraperConfig {
  const path = configPath ?? join(__dirname, '../../config/scraper.yaml');

  if (cachedConfig && cachedConfigPath === path) {
    return cachedConfig;
  }

  const content = readFileSync(path, 'utf-8');
  const raw = parse(content) as {
    chains?: Record<string, Partial<ChainConfig>>;
    defaults?: Partial<ChainConfig>;
  };

  const defaults: ChainConfig = {
    scrape_days: raw.defaults?.scrape_days ?? 3,
    enabled: raw.defaults?.enabled ?? true,
  };

  const chains: Record<string, ChainConfig> = {};
  if (raw.chains) {
    for (const [chain, cfg] of Object.entries(raw.chains)) {
      chains[chain] = {
        scrape_days: cfg?.scrape_days ?? defaults.scrape_days,
        enabled: cfg?.enabled ?? defaults.enabled,
      };
    }
  }

  cachedConfig = { chains, defaults };
  cachedConfigPath = path;
  return cachedConfig;
}

export function getChainConfig(chain: string, configPath?: string): ChainConfig {
  const config = loadScraperConfig(configPath);
  return config.chains[chain] ?? config.defaults;
}

export function getScrapeDates(chain: string, configPath?: string): Date[] {
  const { scrape_days } = getChainConfig(chain, configPath);
  const dates: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < scrape_days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dates.push(d);
  }

  return dates;
}

export function clearConfigCache(): void {
  cachedConfig = null;
  cachedConfigPath = null;
}
