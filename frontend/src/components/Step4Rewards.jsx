import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { PixelBox, Field, Spinner } from './PixelBox.jsx';
import { useDebounce } from '../hooks/useDebounce.js';

export function Step4Rewards({ form, setForm, onNext, onBack }) {
  const [knownTokens,   setKnownTokens]   = useState([]);
  const [selected,      setSelected]      = useState(form.rewardTokens || []);
  const [addInput,      setAddInput]      = useState('');
  const [addStatus,     setAddStatus]     = useState('');
  const [addMsg,        setAddMsg]        = useState('');
  const [resolvedToken, setResolvedToken] = useState(null);

  const debounced = useDebounce(addInput, 700);

  useEffect(() => {
    if (form.chainId) {
      api.getTokens(form.chainId).then(setKnownTokens).catch(() => {});
    }
  }, [form.chainId]);

  // Auto-resolve new address
  useEffect(() => {
    if (!debounced || debounced.length < 42 || !form.chainId) { setResolvedToken(null); return; }
    setAddStatus('loading');
    api.resolveToken(form.chainId, debounced)
      .then(res => {
        if (!res.ok) { setAddStatus('error'); setAddMsg(res.error); setResolvedToken(null); return; }
        setResolvedToken(res);
        setAddStatus('ok');
        setAddMsg(`Found: ${res.symbol} — ${res.name}`);
      })
      .catch(e => { setAddStatus('error'); setAddMsg(e.message); });
  }, [debounced, form.chainId]);

  function toggleToken(token) {
    setSelected(prev => {
      const already = prev.some(t => t.address.toLowerCase() === token.address.toLowerCase());
      const next = already
        ? prev.filter(t => t.address.toLowerCase() !== token.address.toLowerCase())
        : [...prev, token];
      setForm(f => ({ ...f, rewardTokens: next }));
      return next;
    });
  }

  async function addCustomToken() {
    if (!resolvedToken) return;
    await api.addToken(form.chainId, resolvedToken);
    setKnownTokens(await api.getTokens(form.chainId));
    toggleToken(resolvedToken);
    setAddInput('');
    setResolvedToken(null);
    setAddStatus('');
    setAddMsg('');
  }

  const isSelected = (addr) => selected.some(t => t.address.toLowerCase() === addr.toLowerCase());

  return (
    <PixelBox variant="cyan" style={{ padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ color: 'var(--cyan)', fontSize: '11px', marginBottom: '8px' }}>
          ▶ STEP 4 — REWARD TOKENS
        </div>
        <div style={{ fontSize: '7px', color: 'var(--white)', marginBottom: '8px' }}>
          Select the token(s) the staking contract pays out as rewards.<br/>
          These are what Beefy harvests and compounds back into LP.
        </div>
        <div style={{ fontSize: '7px', color: 'var(--cyan)' }}>
          The primary reward (first selected) is used as the "output" token in routes.
        </div>
        {form.strategyType === 'aura' && (
          <div style={{ fontSize: '7px', color: 'var(--gold)', marginTop: '6px' }}>
            🔷 Aura strategy: primary reward should be <strong>BAL</strong> (Balancer governance token).
          </div>
        )}
        {form.strategyType === 'convex' && (
          <div style={{ fontSize: '7px', color: 'var(--gold)', marginTop: '6px' }}>
            ⚙️ Convex strategy: primary reward should be <strong>CRV</strong> (Curve DAO token).
          </div>
        )}
      </div>

      {/* Known tokens grid */}
      {knownTokens.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div className="pixel-label">Known Tokens on This Chain</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {knownTokens.map(t => (
              <button
                key={t.address}
                className={`token-badge ${isSelected(t.address) ? 'selected' : ''}`}
                onClick={() => toggleToken(t)}
                title={t.address}
              >
                {isSelected(t.address) ? '✓ ' : ''}{t.symbol}
              </button>
            ))}
          </div>
        </div>
      )}

      {knownTokens.length === 0 && (
        <div className="hint" style={{ marginBottom: '12px' }}>
          No tokens saved yet for this network — add one below.
        </div>
      )}

      {/* Add new token */}
      <PixelBox style={{ padding: '14px', marginBottom: '16px' }}>
        <div className="pixel-label">Add Token by Address</div>
        <Field hint={addMsg} hintType={addStatus}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              className={`pixel-input ${addStatus === 'error' ? 'error' : ''} ${addStatus === 'ok' ? 'ok' : ''}`}
              placeholder="0x..."
              value={addInput}
              onChange={e => { setAddInput(e.target.value); setAddStatus(''); setAddMsg(''); setResolvedToken(null); }}
            />
            {addStatus === 'loading' && <Spinner />}
          </div>
        </Field>
        {resolvedToken && (
          <div style={{ marginTop: '8px', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span className="tag tag--gold">{resolvedToken.symbol}</span>
            <span style={{ fontSize: '7px', color: 'var(--white)' }}>{resolvedToken.name}</span>
            <button className="btn btn--green btn--sm" onClick={addCustomToken}>
              + ADD & SELECT
            </button>
          </div>
        )}
      </PixelBox>

      {/* Selected tokens summary */}
      {selected.length > 0 && (
        <PixelBox style={{ padding: '12px', marginBottom: '16px' }}>
          <div className="pixel-label">Selected ({selected.length})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {selected.map((t, i) => (
              <span key={t.address} className={`tag ${i === 0 ? 'tag--gold' : 'tag--cyan'}`}>
                {i === 0 ? '⭐ ' : ''}{t.symbol}
                <button
                  onClick={() => toggleToken(t)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', marginLeft: '4px' }}
                >✕</button>
              </span>
            ))}
          </div>
          {selected.length > 1 && (
            <div style={{ fontSize: '7px', color: 'var(--border)', marginTop: '8px' }}>
              ⭐ = primary output (used for swap routes)
            </div>
          )}
        </PixelBox>
      )}

      <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn" onClick={onBack}>◀ BACK</button>
        <button
          className="btn btn--gold"
          disabled={selected.length === 0}
          onClick={onNext}
        >
          NEXT ▶
        </button>
      </div>
    </PixelBox>
  );
}
