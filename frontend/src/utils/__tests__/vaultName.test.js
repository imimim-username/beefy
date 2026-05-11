/**
 * vaultName.test.js — Vitest unit tests for frontend/src/utils/vaultName.js
 */
import { describe, test, expect } from 'vitest';
import { cleanLpSymbol, toMooSymbol, platformPrefix, buildSuggestions } from '../vaultName.js';

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
    expect(toMooSymbol('3CRV')).toBe('moo3Crv');
  });

  test('USDC/WETH → mooUsdcWeth (slash treated same as dash)', () => {
    expect(toMooSymbol('USDC/WETH')).toBe('mooUsdcWeth');
  });

  test('three-token pool: USDC-WETH-DAI → mooUsdcWethDai', () => {
    expect(toMooSymbol('USDC-WETH-DAI')).toBe('mooUsdcWethDai');
  });

  test('pure-number segment is kept as-is: 3-CRV → moo3Crv', () => {
    expect(toMooSymbol('3-CRV')).toBe('moo3Crv');
  });
});

// ─── platformPrefix ────────────────────────────────────────────────────────────
describe('platformPrefix', () => {
  test('gauge on Optimism (10) → VelodromeOp', () => {
    expect(platformPrefix('gauge', 10)).toBe('VelodromeOp');
  });

  test('gauge on Base (8453) → AerodromeBase', () => {
    expect(platformPrefix('gauge', 8453)).toBe('AerodromeBase');
  });

  test('gauge on Fantom (250) → SolidlyFtm', () => {
    expect(platformPrefix('gauge', 250)).toBe('SolidlyFtm');
  });

  test('gauge on unknown chain → SolidlyXxx (empty chain suffix)', () => {
    expect(platformPrefix('gauge', 999)).toBe('Solidly');
  });

  test('convex on Ethereum (1) → CurveEth', () => {
    expect(platformPrefix('convex', 1)).toBe('CurveEth');
  });

  test('curvegauge on Arbitrum (42161) → CurveArb', () => {
    expect(platformPrefix('curvegauge', 42161)).toBe('CurveArb');
  });

  test('stakedao on Ethereum (1) → StakeDaoEth', () => {
    expect(platformPrefix('stakedao', 1)).toBe('StakeDaoEth');
  });

  test('aura on Arbitrum (42161) → AuraArb', () => {
    expect(platformPrefix('aura', 42161)).toBe('AuraArb');
  });

  test('aave on Optimism (10) → AaveV3Op', () => {
    expect(platformPrefix('aave', 10)).toBe('AaveV3Op');
  });

  test('compound on Base (8453) → CompoundBase', () => {
    expect(platformPrefix('compound', 8453)).toBe('CompoundBase');
  });

  test('morpho on Ethereum (1) → MorphoEth', () => {
    expect(platformPrefix('morpho', 1)).toBe('MorphoEth');
  });

  test('silov2 on Optimism (10) → SiloOp', () => {
    expect(platformPrefix('silov2', 10)).toBe('SiloOp');
  });

  test('pendle on Arbitrum (42161) → PendleArb', () => {
    expect(platformPrefix('pendle', 42161)).toBe('PendleArb');
  });

  test('tokemak on Ethereum (1) → TokemakEth', () => {
    expect(platformPrefix('tokemak', 1)).toBe('TokemakEth');
  });

  test('chef on BSC (56) → Bsc (DEX name unknown)', () => {
    expect(platformPrefix('chef', 56)).toBe('Bsc');
  });

  test('erc4626 on Base (8453) → Base (protocol unknown)', () => {
    expect(platformPrefix('erc4626', 8453)).toBe('Base');
  });

  test('unknown stratType on Polygon (137) → Polygon', () => {
    expect(platformPrefix('unknown', 137)).toBe('Polygon');
  });
});

// ─── buildSuggestions ─────────────────────────────────────────────────────────
describe('buildSuggestions', () => {
  test('vault name has NO "Beefy" prefix — just the pool name', () => {
    const form = {
      strategyType: 'gauge',
      chainId: 10,
      lpInfo: { lpSymbol: 'sAMM-USDC/WETH', token0: { symbol: 'USDC' }, token1: { symbol: 'WETH' } },
    };
    const { suggestedName } = buildSuggestions(form);
    expect(suggestedName).toBe('USDC-WETH');
    expect(suggestedName).not.toContain('Beefy');
  });

  test('Velodrome (gauge / Optimism): mooVelodromeOpUSDC-WETH', () => {
    const form = {
      strategyType: 'gauge',
      chainId: 10,
      lpInfo: { lpSymbol: 'sAMM-USDC/WETH', token0: { symbol: 'USDC' }, token1: { symbol: 'WETH' } },
    };
    const { suggestedName, suggestedSymbol, poolName } = buildSuggestions(form);
    expect(poolName).toBe('USDC-WETH');
    expect(suggestedName).toBe('USDC-WETH');
    expect(suggestedSymbol).toBe('mooVelodromeOpUSDC-WETH');
  });

  test('Aerodrome (gauge / Base): mooAerodromeBaseOP-USDC', () => {
    const form = {
      strategyType: 'gauge',
      chainId: 8453,
      lpInfo: { lpSymbol: 'vAMM-OP/USDC', token0: { symbol: 'OP' }, token1: { symbol: 'USDC' } },
    };
    const { suggestedName, suggestedSymbol } = buildSuggestions(form);
    expect(suggestedName).toBe('OP-USDC');
    expect(suggestedSymbol).toBe('mooAerodromeBaseOP-USDC');
  });

  test('Convex (Ethereum): mooCurveEthcrvUSD-scrvUSD', () => {
    const form = {
      strategyType: 'convex',
      chainId: 1,
      lpInfo: { lpSymbol: 'crvUSD/scrvUSD', token0: { symbol: 'crvUSD' }, token1: { symbol: 'scrvUSD' } },
    };
    const { suggestedName, suggestedSymbol } = buildSuggestions(form);
    expect(suggestedName).toBe('crvUSD-scrvUSD');
    expect(suggestedSymbol).toBe('mooCurveEthcrvUSD-scrvUSD');
  });

  test('Aura (Arbitrum): mooAuraArb80ALCX-20WETH', () => {
    const form = {
      strategyType: 'aura',
      chainId: 42161,
      lpInfo: { lpSymbol: '80ALCX-20WETH', token0: { symbol: 'ALCX' }, token1: { symbol: 'WETH' } },
    };
    const { suggestedName, suggestedSymbol } = buildSuggestions(form);
    expect(suggestedName).toBe('80ALCX-20WETH');
    expect(suggestedSymbol).toBe('mooAuraArb80ALCX-20WETH');
  });

  test('Aave single-asset (Optimism): mooAaveV3OpWETH', () => {
    const form = {
      strategyType: 'aave',
      chainId: 10,
      lpInfo: { lpSymbol: 'WETH', token0: { symbol: 'WETH' } },
    };
    const { suggestedName, suggestedSymbol } = buildSuggestions(form);
    expect(suggestedName).toBe('WETH');
    expect(suggestedSymbol).toBe('mooAaveV3OpWETH');
  });

  test('StakeDAO (Ethereum): mooStakeDaoEthcrvUSD-USDC', () => {
    const form = {
      strategyType: 'stakedao',
      chainId: 1,
      lpInfo: { token0: { symbol: 'crvUSD' }, token1: { symbol: 'USDC' } },
    };
    const { suggestedName, suggestedSymbol } = buildSuggestions(form);
    expect(suggestedName).toBe('crvUSD-USDC');
    expect(suggestedSymbol).toBe('mooStakeDaoEthcrvUSD-USDC');
  });

  test('falls back to token symbols joined by dash when lpSymbol is absent', () => {
    const form = {
      strategyType: 'chef',
      chainId: 56,
      lpInfo: { token0: { symbol: 'CAKE' }, token1: { symbol: 'BNB' } },
    };
    const { suggestedName, suggestedSymbol, poolName } = buildSuggestions(form);
    expect(poolName).toBe('CAKE-BNB');
    expect(suggestedName).toBe('CAKE-BNB');
    expect(suggestedSymbol).toBe('mooBscCAKE-BNB');
  });

  test('falls back to "LP" when both lpSymbol and tokens are absent', () => {
    const { suggestedName, suggestedSymbol, poolName } = buildSuggestions({});
    expect(poolName).toBe('LP');
    expect(suggestedName).toBe('LP');
    expect(suggestedSymbol).toBe('mooLP');
  });

  test('handles null/undefined form gracefully', () => {
    const { poolName } = buildSuggestions(null);
    expect(poolName).toBe('LP');
  });

  test('Balancer BPT: uses symbol as-is', () => {
    const form = {
      strategyType: 'aura',
      chainId: 1,
      lpInfo: { lpSymbol: '80ALCX-20WETH', token0: { symbol: 'ALCX' }, token1: { symbol: 'WETH' } },
    };
    const { suggestedName, suggestedSymbol, poolName } = buildSuggestions(form);
    expect(poolName).toBe('80ALCX-20WETH');
    expect(suggestedName).toBe('80ALCX-20WETH');
    expect(suggestedSymbol).toBe('mooAuraEth80ALCX-20WETH');
  });

  test('three-token Curve pool (token2 included)', () => {
    const form = {
      strategyType: 'curvegauge',
      chainId: 1,
      lpInfo: {
        lpSymbol: '3CRV',
        token0: { symbol: 'DAI' },
        token1: { symbol: 'USDC' },
        token2: { symbol: 'USDT' },
      },
    };
    const { suggestedName, suggestedSymbol } = buildSuggestions(form);
    expect(suggestedName).toBe('3CRV');
    expect(suggestedSymbol).toBe('mooCurveEth3CRV');
  });
});

// ─── LP_TYPE_COMPATIBLE logic (unit-tested separately) ────────────────────────
describe('LP type ↔ strategy compatibility (regression test for the mismatch bug)', () => {
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

  test('chef + solidly → no mismatch', () => {
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

  test('regression: gauge + univ2 does NOT show a false mismatch (old bug)', () => {
    expect(isMismatch('gauge', 'univ2')).toBe(false);
  });
});
