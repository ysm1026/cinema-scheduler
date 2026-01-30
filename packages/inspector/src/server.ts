#!/usr/bin/env node

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { getMcpClient, closeMcpClient } from './mcp-client.js';
import { historyService } from './services/history-service.js';
import { homePage } from './views/home.js';
import { toolPage, toolsListPage } from './views/tool.js';
import { historyPage } from './views/history.js';

const app = new Hono();

// ホーム画面
app.get('/', async (c) => {
  try {
    const client = await getMcpClient();
    const tools = client.getTools();

    // データステータスを取得
    let status = {
      lastScrape: null as string | null,
      areaCount: 0,
      theaterCount: 0,
      movieCount: 0,
      showtimeCount: 0,
      dateRange: { from: null as string | null, to: null as string | null },
    };

    try {
      const result = await client.callTool('get_data_status', {});
      if (result.content[0]?.text) {
        const data = JSON.parse(result.content[0].text);
        status = {
          lastScrape: data.lastScrape,
          areaCount: data.areaCount ?? 0,
          theaterCount: data.theaterCount ?? 0,
          movieCount: data.movieCount ?? 0,
          showtimeCount: data.showtimeCount ?? 0,
          dateRange: data.dateRange ?? { from: null, to: null },
        };
      }
    } catch {
      // ステータス取得失敗時はデフォルト値を使用
    }

    const html = homePage(
      status,
      tools.map((t) => ({ name: t.name, description: t.description }))
    );
    return c.html(html);
  } catch (error) {
    return c.html(`
      <h1>Error</h1>
      <p>Failed to connect to MCP server: ${error instanceof Error ? error.message : String(error)}</p>
      <p>Make sure the MCP server is built and the database exists.</p>
    `);
  }
});

// ツール一覧画面
app.get('/tools', async (c) => {
  try {
    const client = await getMcpClient();
    const tools = client.getTools();

    const html = toolsListPage(
      tools.map((t) => ({ name: t.name, description: t.description }))
    );
    return c.html(html);
  } catch (error) {
    return c.text(`Error: ${error instanceof Error ? error.message : String(error)}`, 500);
  }
});

// ツール詳細画面
app.get('/tools/:name', async (c) => {
  try {
    const client = await getMcpClient();
    const toolName = c.req.param('name');
    const tool = client.getTool(toolName);

    if (!tool) {
      return c.text('Tool not found', 404);
    }

    // replayパラメータがある場合は履歴からリクエストを取得
    const replayId = c.req.query('replay');
    let result: { request: unknown; response: unknown; error?: string } | undefined;

    if (replayId) {
      const historyEntry = historyService.getById(replayId);
      if (historyEntry) {
        result = {
          request: historyEntry.request,
          response: historyEntry.response,
          ...(historyEntry.error && { error: historyEntry.error }),
        };
      }
    }

    const html = toolPage(
      {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as {
          properties: Record<
            string,
            { type: string; description?: string; enum?: string[]; default?: unknown }
          >;
          required?: string[];
        },
      },
      result
    );
    return c.html(html);
  } catch (error) {
    return c.text(`Error: ${error instanceof Error ? error.message : String(error)}`, 500);
  }
});

// ツール実行
app.post('/tools/:name/execute', async (c) => {
  try {
    const client = await getMcpClient();
    const toolName = c.req.param('name');
    const tool = client.getTool(toolName);

    if (!tool) {
      return c.text('Tool not found', 404);
    }

    // フォームデータを取得
    const formData = await c.req.parseBody();
    const args: Record<string, unknown> = {};

    // フォームデータをツールの引数に変換
    for (const [key, value] of Object.entries(formData)) {
      if (value === '' || value === undefined) continue;

      const schema = tool.inputSchema.properties[key] as { type?: string } | undefined;
      if (!schema) continue;

      if (schema.type === 'number' || schema.type === 'integer') {
        args[key] = Number(value);
      } else if (schema.type === 'boolean') {
        args[key] = value === 'true';
      } else if (schema.type === 'array') {
        // カンマ区切りの文字列を配列に変換
        args[key] = String(value)
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      } else if (schema.type === 'object') {
        try {
          args[key] = JSON.parse(String(value));
        } catch {
          args[key] = value;
        }
      } else {
        args[key] = value;
      }
    }

    // ツールを実行
    let response: unknown;
    let error: string | undefined;

    try {
      const result = await client.callTool(toolName, args);
      if (result.content[0]?.text) {
        try {
          response = JSON.parse(result.content[0].text);
        } catch {
          response = result.content[0].text;
        }
      } else {
        response = result;
      }
      if (result.isError) {
        error = 'Tool returned an error';
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      response = { error };
    }

    // 履歴に追加
    historyService.add(toolName, args, response, error);

    // 結果を表示
    const html = toolPage(
      {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as {
          properties: Record<
            string,
            { type: string; description?: string; enum?: string[]; default?: unknown }
          >;
          required?: string[];
        },
      },
      { request: args, response, ...(error && { error }) }
    );
    return c.html(html);
  } catch (error) {
    return c.text(`Error: ${error instanceof Error ? error.message : String(error)}`, 500);
  }
});

// 履歴画面
app.get('/history', (c) => {
  const entries = historyService.getAll();
  const html = historyPage(entries);
  return c.html(html);
});

// 履歴クリア
app.post('/history/clear', (c) => {
  historyService.clear();
  return c.redirect('/history');
});

// サーバー起動
const port = Number(process.env.PORT) || 3001;

console.log(`Starting Cinema Scheduler Inspector on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});

// クリーンアップ
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await closeMcpClient();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeMcpClient();
  process.exit(0);
});
