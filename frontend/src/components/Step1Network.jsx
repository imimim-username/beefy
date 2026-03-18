import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { PixelBox, Field } from './PixelBox.jsx';

export function Step1Network({ form, setForm, onNext }) {
  const [chains, setChains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.chains()
      .then(list => { setChains(list); setLoading(false); })
      .catch(() => { setError('Could not reach backend — is the server running?'); setLoading(false); });
  }, []);

  const selected = chains.find(c => c.id === form.chainId);

  return (
    <PixelBox variant="gold" style={{ padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ color: 'var(--gold)', fontSize: '11px', marginBottom: '8px' }}>
          ▶ STEP 1 — SELECT NETWORK
        </div>
        <div style={{ fontSize: '7px', color: 'var(--cyan)', marginBottom: '16px' }}>
          Choose which blockchain you want to deploy on.
        </div>
      </div>

      {loading && <div className="hint loading">Loading chains…</div>}
      {error   && <div className="hint error">{error}</div>}

      {!loading && !error && (
        <Field label="Network">
          <select
            className="pixel-select"
            value={form.chainId || ''}
            onChange={e => setForm(f => ({ ...f, chainId: Number(e.target.value) }))}
          >
            <option value="">— pick a network —</option>
            {chains.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.nativeSymbol})
              </option>
            ))}
          </select>
        </Field>
      )}

      {selected && (
        <PixelBox style={{ padding: '12px', margin: '12px 0' }}>
          <div style={{ fontSize: '7px', color: 'var(--cyan)', display: 'grid', gap: '6px' }}>
            <div><span style={{ color: 'var(--gold)' }}>Chain ID: </span>{selected.id}</div>
            <div><span style={{ color: 'var(--gold)' }}>Native:   </span>{selected.nativeSymbol}</div>
            <div style={{ fontSize: '7px', color: 'var(--border)' }}>
              <span style={{ color: 'var(--gold)' }}>W{selected.nativeSymbol}: </span>
              <span className="addr" style={{ fontSize: '6px' }}>{selected.nativeToken}</span>
            </div>
            <div>
              <a
                href={selected.blockExplorer}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--cyan)', fontSize: '7px' }}
              >
                {selected.blockExplorer} ↗
              </a>
            </div>
          </div>
        </PixelBox>
      )}

      <div style={{ marginTop: '20px', textAlign: 'right' }}>
        <button
          className="btn btn--gold"
          disabled={!form.chainId}
          onClick={onNext}
        >
          NEXT ▶
        </button>
      </div>
    </PixelBox>
  );
}
