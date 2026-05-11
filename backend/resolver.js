'use strict';
/**
 * resolver.js — on-chain reads via ethers.js
 *
 * Connects to the chain's RPC and reads:
 *  - LP token0, token1
 *  - token symbols and decimals
 *  - Gauge/MasterChef sanity checks
 */

const { ethers } = require('ethers');
const { CHAINS } = require('./chains.js');

// Minimal ABIs
const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function decimals() view returns (uint8)',
];

const PAIR_ABI = [
  ...ERC20_ABI,
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function factory() view returns (address)',
];

// Solidly/Velodrome style pairs also expose `stable`
const SOLIDLY_PAIR_ABI = [
  ...PAIR_ABI,
  'function stable() view returns (bool)',
];

// MasterChef — just enough to confirm poolId exists
const MASTERCHEF_ABI = [
  'function poolLength() view returns (uint256)',
  'function poolInfo(uint256) view returns (address lpToken, uint256, uint256, uint256)',
];

// Gauge — Solidly/Velodrome style
const GAUGE_ABI = [
  'function stake() view returns (address)',       // staking token (= LP address)
  'function stakingToken() view returns (address)', // alternate name
  'function TOKEN() view returns (address)',
  'function rewardToken() view returns (address)',
];

// Balancer v2: BPT exposes getPoolId(); v2 Vault same address on all chains
const BALANCER_POOL_ABI = [
  'function getPoolId() view returns (bytes32)',
  'function symbol() view returns (string)',
];
const BALANCER_VAULT_ABI = [
  'function getPoolTokens(bytes32 poolId) view returns (address[] tokens, uint256[] balances, uint256 lastChangeBlock)',
];
const BALANCER_VAULT_ADDR = '0xBA12222222228d8Ba445958a75a0704d566BF2C8';

// Balancer v3: BPT exposes getVault() (no poolId); v3 Vault getPoolTokens takes pool address
const BALANCER_V3_POOL_ABI = [
  'function getVault() view returns (address)',
  'function symbol() view returns (string)',
];
const BALANCER_V3_VAULT_ABI = [
  'function getPoolTokens(address pool) view returns (address[] tokens)',
];

// Curve pools expose coins(uint256) — distinct from V2's token0()/token1()
const CURVE_POOL_ABI = [
  'function coins(uint256 i) view returns (address)',
  'function symbol() view returns (string)',
];

// Aura / Convex L1 booster poolInfo — 6 return values
// (lptoken, token, gauge, crvRewards, stash, shutdown)
const BOOSTER_ABI = [
  'function poolLength() view returns (uint256)',
  'function poolInfo(uint256 pid) view returns (address lptoken, address token, address gauge, address crvRewards, address stash, bool shutdown)',
];

// Convex L2 (sidechain) booster poolInfo — 5 return values, different field layout:
// (lptoken, gauge, rewards, shutdown, factory)
// NOTE: same booster ADDRESS (0xF403C135...) but different ABI on L2 networks.
const BOOSTER_ABI_L2 = [
  'function poolLength() view returns (uint256)',
  'function poolInfo(uint256 pid) view returns (address lptoken, address gauge, address rewards, bool shutdown, address factory)',
];

/**
 * Return the correct Convex booster ABI for a given chain.
 * L2 chains (convexL2: true in chains.js) use a different poolInfo() tuple.
 */
function getBoosterAbi(chainId) {
  return CHAINS[chainId]?.convexL2 ? BOOSTER_ABI_L2 : BOOSTER_ABI;
}

// Convex/Aura crvRewards pool — main reward token + extra reward pools
const REWARD_POOL_ABI = [
  'function rewardToken() view returns (address)',
  'function extraRewardsLength() view returns (uint256)',
  'function extraRewards(uint256 i) view returns (address)',
];
const EXTRA_REWARD_ABI = [
  'function rewardToken() view returns (address)',
];

function getProvider(chainId) {
  const chain = CHAINS[chainId];
  if (!chain) throw new Error(`Unknown chainId: ${chainId}`);
  const url = process.env[chain.rpcEnvKey] || chain.rpcFallback;
  // staticNetwork skips auto-detection so a bad RPC throws immediately instead
  // of retrying forever (ethers v6 default behaviour).
  const network = ethers.Network.from(chain.id);
  return new ethers.JsonRpcProvider(url, network, { staticNetwork: network });
}

/**
 * Resolve LP token metadata + its constituent tokens.
 * Returns:
 *   { lpAddress, lpSymbol, token0, token1, isStable? }
 *   where token0/token1 = { address, symbol, name, decimals }
 */
async function resolveLpToken(chainId, lpAddress) {
  const provider = getProvider(chainId);
  const checksummed = ethers.getAddress(lpAddress);

  // Try as Solidly pair (has `stable()`), fall back to standard Uni-V2 pair
  let token0Addr, token1Addr, lpSymbol, isStable;
  try {
    const pair = new ethers.Contract(checksummed, SOLIDLY_PAIR_ABI, provider);
    [token0Addr, token1Addr, lpSymbol] = await Promise.all([
      pair.token0(),
      pair.token1(),
      pair.symbol().catch(() => 'LP'),
    ]);
    isStable = await pair.stable().catch(() => undefined);
  } catch (_e) {
    try {
      const pair = new ethers.Contract(checksummed, PAIR_ABI, provider);
      [token0Addr, token1Addr, lpSymbol] = await Promise.all([
        pair.token0(),
        pair.token1(),
        pair.symbol().catch(() => 'LP'),
      ]);
    } catch (_e2) {
      // Not a V2/Solidly pair — try Balancer and Curve before giving up.

      // ── Balancer BPT? ──────────────────────────────────────────────────────
      try {
        const bpt  = new ethers.Contract(checksummed, BALANCER_POOL_ABI, provider);
        const poolId = await bpt.getPoolId();
        const vault  = new ethers.Contract(BALANCER_VAULT_ADDR, BALANCER_VAULT_ABI, provider);
        const { tokens } = await vault.getPoolTokens(poolId);
        // Filter out the BPT itself (pre-minted BPT appears in some boosted pools)
        const underlyingTokens = tokens.filter(t => t.toLowerCase() !== checksummed.toLowerCase());
        const sym = await bpt.symbol().catch(() => 'BPT');
        const [t0, t1] = await Promise.all(
          underlyingTokens.slice(0, 2).map(async (addr) => {
            const c = new ethers.Contract(addr, ERC20_ABI, provider);
            const [symbol, name, decimals] = await Promise.all([
              c.symbol().catch(() => '???'),
              c.name().catch(() => '???'),
              c.decimals().catch(() => 18),
            ]);
            return { address: addr, symbol, name, decimals: Number(decimals) };
          })
        );
        return {
          lpAddress: checksummed,
          lpSymbol: sym,
          lpType: 'balancer',
          balancerPoolId: poolId,
          poolTokens: underlyingTokens,
          token0: t0,
          token1: t1,
        };
      } catch (_e3) { /* not Balancer v2 */ }

      // ── Balancer v3 BPT? (getVault() instead of getPoolId()) ───────────────
      try {
        const bptV3  = new ethers.Contract(checksummed, BALANCER_V3_POOL_ABI, provider);
        const vaultAddr = await bptV3.getVault();   // throws if not a v3 BPT
        const v3Vault = new ethers.Contract(vaultAddr, BALANCER_V3_VAULT_ABI, provider);
        const tokens  = await v3Vault.getPoolTokens(checksummed);
        // Filter out the BPT itself (pre-minted BPT sometimes appears in its own token list)
        const underlyingTokens = tokens.filter(t => t.toLowerCase() !== checksummed.toLowerCase());
        const sym = await bptV3.symbol().catch(() => 'BPT');
        const resolvedTokens = await Promise.all(
          underlyingTokens.slice(0, 2).map(async (addr) => {
            const c = new ethers.Contract(addr, ERC20_ABI, provider);
            const [symbol, name, decimals] = await Promise.all([
              c.symbol().catch(() => '???'),
              c.name().catch(() => '???'),
              c.decimals().catch(() => 18),
            ]);
            return { address: addr, symbol, name, decimals: Number(decimals) };
          })
        );
        return {
          lpAddress: checksummed,
          lpSymbol: sym,
          lpType: 'balancer',
          balancerVersion: 3,
          poolTokens: underlyingTokens,
          token0: resolvedTokens[0],
          token1: resolvedTokens[1],
        };
      } catch (_e4) { /* not Balancer v3 */ }

      // ── Curve pool? ────────────────────────────────────────────────────────
      try {
        const pool = new ethers.Contract(checksummed, CURVE_POOL_ABI, provider);
        const [token0Addr, token1Addr] = await Promise.all([pool.coins(0), pool.coins(1)]);
        const sym = await pool.symbol().catch(() => 'CRV-LP');
        // Detect 3-coin pool
        let nCoins = 2;
        let token2Addr = null;
        try { token2Addr = await pool.coins(2); nCoins = 3; } catch (_) { /* 2-coin */ }
        const addrs = [token0Addr, token1Addr];
        if (token2Addr) addrs.push(token2Addr);
        const tokenMeta = await Promise.all(
          addrs.map(async (addr) => {
            const c = new ethers.Contract(addr, ERC20_ABI, provider);
            const [symbol, name, decimals] = await Promise.all([
              c.symbol().catch(() => '???'),
              c.name().catch(() => '???'),
              c.decimals().catch(() => 18),
            ]);
            return { address: addr, symbol, name, decimals: Number(decimals) };
          })
        );
        return {
          lpAddress: checksummed,
          lpSymbol: sym,
          lpType: 'curve',
          nCoins,
          poolTokens: addrs,
          token0: tokenMeta[0],
          token1: tokenMeta[1],
          token2: tokenMeta[2] || undefined,
        };
      } catch (_e5) { /* not Curve */ }

      // ── Unknown LP — treat as single-asset ERC-20 token ──────────────────
      // Return lpType: 'single' so the wizard can offer single-asset strategies
      // (ERC-4626, Morpho, Aave, Compound V3, Silo V2) instead of LP strategies.
      const erc20 = new ethers.Contract(checksummed, ERC20_ABI, provider);
      const [singleSym, singleName, singleDec] = await Promise.all([
        erc20.symbol().catch(() => '???'),
        erc20.name().catch(() => 'Unknown Token'),
        erc20.decimals().catch(() => 18),
      ]);
      return {
        lpAddress:  checksummed,
        lpSymbol:   singleSym,
        lpType:     'single',
        token0: {
          address:  checksummed,
          symbol:   singleSym,
          name:     singleName,
          decimals: Number(singleDec),
        },
      };
    }
  }

  // Read token metadata in parallel
  const [t0, t1] = await Promise.all(
    [token0Addr, token1Addr].map(async (addr) => {
      const c = new ethers.Contract(addr, ERC20_ABI, provider);
      const [symbol, name, decimals] = await Promise.all([
        c.symbol().catch(() => '???'),
        c.name().catch(() => '???'),
        c.decimals().catch(() => 18),
      ]);
      return { address: addr, symbol, name, decimals: Number(decimals) };
    })
  );

  return {
    lpAddress: checksummed,
    lpSymbol,
    lpType: isStable !== undefined ? 'solidly' : 'univ2',
    token0: t0,
    token1: t1,
    isStable: isStable ?? undefined,
  };
}

/**
 * Validate a MasterChef/Chef-style staking contract and optional poolId.
 * Returns { valid, poolLength, lpInPool? }
 */
async function validateChef(chainId, chefAddress, poolId) {
  const provider = getProvider(chainId);
  const chef = new ethers.Contract(ethers.getAddress(chefAddress), MASTERCHEF_ABI, provider);
  try {
    const poolLength = Number(await chef.poolLength());
    let lpInPool = undefined;
    if (poolId !== undefined && poolId !== null && poolId !== '') {
      const pid = Number(poolId);
      if (pid < 0 || pid >= poolLength) {
        return { valid: false, error: `poolId ${pid} out of range (pool length: ${poolLength})` };
      }
      try {
        const info = await chef.poolInfo(pid);
        lpInPool = info[0]; // first element is lpToken
      } catch (_e) {
        // some chefs have different poolInfo signature — that's fine
      }
    }
    return { valid: true, poolLength, lpInPool };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

/**
 * Validate a Gauge (Solidly/Velodrome style) and return its staking token.
 * Returns { valid, stakingToken? }
 */
async function validateGauge(chainId, gaugeAddress) {
  const provider = getProvider(chainId);
  const gauge = new ethers.Contract(ethers.getAddress(gaugeAddress), GAUGE_ABI, provider);
  try {
    // Try different method names different protocols use
    let stakingToken = null;
    for (const method of ['stake', 'stakingToken', 'TOKEN']) {
      try {
        stakingToken = await gauge[method]();
        break;
      } catch (_e) { /* try next */ }
    }
    return { valid: true, stakingToken };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

/**
 * Validate an Aura Booster pool and return the lptoken for cross-checking.
 * Returns { valid, poolLength, lpInPool?, rewardPool? }
 */
async function validateAura(chainId, boosterAddress, pid) {
  const provider = getProvider(chainId);
  const booster = new ethers.Contract(ethers.getAddress(boosterAddress), BOOSTER_ABI, provider);
  try {
    const poolLength = Number(await booster.poolLength());
    const p = Number(pid);
    if (p < 0 || p >= poolLength) {
      return { valid: false, error: `pid ${p} out of range (${poolLength} pools)` };
    }
    const info = await booster.poolInfo(p);
    return { valid: true, poolLength, lpInPool: info.lptoken, rewardPool: info.crvRewards };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

/**
 * Validate a Convex Booster pool and return the lptoken for cross-checking.
 * Returns { valid, poolLength, lpInPool?, rewardPool?, gauge? }
 *
 * Uses chain-specific ABI — L1 and L2 boosters share an address but differ:
 *   L1: poolInfo → (lptoken, token, gauge, crvRewards, stash, shutdown)
 *   L2: poolInfo → (lptoken, gauge, rewards, shutdown, factory)
 */
async function validateConvex(chainId, boosterAddress, pid) {
  const provider = getProvider(chainId);
  const isL2 = !!CHAINS[chainId]?.convexL2;
  const abi = getBoosterAbi(chainId);
  const booster = new ethers.Contract(ethers.getAddress(boosterAddress), abi, provider);
  try {
    const poolLength = Number(await booster.poolLength());
    const p = Number(pid);
    if (p < 0 || p >= poolLength) {
      return { valid: false, error: `pid ${p} out of range (${poolLength} pools)` };
    }
    const info = await booster.poolInfo(p);
    if (isL2) {
      // L2: (lptoken, gauge, rewards, shutdown, factory)
      return { valid: true, poolLength, lpInPool: info.lptoken, gauge: info.gauge, rewardPool: info.rewards };
    } else {
      // L1: (lptoken, token, gauge, crvRewards, stash, shutdown)
      return { valid: true, poolLength, lpInPool: info.lptoken, gauge: info.gauge, rewardPool: info.crvRewards };
    }
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

/**
 * Validate a Curve LiquidityGauge or StakeDAO gauge by reading its lp_token().
 * Also tries to read pool() — newer Curve gauges expose this directly,
 * which saves the user from having to look up the Curve pool address manually.
 * Returns { valid, stakingToken?, pool? }
 *
 * Works for both Curve native gauges and StakeDAO gauges — both expose lp_token().
 */
async function validateCurveGauge(chainId, gaugeAddress) {
  const provider = getProvider(chainId);
  const abi = [
    'function lp_token() view returns (address)',
    'function staking_token() view returns (address)', // StakeDAO alternate name
    'function pool() view returns (address)',          // newer Curve gauges
  ];
  const gauge = new ethers.Contract(ethers.getAddress(gaugeAddress), abi, provider);
  try {
    let stakingToken = null;
    for (const method of ['lp_token', 'staking_token']) {
      try { stakingToken = await gauge[method](); break; } catch (_e) { /* try next */ }
    }
    // Try reading pool() — present on LiquidityGaugeV5+ and some StakeDAO gauges
    let pool = null;
    try { pool = await gauge.pool(); } catch (_) { /* older gauges don't have pool() */ }

    return { valid: true, stakingToken, pool: pool || undefined };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

/**
 * Build suggested swap routes for a strategy.
 * Given the reward token and the two LP tokens, returns three route arrays:
 *   outputToNativeRoute    : reward → native
 *   outputToLp0Route       : reward → token0
 *   outputToLp1Route       : reward → token1
 *
 * Each route is an array of addresses. If token0 == native, the route is [native].
 */
function suggestRoutes(rewardToken, token0, token1, nativeToken) {
  function makeRoute(from, to) {
    if (from.toLowerCase() === to.toLowerCase()) return [from];
    return [from, nativeToken, to].filter((t, i, arr) =>
      !(t.toLowerCase() === arr[i - 1]?.toLowerCase()) // deduplicate consecutive
    );
  }
  return {
    outputToNativeRoute: makeRoute(rewardToken, nativeToken),
    outputToLp0Route:    makeRoute(rewardToken, token0),
    outputToLp1Route:    makeRoute(rewardToken, token1),
  };
}

/**
 * Fetch the ERC-20 token at a given index in a Curve pool.
 * Returns { address, symbol, name, decimals } — same shape as resolveToken.
 */
async function getCurveCoin(chainId, curvePoolAddress, coinIndex) {
  const provider = getProvider(chainId);
  const pool = new ethers.Contract(ethers.getAddress(curvePoolAddress), CURVE_POOL_ABI, provider);
  const coinAddr = await pool.coins(Number(coinIndex));
  return resolveToken(chainId, coinAddr);
}

/**
 * Fetch basic token info (symbol/name/decimals) for an arbitrary address.
 */
async function resolveToken(chainId, tokenAddress) {
  const provider = getProvider(chainId);
  const c = new ethers.Contract(ethers.getAddress(tokenAddress), ERC20_ABI, provider);
  const [symbol, name, decimals] = await Promise.all([
    c.symbol().catch(() => '???'),
    c.name().catch(() => 'Unknown Token'),
    c.decimals().catch(() => 18),
  ]);
  return { address: ethers.getAddress(tokenAddress), symbol, name, decimals: Number(decimals) };
}

/**
 * Scan a Convex/Aura booster to find the pool ID matching a given LP token.
 * Scans newest pools first so recent vaults are found quickly.
 * Returns { found: true, pid } or { found: false }.
 */
async function findPoolByLp(chainId, boosterAddress, lpAddress) {
  const provider = getProvider(chainId);
  const booster = new ethers.Contract(ethers.getAddress(boosterAddress), getBoosterAbi(chainId), provider);
  const poolLength = Number(await booster.poolLength());
  const target = lpAddress.toLowerCase();
  const BATCH = 20; // parallel requests per round

  for (let start = poolLength - 1; start >= 0; start -= BATCH) {
    const pids = [];
    for (let i = start; i > start - BATCH && i >= 0; i--) pids.push(i);

    const results = await Promise.all(
      pids.map(pid =>
        booster.poolInfo(pid)
          .then(info => ({ pid, lptoken: info.lptoken }))
          .catch(() => null)
      )
    );

    for (const r of results) {
      if (r && r.lptoken && r.lptoken.toLowerCase() === target) {
        return { found: true, pid: r.pid, poolLength };
      }
    }
  }

  return { found: false, poolLength };
}

/**
 * Read reward tokens from a Solidly/Velodrome gauge.
 * Tries rewardsListLength+rewards(i) (V2), then rewardTokens(i) array, then single rewardToken().
 * Returns an array of checksummed token addresses.
 */
async function getGaugeRewardTokenAddresses(chainId, gaugeAddress) {
  const provider = getProvider(chainId);
  const abi = [
    'function rewardsListLength() view returns (uint256)',
    'function rewards(uint256 i) view returns (address)',
    'function rewardTokens(uint256 i) view returns (address)',
    'function rewardToken() view returns (address)',
  ];
  const gauge = new ethers.Contract(ethers.getAddress(gaugeAddress), abi, provider);
  const ZERO = ethers.ZeroAddress;

  // Velodrome V2: rewardsListLength() + rewards(i)
  try {
    const len = Number(await gauge.rewardsListLength());
    if (len > 0) {
      const addrs = await Promise.all(Array.from({ length: len }, (_, i) => gauge.rewards(i)));
      return addrs.filter(a => a && a !== ZERO).map(ethers.getAddress);
    }
  } catch (_) {}

  // Some gauges: rewardTokens(i) array, terminates at zero
  try {
    const addrs = [];
    for (let i = 0; i < 8; i++) {
      const a = await gauge.rewardTokens(i);
      if (!a || a === ZERO) break;
      addrs.push(ethers.getAddress(a));
    }
    if (addrs.length > 0) return addrs;
  } catch (_) {}

  // Single rewardToken()
  try {
    const a = await gauge.rewardToken();
    if (a && a !== ZERO) return [ethers.getAddress(a)];
  } catch (_) {}

  return [];
}

/**
 * Read reward tokens from a Convex/Aura BaseRewardPool.
 * Returns the main rewardToken (CRV/BAL) plus any extra reward tokens.
 * Returns an array of checksummed token addresses.
 */
async function getConvexRewardAddresses(chainId, rewardPoolAddress) {
  const provider = getProvider(chainId);
  const pool = new ethers.Contract(ethers.getAddress(rewardPoolAddress), REWARD_POOL_ABI, provider);
  const ZERO = ethers.ZeroAddress;
  const addrs = [];

  // Main reward token (CRV for Convex, BAL for Aura)
  try {
    const main = await pool.rewardToken();
    if (main && main !== ZERO) addrs.push(ethers.getAddress(main));
  } catch (_) {}

  // Extra reward pools
  try {
    const extraLen = Number(await pool.extraRewardsLength());
    const extraPools = await Promise.all(
      Array.from({ length: extraLen }, (_, i) => pool.extraRewards(i))
    );
    const extraTokens = await Promise.all(
      extraPools.map(addr =>
        new ethers.Contract(addr, EXTRA_REWARD_ABI, provider)
          .rewardToken()
          .catch(() => null)
      )
    );
    for (const t of extraTokens) {
      if (t && t !== ZERO) addrs.push(ethers.getAddress(t));
    }
  } catch (_) {}

  return addrs;
}

/**
 * Read reward tokens from a Curve LiquidityGauge or StakeDAO gauge.
 * Curve gauges expose reward_tokens(uint256 i) — returns up to 8 tokens.
 * Returns an array of checksummed token addresses.
 */
async function getCurveGaugeRewardAddresses(chainId, gaugeAddress) {
  const provider = getProvider(chainId);
  const abi = ['function reward_tokens(uint256 i) view returns (address)'];
  const gauge = new ethers.Contract(ethers.getAddress(gaugeAddress), abi, provider);
  const ZERO = ethers.ZeroAddress;
  const addrs = [];

  for (let i = 0; i < 8; i++) {
    try {
      const a = await gauge.reward_tokens(i);
      if (!a || a === ZERO) break;
      addrs.push(ethers.getAddress(a));
    } catch (_) { break; }
  }

  return addrs;
}

/**
 * Resolve reward token addresses to full token metadata, then return unique list.
 * Deduplicates by address.
 */
async function resolveRewardTokens(chainId, rawAddresses) {
  const seen = new Set();
  const unique = rawAddresses.filter(a => {
    const k = a.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return Promise.all(unique.map(addr => resolveToken(chainId, addr)));
}

/**
 * High-level: detect reward tokens on-chain given strategy type + staking address.
 * For aura/convex, rewardPool is required (from booster.poolInfo(...).crvRewards).
 * Returns [{ address, symbol, name, decimals }].
 */
async function detectRewardTokens(chainId, stratType, stakingAddress, rewardPool) {
  let rawAddresses = [];

  if (stratType === 'gauge') {
    rawAddresses = await getGaugeRewardTokenAddresses(chainId, stakingAddress);
  } else if (stratType === 'aura' || stratType === 'convex') {
    if (!rewardPool) return [];
    rawAddresses = await getConvexRewardAddresses(chainId, rewardPool);
  } else if (stratType === 'curvegauge' || stratType === 'stakedao') {
    rawAddresses = await getCurveGaugeRewardAddresses(chainId, stakingAddress);
  } else if (stratType === 'silov2') {
    // rewardPool is the siloGauge address — read its rewardToken()
    if (!rewardPool) return [];
    try {
      const provider = getProvider(chainId);
      const gauge = new ethers.Contract(ethers.getAddress(rewardPool),
        ['function rewardToken() view returns (address)'], provider);
      const addr = await gauge.rewardToken();
      if (addr && addr !== ethers.ZeroAddress) rawAddresses = [ethers.getAddress(addr)];
    } catch (_) {}
  } else if (stratType === 'tokemak') {
    // stakingAddress is the rewarder — read its rewardToken()
    try {
      const provider = getProvider(chainId);
      const rewarder = new ethers.Contract(ethers.getAddress(stakingAddress),
        ['function rewardToken() view returns (address)'], provider);
      const addr = await rewarder.rewardToken();
      if (addr && addr !== ethers.ZeroAddress) rawAddresses = [ethers.getAddress(addr)];
    } catch (_) {}
  }
  // chef: too variable to auto-detect reliably — skip

  return resolveRewardTokens(chainId, rawAddresses);
}

/**
 * Fetch ALL coins in a Curve pool by probing indices 0..3 until the call fails.
 * Returns an array of { index, address, symbol, name, decimals }.
 */
async function getAllCurveCoins(chainId, curvePoolAddress) {
  const coins = [];
  for (let i = 0; i < 4; i++) {
    try {
      const coin = await getCurveCoin(chainId, curvePoolAddress, i);
      coins.push({ index: i, ...coin });
    } catch (_) {
      break; // no more coins at this index
    }
  }
  return coins;
}

// Minimal ABI to check if BeefySwapper has a route for a given token.
// BeefySwapper exposes getAmountOut(from, to, amount) as a view function.
const BEEFY_SWAPPER_ABI = [
  'function getAmountOut(address fromToken, address toToken, uint256 amountIn) view returns (uint256)',
];

/**
 * Check whether BeefySwapper has a registered swap route from depositToken → nativeToken.
 * Returns { hasRoute: bool, isNative?: bool, amountOut?: string, reason?: string }.
 */
async function checkSwapperRoute(chainId, depositToken, swapperAddr, nativeAddr) {
  if (!swapperAddr || !depositToken || !nativeAddr) {
    return { hasRoute: false, reason: 'missing addresses' };
  }
  // Native token always works — no swap needed
  if (depositToken.toLowerCase() === nativeAddr.toLowerCase()) {
    return { hasRoute: true, isNative: true };
  }
  const provider = getProvider(chainId);
  const swapper = new ethers.Contract(
    ethers.getAddress(swapperAddr),
    BEEFY_SWAPPER_ABI,
    provider,
  );
  try {
    // Use 1 token unit (18 decimals) as a probe amount — we only care if it reverts
    const amt = ethers.parseUnits('1', 18);
    const out = await swapper.getAmountOut(
      ethers.getAddress(depositToken),
      ethers.getAddress(nativeAddr),
      amt,
    );
    return { hasRoute: Number(out) > 0, amountOut: out.toString() };
  } catch (e) {
    return { hasRoute: false, reason: e.shortMessage || e.message };
  }
}

/**
 * Validate an ERC-4626 vault and optionally confirm its underlying asset matches want.
 * Used for ERC4626, ERC4626Merkl, Morpho, MorphoMerkl strategy types.
 * Returns { valid, underlying? }
 */
async function validateERC4626(chainId, vaultAddr, expectedWant) {
  const provider = getProvider(chainId);
  const abi = ['function asset() view returns (address)'];
  const vault = new ethers.Contract(ethers.getAddress(vaultAddr), abi, provider);
  try {
    const underlying = await vault.asset();
    if (expectedWant && underlying.toLowerCase() !== expectedWant.toLowerCase()) {
      return {
        valid: false,
        error: `Vault underlying (${underlying}) does not match want (${expectedWant})`,
        underlying,
      };
    }
    return { valid: true, underlying };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

/**
 * Validate an Aave v3 aToken and optionally confirm its underlying asset matches want.
 * Returns { valid, underlying? }
 */
async function validateAToken(chainId, aTokenAddr, expectedWant) {
  const provider = getProvider(chainId);
  const abi = ['function UNDERLYING_ASSET_ADDRESS() view returns (address)'];
  const aToken = new ethers.Contract(ethers.getAddress(aTokenAddr), abi, provider);
  try {
    const underlying = await aToken.UNDERLYING_ASSET_ADDRESS();
    if (expectedWant && underlying.toLowerCase() !== expectedWant.toLowerCase()) {
      return {
        valid: false,
        error: `aToken underlying (${underlying}) does not match want (${expectedWant})`,
        underlying,
      };
    }
    return { valid: true, underlying };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

/**
 * Validate a Compound V3 Comet and optionally confirm its base token matches want.
 * Returns { valid, baseToken? }
 */
async function validateCompoundComet(chainId, cometAddr, expectedWant) {
  const provider = getProvider(chainId);
  const abi = ['function baseToken() view returns (address)'];
  const comet = new ethers.Contract(ethers.getAddress(cometAddr), abi, provider);
  try {
    const baseToken = await comet.baseToken();
    if (expectedWant && baseToken.toLowerCase() !== expectedWant.toLowerCase()) {
      return {
        valid: false,
        error: `Comet baseToken (${baseToken}) does not match want (${expectedWant})`,
        baseToken,
      };
    }
    return { valid: true, baseToken };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

/**
 * Validate a Silo V2 market and optionally confirm its underlying asset matches want.
 * Silo V2 markets are ERC-4626 compatible; they expose asset() like any other ERC-4626 vault.
 * Returns { valid, underlying? }
 */
async function validateSiloV2(chainId, siloAddr, expectedWant) {
  return validateERC4626(chainId, siloAddr, expectedWant);
}

/**
 * validateTokemak — confirm a Tokemak rewarder exposes stakingToken() + rewardToken()
 * and optionally resolve the vault's underlying asset (depositToken).
 *
 * Returns: { ok, stakingToken, underlying, rewardToken }
 * The strategy auto-derives want/depositToken from rewarder, so these are informational.
 */
async function validateTokemak(chainId, rewarderAddr) {
  const provider = getProvider(chainId);
  const checksummed = ethers.getAddress(rewarderAddr);

  const rewarderAbi = [
    'function stakingToken() view returns (address)',
    'function rewardToken() view returns (address)',
  ];
  const rewarder = new ethers.Contract(checksummed, rewarderAbi, provider);

  const [stakingToken, rewardToken] = await Promise.all([
    rewarder.stakingToken(),
    rewarder.rewardToken(),
  ]);

  // Try to read the Tokemak vault's underlying asset
  let underlying = null;
  try {
    const vaultAbi = ['function asset() view returns (address)'];
    const tokemakVault = new ethers.Contract(stakingToken, vaultAbi, provider);
    underlying = await tokemakVault.asset();
  } catch {}

  return { ok: true, stakingToken, underlying, rewardToken };
}

module.exports = {
  resolveLpToken,
  validateChef,
  validateGauge,
  validateAura,
  validateConvex,
  validateCurveGauge,
  validateERC4626,
  validateAToken,
  validateCompoundComet,
  validateSiloV2,
  validateTokemak,
  getCurveCoin,
  getAllCurveCoins,
  checkSwapperRoute,
  suggestRoutes,
  resolveToken,
  getProvider,
  findPoolByLp,
  detectRewardTokens,
};
