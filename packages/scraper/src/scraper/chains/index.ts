export { createCinemaSunshineScraper } from './cinema-sunshine.js';
export { createTohoScraper } from './toho.js';
export { createChainScraper, getRegisteredChains, registerChain } from './registry.js';
export { getChainConfig, getScrapeDates, loadScraperConfig, clearConfigCache } from './config-loader.js';
export type { ChainConfig, ScraperConfig } from './config-loader.js';
export type {
  TheaterScraper,
  ChainScraper,
  ChainScrapedShowtime,
  ChainShowtime,
  ScrapeOptions as ChainScrapeOptions,
  ScrapeError as ChainScrapeError,
  OnProgressCallback as ChainProgressCallback,
} from './types.js';
