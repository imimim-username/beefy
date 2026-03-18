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
    } catch (e2) {
      // The contract exists but doesn't expose token0()/token1().
      // Could be a Balancer pool, Curve pool, Uni-V3 pool, or similar.
      // Try to read symbol for a better error message.
      let sym = '';
      try {
        const erc20 = new ethers.Contract(checksummed, ERC20_ABI, provider);
        sym = await erc20.symbol();
      } catch (_e3) { /* ignore */ }
      throw new Error(
        `Not a supported LP token${sym ? ` (symbol: ${sym})` : ''} — ` +
        `only Uniswap V2-style and Solidly/Velodrome-style pairs are supported. ` +
        `Balancer, Curve, and Uniswap V3 pools are not compatible with these strategies.`
      );
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

module.exports = { resolveLpToken, validateChef, validateGauge, suggestRoutes, resolveToken, getProvider };
