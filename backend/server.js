'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');

const { CHAINS }      = require('./chains.js');
const { resolveLpToken, validateChef, validateGauge, validateAura, validateConvex, validateCurveGauge, getCurveCoin, getAllCurveCoins, checkSwapperRoute, suggestRoutes, resolveToken, findPoolByLp, detectRewardTokens } = require('./resolver.js');
const { dryRun, execute } = require('./deployer.js');
const registry = require('./tokenRegistry.js');

const app  = express();
const PORT = Number(process.env.PORT || 8788);

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ ok: true, chains: Object.keys(CHAINS).map(Number) });
});

// ── Chains list ───────────────────────────────────────────────────────────────
app.get('/api/chains', (_req, res) => {
  const list = Object.values(CHAINS).map(c => ({
    id:           c.id,
    name:         c.name,
    shortName:    c.shortName,
    nativeSymbol: c.nativeSymbol,
    nativeToken:  c.nativeToken,
    blockExplorer: c.blockExplorer,
  }));
  res.json(list);
});

// ── Resolve LP token ──────────────────────────────────────────────────────────
// GET /api/resolve-lp?chainId=56&lp=0x...
app.get('/api/resolve-lp', async (req, res) => {
  const { chainId, lp } = req.query;
  if (!chainId || !lp) return res.status(400).json({ ok: false, error: 'chainId and lp required' });
  try {
    const info = await resolveLpToken(Number(chainId), lp);
    res.json({ ok: true, ...info });
  } catch (e) {
    console.error('resolve-lp error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Validate MasterChef ───────────────────────────────────────────────────────
// GET /api/validate-chef?chainId=56&chef=0x...&poolId=1
app.get('/api/validate-chef', async (req, res) => {
  const { chainId, chef, poolId } = req.query;
  if (!chainId || !chef) return res.status(400).json({ ok: false, error: 'chainId and chef required' });
  try {
    const result = await validateChef(Number(chainId), chef, poolId);
    res.json({ ok: result.valid, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Validate Gauge ────────────────────────────────────────────────────────────
// GET /api/validate-gauge?chainId=10&gauge=0x...
app.get('/api/validate-gauge', async (req, res) => {
  const { chainId, gauge } = req.query;
  if (!chainId || !gauge) return res.status(400).json({ ok: false, error: 'chainId and gauge required' });
  try {
    const result = await validateGauge(Number(chainId), gauge);
    res.json({ ok: result.valid, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Validate Aura pool ────────────────────────────────────────────────────────
// GET /api/validate-aura?chainId=1&booster=0x...&pid=123
app.get('/api/validate-aura', async (req, res) => {
  const { chainId, booster, pid } = req.query;
  if (!chainId || !booster || pid === undefined) {
    return res.status(400).json({ ok: false, error: 'chainId, booster, and pid required' });
  }
  try {
    const result = await validateAura(Number(chainId), booster, pid);
    res.json({ ok: result.valid, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Validate Convex pool ──────────────────────────────────────────────────────
// GET /api/validate-convex?chainId=1&booster=0x...&pid=123
app.get('/api/validate-convex', async (req, res) => {
  const { chainId, booster, pid } = req.query;
  if (!chainId || !booster || pid === undefined) {
    return res.status(400).json({ ok: false, error: 'chainId, booster, and pid required' });
  }
  try {
    const result = await validateConvex(Number(chainId), booster, pid);
    res.json({ ok: result.valid, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Validate Curve / StakeDAO gauge ──────────────────────────────────────────
// GET /api/validate-curvegauge?chainId=1&gauge=0x...
// GET /api/validate-stakedao?chainId=1&gauge=0x...   (same logic)
app.get('/api/validate-curvegauge', async (req, res) => {
  const { chainId, gauge } = req.query;
  if (!chainId || !gauge) return res.status(400).json({ ok: false, error: 'chainId and gauge required' });
  try {
    const result = await validateCurveGauge(Number(chainId), gauge);
    res.json({ ok: result.valid, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/validate-stakedao', async (req, res) => {
  const { chainId, gauge } = req.query;
  if (!chainId || !gauge) return res.status(400).json({ ok: false, error: 'chainId and gauge required' });
  try {
    const result = await validateCurveGauge(Number(chainId), gauge);
    res.json({ ok: result.valid, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Curve coin lookup ─────────────────────────────────────────────────────────
// GET /api/curve-coin?chainId=1&curvePool=0x...&coinIndex=0
app.get('/api/curve-coin', async (req, res) => {
  const { chainId, curvePool, coinIndex } = req.query;
  if (!chainId || !curvePool || coinIndex === undefined) {
    return res.status(400).json({ ok: false, error: 'chainId, curvePool, and coinIndex required' });
  }
  try {
    const info = await getCurveCoin(Number(chainId), curvePool, Number(coinIndex));
    res.json({ ok: true, ...info });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Find pool ID by LP token (Convex / Aura booster scan) ────────────────────
// GET /api/find-pool-id?chainId=1&booster=0x...&lp=0x...
// Scans booster.poolInfo(i) newest-first until it finds a matching lptoken.
app.get('/api/find-pool-id', async (req, res) => {
  const { chainId, booster, lp } = req.query;
  if (!chainId || !booster || !lp) {
    return res.status(400).json({ ok: false, error: 'chainId, booster, and lp required' });
  }
  try {
    const result = await findPoolByLp(Number(chainId), booster, lp);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Auto-detect reward tokens from staking contract ───────────────────────────
// GET /api/reward-tokens?chainId=1&stratType=gauge&staking=0x...&rewardPool=0x...
// rewardPool is required for aura/convex (= booster.poolInfo(pid).crvRewards)
app.get('/api/reward-tokens', async (req, res) => {
  const { chainId, stratType, staking, rewardPool } = req.query;
  if (!chainId || !stratType || !staking) {
    return res.status(400).json({ ok: false, error: 'chainId, stratType, and staking required' });
  }
  try {
    const tokens = await detectRewardTokens(Number(chainId), stratType, staking, rewardPool || null);
    res.json({ ok: true, tokens });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Suggest swap routes ───────────────────────────────────────────────────────
// POST /api/suggest-routes
// body: { chainId, rewardToken, token0, token1 }
app.post('/api/suggest-routes', (req, res) => {
  const { chainId, rewardToken, token0, token1 } = req.body;
  if (!chainId || !rewardToken || !token0 || !token1) {
    return res.status(400).json({ ok: false, error: 'chainId, rewardToken, token0, token1 required' });
  }
  const chain = CHAINS[Number(chainId)];
  if (!chain) return res.status(400).json({ ok: false, error: 'Unknown chainId' });

  const routes = suggestRoutes(rewardToken, token0, token1, chain.nativeToken);
  res.json({ ok: true, ...routes });
});

// ── Resolve arbitrary token ───────────────────────────────────────────────────
// GET /api/resolve-token?chainId=56&address=0x...
app.get('/api/resolve-token', async (req, res) => {
  const { chainId, address } = req.query;
  if (!chainId || !address) return res.status(400).json({ ok: false, error: 'chainId and address required' });
  try {
    const info = await resolveToken(Number(chainId), address);
    res.json({ ok: true, ...info });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Token registry ────────────────────────────────────────────────────────────
app.get('/api/tokens/:chainId', (req, res) => {
  const tokens = registry.getTokens(req.params.chainId);
  res.json(tokens);
});

app.post('/api/tokens/:chainId', (req, res) => {
  const { address, symbol, name, decimals } = req.body;
  if (!address) return res.status(400).json({ ok: false, error: 'address required' });
  const added = registry.addToken(req.params.chainId, { address, symbol: symbol || '?', name: name || address, decimals: decimals || 18 });
  res.json({ ok: true, added });
});

app.delete('/api/tokens/:chainId/:address', (req, res) => {
  registry.removeToken(req.params.chainId, req.params.address);
  res.json({ ok: true });
});

// ── Check for existing Beefy vault + LP health ────────────────────────────────
// GET /api/check-existing-vault?chainId=10&lp=0x...
// Calls Beefy public API to detect a duplicate, and DexScreener for TVL/volume.
const BEEFY_CHAIN_NAME = {
  1: 'ethereum', 56: 'bsc', 137: 'polygon',
  42161: 'arbitrum', 10: 'optimism', 8453: 'base',
  43114: 'avax', 250: 'fantom', 324: 'zksync',
  59144: 'linea', 534352: 'scroll',
};
const DEXSCREENER_CHAIN = {
  1: 'ethereum', 56: 'bsc', 137: 'polygon',
  42161: 'arbitrum', 10: 'optimism', 8453: 'base',
  43114: 'avalanche', 250: 'fantom',
};

app.get('/api/check-existing-vault', async (req, res) => {
  const { chainId, lp } = req.query;
  if (!chainId || !lp) return res.status(400).json({ ok: false, error: 'chainId and lp required' });
  const cid = Number(chainId);
  const lpLower = lp.toLowerCase();
  const result = { ok: true, exists: false, vaults: [], tvl: null, volume24h: null, pairAge: null };

  // ── 1. Check Beefy API for existing vault ───────────────────────────────────
  try {
    const beefyRes = await fetch('https://api.beefy.finance/vaults', {
      signal: AbortSignal.timeout(6000),
    });
    if (beefyRes.ok) {
      const vaults = await beefyRes.json();
      const chainName = BEEFY_CHAIN_NAME[cid];
      const matches = vaults.filter(v =>
        v.chain === chainName &&
        (v.tokenAddress || '').toLowerCase() === lpLower &&
        v.status !== 'eol',
      );
      if (matches.length > 0) {
        result.exists = true;
        result.vaults = matches.map(v => ({
          id:     v.id,
          name:   v.name,
          status: v.status,
          url:    `https://app.beefy.com/vault/${v.id}`,
        }));
      }
    }
  } catch (e) {
    console.warn('Beefy API check failed:', e.message);
  }

  // ── 2. DexScreener for TVL / volume / age ───────────────────────────────────
  const dsChain = DEXSCREENER_CHAIN[cid];
  if (dsChain) {
    try {
      const dsRes = await fetch(
        `https://api.dexscreener.com/latest/dex/pairs/${dsChain}/${lp}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (dsRes.ok) {
        const ds = await dsRes.json();
        const pair = ds?.pairs?.[0];
        if (pair) {
          result.tvl        = pair.liquidity?.usd ?? null;
          result.volume24h  = pair.volume?.h24    ?? null;
          result.pairAge    = pair.pairCreatedAt  ?? null; // unix ms
          result.dexName    = pair.dexId          ?? null;
        }
      }
    } catch (e) {
      console.warn('DexScreener check failed:', e.message);
    }
  }

  res.json(result);
});

// ── List all coins in a Curve pool ─────────────────────────────────────────────
// GET /api/curve-coins?chainId=1&curvePool=0x...
app.get('/api/curve-coins', async (req, res) => {
  const { chainId, curvePool } = req.query;
  if (!chainId || !curvePool) return res.status(400).json({ ok: false, error: 'chainId and curvePool required' });
  try {
    const coins = await getAllCurveCoins(Number(chainId), curvePool);
    res.json({ ok: true, coins });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Check BeefySwapper route for a deposit token ───────────────────────────────
// GET /api/check-swapper-route?chainId=10&depositToken=0x...
app.get('/api/check-swapper-route', async (req, res) => {
  const { chainId, depositToken } = req.query;
  if (!chainId || !depositToken) {
    return res.status(400).json({ ok: false, error: 'chainId and depositToken required' });
  }
  const cid = Number(chainId);
  const chain = CHAINS[cid];
  if (!chain) return res.status(400).json({ ok: false, error: 'Unknown chainId' });

  const swapperAddr = chain.beefyAddresses?.beefySwapper;
  const nativeAddr  = chain.nativeToken;
  if (!swapperAddr) return res.json({ ok: true, hasRoute: null, reason: 'No BeefySwapper configured for this chain' });

  try {
    const result = await checkSwapperRoute(cid, depositToken, swapperAddr, nativeAddr);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Deploy: dry-run ───────────────────────────────────────────────────────────
// POST /api/deploy/dryrun
app.post('/api/deploy/dryrun', async (req, res) => {
  try {
    const result = await dryRun(req.body);
    res.json(result);
  } catch (e) {
    console.error('dryrun error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Deploy: execute ───────────────────────────────────────────────────────────
// POST /api/deploy/execute
app.post('/api/deploy/execute', async (req, res) => {
  if (!process.env.DEPLOYER_PK) {
    return res.status(400).json({ ok: false, error: 'DEPLOYER_PK not set in .env' });
  }
  try {
    const result = await execute(req.body);

    // Auto-register reward tokens in the registry after a successful deploy
    if (result.ok && req.body.chainId && req.body.rewardTokenMeta) {
      for (const t of (req.body.rewardTokenMeta || [])) {
        registry.addToken(req.body.chainId, t);
      }
    }
    res.json(result);
  } catch (e) {
    console.error('execute error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🎮 beefyFinal proxy listening on http://localhost:${PORT}\n`);
  if (!process.env.DEPLOYER_PK) {
    console.warn('⚠️  DEPLOYER_PK not set — deploy/execute will be blocked until .env is configured');
  }
});
