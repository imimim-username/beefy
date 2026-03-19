'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');

const { CHAINS }      = require('./chains.js');
const { resolveLpToken, validateChef, validateGauge, validateAura, validateConvex, validateCurveGauge, getCurveCoin, suggestRoutes, resolveToken } = require('./resolver.js');
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
