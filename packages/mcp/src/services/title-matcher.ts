/**
 * タイトルを正規化（曖昧検索用）
 * - 小文字化
 * - 記号・空白を除去（・-/:など）
 * - 全角半角統一
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    // 全角英数字を半角に
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) =>
      String.fromCharCode(s.charCodeAt(0) - 0xfee0)
    )
    // 記号・空白を除去
    .replace(/[\s・\-\/:：〜～「」『』【】（）()!！?？、,。.]+/g, '')
    // ひらがなをカタカナに
    .replace(/[\u3041-\u3096]/g, (s) =>
      String.fromCharCode(s.charCodeAt(0) + 0x60)
    );
}

/**
 * タイトルが一致するか判定（曖昧検索）
 */
export function matchTitle(query: string, movieTitle: string): boolean {
  const normalizedQuery = normalizeTitle(query);
  const normalizedMovie = normalizeTitle(movieTitle);

  return (
    normalizedMovie.includes(normalizedQuery) ||
    normalizedQuery.includes(normalizedMovie)
  );
}
