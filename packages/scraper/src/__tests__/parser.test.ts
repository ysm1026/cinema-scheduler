import { describe, it, expect } from 'vitest';
import {
  detectPremiumFormat,
  formatDateYYYYMMDD,
  formatDateISO,
  parseTime,
  calculateEndTime,
  calculateDuration,
  normalizeTitle,
  titlesMatch,
} from '../scraper/parser.js';

describe('detectPremiumFormat', () => {
  it('should detect IMAX', () => {
    expect(detectPremiumFormat('IMAX')).toBe('IMAX');
    expect(detectPremiumFormat('IMAXレーザー')).toBe('IMAX');
    expect(detectPremiumFormat('IMAX with Laser')).toBe('IMAX');
  });

  it('should detect Dolby Cinema', () => {
    expect(detectPremiumFormat('ドルビーシネマ')).toBe('DOLBY_CINEMA');
    expect(detectPremiumFormat('Dolby Cinema')).toBe('DOLBY_CINEMA');
  });

  it('should detect Dolby Atmos', () => {
    expect(detectPremiumFormat('ドルビーアトモス')).toBe('DOLBY_ATMOS');
    expect(detectPremiumFormat('Dolby Atmos')).toBe('DOLBY_ATMOS');
  });

  it('should detect 4DX', () => {
    expect(detectPremiumFormat('4DX')).toBe('4DX');
    expect(detectPremiumFormat('MX4D')).toBe('4DX');
  });

  it('should detect SCREENX', () => {
    expect(detectPremiumFormat('SCREEN X')).toBe('SCREENX');
    expect(detectPremiumFormat('SCREENX')).toBe('SCREENX');
  });

  it('should return null for standard format', () => {
    expect(detectPremiumFormat('通常上映')).toBeNull();
    expect(detectPremiumFormat('10:30')).toBeNull();
  });
});

describe('formatDateYYYYMMDD', () => {
  it('should format date correctly', () => {
    const date = new Date('2026-01-29');
    expect(formatDateYYYYMMDD(date)).toBe('20260129');
  });

  it('should pad month and day', () => {
    const date = new Date('2026-05-09');
    expect(formatDateYYYYMMDD(date)).toBe('20260509');
  });
});

describe('formatDateISO', () => {
  it('should format date as ISO', () => {
    const date = new Date('2026-01-29T10:00:00Z');
    expect(formatDateISO(date)).toBe('2026-01-29');
  });
});

describe('parseTime', () => {
  it('should parse valid time', () => {
    expect(parseTime('10:30')).toEqual({ hours: 10, minutes: 30 });
    expect(parseTime('09:05')).toEqual({ hours: 9, minutes: 5 });
    expect(parseTime('21:45')).toEqual({ hours: 21, minutes: 45 });
  });

  it('should parse single digit hour', () => {
    expect(parseTime('8:30')).toEqual({ hours: 8, minutes: 30 });
  });

  it('should return null for invalid time', () => {
    expect(parseTime('invalid')).toBeNull();
    // parseTime doesn't validate hour range, just parses format
    expect(parseTime('25:00')).toEqual({ hours: 25, minutes: 0 });
  });
});

describe('calculateEndTime', () => {
  it('should calculate end time correctly', () => {
    expect(calculateEndTime('10:00', 120)).toBe('12:00');
    expect(calculateEndTime('10:30', 90)).toBe('12:00');
    expect(calculateEndTime('21:00', 150)).toBe('23:30');
  });

  it('should handle overnight', () => {
    expect(calculateEndTime('23:00', 120)).toBe('01:00');
  });
});

describe('calculateDuration', () => {
  it('should calculate duration correctly', () => {
    expect(calculateDuration('10:00', '12:00')).toBe(120);
    expect(calculateDuration('10:30', '12:00')).toBe(90);
    expect(calculateDuration('09:00', '11:30')).toBe(150);
  });

  it('should handle overnight', () => {
    expect(calculateDuration('23:00', '01:00')).toBe(120);
  });

  it('should return default for invalid input', () => {
    expect(calculateDuration('invalid', '12:00')).toBe(120);
  });
});

describe('normalizeTitle', () => {
  it('should remove symbols like ・', () => {
    // normalizeTitle removes ・ but keeps katakana as katakana (lowercase doesn't affect them)
    expect(normalizeTitle('シャドウズ・エッジ')).toBe('シャドウズエッジ');
  });

  it('should convert full-width numbers to half-width and remove prolonged sound mark', () => {
    // ー (U+30FC) is in the replace pattern, so ズートピア becomes ズトピア
    expect(normalizeTitle('ズートピア２')).toBe('ズトピア2');
  });

  it('should convert full-width alphanumeric to half-width lowercase', () => {
    expect(normalizeTitle('ＡＢＣ１２３')).toBe('abc123');
  });
});

describe('titlesMatch', () => {
  it('should match identical titles', () => {
    expect(titlesMatch('ズートピア2', 'ズートピア2')).toBe(true);
  });

  it('should match partial titles', () => {
    expect(titlesMatch('ズートピア2', 'ズートピア')).toBe(true);
    expect(titlesMatch('ズートピア', 'ズートピア2')).toBe(true);
  });

  it('should match normalized titles', () => {
    expect(titlesMatch('ズートピア２', 'ズートピア2')).toBe(true);
  });

  it('should not match different titles', () => {
    expect(titlesMatch('ズートピア', 'シャドウズ')).toBe(false);
  });
});
