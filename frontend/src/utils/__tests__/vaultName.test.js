/**
 * vaultName.test.js — Vitest unit tests for frontend/src/utils/vaultName.js
 */
import { describe, test, expect } from 'vitest';
import { cleanLpSymbol, toMooSymbol, buildSuggestions } from '../vaultName.js';

// ─── cleanLpSymbol ─────────────────────────────────────────────────────────────
describe('cleanLpSymbol', () => {
  test('returns null for falsy input', () => {
    expect(cleanLpSymbol(null)).toBeNull();
    expect(cleanLpSymbol(undefined)).toBeNull();
    expect(cleanLpSymbol('')).toBeNull();
  });

  test('strips sAMM- prefix and replaces / with -', () => {
    expect(cleanLpSymbol('sAMM-USDC/WETH')).toBe('USDC-WETH');
  });

  test('strips vAMM- prefix and replaces / with -', () => {
    expect(cleanLpSymbol('vAMM-OP/WETH')).toBe('OP-WETH');
  });

  test('is case-insensitive for the AMM prefix', () => {
    expect(cleanLpSymbol('SAMM-USDC/WETH')).toBe('USDC-WETH');
    expect(cleanLpSymbol('vamm-OP/WETH')).toBe('OP-WETH');
  });

  test('leaves Balancer BPT symbols unchanged (no AMM prefix)', () => {
    expect(cleanLpSymbol('80ALCX-20WETH')).toBe('80ALCX-20WETH');
  });

  test('leaves Curve LP symbols unchanged', () => {
    expect(cleanLpSymbol('crvFRAX')).toBe('crvFRAX');
    expect(cleanLpSymbol('3CRV')).toBe('3CRV');
  });

  test('replaces slashes with dashes even when no AMM prefix', () => {
    expect(cleanLpSymbol('USDC/WETH')).toBe('USDC-WETH');
  });

  test('handles multi-slash symbols', () => {
    expect(cleanLpSymbol('sAMM-A/B/C')).toBe('A-B-C');
  });
});

// ─── toMooSymbol ───────────────────────────────────────────────────────────────
describe('toMooSymbol', () => {
  test('returns empty string for falsy input', () => {
    expect(toMooSymbol(null)).toBe('');
    expect(toMooSymbol(undefined)).toBe('');
    expect(toMooSymbol('')).toBe('');
  });

  test('USDC-WETH → mooUsdcWeth', () => {
    expect(toMooSymbol('USDC-WETH')).toBe('mooUsdcWeth');
  });

  test('OP-WETH → mooOpWeth', () => {
    expect(toMooSymbol('OP-WETH')).toBe('mooOpWeth');
  });

  test('80ALCX-20WETH → moo80Alcx20Weth (number prefix preserved)', () => {
    expect(toMooSymbol('80ALCX-20WETH')).toBe('moo80Alcx20Weth');
  });

  test('crvFRAX → mooCrvfrax (single segment, no dash)', () => {
    expect(toMooSymbol('crvFRAX')).toBe('mooCrvfrax');
  });

  test('3CRV → moo3Crv (leading digit, first alpha uppercased, rest lowercased)', () => {
    // '3CRV' is one segment: firstAlpha=1 → '3' + 'C'.upper + 'RV'.lower = '3Crv'
    expect(toMooSymbol('3CRV')).toBe('moo3Crv');
  });

  test('USDC/WETH → mooUsdcWeth (slash treated same as dash)', () => {
    expect(toMooSymbol('USDC/WETH')).toBe('mooUsdcWeth');
  });

  test('three-token pool: USDC-WETH-DAI → mooUsdcWethDai', () => {
    expect(toMooSymbol('USDC-WETH-DAI')).toBe('mooUsdcWethDai');
  });

  test('pure-number segment is kept as-is: 3-CRV → moo3Crv', () => {
    // "3" is a pure-number segment — kept; "CRV" gets capitalized
    expect(toMooSymbol('3-CRV')).toBe('moo3Crv');
  });
});

// ─── buildSuggestions ─────────────────────────────────────────────────────────
describe('buildSuggestions', () => {
  test('uses lpSymbol when available (prefers cleaned LP symbol)', () => {
    const form = {
      lpInfo: {
        lpSymbol: 'sAMM-USDC/WETH',
        token0: { symbol: 'USDC' },
        token1: { symbol: 'WETH' },
      },
    };
    const { suggestedName, suggestedSymbol, poolName } = buildSuggestions(form);
    expect(poolName).toBe('USDC-WETH');
    expect(suggestedName).toBe('Beefy USDC-WETH');
    expect(suggestedSymbol).toBe('mooUsdcWeth');
  });

  test('falls back to token symbols joined by dash when lpSymbol is absent', () => {
    const form = {
      lpInfo: {
        token0: { symbol: 'OP' },
        token1: { symbol: 'USDC' },
      },
    };
    const { suggestedName, suggestedSymbol, poolName } = buildSuggestions(form);
    expect(poolName).toBe('OP-USDC');
    expect(suggestedName).toBe('Beefy OP-USDC');
    expect(suggestedSymbol).toBe('mooOpUsdc');
  });

  test('supports three-token Curve pools (token2 included)', () => {
    const form = {
      lpInfo: {
        lpSymbol: '3CRV',
        token0: { symbol: 'DAI' },
        token1: { symbol: 'USDC' },
        token2: { symbol: 'USDT' },
      },
    };
    const { suggestedName, suggestedSymbol, poolName } = buildSuggestions(form);
    expect(poolName).toBe('3CRV');
    expect(suggestedName).toBe('Beefy 3CRV');
    expect(suggestedSymbol).toBe('moo3Crv');
  });

  test('falls back to "LP" when both lpSymbol and tokens are absent', () => {
    const { suggestedName, suggestedSymbol, poolName } = buildSuggestions({});
    expect(poolName).toBe('LP');
    expect(suggestedName).toBe('Beefy LP');
    expect(suggestedSymbol).toBe('mooLp');
  });

  test('handles null/undefined form gracefully', () => {
    const { poolName } = buildSuggestions(null);
    expect(poolName).toBe('LP');
  });

  test('Balancer BPT: uses symbol as-is', () => {
    const form = {
      lpInfo: {
        lpSymbol: '80ALCX-20WETH',
        token0: { symbol: 'ALCX' },
        token1: { symbol: 'WETH' },
      },
    };
    const { suggestedName, suggestedSymbol, poolName } = buildSuggestions(form);
    expect(poolName).toBe('80ALCX-20WETH');
    expect(suggestedSymbol).toBe('moo80Alcx20Weth');
  });
});

// ─── LP_TYPE_COMPATIBLE logic (unit-tested separately) ────────────────────────
// These mirror the logic in Step3Staking.jsx — tested here as pure maps
// since they don't depend on React state.
describe('LP type ↔ strategy compatibility (regression test for the mismatch bug)', () => {
  // Inline the map as it exists in Step3Staking.jsx
  const LP_TYPE_COMPATIBLE = {
    chef:       ['univ2', 'solidly'],
    gauge:      ['solidly', 'univ2'],
    aura:       ['balancer'],
    convex:     ['curve'],
    curvegauge: ['curve'],
    stakedao:   ['curve'],
  };

  function isMismatch(stratType, actualLpType) {
    if (actualLpType === null) return false;
    const compatible = LP_TYPE_COMPATIBLE[stratType] || [];
    if (compatible.length === 0) return false;
    return !compatible.includes(actualLpType);
  }

  test('chef + univ2 → no mismatch', () => {
    expect(isMismatch('chef', 'univ2')).toBe(false);
  });

  test('chef + solidly → no mismatch (Solidly/Uni-V2 LP can both use chef)', () => {
    expect(isMismatch('chef', 'solidly')).toBe(false);
  });

  test('chef + balancer → mismatch', () => {
    expect(isMismatch('chef', 'balancer')).toBe(true);
  });

  test('gauge + solidly → no mismatch', () => {
    expect(isMismatch('gauge', 'solidly')).toBe(false);
  });

  test('gauge + balancer → mismatch', () => {
    expect(isMismatch('gauge', 'balancer')).toBe(true);
  });

  test('aura + balancer → no mismatch', () => {
    expect(isMismatch('aura', 'balancer')).toBe(false);
  });

  test('aura + univ2 → mismatch', () => {
    expect(isMismatch('aura', 'univ2')).toBe(true);
  });

  test('convex + curve → no mismatch', () => {
    expect(isMismatch('convex', 'curve')).toBe(false);
  });

  test('curvegauge + curve → no mismatch', () => {
    expect(isMismatch('curvegauge', 'curve')).toBe(false);
  });

  test('stakedao + curve → no mismatch', () => {
    expect(isMismatch('stakedao', 'curve')).toBe(false);
  });

  test('null lpType → never a mismatch regardless of strategy', () => {
    for (const type of Object.keys(LP_TYPE_COMPATIBLE)) {
      expect(isMismatch(type, null)).toBe(false);
    }
  });

  // Regression: the OLD code used LP_TYPE_MATCH = { chef: null, gauge: null }
  // which caused `null !== 'univ2'` → true → false mismatch for gauge+univ2.
  test('regression: gauge + univ2 does NOT show a false mismatch (old bug)', () => {
    // Old logic: LP_TYPE_MATCH.gauge = null → null !== 'univ2' → mismatch=true (WRONG)
    // New logic: compatible=['solidly','univ2'] → includes('univ2') → mismatch=false (CORRECT)
    expect(isMismatch('gauge', 'univ2')).toBe(false);
  });
});
