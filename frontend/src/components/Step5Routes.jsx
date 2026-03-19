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

/**
 * Build simple 2-hop route suggestions without calling the backend.
 * Works for aura / convex where routes are straightforward.
 */
function buildSimpleRoute(from, to) {
  if (!from || !to) return [];
  if (from.toLowerCase() === to.toLowerCase()) return [from];
  return [from, to];
}

export function Step5Routes({ form, setForm, onNext, onBack }) {
  const stratType = form.strategyType;
  const isAura    = stratType === 'aura';
  const isConvex  = stratType === 'convex';
  const isSpecial = isAura || isConvex;

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
    // 3-coin Curve pool
    if (form.lpInfo.token2) tokenMap[form.lpInfo.token2.address.toLowerCase()] = form.lpInfo.token2;
  }
  if (form.rewardTokens) {
    form.rewardTokens.forEach(t => { tokenMap[t.address.toLowerCase()] = t; });
  }
  if (nativeToken) tokenMap[nativeToken.toLowerCase()] = { symbol: nativeSymbol };
  if (form.convexCoin) tokenMap[form.convexCoin.address.toLowerCase()] = form.convexCoin;

  /* ── Auto-suggest routes on mount ─────────────────────────────────────────── */
  useEffect(() => {
    if (routes) return; // already have routes
    if (!primaryReward || !nativeToken) return;

    if (isAura) {
      // Aura: only outputToNativeRoute [BAL → WETH]
      const r = {
        outputToNativeRoute: buildSimpleRoute(primaryReward.address, nativeToken),
      };
      setRoutes(r);
      setForm(f => ({ ...f, routes: r }));
    } else if (isConvex) {
      // Convex: outputToNativeRoute [CRV → WETH] + outputToCoinRoute [WETH → coin]
      const coinAddr = form.convexCoin?.address;
      const r = {
        outputToNativeRoute: buildSimpleRoute(primaryReward.address, nativeToken),
        outputToCoinRoute:   buildSimpleRoute(nativeToken, coinAddr),
      };
      setRoutes(r);
      setForm(f => ({ ...f, routes: r }));
    } else {
      // Chef / gauge: call suggest-routes API
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
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setRoute(key, val) {
    setRoutes(prev => {
      const next = { ...prev, [key]: val };
      setForm(f => ({ ...f, routes: next }));
      return next;
    });
  }

  /* ── canProceed per strategy ───────────────────────────────────────────────── */
  let canProceed = false;
  if (routes) {
    if (isAura) {
      canProceed = routes.outputToNativeRoute?.length >= 2;
    } else if (isConvex) {
      canProceed = routes.outputToNativeRoute?.length >= 2 &&
                   routes.outputToCoinRoute?.length  >= 1;
    } else {
      canProceed = routes.outputToNativeRoute?.length >= 2 &&
                   routes.outputToLp0Route?.length >= 1 &&
                   routes.outputToLp1Route?.length >= 1;
    }
  }

  const rewardSymbol = primaryReward?.symbol || '?';
  const coinSymbol   = form.convexCoin?.symbol || '?';

  return (
    <PixelBox variant="gold" style={{ padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ color: 'var(--gold)', fontSize: '11px', marginBottom: '8px' }}>
          ▶ STEP 5 — SWAP ROUTES
        </div>
        <div style={{ fontSize: '7px', color: 'var(--white)', marginBottom: '8px' }}>
          {isAura
            ? 'The Aura strategy swaps BAL rewards → native, charges fees, then re-joins the Balancer pool.'
            : isConvex
            ? 'The Convex strategy swaps CRV rewards → native, charges fees, then swaps native → coin and adds Curve liquidity.'
            : 'Routes tell the strategy how to swap reward tokens into LP components.'}
          <br />
          We auto-suggest them — review and edit if needed.
        </div>
        <div className="hint">
          Format: comma-separated addresses.
        </div>
      </div>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--cyan)' }}>
          <Spinner /> Fetching suggested routes…
        </div>
      )}

      {routes && (
        <div style={{ display: 'grid', gap: '16px' }}>
          {/* outputToNativeRoute — all strategies */}
          <EditableRoute
            label={`${rewardSymbol} → ${nativeSymbol} (output to native)`}
            route={routes.outputToNativeRoute || []}
            setRoute={val => setRoute('outputToNativeRoute', val)}
            tokenMap={tokenMap}
          />

          {/* Chef / Gauge: lp0 + lp1 routes */}
          {!isSpecial && (
            <>
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
            </>
          )}

          {/* Convex: coin route */}
          {isConvex && (
            <EditableRoute
              label={`${nativeSymbol} → ${coinSymbol} (native to Curve coin)`}
              route={routes.outputToCoinRoute || []}
              setRoute={val => setRoute('outputToCoinRoute', val)}
              tokenMap={tokenMap}
            />
          )}

          {/* Aura note */}
          {isAura && (
            <PixelBox style={{ padding: '10px' }}>
              <div style={{ fontSize: '7px', color: 'var(--cyan)' }}>
                ℹ️ Balancer pool liquidity is added automatically by the vault via a single-asset join
                at the native token index — no lp0/lp1 routes needed.
              </div>
            </PixelBox>
          )}
        </div>
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
