import React, { useState } from 'react';
import { api } from '../api/client.js';
import { PixelBox, Spinner } from './PixelBox.jsx';
import { CHAINS_INFO } from '../chainInfo.js';

function ResultTable({ result }) {
  const chain = CHAINS_INFO[result.chainId];
  const explorer = chain?.blockExplorer || '';

  function explorerLink(addr, type = 'address') {
    if (!explorer || !addr) return null;
    return `${explorer}/${type}/${addr}`;
  }

  return (
    <div className="result-card pixel-box pixel-box--green">
      {[
        { key: 'Vault',     val: result.vaultAddress,    link: explorerLink(result.vaultAddress) },
        { key: 'Strategy',  val: result.strategyAddress, link: explorerLink(result.strategyAddress) },
        { key: 'Tx Hash',   val: result.txHash,          link: explorerLink(result.txHash, 'tx') },
        { key: 'Network',   val: result.network },
        { key: 'Deployer',  val: result.deployerAddress, link: explorerLink(result.deployerAddress) },
      ].map(({ key, val, link }) => (
        <div className="result-card__row" key={key}>
          <div className="result-card__key">{key}</div>
          <div className="result-card__value addr">
            {link ? (
              <a href={link} target="_blank" rel="noreferrer" style={{ color: 'var(--green)' }}>
                {val}
              </a>
            ) : val || '—'}
          </div>
        </div>
      ))}
    </div>
  );
}

export function StepDeploy({ form, dryResult, onBack, onReset }) {
  const [phase,   setPhase]   = useState(dryResult ? 'dry_done' : 'idle');
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(dryResult || null);
  const [error,   setError]   = useState('');

  function buildPayload(isDryRun) {
    const chain = CHAINS_INFO[form.chainId];
    return {
      chainId:      form.chainId,
      strategyType: form.strategyType,
      want:         form.want,
      staking:      form.staking,
      poolId:       form.poolId,
      rewardTokens: (form.rewardTokens || []).map(t => t.address),
      rewardTokenMeta: form.rewardTokens || [],
      outputToNativeRoute: form.routes?.outputToNativeRoute,
      outputToLp0Route:    form.routes?.outputToLp0Route,
      outputToLp1Route:    form.routes?.outputToLp1Route,
      outputToCoinRoute:   form.routes?.outputToCoinRoute,
      vaultName:    form.vaultName,
      vaultSymbol:  form.vaultSymbol,
      unirouter:    form.unirouter,
      strategist:   form.strategist,
      isStable:     form.isStable,
      pendingRewardsFunctionName: form.pendingRewardsFunctionName,
      // Convex-specific
      curvePool:    form.curvePool,
      coinIndex:    form.coinIndex,
      nCoins:       form.nCoins,
      beefyAddresses: chain?.beefyAddresses,
    };
  }

  async function runDryRun() {
    setLoading(true); setError(''); setPhase('dry_running');
    const res = await api.dryRun(buildPayload(true)).catch(e => ({ ok: false, error: e.message }));
    setLoading(false);
    if (!res.ok) { setError(res.error || 'Dry-run failed'); setPhase('idle'); return; }
    setResult(res.result);
    setPhase('dry_done');
  }

  async function runExecute() {
    setLoading(true); setError(''); setPhase('executing');
    const res = await api.execute(buildPayload(false)).catch(e => ({ ok: false, error: e.message }));
    setLoading(false);
    if (!res.ok) { setError(res.error || 'Deploy failed'); setPhase('dry_done'); return; }
    setResult(res.result);
    setPhase('live_done');
  }

  return (
    <PixelBox variant="cyan" style={{ padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ color: 'var(--cyan)', fontSize: '11px', marginBottom: '8px' }}>
          {phase === 'live_done' ? '🎉 DEPLOY COMPLETE!' : '▶ DEPLOY'}
        </div>
      </div>

      {/* Phase: idle / start dry-run */}
      {phase === 'idle' && (
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn" onClick={onBack}>◀ BACK</button>
          <button className="btn btn--gold" onClick={runDryRun}>🧪 START DRY-RUN</button>
        </div>
      )}

      {/* Phase: running dry-run */}
      {phase === 'dry_running' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--cyan)' }}>
            <Spinner /> Forking chain and deploying…
          </div>
          <div style={{ fontSize: '7px', color: 'var(--border)' }}>
            This may take 30–90 seconds while Hardhat downloads state from the RPC.
          </div>
        </div>
      )}

      {/* Phase: dry-run done */}
      {phase === 'dry_done' && result && (
        <div>
          <PixelBox variant="green" style={{ padding: '12px', marginBottom: '16px' }}>
            <div style={{ fontSize: '8px', color: 'var(--green)' }}>
              ✓ DRY-RUN SUCCEEDED on forked chain
            </div>
          </PixelBox>
          <ResultTable result={result} />
          <div style={{ marginTop: '16px' }}>
            <PixelBox variant="red" style={{ padding: '12px', marginBottom: '12px' }}>
              <div style={{ fontSize: '7px', color: 'var(--red)' }}>
                ⚠ LIVE DEPLOY: This will broadcast real transactions on {CHAINS_INFO[form.chainId]?.name}.<br />
                Ensure your DEPLOYER_PK has enough {CHAINS_INFO[form.chainId]?.nativeSymbol} for gas.
              </div>
            </PixelBox>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn" onClick={onBack}>◀ BACK</button>
              <button className="btn btn--red" onClick={runExecute}>
                🚀 DEPLOY FOR REAL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase: live deploying */}
      {phase === 'executing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--gold)' }}>
            <Spinner /> Broadcasting to {CHAINS_INFO[form.chainId]?.name}…
          </div>
          <div style={{ fontSize: '7px', color: 'var(--border)' }}>
            Waiting for transaction confirmations. Do not close this window.
          </div>
        </div>
      )}

      {/* Phase: live done */}
      {phase === 'live_done' && result && (
        <div>
          <PixelBox variant="green" style={{ padding: '12px', marginBottom: '16px' }}>
            <div style={{ fontSize: '9px', color: 'var(--green)' }}>
              🎉 VAULT DEPLOYED SUCCESSFULLY!
            </div>
          </PixelBox>
          <ResultTable result={{ ...result, dryRun: false }} />
          <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
            <button className="btn btn--green" onClick={onReset}>
              + DEPLOY ANOTHER VAULT
            </button>
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <PixelBox variant="red" style={{ padding: '12px', marginTop: '12px' }}>
          <div style={{ fontSize: '7px', color: 'var(--red)' }}>
            ✗ {error}
          </div>
          <div style={{ marginTop: '8px' }}>
            <button className="btn btn--sm" onClick={() => { setError(''); setPhase('idle'); }}>
              DISMISS
            </button>
          </div>
        </PixelBox>
      )}
    </PixelBox>
  );
}
