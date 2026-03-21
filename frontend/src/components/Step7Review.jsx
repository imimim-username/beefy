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

function strategyLabel(stratType) {
  return stratType === 'chef'       ? 'MasterChef (Chef LP)'              :
         stratType === 'gauge'      ? 'Gauge / Solidly LP'                :
         stratType === 'aura'       ? 'Aura Finance (Balancer LP)'        :
         stratType === 'convex'     ? 'Convex Finance (Curve LP)'         :
         stratType === 'curvegauge' ? 'Curve Native LiquidityGauge'       :
         stratType === 'stakedao'   ? 'StakeDAO Gauge (sd-gauge)'         :
         stratType || '?';
}

export function Step7Review({ form, onDryRun, onBack }) {
  const chain  = CHAINS_INFO[form.chainId];
  const lp     = form.lpInfo;
  const routes = form.routes || {};
  const stratType = form.strategyType;
  const isAura       = stratType === 'aura';
  const isConvex     = stratType === 'convex';
  const isCurveGauge = stratType === 'curvegauge';
  const isStakeDao   = stratType === 'stakedao';
  const usesCurvePool = isConvex || isCurveGauge || isStakeDao;

  // Build token map for route display
  const tokenMap = {};
  if (lp) {
    if (lp.token0) tokenMap[lp.token0.address.toLowerCase()] = lp.token0;
    if (lp.token1) tokenMap[lp.token1.address.toLowerCase()] = lp.token1;
    if (lp.token2) tokenMap[lp.token2.address.toLowerCase()] = lp.token2;
  }
  (form.rewardTokens || []).forEach(t => { tokenMap[t.address.toLowerCase()] = t; });
  if (chain?.nativeToken) tokenMap[chain.nativeToken.toLowerCase()] = { symbol: chain.nativeSymbol };
  if (form.convexCoin)    tokenMap[form.convexCoin.address.toLowerCase()] = form.convexCoin;

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

      {/* Basic info */}
      <div className="result-card pixel-box" style={{ marginBottom: '16px' }}>
        <Row label="Network"      value={chain?.name || form.chainId} />
        <Row label="Strategy"     value={strategyLabel(stratType)} />
        <Row label="Vault Name"   value={form.vaultName} />
        <Row label="Vault Symbol" value={form.vaultSymbol} />
        <Row label="Strategist"   value={form.strategist || '(deployer address)'} addr={!!form.strategist} />
        <Row label="Harvest on Deposit"
             value={form.harvestOnDeposit ? 'YES (harvests on every deposit)' : 'NO — keeper-scheduled (default)'} />
      </div>

      {/* LP / staking info */}
      <div className="result-card pixel-box" style={{ marginBottom: '16px' }}>
        <Row label="LP Token"        value={lp?.lpSymbol || '?'} />
        <Row label="LP Address"      value={form.want} addr />
        <Row label="Token 0"         value={lp?.token0?.symbol} />
        <Row label="Token 1"         value={lp?.token1?.symbol} />
        {lp?.token2 && <Row label="Token 2" value={lp.token2.symbol} />}

        {/* Chef */}
        {stratType === 'chef' && <Row label="Pool ID" value={String(form.poolId)} />}
        {stratType === 'chef' && form.pendingRewardsFunctionName && (
          <Row label="Pending Fn" value={form.pendingRewardsFunctionName} />
        )}

        {/* Aura */}
        {isAura && <Row label="Aura Pool ID"     value={String(form.poolId)} />}

        {/* Convex */}
        {isConvex && <Row label="Convex Pool ID"  value={String(form.poolId)} />}
        {isConvex && <Row label="Curve Pool"      value={form.curvePool} addr />}
        {isConvex && <Row label="Coin Index"      value={String(form.coinIndex)} />}
        {isConvex && <Row label="Pool Coins"      value={String(form.nCoins)} />}
        {isConvex && form.convexCoin && (
          <Row label="Compound Into" value={`${form.convexCoin.symbol} (${form.convexCoin.address.slice(0, 10)}…)`} />
        )}

        {/* Curve native gauge */}
        {isCurveGauge && <Row label="Curve Gauge"  value={form.staking} addr />}
        {isCurveGauge && <Row label="Curve Pool"   value={form.curvePool} addr />}
        {isCurveGauge && <Row label="Coin Index"   value={String(form.coinIndex)} />}
        {isCurveGauge && <Row label="Pool Coins"   value={String(form.nCoins)} />}
        {isCurveGauge && form.convexCoin && (
          <Row label="Compound Into" value={`${form.convexCoin.symbol} (${form.convexCoin.address.slice(0, 10)}…)`} />
        )}
        {isCurveGauge && <Row label="CRV Minter"  value={form.minter || '(none)'} addr={!!form.minter} />}

        {/* StakeDAO gauge */}
        {isStakeDao && <Row label="StakeDAO Gauge" value={form.staking} addr />}
        {isStakeDao && <Row label="Curve Pool"     value={form.curvePool} addr />}
        {isStakeDao && <Row label="Coin Index"     value={String(form.coinIndex)} />}
        {isStakeDao && <Row label="Pool Coins"     value={String(form.nCoins)} />}
        {isStakeDao && form.convexCoin && (
          <Row label="Compound Into" value={`${form.convexCoin.symbol} (${form.convexCoin.address.slice(0, 10)}…)`} />
        )}

        {/* Aura v3 router */}
        {isAura && form.balancerV3Router && (
          <Row label="Balancer v3 Router" value={form.balancerV3Router} addr />
        )}

        {!isCurveGauge && !isStakeDao && (
          <Row label="Staking Contract" value={form.staking} addr />
        )}
      </div>

      {/* Routes */}
      <div className="result-card pixel-box" style={{ marginBottom: '16px' }}>
        <div className="result-card__row">
          <div className="result-card__key">Reward Tokens</div>
          <div className="result-card__value">
            {(form.rewardTokens || []).map(t => (
              <span key={t.address} className="tag tag--gold" style={{ marginLeft: '4px' }}>{t.symbol}</span>
            ))}
          </div>
        </div>

        {/* Native route — always shown */}
        <div className="result-card__row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
          <div className="result-card__key">→ Native route</div>
          <RouteDisplay route={routes.outputToNativeRoute} tokens={tokenMap} />
        </div>

        {/* Coin route — Convex / CurveGauge / StakeDAO */}
        {usesCurvePool && (
          <div className="result-card__row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
            <div className="result-card__key">→ Coin route</div>
            <RouteDisplay route={routes.outputToCoinRoute} tokens={tokenMap} />
          </div>
        )}

        {/* LP routes — chef / gauge only */}
        {!isAura && !usesCurvePool && (
          <>
            <div className="result-card__row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
              <div className="result-card__key">→ LP0 route</div>
              <RouteDisplay route={routes.outputToLp0Route} tokens={tokenMap} />
            </div>
            <div className="result-card__row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
              <div className="result-card__key">→ LP1 route</div>
              <RouteDisplay route={routes.outputToLp1Route} tokens={tokenMap} />
            </div>
          </>
        )}

        {/* Aura note */}
        {isAura && (
          <div className="result-card__row">
            <div className="result-card__key" style={{ color: 'var(--cyan)' }}>LP join</div>
            <div className="result-card__value" style={{ color: 'var(--cyan)', fontSize: '7px' }}>
              Single-asset join via Balancer {form.balancerV3Router ? 'v3 Router' : 'v2 Vault'} (automatic)
            </div>
          </div>
        )}
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
