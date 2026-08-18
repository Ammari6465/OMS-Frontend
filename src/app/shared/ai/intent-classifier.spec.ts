import { describe, it, expect } from 'vitest';

import { CONFIDENCE, bestIntent, detectSmallTalk, isCapabilityQuery, rankIntents } from './intent-classifier';
import { normalizeQuery } from './query-normalizer';

const nq = (s: string) => normalizeQuery(s);

describe('Ask OMS intent classifier', () => {
  it('recognises greetings, with or without addressing the assistant', () => {
    for (const g of ['Hi', 'hello', 'Hey', 'good morning', 'Hey Ask OMS', 'hello there', 'hi how are you']) {
      expect(detectSmallTalk(nq(g)), g).toBe('greeting');
    }
  });

  it('recognises thanks separately from greetings', () => {
    expect(detectSmallTalk(nq('thanks'))).toBe('courtesy');
    expect(detectSmallTalk(nq('thank you!'))).toBe('courtesy');
  });

  it('does not treat a real question as small talk', () => {
    for (const q of ['Find Hiran', 'hey who manages Finance', 'Show open vacancies']) {
      expect(detectSmallTalk(nq(q)), q).toBeNull();
    }
  });

  it('detects capability questions only when no entity is named', () => {
    expect(isCapabilityQuery(nq('What can you do?'), false)).toBe(true);
    expect(isCapabilityQuery(nq('examples'), false)).toBe(true);
    expect(isCapabilityQuery(nq('help'), false)).toBe(true);
    // "help me find Sarah" names a person — it must stay an employee lookup.
    expect(isCapabilityQuery(nq('help me find Sarah'), true)).toBe(false);
  });

  it('scores an exact concept hit high enough to execute', () => {
    const top = rankIntents(nq('open vacancies'))[0];
    expect(top.intent).toBe('vacancies');
    expect(top.confidence).toBeGreaterThanOrEqual(CONFIDENCE.execute);
  });

  it('ranks staff-count language as department statistics, not contact info', () => {
    for (const query of ['Number of Staff in Engineering and Technology', 'Total employees in Finance', 'Staff count for IT']) {
      expect(rankIntents(nq(query))[0]?.intent, query).toBe('department-stats');
    }
  });

  it('scores a typo into the clarify band rather than the execute band', () => {
    const top = bestIntent(nq('Any vacany'));
    expect(top?.intent).toBe('vacancies');
    expect(top!.confidence).toBeGreaterThanOrEqual(CONFIDENCE.clarify);
    expect(top!.confidence).toBeLessThan(CONFIDENCE.execute);
  });

  it('returns nothing for gibberish', () => {
    expect(bestIntent(nq('asdfgh'))).toBeNull();
    expect(bestIntent(nq('qwertyuiop zxcvbnm'))).toBeNull();
  });
});
