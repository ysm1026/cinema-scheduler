import { html } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import { layout } from './layout.js';

type HtmlContent = HtmlEscapedString | Promise<HtmlEscapedString>;

interface DataStatus {
  lastScrape: string | null;
  areaCount: number;
  theaterCount: number;
  movieCount: number;
  showtimeCount: number;
  dateRange: { from: string | null; to: string | null };
}

interface Tool {
  name: string;
  description: string;
}

/**
 * ホーム画面
 */
export function homePage(status: DataStatus, tools: Tool[]): HtmlContent {
  const content = html`
    <div class="grid grid-2">
      <div class="card">
        <h2>Data Status</h2>
        <table style="width: 100%;">
          <tr>
            <td>Last Scrape</td>
            <td class="${status.lastScrape ? 'status-ok' : 'status-error'}">
              ${status.lastScrape ?? 'No data'}
            </td>
          </tr>
          <tr>
            <td>Areas</td>
            <td>${status.areaCount}</td>
          </tr>
          <tr>
            <td>Theaters</td>
            <td>${status.theaterCount}</td>
          </tr>
          <tr>
            <td>Movies</td>
            <td>${status.movieCount}</td>
          </tr>
          <tr>
            <td>Showtimes</td>
            <td>${status.showtimeCount}</td>
          </tr>
          <tr>
            <td>Date Range</td>
            <td>
              ${status.dateRange.from ?? '-'} ~ ${status.dateRange.to ?? '-'}
            </td>
          </tr>
        </table>
      </div>

      <div class="card">
        <h2>Available Tools</h2>
        <ul class="tool-list">
          ${tools.map(
            (tool) => html`
              <li>
                <a href="/tools/${tool.name}">${tool.name}</a>
                <div class="description">${tool.description}</div>
              </li>
            `
          )}
        </ul>
      </div>
    </div>

    <div class="card">
      <h2>Quick Actions</h2>
      <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        <a href="/tools/get_showtimes" class="btn">Search Showtimes</a>
        <a href="/tools/list_movies" class="btn">List Movies</a>
        <a href="/tools/optimize_schedule" class="btn">Optimize Schedule</a>
      </div>
    </div>
  `;

  return layout('Home', content);
}
