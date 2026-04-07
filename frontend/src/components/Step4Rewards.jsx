import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { PixelBox, Field, Spinner } from './PixelBox.jsx';
import { useDebounce } from '../hooks/useDebounce.js';

// Strategy types that support on-chain reward token detection
const AUTO_DETECT_TYPES = new Set(['gauge', 'convex', 'curvegauge', 'stakedao', 'aura']);

// Primary reward hint per strategy
const PRIMARY_HINT = {
  aura:      '🔷 Primary reward should be BAL (Balancer governance token).',
  convex:    '⚙️ Primary reward should be CRV (Curve DAO token).',
  curvegauge:'⚙️ Primary reward should be CRV (Curve DAO token).',
  stakedao:  '🟣 Primary reward should be SDT (StakeDAO token).',
};

export function Step4Rewards({ form, setForm, onNext, onBack }) {
  const [knownTokens,   setKnownTokens]   = useState([]);
  const [selected,      setSelected]      = useState(form.rewardTokens || []);
  const [addInput,      setAddInput]      = useState('');
  const [addStatus,     setAddStatus]     = useState('');
  const [addMsg,        setAddMsg]        = useState('');
  const [resolvedToken, setResolvedToken] = useState(null);

  // Auto-detection state
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [autoMsg,       setAutoMsg]       = useState('');
  const [autoDetected,  setAutoDetected]  = useState(new Set()); // addresses auto-detected

  const debounced = useDebounce(addInput, 700);

  // Track whether we already ran auto-detect for this staking address
  const lastAutoStaking = useRef('');

  // Load known tokens whenever chain changes
  useEffect(() => {
    if (form.chainId) {
      api.getTokens(form.chainId).then(setKnownTokens).catch(() => {});
    }
  }, [form.chainId]);

  // Auto-detect reward tokens from staking contract
  useEffect(() => {
    const { chainId, strategyType, staking, rewardPool } = form;
    if (!AUTO_DETECT_TYPES.has(strategyType)) return;
    if (!chainId || !staking || staking.length < 42) return;
    // Only run once per unique staking address (avoid re-running on every render)
    if (staking === lastAutoStaking.current) return;
    lastAutoStaking.current = staking;

    setAutoDetecting(true);
    setAutoMsg('Scanning staking contract for reward tokens…');

    api.rewardTokens(chainId, strategyType, staking, rewardPool || null)
      .then(async res => {
        if (!res.ok || !res.tokens || res.tokens.length === 0) {
          setAutoMsg('No reward tokens auto-detected — add manually below.');
          setAutoDetecting(false);
          return;
        }

        // Save each detected token to the registry (idempotent)
        for (const t of res.tokens) {
          await api.addToken(chainId, t).catch(() => {});
        }

        // Refresh known tokens list
        const refreshed = await api.getTokens(chainId).catch(() => knownTokens);
        setKnownTokens(refreshed);

        // Pre-select detected tokens (don't overwrite any already-selected tokens
        // that may have been carried from a previous visit to this step)
        setSelected(prev => {
          const merged = [...prev];
          const detectedAddrs = new Set();
          for (const t of res.tokens) {
            detectedAddrs.add(t.address.toLowerCase());
            if (!merged.some(p => p.address.toLowerCase() === t.address.toLowerCase())) {
              merged.push(t);
            }
          }
          setAutoDetected(detectedAddrs);
          setForm(f => ({ ...f, rewardTokens: merged }));
          return merged;
        });

        setAutoMsg(`Auto-detected ${res.tokens.length} reward token${res.tokens.length > 1 ? 's' : ''} from chain.`);
        setAutoDetecting(false);
      })
      .catch(e => {
        setAutoMsg(`Detection failed: ${e.message}`);
        setAutoDetecting(false);
      });
  }, [form.staking, form.strategyType, form.chainId, form.rewardPool]); // eslint-disable-line

  // Auto-resolve new address typed in the "Add Token" input
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
  const isAutoDetected = (addr) => autoDetected.has(addr.toLowerCase());

  const hint = PRIMARY_HINT[form.strategyType];

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
        {hint && (
          <div style={{ fontSize: '7px', color: 'var(--gold)', marginTop: '6px' }}>
            {hint}
          </div>
        )}
      </div>

      {/* Auto-detection status banner */}
      {AUTO_DETECT_TYPES.has(form.strategyType) && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(0,255,200,0.07)',
          border: '1px solid var(--cyan)',
          padding: '8px 12px',
          marginBottom: '16px',
          fontSize: '7px',
          color: autoDetecting ? 'var(--cyan)' : autoDetected.size > 0 ? 'var(--green)' : 'var(--border)',
        }}>
          {autoDetecting ? <Spinner /> : (autoDetected.size > 0 ? '✓' : '○')}
          <span>{autoMsg || 'Reward token detection pending…'}</span>
        </div>
      )}

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
                title={`${t.address}${isAutoDetected(t.address) ? ' (auto-detected)' : ''}`}
              >
                {isSelected(t.address) ? '✓ ' : ''}{t.symbol}
                {isAutoDetected(t.address) && (
                  <span style={{ fontSize: '5px', marginLeft: '3px', opacity: 0.8 }}>⚡</span>
                )}
              </button>
            ))}
          </div>
          {autoDetected.size > 0 && (
            <div style={{ fontSize: '6px', color: 'var(--border)', marginTop: '5px' }}>
              ⚡ = auto-detected from staking contract
            </div>
          )}
        </div>
      )}

      {knownTokens.length === 0 && !autoDetecting && (
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
                {isAutoDetected(t.address) && (
                  <span style={{ fontSize: '5px', marginLeft: '2px', opacity: 0.8 }}>⚡</span>
                )}
                <button
                  onClick={() => toggleToken(t)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', marginLeft: '4px' }}
                >✕</button>
              </span>
            ))}
          </div>
          {selected.length > 1 && (
            <div style={{ fontSize: '7px', color: 'var(--border)', marginTop: '8px' }}>
              ⭐ = primary output (used for swap routes) &nbsp;·&nbsp; ⚡ = auto-detected
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
