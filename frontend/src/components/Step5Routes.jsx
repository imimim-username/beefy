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
 * Works for convex where routes are straightforward.
 */
function buildSimpleRoute(from, to) {
  if (!from || !to) return [];
  if (from.toLowerCase() === to.toLowerCase()) return [from];
  return [from, to];
}

// ─── Aura: deposit token selector ────────────────────────────────────────────
//
// StrategyBalancerV3 (official Beefy audited contract) uses a single "deposit
// token" to add liquidity to the Balancer pool on harvest. Rewards (BAL, AURA)
// are swapped to native via BeefySwapper, then native → depositToken, then
// depositToken is single-asset joined into the pool to mint BPT.
//
// Best choice: the pool token that matches the chain's native (WETH on Ethereum)
// so the strategy skips the extra swap. If native is not a pool token, pick any
// pool token that BeefySwapper can reach from native.

function AuraDepositTokenStep({ form, setForm }) {
  const chainInfo   = CHAINS_INFO[form.chainId] || {};
  const nativeToken = chainInfo.nativeToken || '';

  // Collect pool tokens from lpInfo
  const poolTokens = [];
  if (form.lpInfo?.token0) poolTokens.push(form.lpInfo.token0);
  if (form.lpInfo?.token1) poolTokens.push(form.lpInfo.token1);
  if (form.lpInfo?.token2) poolTokens.push(form.lpInfo.token2);

  // Default: native token if it's one of the pool tokens; otherwise first token
  const defaultToken = poolTokens.find(t =>
    t.address.toLowerCase() === nativeToken.toLowerCase()
  ) || poolTokens[0];

  const [selected, setSelected] = useState(
    form.depositToken || defaultToken?.address || ''
  );

  // Custom address input (for pools where the deposit token isn't auto-detected)
  const [customAddr, setCustomAddr]   = useState('');
  const [customErr,  setCustomErr]    = useState('');
  const useCustom = selected === '__custom__';

  useEffect(() => {
    // Pre-select native token on first render if not already set
    if (!form.depositToken && defaultToken?.address) {
      setSelected(defaultToken.address);
      setForm(f => ({ ...f, depositToken: defaultToken.address }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSelect(addr) {
    setSelected(addr);
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
          ℹ️ <strong>How StrategyBalancerV3 harvests:</strong>
          <br />
          1. Claims BAL + AURA rewards from Aura
          <br />
          2. BeefySwapper swaps BAL + AURA → native (WETH)
          <br />
          3. If needed, swaps native → <em>deposit token</em>
          <br />
          4. Single-asset joins the Balancer pool to mint BPT
          <br />
          <br />
          <strong>Pick the deposit token below.</strong> Choose native (WETH) if
          it's a pool token — it saves a swap step.
        </div>
      </PixelBox>

      <Field label="DEPOSIT TOKEN" hint="Which pool token to use when adding liquidity on harvest">
        <div style={{ display: 'grid', gap: '6px' }}>
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
        <div style={{ fontSize: '7px', color: '#aaa' }}>
          Selected: <span style={{ color: 'var(--cyan)' }}>{selected}</span>
          {isNative(selected)
            ? ' — strategy will deposit directly without an extra swap ✓'
            : ' — strategy will swap native → this token on each harvest'}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

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
    if (form.lpInfo.token2) tokenMap[form.lpInfo.token2.address.toLowerCase()] = form.lpInfo.token2;
  }
  if (form.rewardTokens) {
    form.rewardTokens.forEach(t => { tokenMap[t.address.toLowerCase()] = t; });
  }
  if (nativeToken) tokenMap[nativeToken.toLowerCase()] = { symbol: nativeSymbol };
  if (form.convexCoin) tokenMap[form.convexCoin.address.toLowerCase()] = form.convexCoin;

  /* ── Auto-suggest routes on mount (non-Aura strategies) ───────────────────── */
  useEffect(() => {
    if (isAura) return; // Aura uses depositToken picker instead
    if (routes) return;
    if (!primaryReward || !nativeToken) return;

    if (isConvex) {
      const coinAddr = form.convexCoin?.address;
      const r = {
        outputToNativeRoute: buildSimpleRoute(primaryReward.address, nativeToken),
        outputToCoinRoute:   buildSimpleRoute(nativeToken, coinAddr),
      };
      setRoutes(r);
      setForm(f => ({ ...f, routes: r }));
    } else {
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
  if (isAura) {
    // For Aura: need a valid depositToken (not zero address)
    const dt = form.depositToken || '';
    canProceed = /^0x[0-9a-fA-F]{40}$/.test(dt) && dt !== '0x0000000000000000000000000000000000000000';
  } else if (routes) {
    if (isConvex) {
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
          ▶ STEP 5 — {isAura ? 'DEPOSIT TOKEN' : 'SWAP ROUTES'}
        </div>
        <div style={{ fontSize: '7px', color: 'var(--white)', marginBottom: '8px' }}>
          {isAura
            ? 'StrategyBalancerV3 uses BeefySwapper to handle all reward → native swaps automatically. You only need to choose which pool token it deposits into Balancer to mint BPT.'
            : isConvex
            ? 'The Convex strategy swaps CRV rewards → native, charges fees, then swaps native → coin and adds Curve liquidity.'
            : 'Routes tell the strategy how to swap reward tokens into LP components.'}
          {!isAura && (
            <>
              <br />We auto-suggest them — review and edit if needed.
            </>
          )}
        </div>
      </div>

      {/* ── Aura: deposit token picker ─────────────────────────────────────────── */}
      {isAura && (
        <AuraDepositTokenStep form={form} setForm={setForm} />
      )}

      {/* ── Non-Aura: route inputs ─────────────────────────────────────────────── */}
      {!isAura && (
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

              {isConvex && (
                <EditableRoute
                  label={`${nativeSymbol} → ${coinSymbol} (native to Curve coin)`}
                  route={routes.outputToCoinRoute || []}
                  setRoute={val => setRoute('outputToCoinRoute', val)}
                  tokenMap={tokenMap}
                />
              )}
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
