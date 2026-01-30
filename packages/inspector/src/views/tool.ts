import { html } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import { layout } from './layout.js';

type HtmlContent = HtmlEscapedString | Promise<HtmlEscapedString>;

interface ToolSchema {
  name: string;
  description: string;
  inputSchema: {
    properties: Record<
      string,
      {
        type: string;
        description?: string;
        enum?: string[];
        default?: unknown;
      }
    >;
    required?: string[];
  };
}

/**
 * ツール実行画面
 */
export function toolPage(
  tool: ToolSchema,
  result?: { request: unknown; response: unknown; error?: string }
): HtmlContent {
  const properties = tool.inputSchema.properties;
  const required = tool.inputSchema.required ?? [];

  const content = html`
    <div class="card">
      <h2>${tool.name}</h2>
      <p style="color: #6b7280; margin-bottom: 20px;">${tool.description}</p>

      <form method="POST" action="/tools/${tool.name}/execute">
        ${Object.entries(properties).map(([name, schema]) => {
          const isRequired = required.includes(name);
          const inputType =
            schema.type === 'number' || schema.type === 'integer'
              ? 'number'
              : schema.type === 'boolean'
                ? 'checkbox'
                : 'text';

          return html`
            <div class="form-group">
              <label for="${name}">
                ${name}${isRequired ? ' *' : ''}
                ${schema.description
                  ? html`<span style="font-weight: normal; color: #6b7280;">
                      - ${schema.description}
                    </span>`
                  : ''}
              </label>
              ${schema.enum
                ? html`
                    <select name="${name}" id="${name}" ${isRequired ? 'required' : ''}>
                      <option value="">Select...</option>
                      ${schema.enum.map(
                        (v) => html`<option value="${v}">${v}</option>`
                      )}
                    </select>
                  `
                : schema.type === 'boolean'
                  ? html`
                      <input
                        type="checkbox"
                        name="${name}"
                        id="${name}"
                        value="true"
                        ${schema.default === true ? 'checked' : ''}
                      />
                    `
                  : schema.type === 'array'
                    ? html`
                        <textarea
                          name="${name}"
                          id="${name}"
                          rows="3"
                          placeholder="値1, 値2, 値3（カンマ区切り）"
                          ${isRequired ? 'required' : ''}
                        ></textarea>
                      `
                    : schema.type === 'object'
                      ? html`
                          <textarea
                            name="${name}"
                            id="${name}"
                            rows="3"
                            placeholder='{"key": "value"}（JSON形式）'
                            ${isRequired ? 'required' : ''}
                          ></textarea>
                        `
                      : html`
                          <input
                            type="${inputType}"
                            name="${name}"
                            id="${name}"
                            placeholder="${schema.default !== undefined ? String(schema.default) : ''}"
                            ${isRequired ? 'required' : ''}
                          />
                        `}
            </div>
          `;
        })}

        <div style="display: flex; gap: 10px;">
          <button type="submit" class="btn">Execute</button>
          <a href="/tools" class="btn btn-secondary">Back to Tools</a>
        </div>
      </form>
    </div>

    ${result
      ? html`
          <div class="grid grid-2">
            <div class="card">
              <h2>Request</h2>
              <pre>${JSON.stringify(result.request, null, 2)}</pre>
            </div>

            <div class="card">
              <h2>Response</h2>
              ${result.error
                ? html`<p class="status-error">${result.error}</p>`
                : ''}
              <pre>${JSON.stringify(result.response, null, 2)}</pre>
            </div>
          </div>
        `
      : ''}
  `;

  return layout(tool.name, content);
}

/**
 * ツール一覧画面
 */
export function toolsListPage(
  tools: Array<{ name: string; description: string }>
): HtmlContent {
  const content = html`
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
  `;

  return layout('Tools', content);
}
