import React from 'react';
import { PixelBox, RouteDisplay } from './PixelBox.jsx';
import { CHAINS_INFO } from '../chainInfo.js';

function Row({ label, value, addr = false }) {
  return (
    <div className="result-card__row">
      <div className="result-card__key">{label}</div>
      <div className={`result-card__value ${addr ? 'addr' : ''}`}>{value}</div>
    </div>
  );
}

export function Step7Review({ form, onDryRun, onBack }) {
  const chain = CHAINS_INFO[form.chainId];
  const lp = form.lpInfo;
  const routes = form.routes || {};

  // Build token map for route display
  const tokenMap = {};
  if (lp) {
    tokenMap[lp.token0.address.toLowerCase()] = lp.token0;
    tokenMap[lp.token1.address.toLowerCase()] = lp.token1;
  }
  (form.rewardTokens || []).forEach(t => { tokenMap[t.address.toLowerCase()] = t; });
  if (chain?.nativeToken) tokenMap[chain.nativeToken.toLowerCase()] = { symbol: chain.nativeSymbol };

  return (
    <PixelBox variant="gold" style={{ padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ color: 'var(--gold)', fontSize: '11px', marginBottom: '8px' }}>
          ▶ STEP 7 — REVIEW & DEPLOY
        </div>
        <div style={{ fontSize: '7px', color: 'var(--white)', marginBottom: '8px' }}>
          Review everything before deploying. First we dry-run on a forked chain.<br />
          Then you confirm for the real network.
        </div>
      </div>

      <div className="result-card pixel-box" style={{ marginBottom: '16px' }}>
        <Row label="Network"     value={chain?.name || form.chainId} />
        <Row label="Strategy"    value={form.strategyType === 'chef' ? 'MasterChef / Chef LP' : 'Gauge / Solidly LP'} />
        <Row label="Vault Name"  value={form.vaultName} />
        <Row label="Vault Symbol" value={form.vaultSymbol} />
        <Row label="Strategist"  value={form.strategist || '(deployer address)'} addr={!!form.strategist} />
      </div>

      <div className="result-card pixel-box" style={{ marginBottom: '16px' }}>
        <Row label="LP Token"   value={lp?.lpSymbol || '?'} />
        <Row label="LP Address" value={form.want} addr />
        <Row label="Token 0"    value={lp?.token0?.symbol} />
        <Row label="Token 1"    value={lp?.token1?.symbol} />
        {form.strategyType === 'chef' && <Row label="Pool ID" value={String(form.poolId)} />}
        <Row label="Staking Contract" value={form.staking} addr />
      </div>

      <div className="result-card pixel-box" style={{ marginBottom: '16px' }}>
        <div className="result-card__row">
          <div className="result-card__key">Reward Tokens</div>
          <div className="result-card__value">
            {(form.rewardTokens || []).map(t => (
              <span key={t.address} className="tag tag--gold" style={{ marginLeft: '4px' }}>{t.symbol}</span>
            ))}
          </div>
        </div>
        <div className="result-card__row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
          <div className="result-card__key">→ Native route</div>
          <RouteDisplay route={routes.outputToNativeRoute} tokens={tokenMap} />
        </div>
        <div className="result-card__row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
          <div className="result-card__key">→ LP0 route</div>
          <RouteDisplay route={routes.outputToLp0Route} tokens={tokenMap} />
        </div>
        <div className="result-card__row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
          <div className="result-card__key">→ LP1 route</div>
          <RouteDisplay route={routes.outputToLp1Route} tokens={tokenMap} />
        </div>
      </div>

      <PixelBox variant="red" style={{ padding: '12px', marginBottom: '20px' }}>
        <div style={{ fontSize: '7px', color: 'var(--red)' }}>
          ⚠ DRY-RUN first: deploys on a forked chain — no real funds used.<br />
          After reviewing dry-run results you can confirm the real deploy.
        </div>
      </PixelBox>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn" onClick={onBack}>◀ BACK</button>
        <button className="btn btn--gold" onClick={onDryRun}>
          🧪 DRY-RUN ▶
        </button>
      </div>
    </PixelBox>
  );
}
