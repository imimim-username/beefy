import React, { useState } from 'react';
import { PixelBox, Field } from './PixelBox.jsx';

export function Step6VaultName({ form, setForm, onNext, onBack }) {
  const lp = form.lpInfo;
  const t0 = lp?.token0?.symbol || 'TKN0';
  const t1 = lp?.token1?.symbol || 'TKN1';

  // Suggest defaults
  const suggestedName   = `Beefy ${t0}-${t1}`;
  const suggestedSymbol = `moo${t0}${t1}`;

  const [name,   setName]   = useState(form.vaultName   || suggestedName);
  const [symbol, setSymbol] = useState(form.vaultSymbol || suggestedSymbol);
  const [router, setRouter] = useState(form.unirouter   || '');

  function commit() {
    setForm(f => ({
      ...f,
      vaultName:   name.trim()   || suggestedName,
      vaultSymbol: symbol.trim() || suggestedSymbol,
      unirouter:   router.trim() || undefined,
    }));
    onNext();
  }

  const valid = name.trim().length > 0 && symbol.trim().length > 0;

  return (
    <PixelBox variant="cyan" style={{ padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ color: 'var(--cyan)', fontSize: '11px', marginBottom: '8px' }}>
          ▶ STEP 6 — VAULT DETAILS
        </div>
        <div style={{ fontSize: '7px', color: 'var(--white)', marginBottom: '16px' }}>
          Name your vault. The symbol (moo-token) will be what depositors hold in their wallets.
        </div>
      </div>

      <Field label="Vault Name (ERC-20 name)">
        <input
          className="pixel-input"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={48}
          placeholder={suggestedName}
        />
      </Field>

      <Field label="Vault Symbol (moo-token)">
        <input
          className="pixel-input"
          value={symbol}
          onChange={e => setSymbol(e.target.value)}
          maxLength={24}
          placeholder={suggestedSymbol}
          style={{ width: '200px' }}
        />
      </Field>

      <Field
        label="DEX Router Override (optional)"
        hint="Leave blank to use the default router for this network"
      >
        <input
          className="pixel-input"
          value={router}
          onChange={e => setRouter(e.target.value)}
          placeholder="0x… (leave blank for default)"
        />
      </Field>

      <PixelBox style={{ padding: '12px', marginBottom: '16px' }}>
        <div style={{ fontSize: '7px', display: 'grid', gap: '6px' }}>
          <div><span style={{ color: 'var(--gold)' }}>Preview name:   </span>{name || suggestedName}</div>
          <div><span style={{ color: 'var(--gold)' }}>Preview symbol: </span>{symbol || suggestedSymbol}</div>
        </div>
      </PixelBox>

      <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn" onClick={onBack}>◀ BACK</button>
        <button className="btn btn--gold" disabled={!valid} onClick={commit}>
          NEXT ▶
        </button>
      </div>
    </PixelBox>
  );
}
