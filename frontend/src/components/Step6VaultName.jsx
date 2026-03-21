import React, { useState } from 'react';
import { PixelBox, Field } from './PixelBox.jsx';

const ETH_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

export function Step6VaultName({ form, setForm, onNext, onBack }) {
  const lp = form.lpInfo;
  const t0 = lp?.token0?.symbol || 'TKN0';
  const t1 = lp?.token1?.symbol || 'TKN1';
  const isAura = form.strategyType === 'aura';

  const suggestedName   = `Beefy ${t0}-${t1}`;
  const suggestedSymbol = `moo${t0}${t1}`;

  const [name,             setName]             = useState(form.vaultName        || suggestedName);
  const [symbol,           setSymbol]           = useState(form.vaultSymbol      || suggestedSymbol);
  const [router,           setRouter]           = useState(form.unirouter        || '');
  const [strategist,       setStrategist]       = useState(form.strategist       || '');
  const [harvestOnDeposit, setHarvestOnDeposit] = useState(form.harvestOnDeposit ?? false);

  const strategistErr = strategist.trim() && !ETH_ADDR_RE.test(strategist.trim());

  function commit() {
    setForm(f => ({
      ...f,
      vaultName:        name.trim()       || suggestedName,
      vaultSymbol:      symbol.trim()     || suggestedSymbol,
      unirouter:        router.trim()     || undefined,
      strategist:       strategist.trim() || undefined,
      harvestOnDeposit: isAura ? harvestOnDeposit : undefined,
    }));
    onNext();
  }

  const valid = name.trim().length > 0 && symbol.trim().length > 0 && !strategistErr;

  return (
    <PixelBox variant="cyan" style={{ padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ color: 'var(--cyan)', fontSize: '11px', marginBottom: '8px' }}>
          ▶ STEP 6 — VAULT DETAILS
        </div>
        <div style={{ fontSize: '7px', color: 'var(--white)', marginBottom: '16px' }}>
          Name your vault and set the address that will receive the strategist fee cut from each harvest.
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
          style={{ width: '220px' }}
        />
      </Field>

      <Field
        label="Strategist Address (fee recipient)"
        hint={
          strategistErr
            ? 'Must be a valid 0x address'
            : strategist.trim()
              ? '✓ This address receives the strategist cut on every harvest'
              : 'Leave blank to use the deployer address (your wallet)'
        }
        hintType={strategistErr ? 'error' : strategist.trim() ? 'ok' : ''}
      >
        <input
          className={`pixel-input ${strategistErr ? 'error' : strategist.trim() ? 'ok' : ''}`}
          value={strategist}
          onChange={e => setStrategist(e.target.value)}
          placeholder="0x… (leave blank to use deployer address)"
        />
      </Field>

      <PixelBox style={{ padding: '10px', marginBottom: '14px' }}>
        <div style={{ fontSize: '7px', color: 'var(--border)', lineHeight: '1.6' }}>
          On every harvest, fees are split three ways:<br />
          <span style={{ color: 'var(--gold)' }}>Strategist</span> (you) ·{' '}
          <span style={{ color: 'var(--cyan)' }}>Beefy treasury</span> ·{' '}
          <span style={{ color: 'var(--green)' }}>Caller (harvester bot)</span><br />
          The % split is governed by Beefy's on-chain fee config contract.
        </div>
      </PixelBox>

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

      {/* ── harvestOnDeposit toggle — Aura (StrategyBalancerV3) only ─────────── */}
      {isAura && (
        <PixelBox style={{ padding: '12px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flexShrink: 0 }}>
              <input
                type="checkbox"
                checked={harvestOnDeposit}
                onChange={e => setHarvestOnDeposit(e.target.checked)}
                style={{ width: '14px', height: '14px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '8px', color: 'var(--gold)', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                HARVEST ON DEPOSIT
              </span>
            </label>
            <div style={{ fontSize: '7px', color: 'var(--border)', lineHeight: '1.7' }}>
              When enabled, the strategy harvests and compounds rewards automatically on every
              user deposit (calls <code style={{ color: 'var(--cyan)' }}>harvest()</code> inside{' '}
              <code style={{ color: 'var(--cyan)' }}>beforeDeposit()</code>).
              Also sets <code style={{ color: 'var(--cyan)' }}>lockDuration = 0</code> (no profit
              lock-up delay between harvests).
              <br />
              <span style={{ color: harvestOnDeposit ? 'var(--green)' : '#aaa', marginTop: '4px', display: 'block' }}>
                {harvestOnDeposit
                  ? '✓ ON — good for correlated / pegged pairs (e.g. stablecoin pools) where harvesting often maximises yield with minimal extra gas.'
                  : '○ OFF (default) — better for uncorrelated pairs (e.g. ALCX/WETH). Harvest is triggered manually by the Beefy keeper bot on a schedule.'}
              </span>
            </div>
          </div>
        </PixelBox>
      )}

      <PixelBox style={{ padding: '12px', marginBottom: '16px' }}>
        <div style={{ fontSize: '7px', display: 'grid', gap: '6px' }}>
          <div><span style={{ color: 'var(--gold)' }}>Preview name:    </span>{name || suggestedName}</div>
          <div><span style={{ color: 'var(--gold)' }}>Preview symbol:  </span>{symbol || suggestedSymbol}</div>
          <div>
            <span style={{ color: 'var(--gold)' }}>Strategist:      </span>
            {strategist.trim() || <span style={{ color: 'var(--border)' }}>deployer address</span>}
          </div>
          {isAura && (
            <div>
              <span style={{ color: 'var(--gold)' }}>Harvest on deposit: </span>
              <span style={{ color: harvestOnDeposit ? 'var(--green)' : '#aaa' }}>
                {harvestOnDeposit ? 'YES' : 'NO'}
              </span>
            </div>
          )}
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
