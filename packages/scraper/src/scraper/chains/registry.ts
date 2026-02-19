import type { TheaterScraper } from './types.js';
import { createCinemaSunshineScraper } from './cinema-sunshine.js';
import { createTohoScraper } from './toho.js';
import { getChainConfig } from './config-loader.js';

type ChainScraperFactory = () => Promise<TheaterScraper>;

const CHAIN_FACTORIES: Record<string, ChainScraperFactory> = {
  cinema_sunshine: createCinemaSunshineScraper,
  toho: createTohoScraper,
};

export async function createChainScraper(chain: string): Promise<TheaterScraper | null> {
  const config = getChainConfig(chain);
  if (!config.enabled) return null;
  const factory = CHAIN_FACTORIES[chain];
  if (!factory) return null;
  return factory();
}

export function getRegisteredChains(): string[] {
  return Object.keys(CHAIN_FACTORIES);
}

export function registerChain(chain: string, factory: ChainScraperFactory): void {
  CHAIN_FACTORIES[chain] = factory;
}
