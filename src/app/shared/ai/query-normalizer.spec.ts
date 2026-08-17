import { describe, it, expect } from 'vitest';

import { editDistance, fuzzyEquals, normalizeQuery, stem } from './query-normalizer';

describe('Ask OMS query normalizer', () => {
  it('lowercases, trims and collapses whitespace and punctuation', () => {
    const nq = normalizeQuery('  Any   VACANCIES???  ');
    expect(nq.text).toBe('any vacancies');
    expect(nq.isQuestion).toBe(true);
  });

  it('folds possessives so "Sarah\'s manager" reads as "sarah manager"', () => {
    expect(normalizeQuery("Who is Sarah's manager?").text).toBe('who is sarah manager');
    expect(normalizeQuery('Sarah’s team').text).toBe('sarah team');
  });

  it('strips conversational filler into `core` without touching `text`', () => {
    const nq = normalizeQuery('Can you please show me the vacancies?');
    expect(nq.text).toContain('vacancies');
    expect(nq.core).toBe('vacancies');
    expect(nq.hadFiller).toBe(true);
  });

  it('keeps meaningful words when removing "do we have" / "are there"', () => {
    expect(normalizeQuery('Do we have any vacancies?').core).toBe('vacancies');
    expect(normalizeQuery('Are there any open positions?').core).toBe('open positions');
  });

  it('preserves emails, employee codes and phone numbers', () => {
    expect(normalizeQuery('Find john@acme.com').text).toBe('find john@acme.com');
    expect(normalizeQuery('Find EMP-001').text).toBe('find emp-001');
    expect(normalizeQuery('Who has 077 123 4567?').text).toBe('who has 077 123 4567');
  });

  it('stems common plurals', () => {
    expect(stem('vacancies')).toBe('vacancy');
    expect(stem('employees')).toBe('employee');
    expect(stem('peoples')).toBe('people');
    expect(stem('staff')).toBe('staff');
  });

  it('measures edit distance including transpositions', () => {
    expect(editDistance('vacancy', 'vacany')).toBe(1);
    expect(editDistance('the', 'hte')).toBe(1);
    expect(editDistance('finance', 'zzzzzzz')).toBeGreaterThan(2);
  });

  it('treats near-misses as equal but keeps short words strict', () => {
    expect(fuzzyEquals('vacancies', 'vacancy')).toBe(true);
    expect(fuzzyEquals('vacany', 'vacancy')).toBe(true);
    expect(fuzzyEquals('man', 'manager')).toBe(false);
    expect(fuzzyEquals('cat', 'car')).toBe(false);
  });
});
