import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { PixelBox, Field, RouteDisplay, Spinner } from './PixelBox.jsx';
import { CHAINS_INFO } from '../chainInfo.js';

function addrToStr(addr) { return addr ? addr.slice(0, 8) + '…' : '?'; }

function EditableRoute({ label, route, setRoute, tokenMap }) {
  const [raw, setRaw] = useState(route.join(', '));
  const [parseErr, setParseErr] = useState('');

  function handleChange(val) {
    setRaw(val);
    const parts = val.split(',').map(s => s.trim()).filter(Boolean);
    const bad = parts.find(p => !/^0x[0-9a-fA-F]{40}$/.test(p));
    if (bad) { setParseErr(`Bad address: ${bad}`); return; }
    setParseErr('');
    setRoute(parts);
  }

  return (
    <Field
      label={label}
      hint={parseErr || `Preview: `}
      hintType={parseErr ? 'error' : ''}
    >
      <input
        className={`pixel-input ${parseErr ? 'error' : 'ok'}`}
        value={raw}
        onChange={e => handleChange(e.target.value)}
        placeholder="0xABC…, 0xDEF…"
        style={{ fontSize: '7px' }}
      />
      {!parseErr && route.length > 0 && (
        <div style={{ marginTop: '6px' }}>
          <RouteDisplay route={route} tokens={tokenMap} />
        </div>
      )}
    </Field>
  );
}

// ─── Factory strategy harvest-flow descriptions ────────────────────────────────
//
// All factory strategies (aura, gauge, convex, curvegauge, stakedao) use
// BeefySwapper to handle all reward→native swaps automatically. You only need
// to choose which pool token the strategy deposits into the pool to compound.

const FACTORY_DESCRIPTIONS = {
  aura: {
    title: 'How StrategyBalancerV3 harvests:',
    steps: [
      'Claims BAL + AURA rewards from Aura Finance',
      'BeefySwapper swaps BAL + AURA → native (WETH)',
      'If needed, swaps native → deposit token',
      'Single-asset joins the Balancer pool to mint BPT',
    ],
    hint: 'Choose native (WETH) if it\'s a pool token — saves a swap step.',
  },
  gauge: {
    title: 'How StrategyVelodrome harvests:',
    steps: [
      'Claims gauge reward tokens (e.g. OP, VELO, AERO)',
      'BeefySwapper swaps all rewards → native',
      'If needed, swaps native → deposit token',
      'Adds liquidity to the Solidly pool to mint LP',
    ],
    hint: 'Choose the pool token closest to native for lowest slippage.',
  },
  convex: {
    title: 'How StrategyCurveConvexFactory harvests:',
    steps: [
      'Claims CRV + CVX rewards from Convex',
      'BeefySwapper swaps CRV + CVX → native',
      'If needed, swaps native → deposit token',
      'Adds single-sided liquidity to the Curve pool to mint LP',
    ],
    hint: 'Choose the pool token BeefySwapper can most easily reach from native.',
  },
  curvegauge: {
    title: 'How StrategyCurveConvexFactory (pure Curve) harvests:',
    steps: [
      'Claims CRV rewards directly from the Curve LiquidityGauge',
      'BeefySwapper swaps CRV → native',
      'If needed, swaps native → deposit token',
      'Adds single-sided liquidity to the Curve pool to mint LP',
    ],
    hint: 'Choose the pool token BeefySwapper can most easily reach from native.',
  },
  stakedao: {
    title: 'How StrategyStakeDaoV2 harvests:',
    steps: [
      'Claims CRV + SDT rewards via claim_rewards() on the sd-gauge',
      'BeefySwapper swaps CRV + SDT → native',
      'If needed, swaps native → deposit token',
      'Adds single-sided liquidity to the Curve pool to mint LP',
    ],
    hint: 'Choose the pool token BeefySwapper can most easily reach from native.',
  },
};

// All strategy types that use the StrategyFactory + BeefySwapper pattern
const FACTORY_TYPES = new Set(['aura', 'gauge', 'convex', 'curvegauge', 'stakedao']);

// Known major tokens that BeefySwapper commonly has routes for (by lowercase symbol).
// We can't verify on-chain, but these are standard across Beefy deployments.
const BEEFY_SWAPPER_KNOWN_SYMBOLS = new Set([
  'weth', 'wbnb', 'wmatic', 'wavax', 'wftm', 'wop', 'wbase',
  'usdc', 'usdt', 'dai', 'frax', 'usdc.e', 'usdt.e', 'busd',
  'wbtc', 'btc.b',
  'crv', 'cvx', 'bal', 'aura',
  'op', 'arb',
]);

// ─── Shared deposit token picker (all factory strategies) ────────────────────

function FactoryDepositTokenStep({ form, setForm }) {
  const stratType    = form.strategyType;
  const desc         = FACTORY_DESCRIPTIONS[stratType] || FACTORY_DESCRIPTIONS.aura;
  const chainInfo    = CHAINS_INFO[form.chainId] || {};
  const nativeToken  = chainInfo.nativeToken || '';
  const swapperAddr  = chainInfo.beefyAddresses?.beefySwapper || '';
  const explorer     = chainInfo.blockExplorer || '';

  // Collect pool tokens from lpInfo
  const poolTokens = [];
  if (form.lpInfo?.token0) poolTokens.push(form.lpInfo.token0);
  if (form.lpInfo?.token1) poolTokens.push(form.lpInfo.token1);
  if (form.lpInfo?.token2) poolTokens.push(form.lpInfo.token2);

  // Common tokens for this chain (WETH / USDC) that aren't already a pool token
  const poolAddrs = new Set(poolTokens.map(t => t.address.toLowerCase()));
  const commonTokens = (chainInfo.commonTokens || []).filter(
    t => !poolAddrs.has(t.address.toLowerCase())
  );

  // All selectable tokens = pool tokens first, then common extras
  const allTokens = [...poolTokens, ...commonTokens];

  // Default: native token if it's one of the pool tokens; otherwise first token
  const defaultToken = allTokens.find(t =>
    t.address.toLowerCase() === nativeToken.toLowerCase()
  ) || allTokens[0];

  const [selected, setSelected] = useState(
    form.depositToken || defaultToken?.address || ''
  );

  // Custom address input (for pools where the deposit token isn't auto-detected)
  const [customAddr, setCustomAddr]   = useState('');
  const [customErr,  setCustomErr]    = useState('');
  const useCustom = selected === '__custom__';

  // Live BeefySwapper route check
  const [routeCheck,        setRouteCheck]        = useState(null); // null | { hasRoute, isNative, amountOut, reason }
  const [routeCheckLoading, setRouteCheckLoading] = useState(false);

  useEffect(() => {
    // Pre-select native token on first render if not already set
    if (!form.depositToken && defaultToken?.address) {
      setSelected(defaultToken.address);
      setForm(f => ({ ...f, depositToken: defaultToken.address }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check swapper route whenever selected token changes (skip native and custom)
  useEffect(() => {
    if (!selected || selected === '__custom__' || !form.chainId) return;
    if (isNative(selected)) { setRouteCheck({ hasRoute: true, isNative: true }); return; }
    setRouteCheck(null);
    setRouteCheckLoading(true);
    api.checkSwapperRoute(form.chainId, selected)
      .then(res => { if (res.ok !== false) setRouteCheck(res); })
      .catch(() => {})
      .finally(() => setRouteCheckLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, form.chainId]);

  function handleSelect(addr) {
    setSelected(addr);
    setRouteCheck(null);
    if (addr !== '__custom__') {
      setForm(f => ({ ...f, depositToken: addr }));
    }
  }

  function handleCustomChange(val) {
    setCustomAddr(val);
    const ok = /^0x[0-9a-fA-F]{40}$/.test(val.trim());
    setCustomErr(ok ? '' : 'Enter a valid 0x address');
    if (ok) setForm(f => ({ ...f, depositToken: val.trim() }));
  }

  const isNative = addr =>
    addr && nativeToken && addr.toLowerCase() === nativeToken.toLowerCase();

  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      <PixelBox style={{ padding: '10px' }}>
        <div style={{ fontSize: '7px', color: 'var(--cyan)', lineHeight: '1.8' }}>
          ℹ️ <strong>{desc.title}</strong>
          <br />
          {desc.steps.map((step, i) => (
            <React.Fragment key={i}>
              {i + 1}. {step}
              <br />
            </React.Fragment>
          ))}
          <br />
          <strong>Pick the deposit token below.</strong> {desc.hint}
        </div>
      </PixelBox>

      <Field label="DEPOSIT TOKEN" hint="Which token BeefySwapper swaps into when adding liquidity on harvest">
        <div style={{ display: 'grid', gap: '6px' }}>
          {/* Pool tokens (from the LP itself) */}
          {poolTokens.length > 0 && (
            <div style={{ fontSize: '6px', color: '#666', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Pool tokens
            </div>
          )}
          {poolTokens.map(token => (
            <label
              key={token.address}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                cursor: 'pointer', fontSize: '7px', color: 'var(--white)',
              }}
            >
              <input
                type="radio"
                name="depositToken"
                value={token.address}
                checked={selected === token.address}
                onChange={() => handleSelect(token.address)}
              />
              <span>
                <span style={{ color: 'var(--gold)' }}>{token.symbol || addrToStr(token.address)}</span>
                {' '}
                <span style={{ color: '#888' }}>{token.address}</span>
                {isNative(token.address) && (
                  <span style={{
                    marginLeft: '6px', color: 'var(--green)',
                    border: '1px solid var(--green)', padding: '0 3px',
                    fontSize: '6px',
                  }}>
                    NATIVE — RECOMMENDED
                  </span>
                )}
              </span>
            </label>
          ))}

          {/* Common liquid tokens for this chain (WETH / USDC) not already in the pool */}
          {commonTokens.length > 0 && (
            <>
              <div style={{ fontSize: '6px', color: '#666', marginTop: '6px', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Other liquid options
              </div>
              {commonTokens.map(token => (
                <label
                  key={token.address}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    cursor: 'pointer', fontSize: '7px', color: 'var(--white)',
                  }}
                >
                  <input
                    type="radio"
                    name="depositToken"
                    value={token.address}
                    checked={selected === token.address}
                    onChange={() => handleSelect(token.address)}
                  />
                  <span>
                    <span style={{ color: 'var(--cyan)' }}>{token.symbol}</span>
                    {' '}
                    <span style={{ color: '#888' }}>{token.address}</span>
                    <span style={{
                      marginLeft: '6px', color: 'var(--gold)',
                      border: '1px solid var(--gold)', padding: '0 3px',
                      fontSize: '6px',
                    }}>
                      WELL-SUPPORTED
                    </span>
                  </span>
                </label>
              ))}
            </>
          )}

          {/* Fallback: custom address for pools not fully resolved */}
          <label
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              cursor: 'pointer', fontSize: '7px', color: 'var(--white)',
            }}
          >
            <input
              type="radio"
              name="depositToken"
              value="__custom__"
              checked={useCustom}
              onChange={() => handleSelect('__custom__')}
            />
            <span style={{ color: '#aaa' }}>Other (enter address manually)</span>
          </label>

          {useCustom && (
            <div style={{ marginLeft: '18px' }}>
              <input
                className={`pixel-input ${customErr ? 'error' : customAddr ? 'ok' : ''}`}
                value={customAddr}
                onChange={e => handleCustomChange(e.target.value)}
                placeholder="0x…"
                style={{ fontSize: '7px', width: '100%' }}
              />
              {customErr && (
                <div style={{ color: 'var(--red)', fontSize: '6px', marginTop: '3px' }}>
                  {customErr}
                </div>
              )}
            </div>
          )}
        </div>
      </Field>

      {!useCustom && selected && (
        <div style={{ fontSize: '7px', color: '#aaa', marginTop: '4px' }}>
          Selected: <span style={{ color: 'var(--cyan)' }}>{selected}</span>
          {isNative(selected)
            ? ' — strategy will deposit directly without an extra swap ✓'
            : ' — strategy will swap native → this token on each harvest'}
        </div>
      )}

      {/* BeefySwapper verification notice — live on-chain check */}
      {selected && selected !== '__custom__' && (() => {
        const selToken = allTokens.find(
          t => t.address.toLowerCase() === selected.toLowerCase()
        );
        const sym = selToken?.symbol?.toLowerCase() || '';

        // While live check is in flight, fall back to symbol heuristic for instant feedback
        const symbolKnown = isNative(selected) || BEEFY_SWAPPER_KNOWN_SYMBOLS.has(sym);

        if (routeCheckLoading) {
          return (
            <div style={{ fontSize: '7px', color: '#888', marginTop: '8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
              <Spinner /> Checking BeefySwapper route on-chain…
            </div>
          );
        }

        // Live result available
        if (routeCheck) {
          if (routeCheck.isNative || routeCheck.hasRoute === true) {
            return (
              <div style={{
                fontSize: '7px', color: 'var(--green)',
                border: '1px solid var(--green)',
                padding: '6px 10px', marginTop: '8px',
                background: 'rgba(0,255,100,0.04)',
              }}>
                {routeCheck.isNative
                  ? '✓ Wrapped native — BeefySwapper always supports this token. Optimal choice.'
                  : `✓ BeefySwapper route confirmed on-chain for ${selToken?.symbol || selected.slice(0, 8)}.`}
              </div>
            );
          }

          // hasRoute === false — check if it's a symbol-known token (may just need oracle registration)
          return (
            <div style={{
              fontSize: '7px',
              color: symbolKnown ? 'var(--gold)' : 'var(--red)',
              border: `1px solid ${symbolKnown ? 'var(--gold)' : 'var(--red)'}`,
              padding: '8px 10px', marginTop: '8px',
              background: symbolKnown ? 'rgba(255,200,0,0.04)' : 'rgba(255,50,50,0.04)',
            }}>
              {symbolKnown
                ? `⚠ BeefySwapper route not confirmed for "${selToken?.symbol || selected.slice(0, 8)}" — this is a commonly-known token so a route likely exists but may need registration. Verify before deploying.`
                : `⛔ No BeefySwapper route found for this token. If no swap route is registered, the strategy will fail to compound on harvest. Use the wrapped native (${chainInfo.nativeSymbol || 'WETH'}) or contact the Beefy team to register a route.`
              }
              {swapperAddr && explorer && (
                <span>
                  {' '}
                  <a
                    href={`${explorer}/address/${swapperAddr}#readContract`}
                    target="_blank" rel="noreferrer"
                    style={{ color: 'var(--green)' }}
                  >
                    Inspect BeefySwapper →
                  </a>
                </span>
              )}
            </div>
          );
        }

        // No live result yet (loading just started or chainId missing) — show symbol-based fallback
        if (isNative(selected)) {
          return (
            <div style={{
              fontSize: '7px', color: 'var(--green)',
              border: '1px solid var(--green)',
              padding: '6px 10px', marginTop: '8px',
              background: 'rgba(0,255,100,0.04)',
            }}>
              ✓ Wrapped native — BeefySwapper always supports this token. Optimal choice.
            </div>
          );
        }
        return null;
      })()}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function Step5Routes({ form, setForm, onNext, onBack }) {
  const stratType   = form.strategyType;
  const isFactory   = FACTORY_TYPES.has(stratType);

  const [loading, setLoading] = useState(false);
  const [routes, setRoutes]   = useState(form.routes || null);

  const primaryReward = form.rewardTokens?.[0];
  const lp0 = form.lpInfo?.token0;
  const lp1 = form.lpInfo?.token1;

  const chainInfo    = CHAINS_INFO[form.chainId];
  const nativeToken  = chainInfo?.nativeToken;
  const nativeSymbol = chainInfo?.nativeSymbol || 'native';

  // Build a token symbol map for display
  const tokenMap = {};
  if (form.lpInfo) {
    if (lp0) tokenMap[lp0.address.toLowerCase()] = lp0;
    if (lp1) tokenMap[lp1.address.toLowerCase()] = lp1;
    if (form.lpInfo.token2) tokenMap[form.lpInfo.token2.address.toLowerCase()] = form.lpInfo.token2;
  }
  if (form.rewardTokens) {
    form.rewardTokens.forEach(t => { tokenMap[t.address.toLowerCase()] = t; });
  }
  if (nativeToken) tokenMap[nativeToken.toLowerCase()] = { symbol: nativeSymbol };

  /* ── Auto-suggest routes on mount (chef only) ─────────────────────────────── */
  useEffect(() => {
    if (isFactory) return; // factory strategies use depositToken picker instead
    if (routes) return;
    if (!primaryReward || !nativeToken) return;
    if (!lp0 || !lp1) return;

    setLoading(true);
    api.suggestRoutes({
      chainId:     form.chainId,
      rewardToken: primaryReward.address,
      token0:      lp0.address,
      token1:      lp1.address,
    }).then(res => {
      if (res.ok) {
        const r = {
          outputToNativeRoute: res.outputToNativeRoute,
          outputToLp0Route:    res.outputToLp0Route,
          outputToLp1Route:    res.outputToLp1Route,
        };
        setRoutes(r);
        setForm(f => ({ ...f, routes: r }));
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setRoute(key, val) {
    setRoutes(prev => {
      const next = { ...prev, [key]: val };
      setForm(f => ({ ...f, routes: next }));
      return next;
    });
  }

  /* ── canProceed ────────────────────────────────────────────────────────────── */
  let canProceed = false;
  if (isFactory) {
    // Factory strategies: need a valid non-zero depositToken
    const dt = form.depositToken || '';
    canProceed = /^0x[0-9a-fA-F]{40}$/.test(dt) && dt !== '0x0000000000000000000000000000000000000000';
  } else if (routes) {
    // Chef: need outputToNativeRoute + both LP routes
    canProceed = routes.outputToNativeRoute?.length >= 2 &&
                 routes.outputToLp0Route?.length    >= 1 &&
                 routes.outputToLp1Route?.length    >= 1;
  }

  const rewardSymbol = primaryReward?.symbol || '?';

  return (
    <PixelBox variant="gold" style={{ padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ color: 'var(--gold)', fontSize: '11px', marginBottom: '8px' }}>
          ▶ STEP 5 — {isFactory ? 'DEPOSIT TOKEN' : 'SWAP ROUTES'}
        </div>
        <div style={{ fontSize: '7px', color: 'var(--white)', marginBottom: '8px' }}>
          {isFactory
            ? 'This strategy uses BeefySwapper to handle all reward → native swaps automatically. You only need to choose which pool token it deposits to compound.'
            : 'Routes tell the strategy how to swap reward tokens into LP components. We auto-suggest them — review and edit if needed.'}
        </div>
      </div>

      {/* ── Factory strategies: deposit token picker ──────────────────────────── */}
      {isFactory && (
        <FactoryDepositTokenStep form={form} setForm={setForm} />
      )}

      {/* ── Chef: route inputs ────────────────────────────────────────────────── */}
      {!isFactory && (
        <>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--cyan)' }}>
              <Spinner /> Fetching suggested routes…
            </div>
          )}

          {routes && (
            <div style={{ display: 'grid', gap: '16px' }}>
              <EditableRoute
                label={`${rewardSymbol} → ${nativeSymbol} (output to native)`}
                route={routes.outputToNativeRoute || []}
                setRoute={val => setRoute('outputToNativeRoute', val)}
                tokenMap={tokenMap}
              />
              <EditableRoute
                label={`${rewardSymbol} → ${lp0?.symbol || 'LP token 0'}`}
                route={routes.outputToLp0Route || []}
                setRoute={val => setRoute('outputToLp0Route', val)}
                tokenMap={tokenMap}
              />
              <EditableRoute
                label={`${rewardSymbol} → ${lp1?.symbol || 'LP token 1'}`}
                route={routes.outputToLp1Route || []}
                setRoute={val => setRoute('outputToLp1Route', val)}
                tokenMap={tokenMap}
              />
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn" onClick={onBack}>◀ BACK</button>
        <button
          className="btn btn--gold"
          disabled={!canProceed}
          onClick={onNext}
        >
          NEXT ▶
        </button>
      </div>
    </PixelBox>
  );
}
