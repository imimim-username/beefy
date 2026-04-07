import React, { useState } from 'react';
import { PixelBox, Field } from './PixelBox.jsx';

const ETH_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

// L2 chains where gas is cheap — default harvestOnDeposit = true per Beefy convention
const L2_CHAINS = new Set([10, 8453, 42161, 324, 59144, 534352]); // Optimism, Base, Arbitrum, zkSync, Linea, Scroll

const L2_NAMES = { 10: 'Optimism', 8453: 'Base', 42161: 'Arbitrum', 324: 'zkSync', 59144: 'Linea', 534352: 'Scroll' };

// Strip Solidly AMM prefixes from LP symbols so the vault name is clean.
// "sAMM-USDC/WETH" → "USDC-WETH"   "vAMM-OP/WETH" → "OP-WETH"
// Balancer BPTs and Curve LPs keep their full symbol (already meaningful).
function cleanLpSymbol(sym) {
  if (!sym) return null;
  return sym.replace(/^[vs]AMM-/i, '').replace(/\//g, '-');
}

// Build a moo-token symbol from a cleaned pool name string.
// "USDC-WETH" → "mooUsdcWeth"   "80ALCX-20WETH" → "moo80Alcx20Weth"
function toMooSymbol(poolName) {
  if (!poolName) return '';
  const parts = poolName
    .replace(/\//g, '-')
    .split('-')
    .map(p => {
      if (!p) return '';
      const firstAlpha = p.search(/[a-zA-Z]/);
      if (firstAlpha === -1) return p; // pure number segment — keep as-is
      return p.slice(0, firstAlpha)
        + p[firstAlpha].toUpperCase()
        + p.slice(firstAlpha + 1).toLowerCase();
    });
  return 'moo' + parts.join('');
}

function buildSuggestions(form) {
  const lp = form.lpInfo;
  const tokens = [lp?.token0?.symbol, lp?.token1?.symbol, lp?.token2?.symbol]
    .filter(Boolean);

  // Prefer the LP's own symbol (cleaned) — most accurate for BPTs and Curve LPs
  const lpSymbolClean = cleanLpSymbol(lp?.lpSymbol);
  const poolName = lpSymbolClean || tokens.join('-') || 'LP';

  return {
    suggestedName:   `Beefy ${poolName}`,
    suggestedSymbol: toMooSymbol(poolName),
    poolName,
  };
}

export function Step6VaultName({ form, setForm, onNext, onBack }) {
  const { suggestedName, suggestedSymbol } = buildSuggestions(form);

  // harvestOnDeposit defaults to true on L2 chains (gas is cheap), false on L1s.
  // If the user already set a value (e.g. visiting this step a second time), preserve it.
  const isL2 = L2_CHAINS.has(form.chainId);
  const defaultHarvestOnDeposit = form.harvestOnDeposit != null ? form.harvestOnDeposit : isL2;

  const [name,             setName]             = useState(form.vaultName    || suggestedName);
  const [symbol,           setSymbol]           = useState(form.vaultSymbol  || suggestedSymbol);
  const [router,           setRouter]           = useState(form.unirouter    || '');
  const [strategist,       setStrategist]       = useState(form.strategist   || '');
  const [harvestOnDeposit, setHarvestOnDeposit] = useState(defaultHarvestOnDeposit);

  const strategistErr = strategist.trim() && !ETH_ADDR_RE.test(strategist.trim());

  function commit() {
    setForm(f => ({
      ...f,
      vaultName:        name.trim()       || suggestedName,
      vaultSymbol:      symbol.trim()     || suggestedSymbol,
      unirouter:        router.trim()     || undefined,
      strategist:       strategist.trim() || undefined,
      harvestOnDeposit,
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

      {/* Auto-suggestion notice */}
      {form.lpInfo?.lpSymbol && (
        <div style={{
          fontSize: '6px', color: 'var(--border)',
          marginBottom: '12px', padding: '6px 8px',
          border: '1px solid var(--border)',
          background: 'rgba(0,0,0,0.2)',
        }}>
          ⚡ Name and symbol auto-suggested from LP token symbol:{' '}
          <strong style={{ color: 'var(--cyan)' }}>{form.lpInfo.lpSymbol}</strong>
        </div>
      )}

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

      {/* ── harvestOnDeposit toggle ───────────────────────────────────────────── */}
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
            When enabled, the strategy harvests and compounds rewards on every user deposit
            (calls <code style={{ color: 'var(--cyan)' }}>harvest()</code> inside{' '}
            <code style={{ color: 'var(--cyan)' }}>beforeDeposit()</code>).
            Also sets <code style={{ color: 'var(--cyan)' }}>lockDuration = 0</code>.
            {isL2 && (
              <span style={{ color: 'var(--cyan)', display: 'block', marginTop: '3px' }}>
                ⚡ Auto-set ON — {L2_NAMES[form.chainId] || 'This chain'} is an L2 where gas is cheap.
                Beefy convention defaults harvestOnDeposit to true on L2 networks.
              </span>
            )}
            <span style={{ color: harvestOnDeposit ? 'var(--green)' : '#aaa', marginTop: '4px', display: 'block' }}>
              {harvestOnDeposit
                ? '✓ ON — recommended for correlated/pegged pairs and L2 chains.'
                : '○ OFF — harvest triggered by Beefy keeper bot on a schedule (recommended for L1).'}
            </span>
          </div>
        </div>
      </PixelBox>

      {/* Preview */}
      <PixelBox style={{ padding: '12px', marginBottom: '16px' }}>
        <div style={{ fontSize: '7px', display: 'grid', gap: '6px' }}>
          <div><span style={{ color: 'var(--gold)' }}>Preview name:   </span>{name || suggestedName}</div>
          <div><span style={{ color: 'var(--gold)' }}>Preview symbol: </span>{symbol || suggestedSymbol}</div>
          <div>
            <span style={{ color: 'var(--gold)' }}>Strategist:     </span>
            {strategist.trim() || <span style={{ color: 'var(--border)' }}>deployer address</span>}
          </div>
          <div>
            <span style={{ color: 'var(--gold)' }}>Harvest on deposit: </span>
            <span style={{ color: harvestOnDeposit ? 'var(--green)' : '#aaa' }}>
              {harvestOnDeposit ? 'YES' : 'NO'}
            </span>
          </div>
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
