import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { PixelBox, Field, Spinner } from './PixelBox.jsx';
import { useDebounce } from '../hooks/useDebounce.js';

export function Step2LP({ form, setForm, onNext, onBack }) {
  const [lpInput,  setLpInput]  = useState(form.want || '');
  const [lpInfo,   setLpInfo]   = useState(form.lpInfo || null);
  const [status,   setStatus]   = useState(''); // '', 'loading', 'ok', 'error'
  const [msg,      setMsg]      = useState('');

  const debounced = useDebounce(lpInput, 700);

  useEffect(() => {
    if (!debounced || debounced.length < 42 || !form.chainId) return;
    setStatus('loading');
    setMsg('Resolving LP token…');
    api.resolveLp(form.chainId, debounced)
      .then(res => {
        if (!res.ok) { setStatus('error'); setMsg(res.error || 'Failed to resolve LP'); return; }
        setLpInfo(res);
        setForm(f => ({ ...f, want: res.lpAddress, lpInfo: res }));
        setStatus('ok');
        const typeTag = res.lpType === 'balancer'
          ? ` [Balancer v${res.balancerVersion || 2}]`
          : res.lpType === 'curve' ? ' [Curve]' : '';
        const tokens = [res.token0?.symbol, res.token1?.symbol, res.token2?.symbol].filter(Boolean).join(' / ');
        setMsg(`Found: ${tokens}${typeTag}`);
      })
      .catch(e => { setStatus('error'); setMsg(e.message); });
  }, [debounced, form.chainId]);

  return (
    <PixelBox variant="cyan" style={{ padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ color: 'var(--cyan)', fontSize: '11px', marginBottom: '8px' }}>
          ▶ STEP 2 — LP TOKEN
        </div>
        <div style={{ fontSize: '7px', color: 'var(--white)', marginBottom: '16px' }}>
          Enter the address of the LP token you want to farm.<br />
          This is the token that gets staked into the chef or gauge.
        </div>
      </div>

      <Field
        label="LP Token Address"
        hint={msg}
        hintType={status}
      >
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input
            className={`pixel-input ${status === 'error' ? 'error' : ''} ${status === 'ok' ? 'ok' : ''}`}
            placeholder="0x..."
            value={lpInput}
            onChange={e => { setLpInput(e.target.value); setStatus(''); setMsg(''); setLpInfo(null); }}
          />
          {status === 'loading' && <Spinner />}
        </div>
      </Field>

      {lpInfo && (
        <PixelBox style={{ padding: '14px', marginBottom: '16px' }}>
          <div style={{ fontSize: '7px', display: 'grid', gap: '8px' }}>
            <div>
              <span style={{ color: 'var(--gold)' }}>LP Symbol: </span>
              <span className="tag tag--cyan">{lpInfo.lpSymbol}</span>
            </div>
            {lpInfo.lpType && (
              <div>
                <span style={{ color: 'var(--gold)' }}>Pool type: </span>
                <span className="tag tag--cyan">
                  {lpInfo.lpType === 'balancer'
                    ? `BALANCER V${lpInfo.balancerVersion || 2}`
                    : lpInfo.lpType.toUpperCase()}
                </span>
              </div>
            )}
            {lpInfo.balancerVersion === 3 && (
              <div style={{ padding: '8px', background: 'var(--dark)', border: '1px solid var(--gold)', borderRadius: '2px' }}>
                <div style={{ fontSize: '7px', color: 'var(--gold)' }}>
                  ⚠ Balancer v3 pool detected. The current Aura strategy contracts
                  target the Balancer v2 Vault (<code>joinPool</code> interface).
                  Balancer v3 pools use a different join mechanism and are not yet
                  supported by the included strategy contract. Proceed only if you
                  have a compatible v3-aware strategy.
                </div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${lpInfo.token2 ? 3 : 2}, 1fr)`, gap: '8px' }}>
              {[lpInfo.token0, lpInfo.token1, lpInfo.token2].filter(Boolean).map((tok, i) => (
                <div key={i}>
                  <div style={{ color: 'var(--gold)', marginBottom: '4px' }}>TOKEN {i}</div>
                  <div className="tag tag--gold">{tok.symbol}</div>
                  <div className="addr" style={{ marginTop: '4px' }}>{tok.address.slice(0, 20)}…</div>
                </div>
              ))}
            </div>
            {lpInfo.isStable !== undefined && (
              <div>
                <span style={{ color: 'var(--gold)' }}>Pair type: </span>
                <span className={`tag ${lpInfo.isStable ? 'tag--cyan' : 'tag--gold'}`}>
                  {lpInfo.isStable ? 'STABLE' : 'VOLATILE'}
                </span>
              </div>
            )}
          </div>
        </PixelBox>
      )}

      <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn" onClick={onBack}>◀ BACK</button>
        <button
          className="btn btn--gold"
          disabled={status !== 'ok'}
          onClick={onNext}
        >
          NEXT ▶
        </button>
      </div>
    </PixelBox>
  );
}
