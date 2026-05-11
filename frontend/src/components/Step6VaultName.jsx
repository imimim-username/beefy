import React, { useState } from 'react';
import { PixelBox, Field } from './PixelBox.jsx';
import { buildSuggestions } from '../utils/vaultName.js';

const ETH_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

// L2 chains where gas is cheap — default harvestOnDeposit = true per Beefy convention
const L2_CHAINS = new Set([10, 8453, 42161, 324, 59144, 534352]); // Optimism, Base, Arbitrum, zkSync, Linea, Scroll

const L2_NAMES = { 10: 'Optimism', 8453: 'Base', 42161: 'Arbitrum', 324: 'zkSync', 59144: 'Linea', 534352: 'Scroll' };

// localStorage key for address-book (persists across vaults)
const ADDR_BOOK_KEY = 'beefy_addr_book_v1';

function loadAddrBook() {
  try { return JSON.parse(localStorage.getItem(ADDR_BOOK_KEY) || '{}'); } catch { return {}; }
}
function saveAddrBook(book) {
  try { localStorage.setItem(ADDR_BOOK_KEY, JSON.stringify(book)); } catch {}
}

export function Step6VaultName({ form, setForm, onNext, onBack }) {
  const { suggestedName, suggestedSymbol } = buildSuggestions(form);

  // harvestOnDeposit defaults to true on L2 chains (gas is cheap), false on L1s.
  // If the user already set a value (e.g. visiting this step a second time), preserve it.
  const isL2 = L2_CHAINS.has(form.chainId);
  const defaultHarvestOnDeposit = form.harvestOnDeposit != null ? form.harvestOnDeposit : isL2;

  // Address book — load once on mount
  const addrBook = loadAddrBook();

  const [name,             setName]             = useState(form.vaultName    || suggestedName);
  const [symbol,           setSymbol]           = useState(form.vaultSymbol  || suggestedSymbol);
  const [router,           setRouter]           = useState(form.unirouter    || addrBook.router    || '');
  const [strategist,       setStrategist]       = useState(form.strategist   || addrBook.strategist || '');
  const [harvestOnDeposit, setHarvestOnDeposit] = useState(defaultHarvestOnDeposit);

  const strategistErr = strategist.trim() && !ETH_ADDR_RE.test(strategist.trim());
  const routerErr     = router.trim()     && !ETH_ADDR_RE.test(router.trim());

  function commit() {
    // Save non-empty addresses to address book for next vault
    const book = loadAddrBook();
    if (strategist.trim() && ETH_ADDR_RE.test(strategist.trim())) book.strategist = strategist.trim();
    if (router.trim()     && ETH_ADDR_RE.test(router.trim()))     book.router     = router.trim();
    saveAddrBook(book);

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

  const savedStrategist = addrBook.strategist;
  const savedRouter     = addrBook.router;

  const valid = name.trim().length > 0 && symbol.trim().length > 0 && !strategistErr && !routerErr;

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
          fontSize: '6px', color: 'var(--muted)',
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
        {/* Address book: show remembered address if different from current value */}
        {savedStrategist && savedStrategist !== strategist.trim() && (
          <div style={{ marginTop: '4px', fontSize: '6px', color: '#888' }}>
            Previously used:{' '}
            <button
              className="btn btn--sm"
              style={{ fontSize: '6px', padding: '1px 6px', marginLeft: '4px' }}
              onClick={() => setStrategist(savedStrategist)}
            >
              USE {savedStrategist.slice(0, 10)}…
            </button>
          </div>
        )}
      </Field>

      <PixelBox style={{ padding: '10px', marginBottom: '14px' }}>
        <div style={{ fontSize: '7px', color: 'var(--muted)', lineHeight: '1.6' }}>
          On every harvest, fees are split three ways:<br />
          <span style={{ color: 'var(--gold)' }}>Strategist</span> (you) ·{' '}
          <span style={{ color: 'var(--cyan)' }}>Beefy treasury</span> ·{' '}
          <span style={{ color: 'var(--green)' }}>Caller (harvester bot)</span><br />
          The % split is governed by Beefy's on-chain fee config contract.
        </div>
      </PixelBox>

      <Field
        label="DEX Router Override (optional)"
        hint={routerErr ? 'Must be a valid 0x address' : 'Leave blank to use the default router for this network'}
        hintType={routerErr ? 'error' : ''}
      >
        <input
          className={`pixel-input ${routerErr ? 'error' : router.trim() ? 'ok' : ''}`}
          value={router}
          onChange={e => setRouter(e.target.value)}
          placeholder="0x… (leave blank for default)"
        />
        {savedRouter && savedRouter !== router.trim() && (
          <div style={{ marginTop: '4px', fontSize: '6px', color: '#888' }}>
            Previously used:{' '}
            <button
              className="btn btn--sm"
              style={{ fontSize: '6px', padding: '1px 6px', marginLeft: '4px' }}
              onClick={() => setRouter(savedRouter)}
            >
              USE {savedRouter.slice(0, 10)}…
            </button>
          </div>
        )}
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
          <div style={{ fontSize: '7px', color: 'var(--muted)', lineHeight: '1.7' }}>
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
