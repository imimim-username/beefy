import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { PixelBox, Field, Spinner } from './PixelBox.jsx';
import { useDebounce } from '../hooks/useDebounce.js';

function formatTvl(usd) {
  if (!usd || usd < 1) return null;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 1_000)     return `$${(usd / 1_000).toFixed(1)}K`;
  return `$${usd.toFixed(0)}`;
}

function formatAge(createdAtMs) {
  if (!createdAtMs) return null;
  const days = Math.floor((Date.now() - createdAtMs) / (1000 * 60 * 60 * 24));
  if (days < 1)   return '< 1 day old';
  if (days < 30)  return `${days}d old`;
  if (days < 365) return `${Math.floor(days / 30)}mo old`;
  return `${(days / 365).toFixed(1)}yr old`;
}

export function Step2LP({ form, setForm, onNext, onBack }) {
  const [lpInput,  setLpInput]  = useState(form.want || '');
  const [lpInfo,   setLpInfo]   = useState(form.lpInfo || null);
  const [status,   setStatus]   = useState(''); // '', 'loading', 'ok', 'error'
  const [msg,      setMsg]      = useState('');

  // Vault existence + health check state
  const [vaultCheck,  setVaultCheck]  = useState(null); // null | { exists, vaults, tvl, volume24h, pairAge, dexName }
  const [healthLoading, setHealthLoading] = useState(false);

  const debounced = useDebounce(lpInput, 700);

  // LP resolution
  useEffect(() => {
    if (!debounced || debounced.length < 42 || !form.chainId) return;
    setStatus('loading');
    setMsg('Resolving LP token…');
    setVaultCheck(null);
    api.resolveLp(form.chainId, debounced)
      .then(res => {
        if (!res.ok) { setStatus('error'); setMsg(res.error || 'Failed to resolve LP'); return; }
        setLpInfo(res);
        setForm(f => ({ ...f, want: res.lpAddress, lpInfo: res }));
        setStatus('ok');
        const typeTag =
          res.lpType === 'single'  ? ' [SINGLE ASSET]'                     :
          res.lpType === 'balancer'? ` [Balancer v${res.balancerVersion || 2}]` :
          res.lpType === 'curve'   ? ' [Curve]'                             : '';
        const tokens = [res.token0?.symbol, res.token1?.symbol, res.token2?.symbol].filter(Boolean).join(' / ');
        setMsg(`Found: ${tokens}${typeTag}`);
      })
      .catch(e => { setStatus('error'); setMsg(e.message); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, form.chainId]);

  // Vault existence + DexScreener health check (fires once LP resolves OK)
  useEffect(() => {
    if (status !== 'ok' || !debounced || debounced.length < 42 || !form.chainId) return;
    setHealthLoading(true);
    api.checkExistingVault(form.chainId, debounced)
      .then(res => {
        if (res.ok) setVaultCheck(res);
      })
      .catch(() => {})
      .finally(() => setHealthLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <PixelBox variant="cyan" style={{ padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ color: 'var(--cyan)', fontSize: '11px', marginBottom: '8px' }}>
          ▶ STEP 2 — LP TOKEN / ASSET
        </div>
        <div style={{ fontSize: '7px', color: 'var(--white)', marginBottom: '16px' }}>
          Enter the address of the LP token you want to farm, or a single asset token
          (USDC, WETH…) for supply strategies like Aave, Morpho, Compound V3, or Silo V2.<br />
          This is the token that gets deposited into the vault.
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
            onChange={e => { setLpInput(e.target.value); setStatus(''); setMsg(''); setLpInfo(null); setVaultCheck(null); }}
          />
          {status === 'loading' && <Spinner />}
        </div>
      </Field>

      {/* ── Existing vault warning ───────────────────────────────────────────── */}
      {healthLoading && (
        <div style={{ fontSize: '6px', color: '#888', marginBottom: '10px', display: 'flex', gap: '6px', alignItems: 'center' }}>
          <Spinner /> Checking Beefy vault registry…
        </div>
      )}

      {vaultCheck?.exists && (
        <PixelBox variant="red" style={{ padding: '10px', marginBottom: '12px' }}>
          <div style={{ fontSize: '7px', color: 'var(--red)', lineHeight: '1.7' }}>
            ⚠ <strong>Beefy already has an active vault for this LP:</strong>
            <ul style={{ margin: '6px 0 0 12px', padding: 0 }}>
              {vaultCheck.vaults.map(v => (
                <li key={v.id}>
                  <a href={v.url} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>
                    {v.name}
                  </a>
                  {' '}
                  <span style={{ color: '#888' }}>({v.status})</span>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: '6px', color: '#aaa' }}>
              You can continue if you have a reason to deploy a second vault, but check with the Beefy team first.
            </div>
          </div>
        </PixelBox>
      )}

      {/* ── LP health / TVL chips ────────────────────────────────────────────── */}
      {vaultCheck && !vaultCheck.exists && (vaultCheck.tvl || vaultCheck.volume24h || vaultCheck.pairAge) && (
        <div style={{
          display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px',
          fontSize: '6px',
        }}>
          {vaultCheck.tvl != null && (
            <span style={{
              background: vaultCheck.tvl >= 100_000 ? 'rgba(0,255,100,0.12)' : 'rgba(255,200,0,0.12)',
              color: vaultCheck.tvl >= 100_000 ? 'var(--green)' : 'var(--gold)',
              border: `1px solid ${vaultCheck.tvl >= 100_000 ? 'var(--green)' : 'var(--gold)'}`,
              padding: '2px 8px',
            }}>
              TVL {formatTvl(vaultCheck.tvl)}
            </span>
          )}
          {vaultCheck.volume24h != null && (
            <span style={{
              background: 'rgba(0,200,255,0.10)',
              color: 'var(--cyan)', border: '1px solid var(--cyan)', padding: '2px 8px',
            }}>
              24h vol {formatTvl(vaultCheck.volume24h)}
            </span>
          )}
          {vaultCheck.pairAge != null && (
            <span style={{ color: '#888', border: '1px solid #444', padding: '2px 8px' }}>
              {formatAge(vaultCheck.pairAge)}
            </span>
          )}
          {vaultCheck.dexName && (
            <span style={{ color: '#888', border: '1px solid #444', padding: '2px 8px' }}>
              {vaultCheck.dexName}
            </span>
          )}
          {vaultCheck.tvl != null && vaultCheck.tvl < 50_000 && (
            <span style={{ color: 'var(--gold)', fontSize: '6px', fontStyle: 'italic' }}>
              ⚠ Low TVL — consider whether this pool has enough liquidity to sustain a vault
            </span>
          )}
        </div>
      )}

      {lpInfo && (
        <PixelBox style={{ padding: '14px', marginBottom: '16px' }}>
          <div style={{ fontSize: '7px', display: 'grid', gap: '8px' }}>
            <div>
              <span style={{ color: 'var(--gold)' }}>{lpInfo.lpType === 'single' ? 'Token: ' : 'LP Symbol: '}</span>
              <span className="tag tag--cyan">{lpInfo.lpSymbol}</span>
            </div>
            {lpInfo.lpType && (
              <div>
                <span style={{ color: 'var(--gold)' }}>Type: </span>
                <span className="tag tag--cyan">
                  {lpInfo.lpType === 'single'   ? 'SINGLE ASSET'                       :
                   lpInfo.lpType === 'balancer' ? `BALANCER V${lpInfo.balancerVersion || 2}` :
                   lpInfo.lpType.toUpperCase()}
                </span>
              </div>
            )}

            {/* Single-asset: show one token card + explanation */}
            {lpInfo.lpType === 'single' && lpInfo.token0 && (
              <>
                <div style={{ padding: '8px', background: 'var(--dark)', border: '1px solid var(--cyan)' }}>
                  <div style={{ color: 'var(--gold)', marginBottom: '4px' }}>ASSET</div>
                  <div className="tag tag--gold">{lpInfo.token0.symbol}</div>
                  <div className="addr" style={{ marginTop: '4px' }}>{lpInfo.token0.address}</div>
                  {lpInfo.token0.name && (
                    <div style={{ color: '#888', marginTop: '2px' }}>{lpInfo.token0.name}</div>
                  )}
                </div>
                <div style={{ color: 'var(--cyan)', fontSize: '6px', lineHeight: '1.6' }}>
                  ℹ Single-asset token detected. In the next step you'll choose a
                  supply strategy: Aave, Morpho, Compound V3, Silo V2, or any ERC-4626 vault.
                </div>
              </>
            )}

            {/* LP types: show token grid */}
            {lpInfo.lpType !== 'single' && (
              <>
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
              </>
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
