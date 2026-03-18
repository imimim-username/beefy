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

export function Step5Routes({ form, setForm, onNext, onBack }) {
  const [loading, setLoading] = useState(false);
  const [routes, setRoutes]   = useState(form.routes || null);

  const primaryReward = form.rewardTokens?.[0];
  const lp0 = form.lpInfo?.token0;
  const lp1 = form.lpInfo?.token1;

  // Build a token symbol map for display
  const tokenMap = {};
  if (form.lpInfo) {
    tokenMap[lp0.address.toLowerCase()] = lp0;
    tokenMap[lp1.address.toLowerCase()] = lp1;
  }
  if (form.rewardTokens) {
    form.rewardTokens.forEach(t => { tokenMap[t.address.toLowerCase()] = t; });
  }
  // Add chain's native
  const chainNative = CHAINS_INFO[form.chainId]?.nativeToken;
  if (chainNative) tokenMap[chainNative.toLowerCase()] = { symbol: CHAINS_INFO[form.chainId].nativeSymbol };

  useEffect(() => {
    if (!primaryReward || !lp0 || !lp1) return;
    if (routes) return; // already fetched
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

  const canProceed = routes &&
    routes.outputToNativeRoute?.length >= 2 &&
    routes.outputToLp0Route?.length >= 1 &&
    routes.outputToLp1Route?.length >= 1;

  return (
    <PixelBox variant="gold" style={{ padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ color: 'var(--gold)', fontSize: '11px', marginBottom: '8px' }}>
          ▶ STEP 5 — SWAP ROUTES
        </div>
        <div style={{ fontSize: '7px', color: 'var(--white)', marginBottom: '8px' }}>
          Routes tell the strategy how to swap reward tokens into LP components.<br />
          We auto-suggest them — review and edit if needed.
        </div>
        <div className="hint">
          Format: comma-separated addresses. Min 2 for→native, 1 for→LP tokens.
        </div>
      </div>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--cyan)' }}>
          <Spinner /> Fetching suggested routes…
        </div>
      )}

      {routes && (
        <div style={{ display: 'grid', gap: '16px' }}>
          <EditableRoute
            label={`Output → Native (${primaryReward?.symbol || '?'} → ${CHAINS_INFO[form.chainId]?.nativeSymbol || 'native'})`}
            route={routes.outputToNativeRoute}
            setRoute={val => setRoute('outputToNativeRoute', val)}
            tokenMap={tokenMap}
          />
          <EditableRoute
            label={`Output → LP Token0 (${primaryReward?.symbol || '?'} → ${lp0?.symbol || '?'})`}
            route={routes.outputToLp0Route}
            setRoute={val => setRoute('outputToLp0Route', val)}
            tokenMap={tokenMap}
          />
          <EditableRoute
            label={`Output → LP Token1 (${primaryReward?.symbol || '?'} → ${lp1?.symbol || '?'})`}
            route={routes.outputToLp1Route}
            setRoute={val => setRoute('outputToLp1Route', val)}
            tokenMap={tokenMap}
          />
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
