import { html } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import { layout } from './layout.js';

type HtmlContent = HtmlEscapedString | Promise<HtmlEscapedString>;

interface HistoryEntry {
  id: string;
  toolName: string;
  timestamp: string;
  request: unknown;
  response: unknown;
  error?: string;
}

/**
 * 履歴画面
 */
export function historyPage(entries: HistoryEntry[]): HtmlContent {
  const content = html`
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <h2 style="margin-bottom: 0; border-bottom: none; padding-bottom: 0;">Request History</h2>
        ${entries.length > 0
          ? html`
              <form method="POST" action="/history/clear" style="margin: 0;">
                <button type="submit" class="btn btn-secondary">Clear All</button>
              </form>
            `
          : ''}
      </div>

      ${entries.length === 0
        ? html`<p style="color: #6b7280;">No history yet. Execute some tools to see history here.</p>`
        : html`
            <div style="display: flex; flex-direction: column; gap: 15px;">
              ${entries.map(
                (entry) => html`
                  <div
                    style="border: 1px solid #e5e7eb; border-radius: 4px; padding: 15px;"
                  >
                    <div
                      style="display: flex; justify-content: space-between; margin-bottom: 10px;"
                    >
                      <span>
                        <strong>${entry.toolName}</strong>
                        ${entry.error
                          ? html`<span class="status-error"> (Error)</span>`
                          : ''}
                      </span>
                      <span style="color: #6b7280; font-size: 14px;">
                        ${entry.timestamp}
                      </span>
                    </div>
                    <details>
                      <summary style="cursor: pointer; color: #2563eb;">
                        Show details
                      </summary>
                      <div style="margin-top: 10px;">
                        <div style="margin-bottom: 10px;">
                          <strong>Request:</strong>
                          <pre style="margin-top: 5px;">${JSON.stringify(entry.request, null, 2)}</pre>
                        </div>
                        <div>
                          <strong>Response:</strong>
                          <pre style="margin-top: 5px;">${JSON.stringify(entry.response, null, 2)}</pre>
                        </div>
                      </div>
                    </details>
                    <div style="margin-top: 10px;">
                      <a href="/tools/${entry.toolName}?replay=${entry.id}" class="btn">
                        Replay
                      </a>
                    </div>
                  </div>
                `
              )}
            </div>
          `}
    </div>
  `;

  return layout('History', content);
}
