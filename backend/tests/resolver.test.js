'use strict';
/**
 * resolver.test.js — unit tests for backend/resolver.js
 *
 * Pure functions (suggestRoutes) are tested by requiring the module directly.
 * Async functions that call ethers are tested with jest.doMock() + local require()
 * so each test gets a freshly mocked module without hoisting restrictions.
 */

const ZERO = '0x0000000000000000000000000000000000000000';
const A    = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B    = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const C    = '0xcccccccccccccccccccccccccccccccccccccccc';
const D    = '0xdddddddddddddddddddddddddddddddddddddddd';

/** Apply mocks and return a fresh require('resolver') for one test. */
function requireResolver(mockContractFactory, chainId = 1) {
  jest.resetModules();
  jest.doMock('ethers', () => ({
    ethers: {
      JsonRpcProvider: jest.fn().mockReturnValue({}),
      Network: { from: jest.fn().mockReturnValue({}) },
      Contract: mockContractFactory,
      getAddress: jest.fn(a => a),
      ZeroAddress: ZERO,
    },
  }));
  jest.doMock('../chains.js', () => ({
    CHAINS: {
      [chainId]: { id: chainId, rpcEnvKey: 'TEST_RPC', rpcFallback: 'http://localhost' },
    },
  }));
  return require('../resolver.js');
}

// ─── 1. suggestRoutes (pure — no mocks needed) ─────────────────────────────────
describe('suggestRoutes', () => {
  const { suggestRoutes } = require('../resolver.js');

  const native  = '0xNATIVE';
  const reward  = '0xREWARD';
  const token0  = '0xTOKEN0';
  const token1  = '0xTOKEN1';

  test('reward → native: direct 2-hop when reward ≠ native', () => {
    const { outputToNativeRoute } = suggestRoutes(reward, token0, token1, native);
    expect(outputToNativeRoute).toEqual([reward, native]);
  });

  test('reward → native: single-element when reward === native', () => {
    const { outputToNativeRoute } = suggestRoutes(native, token0, token1, native);
    expect(outputToNativeRoute).toEqual([native]);
  });

  test('reward → token0: 3-hop [reward, native, token0] when nothing overlaps', () => {
    const { outputToLp0Route } = suggestRoutes(reward, token0, token1, native);
    expect(outputToLp0Route).toEqual([reward, native, token0]);
  });

  test('reward → token0: collapses to [reward] when reward === token0', () => {
    const { outputToLp0Route } = suggestRoutes(token0, token0, token1, native);
    expect(outputToLp0Route).toEqual([token0]);
  });

  test('reward → token0: deduplicates when native === token0', () => {
    const { outputToLp0Route } = suggestRoutes(reward, native, token1, native);
    expect(outputToLp0Route).toEqual([reward, native]);
  });

  test('reward → token1: 3-hop when nothing overlaps', () => {
    const { outputToLp1Route } = suggestRoutes(reward, token0, token1, native);
    expect(outputToLp1Route).toEqual([reward, native, token1]);
  });

  test('reward → token1: collapses to [reward] when reward === token1', () => {
    const { outputToLp1Route } = suggestRoutes(token1, token0, token1, native);
    expect(outputToLp1Route).toEqual([token1]);
  });

  test('all three routes: CRV reward, USDC/WETH pool, WETH native', () => {
    const crv  = '0xCRV';
    const weth = '0xWETH';
    const usdc = '0xUSDC';
    const { outputToNativeRoute, outputToLp0Route, outputToLp1Route } =
      suggestRoutes(crv, usdc, weth, weth);
    expect(outputToNativeRoute).toEqual([crv, weth]);
    expect(outputToLp0Route).toEqual([crv, weth, usdc]);
    expect(outputToLp1Route).toEqual([crv, weth]);  // weth===token1 → deduped
  });
});

// ─── 2. findPoolByLp ──────────────────────────────────────────────────────────
describe('findPoolByLp', () => {
  afterEach(() => { jest.resetModules(); });

  test('returns { found: true, pid } when LP matches a pool', async () => {
    const mockPoolInfo = jest.fn(pid =>
      Promise.resolve({ lptoken: pid === 0 ? A : B })
    );
    const mockPoolLength = jest.fn().mockResolvedValue(2n);

    const { findPoolByLp } = requireResolver(
      jest.fn().mockReturnValue({ poolLength: mockPoolLength, poolInfo: mockPoolInfo })
    );

    const result = await findPoolByLp(1, '0xBOOSTER', A);
    expect(result.found).toBe(true);
    expect(result.pid).toBe(0);
  });

  test('returns { found: false } when LP not in any pool', async () => {
    const mockPoolInfo = jest.fn().mockResolvedValue({ lptoken: B });
    const mockPoolLength = jest.fn().mockResolvedValue(3n);

    const { findPoolByLp } = requireResolver(
      jest.fn().mockReturnValue({ poolLength: mockPoolLength, poolInfo: mockPoolInfo })
    );

    const result = await findPoolByLp(1, '0xBOOSTER', A);
    expect(result.found).toBe(false);
  });

  test('handles poolInfo errors gracefully (skips errored pools)', async () => {
    const mockPoolInfo = jest.fn(pid => {
      if (pid === 1) return Promise.resolve({ lptoken: A });
      return Promise.reject(new Error('rpc error'));
    });
    const mockPoolLength = jest.fn().mockResolvedValue(2n);

    const { findPoolByLp } = requireResolver(
      jest.fn().mockReturnValue({ poolLength: mockPoolLength, poolInfo: mockPoolInfo })
    );

    const result = await findPoolByLp(1, '0xBOOSTER', A);
    expect(result.found).toBe(true);
    expect(result.pid).toBe(1);
  });
});

// ─── 3. detectRewardTokens — gauge path ───────────────────────────────────────
describe('detectRewardTokens — gauge (Velodrome V2 rewardsListLength path)', () => {
  afterEach(() => { jest.resetModules(); });

  test('returns tokens from rewardsListLength + rewards(i)', async () => {
    const mockGauge = {
      rewardsListLength: jest.fn().mockResolvedValue(2n),
      rewards:           jest.fn().mockImplementation(i => Promise.resolve([A, B][Number(i)])),
      rewardTokens:      jest.fn().mockRejectedValue(new Error('no')),
      rewardToken:       jest.fn().mockRejectedValue(new Error('no')),
      // ERC20 methods for resolveToken
      symbol:   jest.fn().mockResolvedValue('VELO'),
      name:     jest.fn().mockResolvedValue('Velodrome'),
      decimals: jest.fn().mockResolvedValue(18n),
    };

    const { detectRewardTokens } = requireResolver(jest.fn().mockReturnValue(mockGauge), 10);
    const tokens = await detectRewardTokens(10, 'gauge', '0xGAUGE', null);
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toMatchObject({ address: A, symbol: 'VELO' });
    expect(tokens[1]).toMatchObject({ address: B, symbol: 'VELO' });
  });

  test('falls back to single rewardToken() when list methods fail', async () => {
    const mockGauge = {
      rewardsListLength: jest.fn().mockRejectedValue(new Error('no')),
      rewardTokens:      jest.fn().mockRejectedValue(new Error('no')),
      rewardToken:       jest.fn().mockResolvedValue(A),
      symbol:   jest.fn().mockResolvedValue('OP'),
      name:     jest.fn().mockResolvedValue('Optimism'),
      decimals: jest.fn().mockResolvedValue(18n),
    };

    const { detectRewardTokens } = requireResolver(jest.fn().mockReturnValue(mockGauge), 10);
    const tokens = await detectRewardTokens(10, 'gauge', '0xGAUGE', null);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ address: A, symbol: 'OP' });
  });

  test('returns [] when all gauge reward methods fail', async () => {
    const mockGauge = {
      rewardsListLength: jest.fn().mockRejectedValue(new Error('no')),
      rewardTokens:      jest.fn().mockRejectedValue(new Error('no')),
      rewardToken:       jest.fn().mockRejectedValue(new Error('no')),
    };

    const { detectRewardTokens } = requireResolver(jest.fn().mockReturnValue(mockGauge), 10);
    const tokens = await detectRewardTokens(10, 'gauge', '0xGAUGE', null);
    expect(tokens).toEqual([]);
  });

  test('deduplicates tokens if same address appears twice', async () => {
    const mockGauge = {
      rewardsListLength: jest.fn().mockResolvedValue(2n),
      rewards:           jest.fn().mockResolvedValue(A), // both slots return same addr
      symbol:   jest.fn().mockResolvedValue('VELO'),
      name:     jest.fn().mockResolvedValue('Velodrome'),
      decimals: jest.fn().mockResolvedValue(18n),
    };

    const { detectRewardTokens } = requireResolver(jest.fn().mockReturnValue(mockGauge), 10);
    const tokens = await detectRewardTokens(10, 'gauge', '0xGAUGE', null);
    expect(tokens).toHaveLength(1);
  });
});

// ─── 4. detectRewardTokens — convex/aura path ─────────────────────────────────
describe('detectRewardTokens — convex/aura (BaseRewardPool)', () => {
  afterEach(() => { jest.resetModules(); });

  test('detects main + extra reward tokens', async () => {
    const mockExtraPool  = { rewardToken: jest.fn().mockResolvedValue(C) };
    const mockRewardPool = {
      rewardToken:        jest.fn().mockResolvedValue(A),
      extraRewardsLength: jest.fn().mockResolvedValue(1n),
      extraRewards:       jest.fn().mockResolvedValue(D),
    };
    const mockTokenMeta = {
      symbol:   jest.fn().mockResolvedValue('CRV'),
      name:     jest.fn().mockResolvedValue('Curve DAO Token'),
      decimals: jest.fn().mockResolvedValue(18n),
    };

    const { detectRewardTokens } = requireResolver(
      jest.fn().mockImplementation(addr => {
        if (addr === '0xREWARD') return mockRewardPool;
        if (addr === D) return mockExtraPool;
        return mockTokenMeta;
      })
    );

    const tokens = await detectRewardTokens(1, 'convex', '0xANY', '0xREWARD');
    expect(tokens).toHaveLength(2);
    const addrs = tokens.map(t => t.address);
    expect(addrs).toContain(A);
    expect(addrs).toContain(C);
  });

  test('returns [] when rewardPool is null (convex)', async () => {
    const { detectRewardTokens } = requireResolver(jest.fn().mockReturnValue({}));
    const tokens = await detectRewardTokens(1, 'convex', '0xANY', null);
    expect(tokens).toEqual([]);
  });

  test('returns [] when rewardPool is null (aura)', async () => {
    const { detectRewardTokens } = requireResolver(jest.fn().mockReturnValue({}));
    const tokens = await detectRewardTokens(1, 'aura', '0xANY', null);
    expect(tokens).toEqual([]);
  });

  test('handles missing extra rewards (extraRewardsLength = 0)', async () => {
    const mockRewardPool = {
      rewardToken:        jest.fn().mockResolvedValue(A),
      extraRewardsLength: jest.fn().mockResolvedValue(0n),
      extraRewards:       jest.fn(),
    };
    const mockTokenMeta = {
      symbol:   jest.fn().mockResolvedValue('BAL'),
      name:     jest.fn().mockResolvedValue('Balancer'),
      decimals: jest.fn().mockResolvedValue(18n),
    };

    const { detectRewardTokens } = requireResolver(
      jest.fn().mockImplementation(addr =>
        addr === '0xREWARD' ? mockRewardPool : mockTokenMeta
      )
    );

    const tokens = await detectRewardTokens(1, 'aura', '0xANY', '0xREWARD');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ address: A, symbol: 'BAL' });
  });
});

// ─── 5. detectRewardTokens — curvegauge/stakedao path ────────────────────────
describe('detectRewardTokens — curvegauge + stakedao (reward_tokens array)', () => {
  afterEach(() => { jest.resetModules(); });

  test('reads reward_tokens(0..n) and stops at zero address', async () => {
    const rewards = [A, B, ZERO];
    const mockGauge = {
      reward_tokens: jest.fn().mockImplementation(i =>
        Promise.resolve(rewards[Number(i)] ?? ZERO)
      ),
    };
    const mockMeta = {
      symbol: jest.fn().mockResolvedValue('CRV'),
      name: jest.fn().mockResolvedValue('Curve DAO Token'),
      decimals: jest.fn().mockResolvedValue(18n),
    };

    const { detectRewardTokens } = requireResolver(
      jest.fn().mockImplementation(addr =>
        addr === '0xGAUGE' ? mockGauge : mockMeta
      )
    );

    const tokens = await detectRewardTokens(1, 'curvegauge', '0xGAUGE', null);
    expect(tokens).toHaveLength(2);
    expect(mockGauge.reward_tokens).toHaveBeenCalledWith(0);
    expect(mockGauge.reward_tokens).toHaveBeenCalledWith(1);
    expect(mockGauge.reward_tokens).toHaveBeenCalledWith(2); // reads ZERO → stops
  });

  test('works for stakedao type (same code path as curvegauge)', async () => {
    const mockGauge = {
      reward_tokens: jest.fn().mockImplementation(i =>
        Number(i) === 0 ? Promise.resolve(A) : Promise.resolve(ZERO)
      ),
    };
    const mockMeta = {
      symbol: jest.fn().mockResolvedValue('SDT'),
      name: jest.fn().mockResolvedValue('Stake DAO Token'),
      decimals: jest.fn().mockResolvedValue(18n),
    };

    const { detectRewardTokens } = requireResolver(
      jest.fn().mockImplementation(addr =>
        addr === '0xSDGAUGE' ? mockGauge : mockMeta
      )
    );

    const tokens = await detectRewardTokens(1, 'stakedao', '0xSDGAUGE', null);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ address: A, symbol: 'SDT' });
  });

  test('returns [] when reward_tokens throws immediately', async () => {
    const mockGauge = {
      reward_tokens: jest.fn().mockRejectedValue(new Error('not supported')),
    };

    const { detectRewardTokens } = requireResolver(
      jest.fn().mockImplementation(addr =>
        addr === '0xGAUGE' ? mockGauge : {}
      )
    );

    const tokens = await detectRewardTokens(1, 'curvegauge', '0xGAUGE', null);
    expect(tokens).toEqual([]);
  });
});

// ─── 6. detectRewardTokens — chef guard ───────────────────────────────────────
describe('detectRewardTokens — chef (auto-detect not supported)', () => {
  afterEach(() => { jest.resetModules(); });

  test('returns empty array for chef — no on-chain scan attempted', async () => {
    const mockContract = jest.fn();
    const { detectRewardTokens } = requireResolver(mockContract, 56);
    const tokens = await detectRewardTokens(56, 'chef', '0xCHEF', null);
    expect(tokens).toEqual([]);
    // Should not call Contract at all (no RPC calls for chef)
    expect(mockContract).not.toHaveBeenCalled();
  });
});

// ─── 7. getAllCurveCoins ────────────────────────────────────────────────────────
describe('getAllCurveCoins', () => {
  afterEach(() => { jest.resetModules(); });

  test('returns all coins until address is zero/undefined', async () => {
    const mockPool = {
      coins: jest.fn()
        .mockResolvedValueOnce('0xCoinA')
        .mockResolvedValueOnce('0xCoinB')
        .mockRejectedValueOnce(new Error('index out of range')),
    };
    const mockToken = {
      symbol:   jest.fn().mockResolvedValue('USDC'),
      name:     jest.fn().mockResolvedValue('USD Coin'),
      decimals: jest.fn().mockResolvedValue(6),
    };

    const { getAllCurveCoins } = requireResolver(
      jest.fn().mockImplementation((addr) => {
        if (addr === '0xPOOL') return mockPool;
        return mockToken;
      })
    );

    const coins = await getAllCurveCoins(1, '0xPOOL');
    expect(coins).toHaveLength(2);
    expect(coins[0].index).toBe(0);
    expect(coins[1].index).toBe(1);
    expect(coins[0].symbol).toBe('USDC');
  });

  test('returns empty array when first coins() call fails', async () => {
    const mockPool = {
      coins: jest.fn().mockRejectedValue(new Error('not a curve pool')),
    };

    const { getAllCurveCoins } = requireResolver(
      jest.fn().mockImplementation(() => mockPool)
    );

    const coins = await getAllCurveCoins(1, '0xNOTCURVE');
    expect(coins).toEqual([]);
  });

  test('caps at 4 coins maximum', async () => {
    const mockPool = {
      coins: jest.fn().mockResolvedValue('0xSomeCoin'),
    };
    const mockToken = {
      symbol:   jest.fn().mockResolvedValue('TKN'),
      name:     jest.fn().mockResolvedValue('Token'),
      decimals: jest.fn().mockResolvedValue(18),
    };

    const { getAllCurveCoins } = requireResolver(
      jest.fn().mockImplementation((addr) => {
        if (addr === '0xBIGPOOL') return mockPool;
        return mockToken;
      })
    );

    const coins = await getAllCurveCoins(1, '0xBIGPOOL');
    expect(coins).toHaveLength(4); // loop stops at i < 4
  });
});

// ─── 8. checkSwapperRoute ─────────────────────────────────────────────────────
describe('checkSwapperRoute', () => {
  afterEach(() => { jest.resetModules(); });

  const SWAPPER = '0xSWAPPER';
  const NATIVE  = '0xNATIVE';
  const DEPOSIT = '0xDEPOSIT';

  function requireResolverWithSwapper(getAmountOutImpl) {
    jest.resetModules();
    jest.doMock('ethers', () => ({
      ethers: {
        JsonRpcProvider: jest.fn().mockReturnValue({}),
        Network: { from: jest.fn().mockReturnValue({}) },
        Contract: jest.fn().mockImplementation(() => ({
          getAmountOut: getAmountOutImpl,
        })),
        getAddress: jest.fn(a => a),
        ZeroAddress: '0x0000000000000000000000000000000000000000',
        parseUnits: jest.fn().mockReturnValue(BigInt('1000000000000000000')),
      },
    }));
    jest.doMock('../chains.js', () => ({
      CHAINS: {
        1: { id: 1, rpcEnvKey: 'TEST_RPC', rpcFallback: 'http://localhost' },
      },
    }));
    return require('../resolver.js');
  }

  test('returns isNative:true when depositToken equals nativeToken', async () => {
    const { checkSwapperRoute } = requireResolverWithSwapper(jest.fn());
    const result = await checkSwapperRoute(1, NATIVE, SWAPPER, NATIVE);
    expect(result.hasRoute).toBe(true);
    expect(result.isNative).toBe(true);
  });

  test('returns hasRoute:true when getAmountOut returns positive value', async () => {
    const { checkSwapperRoute } = requireResolverWithSwapper(
      jest.fn().mockResolvedValue(BigInt('500000000000000000'))
    );
    const result = await checkSwapperRoute(1, DEPOSIT, SWAPPER, NATIVE);
    expect(result.hasRoute).toBe(true);
  });

  test('returns hasRoute:false when getAmountOut returns zero', async () => {
    const { checkSwapperRoute } = requireResolverWithSwapper(
      jest.fn().mockResolvedValue(BigInt('0'))
    );
    const result = await checkSwapperRoute(1, DEPOSIT, SWAPPER, NATIVE);
    expect(result.hasRoute).toBe(false);
  });

  test('returns hasRoute:false when getAmountOut reverts', async () => {
    const { checkSwapperRoute } = requireResolverWithSwapper(
      jest.fn().mockRejectedValue(Object.assign(new Error('revert: no route'), { shortMessage: 'no route registered' }))
    );
    const result = await checkSwapperRoute(1, DEPOSIT, SWAPPER, NATIVE);
    expect(result.hasRoute).toBe(false);
    expect(result.reason).toBe('no route registered');
  });

  test('returns hasRoute:false with reason when addresses are missing', async () => {
    const { checkSwapperRoute } = requireResolverWithSwapper(jest.fn());
    const result = await checkSwapperRoute(1, null, SWAPPER, NATIVE);
    expect(result.hasRoute).toBe(false);
    expect(result.reason).toMatch(/missing/i);
  });
});

// ─── 9. resolveLpToken — lpType field ─────────────────────────────────────────
describe('resolveLpToken — lpType field', () => {
  afterEach(() => { jest.resetModules(); });

  /**
   * Build a requireResolver that makes a Solidly/Uni-V2 pair succeed.
   * Balancer and Curve probes are not reached (those paths require pair detection to fail first).
   * We fake token0/token1/symbol as if the SOLIDLY_PAIR_ABI call worked,
   * and control whether stable() resolves or rejects.
   */
  function makePairResolver({ stableValue }) {
    let callCount = 0;
    return requireResolver(
      jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            token0:  jest.fn().mockResolvedValue(A),
            token1:  jest.fn().mockResolvedValue(B),
            symbol:  jest.fn().mockResolvedValue('sAMM-USDC/DAI'),
            stable:  stableValue === undefined
              ? jest.fn().mockRejectedValue(new Error('no stable()'))
              : jest.fn().mockResolvedValue(stableValue),
          };
        }
        // Subsequent calls are for token0 / token1 ERC-20 metadata
        return {
          symbol:   jest.fn().mockResolvedValue('TKN'),
          name:     jest.fn().mockResolvedValue('Token'),
          decimals: jest.fn().mockResolvedValue(18n),
        };
      })
    );
  }

  test('lpType is "solidly" when stable() returns true', async () => {
    const { resolveLpToken } = makePairResolver({ stableValue: true });
    const result = await resolveLpToken(1, A);
    expect(result.lpType).toBe('solidly');
    expect(result.isStable).toBe(true);
  });

  test('lpType is "solidly" when stable() returns false (volatile Solidly pair)', async () => {
    const { resolveLpToken } = makePairResolver({ stableValue: false });
    const result = await resolveLpToken(1, A);
    expect(result.lpType).toBe('solidly');
    expect(result.isStable).toBe(false);
  });

  test('lpType is "univ2" when stable() reverts (plain Uni-V2 fallback)', async () => {
    const { resolveLpToken } = makePairResolver({ stableValue: undefined });
    const result = await resolveLpToken(1, A);
    expect(result.lpType).toBe('univ2');
    expect(result.isStable).toBeUndefined();
  });

  test('result always includes token0, token1, lpAddress', async () => {
    const { resolveLpToken } = makePairResolver({ stableValue: false });
    const result = await resolveLpToken(1, A);
    expect(result.token0).toBeDefined();
    expect(result.token1).toBeDefined();
    expect(result.lpAddress).toBe(A);
  });
});

// ─── 10. validateERC4626 ──────────────────────────────────────────────────────
describe('validateERC4626', () => {
  afterEach(() => { jest.resetModules(); });

  test('returns { valid: true, underlying } when asset() matches expectedWant', async () => {
    const { validateERC4626 } = requireResolver(
      jest.fn().mockReturnValue({ asset: jest.fn().mockResolvedValue(A) })
    );
    const result = await validateERC4626(1, B, A);
    expect(result.valid).toBe(true);
    expect(result.underlying).toBe(A);
  });

  test('returns { valid: true } when expectedWant is not provided (no check)', async () => {
    const { validateERC4626 } = requireResolver(
      jest.fn().mockReturnValue({ asset: jest.fn().mockResolvedValue(A) })
    );
    const result = await validateERC4626(1, B, undefined);
    expect(result.valid).toBe(true);
  });

  test('returns { valid: false } when underlying does not match expectedWant', async () => {
    const { validateERC4626 } = requireResolver(
      jest.fn().mockReturnValue({ asset: jest.fn().mockResolvedValue(C) })
    );
    const result = await validateERC4626(1, B, A);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/does not match/i);
    expect(result.underlying).toBe(C);
  });

  test('returns { valid: false } when asset() reverts (not an ERC-4626 vault)', async () => {
    const { validateERC4626 } = requireResolver(
      jest.fn().mockReturnValue({ asset: jest.fn().mockRejectedValue(new Error('not a vault')) })
    );
    const result = await validateERC4626(1, B, A);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not a vault/i);
  });
});

// ─── 11. validateAToken ───────────────────────────────────────────────────────
describe('validateAToken', () => {
  afterEach(() => { jest.resetModules(); });

  test('returns { valid: true, underlying } when UNDERLYING_ASSET_ADDRESS matches want', async () => {
    const { validateAToken } = requireResolver(
      jest.fn().mockReturnValue({ UNDERLYING_ASSET_ADDRESS: jest.fn().mockResolvedValue(A) })
    );
    const result = await validateAToken(1, B, A);
    expect(result.valid).toBe(true);
    expect(result.underlying).toBe(A);
  });

  test('returns { valid: false } when underlying does not match want', async () => {
    const { validateAToken } = requireResolver(
      jest.fn().mockReturnValue({ UNDERLYING_ASSET_ADDRESS: jest.fn().mockResolvedValue(C) })
    );
    const result = await validateAToken(1, B, A);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/does not match/i);
  });

  test('returns { valid: false } when UNDERLYING_ASSET_ADDRESS() reverts', async () => {
    const { validateAToken } = requireResolver(
      jest.fn().mockReturnValue({ UNDERLYING_ASSET_ADDRESS: jest.fn().mockRejectedValue(new Error('revert')) })
    );
    const result = await validateAToken(1, B, A);
    expect(result.valid).toBe(false);
  });

  test('returns { valid: true } when no expectedWant is provided', async () => {
    const { validateAToken } = requireResolver(
      jest.fn().mockReturnValue({ UNDERLYING_ASSET_ADDRESS: jest.fn().mockResolvedValue(A) })
    );
    const result = await validateAToken(1, B, null);
    expect(result.valid).toBe(true);
  });
});

// ─── 12. validateCompoundComet ────────────────────────────────────────────────
describe('validateCompoundComet', () => {
  afterEach(() => { jest.resetModules(); });

  test('returns { valid: true, baseToken } when baseToken() matches want', async () => {
    const { validateCompoundComet } = requireResolver(
      jest.fn().mockReturnValue({ baseToken: jest.fn().mockResolvedValue(A) })
    );
    const result = await validateCompoundComet(1, B, A);
    expect(result.valid).toBe(true);
    expect(result.baseToken).toBe(A);
  });

  test('returns { valid: false } when baseToken does not match want', async () => {
    const { validateCompoundComet } = requireResolver(
      jest.fn().mockReturnValue({ baseToken: jest.fn().mockResolvedValue(C) })
    );
    const result = await validateCompoundComet(1, B, A);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/does not match/i);
    expect(result.baseToken).toBe(C);
  });

  test('returns { valid: false } when baseToken() reverts', async () => {
    const { validateCompoundComet } = requireResolver(
      jest.fn().mockReturnValue({ baseToken: jest.fn().mockRejectedValue(new Error('not a comet')) })
    );
    const result = await validateCompoundComet(1, B, A);
    expect(result.valid).toBe(false);
  });

  test('returns { valid: true } when no expectedWant provided', async () => {
    const { validateCompoundComet } = requireResolver(
      jest.fn().mockReturnValue({ baseToken: jest.fn().mockResolvedValue(A) })
    );
    const result = await validateCompoundComet(1, B, undefined);
    expect(result.valid).toBe(true);
  });
});

// ─── 13. validateSiloV2 (delegates to validateERC4626) ───────────────────────
describe('validateSiloV2', () => {
  afterEach(() => { jest.resetModules(); });

  test('returns { valid: true, underlying } when asset() matches want', async () => {
    const { validateSiloV2 } = requireResolver(
      jest.fn().mockReturnValue({ asset: jest.fn().mockResolvedValue(A) })
    );
    const result = await validateSiloV2(1, B, A);
    expect(result.valid).toBe(true);
    expect(result.underlying).toBe(A);
  });

  test('returns { valid: false } when underlying does not match want', async () => {
    const { validateSiloV2 } = requireResolver(
      jest.fn().mockReturnValue({ asset: jest.fn().mockResolvedValue(C) })
    );
    const result = await validateSiloV2(1, B, A);
    expect(result.valid).toBe(false);
  });
});

// ─── 14. validateTokemak ──────────────────────────────────────────────────────
describe('validateTokemak', () => {
  afterEach(() => { jest.resetModules(); });

  test('returns { ok: true, stakingToken, rewardToken, underlying } on success', async () => {
    let callIdx = 0;
    const { validateTokemak } = requireResolver(
      jest.fn().mockImplementation(() => {
        callIdx++;
        if (callIdx === 1) {
          return {
            stakingToken: jest.fn().mockResolvedValue(B),
            rewardToken:  jest.fn().mockResolvedValue(C),
          };
        }
        // tokemak vault.asset()
        return { asset: jest.fn().mockResolvedValue(A) };
      })
    );
    const result = await validateTokemak(1, D);
    expect(result.ok).toBe(true);
    expect(result.stakingToken).toBe(B);
    expect(result.rewardToken).toBe(C);
    expect(result.underlying).toBe(A);
  });

  test('still returns ok: true when vault.asset() reverts (underlying = null)', async () => {
    let callIdx = 0;
    const { validateTokemak } = requireResolver(
      jest.fn().mockImplementation(() => {
        callIdx++;
        if (callIdx === 1) {
          return {
            stakingToken: jest.fn().mockResolvedValue(B),
            rewardToken:  jest.fn().mockResolvedValue(C),
          };
        }
        return { asset: jest.fn().mockRejectedValue(new Error('not a vault')) };
      })
    );
    const result = await validateTokemak(1, D);
    expect(result.ok).toBe(true);
    expect(result.underlying).toBeNull();
  });

  test('rejects when stakingToken() reverts (not a valid rewarder)', async () => {
    const { validateTokemak } = requireResolver(
      jest.fn().mockReturnValue({
        stakingToken: jest.fn().mockRejectedValue(new Error('no stakingToken')),
        rewardToken:  jest.fn().mockResolvedValue(C),
      })
    );
    await expect(validateTokemak(1, D)).rejects.toThrow('no stakingToken');
  });
});
