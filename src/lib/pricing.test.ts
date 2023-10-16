import {
  centsToCredits,
  dollarsToCents,
  dollarsToCredits,
  tokensToCredits,
  RequestUsage,
} from './pricing';

import { test, describe, vi, expect } from 'vitest';

describe('Conversion utility functions', () => {
  test('centsToCredits', () => {
    expect(centsToCredits(1)).toBe(100);
    expect(centsToCredits(0.5)).toBe(50);
    expect(centsToCredits(0)).toBe(0);
  });

  test('dollarsToCents', () => {
    expect(dollarsToCents(1)).toBe(100);
    expect(dollarsToCents(0.5)).toBe(50);
    expect(dollarsToCents(0)).toBe(0);
  });

  test('dollarsToCredits', () => {
    expect(dollarsToCredits(1)).toBe(10000);
    expect(dollarsToCredits(0.5)).toBe(5000);
    expect(dollarsToCredits(0)).toBe(0);
  });

  describe('tokensToCredits', () => {
    const usage: RequestUsage = { promptTokens: 1000, completionTokens: 500 };

    test('gpt-3.5-turbo model', () => {
      expect(tokensToCredits('gpt-3.5-turbo', usage)).toBe(29000);
    });

    test('gpt-4 model', () => {
      expect(tokensToCredits('gpt-4', usage)).toBe(720000);
    });
  });
});
