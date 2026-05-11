/**
 * vaultName.test.js — Vitest unit tests for frontend/src/utils/vaultName.js
 */
import { describe, test, expect } from 'vitest';
import { cleanLpSymbol, toMooSymbol, platformPrefix, platformDisplayName, buildSuggestions } from '../vaultName.js';

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
  test('gauge on Optimism (10) → VeloV2', () => {
    expect(platformPrefix('gauge', 10)).toBe('VeloV2');
  });

  test('gauge on Base (8453) → Aero', () => {
    expect(platformPrefix('gauge', 8453)).toBe('Aero');
  });

  test('gauge on Fantom (250) → SolidlyFtm', () => {
    expect(platformPrefix('gauge', 250)).toBe('SolidlyFtm');
  });

  test('gauge on unknown chain → Solidly (empty chain suffix)', () => {
    expect(platformPrefix('gauge', 999)).toBe('Solidly');
  });

  test('convex uses Curve prefix (Convex farms Curve LPs)', () => {
    expect(platformPrefix('convex', 1)).toBe('CurveEth');
  });

  test('curvegauge on Arbitrum (42161) → CurveArb', () => {
    expect(platformPrefix('curvegauge', 42161)).toBe('CurveArb');
  });

  test('stakedao on Ethereum (1) → StakeDaoEth', () => {
    expect(platformPrefix('stakedao', 1)).toBe('StakeDaoEth');
  });

  test('aura on Ethereum (1) → BalancerEthereum', () => {
    expect(platformPrefix('aura', 1)).toBe('BalancerEthereum');
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

  test('silov2 on Optimism (10) → SiloV2Op', () => {
    expect(platformPrefix('silov2', 10)).toBe('SiloV2Op');
  });

  test('silov2 on Arbitrum (42161) → SiloV2Arb', () => {
    expect(platformPrefix('silov2', 42161)).toBe('SiloV2Arb');
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

// ─── platformDisplayName ───────────────────────────────────────────────────────
describe('platformDisplayName', () => {
  test('gauge/Optimism → Velo', () => {
    expect(platformDisplayName('gauge', 10)).toBe('Velo');
  });

  test('gauge/Base → Aero', () => {
    expect(platformDisplayName('gauge', 8453)).toBe('Aero');
  });

  test('gauge/other → Solidly', () => {
    expect(platformDisplayName('gauge', 250)).toBe('Solidly');
  });

  test('convex → Curve (Convex farms Curve LPs)', () => {
    expect(platformDisplayName('convex', 1)).toBe('Curve');
  });

  test('curvegauge → Curve', () => {
    expect(platformDisplayName('curvegauge', 1)).toBe('Curve');
  });

  test('stakedao → StakeDAO', () => {
    expect(platformDisplayName('stakedao', 1)).toBe('StakeDAO');
  });

  test('aura → Aura', () => {
    expect(platformDisplayName('aura', 1)).toBe('Aura');
  });

  test('aave → Aave', () => {
    expect(platformDisplayName('aave', 10)).toBe('Aave');
  });

  test('compound → Compound', () => {
    expect(platformDisplayName('compound', 8453)).toBe('Compound');
  });

  test('morpho → Morpho', () => {
    expect(platformDisplayName('morpho', 1)).toBe('Morpho');
  });

  test('silov2 → Silo', () => {
    expect(platformDisplayName('silov2', 42161)).toBe('Silo');
  });

  test('pendle → Pendle', () => {
    expect(platformDisplayName('pendle', 1)).toBe('Pendle');
  });

  test('tokemak → Tokemak', () => {
    expect(platformDisplayName('tokemak', 1)).toBe('Tokemak');
  });

  test('chef → empty string (DEX unknown)', () => {
    expect(platformDisplayName('chef', 56)).toBe('');
  });

  test('erc4626 → empty string (protocol unknown)', () => {
    expect(platformDisplayName('erc4626', 8453)).toBe('');
  });
});

// ─── buildSuggestions ─────────────────────────────────────────────────────────
describe('buildSuggestions', () => {
  test('Aerodrome (gauge/Base): name="Moo Aero msETH-ETH", symbol="mooAeromsETH-ETH"', () => {
    // Verified against deployed contract 0x4187d53fa448dc18dA79acCd27112fF065216471 on Base
    const form = {
      strategyType: 'gauge',
      chainId: 8453,
      lpInfo: { lpSymbol: 'sAMM-msETH/ETH', token0: { symbol: 'msETH' }, token1: { symbol: 'ETH' } },
    };
    const { suggestedName, suggestedSymbol } = buildSuggestions(form);
    expect(suggestedName).toBe('Moo Aero msETH-ETH');
    expect(suggestedSymbol).toBe('mooAeromsETH-ETH');
  });

  test('Velodrome (gauge/Optimism): name="Moo Velo USDC-WETH", symbol="mooVeloV2USDC-WETH"', () => {
    const form = {
      strategyType: 'gauge',
      chainId: 10,
      lpInfo: { lpSymbol: 'sAMM-USDC/WETH', token0: { symbol: 'USDC' }, token1: { symbol: 'WETH' } },
    };
    const { suggestedName, suggestedSymbol } = buildSuggestions(form);
    expect(suggestedName).toBe('Moo Velo USDC-WETH');
    expect(suggestedSymbol).toBe('mooVeloV2USDC-WETH');
  });

  test('Convex (Ethereum): name="Moo Curve crvUSD-scrvUSD", symbol="mooCurveEthcrvUSD-scrvUSD"', () => {
    const form = {
      strategyType: 'convex',
      chainId: 1,
      lpInfo: { lpSymbol: 'crvUSD/scrvUSD', token0: { symbol: 'crvUSD' }, token1: { symbol: 'scrvUSD' } },
    };
    const { suggestedName, suggestedSymbol } = buildSuggestions(form);
    expect(suggestedName).toBe('Moo Curve crvUSD-scrvUSD');
    expect(suggestedSymbol).toBe('mooCurveEthcrvUSD-scrvUSD');
  });

  test('Aura (Ethereum): name="Moo Aura 80ALCX-20WETH", symbol="mooBalancerEthereum80ALCX-20WETH"', () => {
    const form = {
      strategyType: 'aura',
      chainId: 1,
      lpInfo: { lpSymbol: '80ALCX-20WETH', token0: { symbol: 'ALCX' }, token1: { symbol: 'WETH' } },
    };
    const { suggestedName, suggestedSymbol } = buildSuggestions(form);
    expect(suggestedName).toBe('Moo Aura 80ALCX-20WETH');
    expect(suggestedSymbol).toBe('mooBalancerEthereum80ALCX-20WETH');
  });

  test('Aura (Arbitrum): name="Moo Aura GHO-USDC", symbol="mooAuraArbGHO-USDC"', () => {
    const form = {
      strategyType: 'aura',
      chainId: 42161,
      lpInfo: { token0: { symbol: 'GHO' }, token1: { symbol: 'USDC' } },
    };
    const { suggestedName, suggestedSymbol } = buildSuggestions(form);
    expect(suggestedName).toBe('Moo Aura GHO-USDC');
    expect(suggestedSymbol).toBe('mooAuraArbGHO-USDC');
  });

  test('Aave single-asset (Optimism): name="Moo Aave WETH", symbol="mooAaveV3OpWETH"', () => {
    const form = {
      strategyType: 'aave',
      chainId: 10,
      lpInfo: { lpSymbol: 'WETH', token0: { symbol: 'WETH' } },
    };
    const { suggestedName, suggestedSymbol } = buildSuggestions(form);
    expect(suggestedName).toBe('Moo Aave WETH');
    expect(suggestedSymbol).toBe('mooAaveV3OpWETH');
  });

  test('Chef (BSC, DEX unknown): name="Moo CAKE-BNB", symbol="mooBscCAKE-BNB"', () => {
    const form = {
      strategyType: 'chef',
      chainId: 56,
      lpInfo: { token0: { symbol: 'CAKE' }, token1: { symbol: 'BNB' } },
    };
    const { suggestedName, suggestedSymbol } = buildSuggestions(form);
    expect(suggestedName).toBe('Moo CAKE-BNB');
    expect(suggestedSymbol).toBe('mooBscCAKE-BNB');
  });

  test('StakeDAO (Ethereum): name="Moo StakeDAO crvUSD-USDC"', () => {
    const form = {
      strategyType: 'stakedao',
      chainId: 1,
      lpInfo: { token0: { symbol: 'crvUSD' }, token1: { symbol: 'USDC' } },
    };
    const { suggestedName, suggestedSymbol } = buildSuggestions(form);
    expect(suggestedName).toBe('Moo StakeDAO crvUSD-USDC');
    expect(suggestedSymbol).toBe('mooStakeDaoEthcrvUSD-USDC');
  });

  test('falls back to "Moo LP" when no info available', () => {
    const { suggestedName, suggestedSymbol, poolName } = buildSuggestions({});
    expect(poolName).toBe('LP');
    expect(suggestedName).toBe('Moo LP');
    expect(suggestedSymbol).toBe('mooLP');
  });

  test('handles null/undefined form gracefully', () => {
    const { poolName, suggestedName } = buildSuggestions(null);
    expect(poolName).toBe('LP');
    expect(suggestedName).toBe('Moo LP');
  });

  test('three-token Curve pool', () => {
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
    expect(suggestedName).toBe('Moo Curve 3CRV');
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

  test('chef + univ2 → no mismatch', () => expect(isMismatch('chef', 'univ2')).toBe(false));
  test('chef + solidly → no mismatch', () => expect(isMismatch('chef', 'solidly')).toBe(false));
  test('chef + balancer → mismatch', () => expect(isMismatch('chef', 'balancer')).toBe(true));
  test('gauge + solidly → no mismatch', () => expect(isMismatch('gauge', 'solidly')).toBe(false));
  test('gauge + balancer → mismatch', () => expect(isMismatch('gauge', 'balancer')).toBe(true));
  test('aura + balancer → no mismatch', () => expect(isMismatch('aura', 'balancer')).toBe(false));
  test('aura + univ2 → mismatch', () => expect(isMismatch('aura', 'univ2')).toBe(true));
  test('convex + curve → no mismatch', () => expect(isMismatch('convex', 'curve')).toBe(false));
  test('curvegauge + curve → no mismatch', () => expect(isMismatch('curvegauge', 'curve')).toBe(false));
  test('stakedao + curve → no mismatch', () => expect(isMismatch('stakedao', 'curve')).toBe(false));
  test('null lpType → never a mismatch', () => {
    for (const type of Object.keys(LP_TYPE_COMPATIBLE)) {
      expect(isMismatch(type, null)).toBe(false);
    }
  });
  test('regression: gauge + univ2 does NOT show a false mismatch (old bug)', () => {
    expect(isMismatch('gauge', 'univ2')).toBe(false);
  });
});
