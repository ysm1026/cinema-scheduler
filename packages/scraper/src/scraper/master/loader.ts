import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface TheaterEntry {
  enabled: boolean;
  chain: string;
  name: string;
  code: string;
  note: string;
}

function parseCsvLine(line: string): string[] {
  return line.split(',');
}

export function loadTheaterMaster(csvPath?: string): TheaterEntry[] {
  const path = csvPath ?? join(__dirname, '../../config/theaters.csv');
  const content = readFileSync(path, 'utf-8');
  const lines = content.trim().split('\n');
  const dataLines = lines.slice(1);

  return (dataLines as string[])
    .map((line: string) => {
      const fields = parseCsvLine(line);
      return {
        enabled: fields[0] === '1',
        chain: fields[1] ?? '',
        name: fields[2] ?? '',
        code: fields[3] ?? '',
        note: fields[4] ?? '',
      };
    })
    .filter((entry: TheaterEntry) => entry.name !== '');
}

export function getEnabledTheaters(chain?: string, csvPath?: string): TheaterEntry[] {
  const all = loadTheaterMaster(csvPath);
  return all.filter((entry) => {
    if (!entry.enabled) return false;
    if (chain !== undefined && entry.chain !== chain) return false;
    return true;
  });
}

export function getChainNames(csvPath?: string): string[] {
  const all = loadTheaterMaster(csvPath);
  return [...new Set(all.map((entry) => entry.chain))];
}
