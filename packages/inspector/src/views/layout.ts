import { html } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';

type HtmlContent = HtmlEscapedString | Promise<HtmlEscapedString>;

/**
 * HTMLレイアウトテンプレート
 */
export function layout(title: string, content: HtmlContent): HtmlContent {
  return html`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Cinema Scheduler Inspector</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    header {
      background: #2563eb;
      color: white;
      padding: 15px 0;
      margin-bottom: 20px;
    }
    header .container {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    header h1 {
      font-size: 1.5rem;
    }
    header nav a {
      color: white;
      text-decoration: none;
      margin-left: 20px;
    }
    header nav a:hover {
      text-decoration: underline;
    }
    .card {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      padding: 20px;
      margin-bottom: 20px;
    }
    .card h2 {
      margin-bottom: 15px;
      color: #1e40af;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 10px;
    }
    .btn {
      display: inline-block;
      padding: 8px 16px;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      text-decoration: none;
      font-size: 14px;
    }
    .btn:hover {
      background: #1d4ed8;
    }
    .btn-secondary {
      background: #6b7280;
    }
    .btn-secondary:hover {
      background: #4b5563;
    }
    .form-group {
      margin-bottom: 15px;
    }
    .form-group label {
      display: block;
      margin-bottom: 5px;
      font-weight: 500;
    }
    .form-group input,
    .form-group select,
    .form-group textarea {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      font-size: 14px;
    }
    .form-group input:focus,
    .form-group select:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
    }
    pre {
      background: #1f2937;
      color: #e5e7eb;
      padding: 15px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 13px;
      line-height: 1.5;
    }
    .grid {
      display: grid;
      gap: 20px;
    }
    .grid-2 {
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    }
    .status-ok {
      color: #059669;
    }
    .status-error {
      color: #dc2626;
    }
    .tool-list {
      list-style: none;
    }
    .tool-list li {
      padding: 10px;
      border-bottom: 1px solid #e5e7eb;
    }
    .tool-list li:last-child {
      border-bottom: none;
    }
    .tool-list a {
      color: #2563eb;
      text-decoration: none;
      font-weight: 500;
    }
    .tool-list a:hover {
      text-decoration: underline;
    }
    .tool-list .description {
      color: #6b7280;
      font-size: 14px;
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <header>
    <div class="container">
      <h1>Cinema Scheduler Inspector</h1>
      <nav>
        <a href="/">Home</a>
        <a href="/tools">Tools</a>
        <a href="/history">History</a>
      </nav>
    </div>
  </header>
  <main class="container">
    ${content}
  </main>
</body>
</html>`;
}
