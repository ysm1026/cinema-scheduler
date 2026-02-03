import type { ShowtimeFormat, AudioType } from '@cinema-scheduler/shared';

/**
 * Premium format detection patterns
 */
const PREMIUM_FORMAT_PATTERNS: Array<{ pattern: RegExp; format: ShowtimeFormat }> = [
  { pattern: /IMAX[^レ]*レーザー|IMAXレーザー/i, format: 'IMAX' },
  { pattern: /IMAX/i, format: 'IMAX' },
  { pattern: /ドルビーシネマ|Dolby\s*Cinema/i, format: 'DOLBY_CINEMA' },
  { pattern: /ドルビーアトモス|Dolby\s*Atmos/i, format: 'DOLBY_ATMOS' },
  { pattern: /SCREEN\s*X/i, format: 'SCREENX' },
  { pattern: /4DX|4D/i, format: '4DX' },
  { pattern: /MX4D/i, format: '4DX' },
  { pattern: /轟音|GOOON|GOUON/i, format: 'GOOON' },
  { pattern: /TCX|TOHO\s*CINEMAS\s*eXtra/i, format: 'TCX' },
];

/**
 * Detects premium format from text
 */
export function detectPremiumFormat(text: string): ShowtimeFormat {
  for (const { pattern, format } of PREMIUM_FORMAT_PATTERNS) {
    if (pattern.test(text)) {
      return format;
    }
  }
  return null;
}

/**
 * Detects audio type (subtitled/dubbed) from text
 */
export function detectAudioType(text: string): AudioType {
  // 字幕版の検出
  if (/字幕|subtitled/i.test(text)) {
    return 'subtitled';
  }
  // 吹替版の検出
  if (/吹替|吹き替え|日本語版|dubbed/i.test(text)) {
    return 'dubbed';
  }
  return null;
}

/**
 * Formats a date as YYYYMMDD for URL construction
 */
export function formatDateYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Formats a date as YYYY-MM-DD
 */
export function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

/**
 * Parses time string (HH:MM) to hours and minutes
 */
export function parseTime(timeStr: string): { hours: number; minutes: number } | null {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match || !match[1] || !match[2]) {
    return null;
  }
  return {
    hours: parseInt(match[1], 10),
    minutes: parseInt(match[2], 10),
  };
}

/**
 * Calculates end time from start time and duration
 */
export function calculateEndTime(startTime: string, durationMinutes: number): string {
  const parsed = parseTime(startTime);
  if (!parsed) {
    return startTime;
  }

  const totalMinutes = parsed.hours * 60 + parsed.minutes + durationMinutes;
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMinutes = totalMinutes % 60;

  return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
}

/**
 * Calculates duration in minutes from start and end times
 */
export function calculateDuration(startTime: string, endTime: string): number {
  const start = parseTime(startTime);
  const end = parseTime(endTime);

  if (!start || !end) {
    return 120; // デフォルト2時間
  }

  let startMinutes = start.hours * 60 + start.minutes;
  let endMinutes = end.hours * 60 + end.minutes;

  // 日付をまたぐ場合の処理
  if (endMinutes < startMinutes) {
    endMinutes += 24 * 60;
  }

  return endMinutes - startMinutes;
}

/**
 * Normalizes movie title for matching
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\s・\-ー−:：]/g, '')
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
}

/**
 * Checks if two movie titles match
 */
export function titlesMatch(title1: string, title2: string): boolean {
  const normalized1 = normalizeTitle(title1);
  const normalized2 = normalizeTitle(title2);

  return (
    normalized1.includes(normalized2) ||
    normalized2.includes(normalized1) ||
    title1.includes(title2) ||
    title2.includes(title1)
  );
}
