import { describe, expect, it } from 'vitest';
import { localized, steamLanguage } from './language.ts';

describe('steamLanguage', () => {
  it("finds Steam's language for a locale, by its language", () => {
    expect(steamLanguage('en-US')).toBe(0);
    expect(steamLanguage('de-AT')).toBe(1);
    expect(steamLanguage('ru')).toBe(8);
    expect(steamLanguage('ja-JP')).toBe(10);
    expect(steamLanguage('nb-NO')).toBe(16);
  });

  it('tells regional variants Steam has apart', () => {
    expect(steamLanguage('pt-PT')).toBe(11);
    expect(steamLanguage('pt-BR')).toBe(22);
    expect(steamLanguage('es-ES')).toBe(5);
    expect(steamLanguage('es-MX')).toBe(27);
    expect(steamLanguage('zh-CN')).toBe(6);
    expect(steamLanguage('zh-Hans-CN')).toBe(6);
    expect(steamLanguage('zh-TW')).toBe(7);
    expect(steamLanguage('zh-Hant-HK')).toBe(7);
  });

  it('is english for languages Steam has no texts in', () => {
    expect(steamLanguage('xx-YY')).toBe(0);
    expect(steamLanguage('')).toBe(0);
  });
});

describe('localized', () => {
  it("picks the language's entry, english when it has none", () => {
    const texts = ['Hello', 'Hallo', null, ''];
    expect(localized(texts, 1)).toBe('Hallo');
    expect(localized(texts, 2)).toBe('Hello');
    expect(localized(texts, 3)).toBe('Hello');
    expect(localized(texts, 9)).toBe('Hello');
    expect(localized(undefined, 1)).toBeUndefined();
  });
});
