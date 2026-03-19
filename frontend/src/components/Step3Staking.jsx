import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { PixelBox, Field, Spinner } from './PixelBox.jsx';
import { useDebounce } from '../hooks/useDebounce.js';
import { CHAINS_INFO } from '../chainInfo.js';

const STRATEGY_OPTS = [
  { id: 'chef',   label: '👨‍🍳 MASTERCHEF', desc: 'PancakeSwap, SushiSwap, etc.'    },
  { id: 'gauge',  label: '⚡ GAUGE',       desc: 'Velodrome, Aerodrome, Solidly…'  },
  { id: 'aura',   label: '🔷 AURA',        desc: 'Balancer LP staked on Aura'       },
  { id: 'convex', label: '⚙️ CONVEX',      desc: 'Curve LP staked on Convex'        },
];

// Which LP types match which strategy
const LP_TYPE_MATCH = {
  chef:   null,          // V2 / Solidly — lpType field absent
  gauge:  null,
  aura:   'balancer',
  convex: 'curve',
};

export function Step3Staking({ form, setForm, onNext, onBack }) {
  const chain = CHAINS_INFO[form.chainId];

  /* ── local state ──────────────────────────────────────────────────────────── */
  const [stratType,   setStratType]   = useState(form.strategyType || 'chef');
  const [stakingAddr, setStakingAddr] = useState(form.staking || '');
  const [poolId,      setPoolId]      = useState(form.poolId !== undefined ? String(form.poolId) : '');
  const [pendingFn,   setPendingFn]   = useState(form.pendingRewardsFunctionName || '');

  // Convex-specific
  const [curvePool,  setCurvePool]  = useState(form.curvePool  || '');
  const [coinIndex,  setCoinIndex]  = useState(form.coinIndex  !== undefined ? String(form.coinIndex) : '');
  const [nCoins,     setNCoins]     = useState(form.nCoins     !== undefined ? String(form.nCoins) : '2');
  const [convexCoin, setConvexCoin] = useState(form.convexCoin || null);
  const [coinStatus, setCoinStatus] = useState('');
  const [coinMsg,    setCoinMsg]    = useState('');

  // Staking validation
  const [status, setStatus] = useState('');
  const [msg,    setMsg]    = useState('');

  const debouncedStaking   = useDebounce(stakingAddr, 700);
  const debouncedCurvePool = useDebounce(curvePool,   700);

  /* ── auto-fill booster address from chain config ──────────────────────────── */
  useEffect(() => {
    if (!form.chainId || !chain) return;
    if (stratType === 'aura'   && !stakingAddr && chain.beefyAddresses?.auraBooster) {
      setStakingAddr(chain.beefyAddresses.auraBooster);
    } else if (stratType === 'convex' && !stakingAddr && chain.beefyAddresses?.convexBooster) {
      setStakingAddr(chain.beefyAddresses.convexBooster);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stratType, form.chainId]);

  /* ── main staking validation ──────────────────────────────────────────────── */
  useEffect(() => {
    if (!debouncedStaking || debouncedStaking.length < 42 || !form.chainId) return;
    // chef / aura / convex all require a poolId before validating
    if ((stratType === 'chef' || stratType === 'aura' || stratType === 'convex') && poolId.trim() === '') return;

    setStatus('loading');
    setMsg('Validating…');

    let validate;
    if      (stratType === 'chef')   validate = api.validateChef(form.chainId, debouncedStaking, poolId);
    else if (stratType === 'gauge')  validate = api.validateGauge(form.chainId, debouncedStaking);
    else if (stratType === 'aura')   validate = api.validateAura(form.chainId, debouncedStaking, poolId);
    else                             validate = api.validateConvex(form.chainId, debouncedStaking, poolId);

    validate.then(res => {
      if (!res.ok) { setStatus('error'); setMsg(res.error || 'Validation failed'); return; }

      if (stratType === 'chef') {
        if (res.lpInPool && form.want && res.lpInPool.toLowerCase() !== form.want.toLowerCase()) {
          setStatus('error');
          setMsg(`⚠ Pool ${poolId} LP (${res.lpInPool.slice(0, 10)}…) differs from your LP token`);
          return;
        }
        setMsg(`Chef OK — ${res.poolLength} pools · Pool LP: ${res.lpInPool?.slice(0, 10)}…`);
      } else if (stratType === 'gauge') {
        if (res.stakingToken && form.want && res.stakingToken.toLowerCase() !== form.want.toLowerCase()) {
          setStatus('error');
          setMsg(`⚠ Gauge staking token (${res.stakingToken.slice(0, 10)}…) differs from your LP token`);
          return;
        }
        setMsg(`Gauge OK${res.stakingToken ? ` · staking token: ${res.stakingToken.slice(0, 10)}…` : ''}`);
      } else if (stratType === 'aura') {
        if (res.lpInPool && form.want && res.lpInPool.toLowerCase() !== form.want.toLowerCase()) {
          setStatus('error');
          setMsg(`⚠ Pool ${poolId} BPT (${res.lpInPool.slice(0, 10)}…) differs from your LP token`);
          return;
        }
        setMsg(`Aura OK — ${res.poolLength} pools · BPT: ${res.lpInPool?.slice(0, 10)}…`);
      } else { // convex
        if (res.lpInPool && form.want && res.lpInPool.toLowerCase() !== form.want.toLowerCase()) {
          setStatus('error');
          setMsg(`⚠ Pool ${poolId} LP (${res.lpInPool.slice(0, 10)}…) differs from your Curve LP`);
          return;
        }
        setMsg(`Convex OK — ${res.poolLength} pools · LP: ${res.lpInPool?.slice(0, 10)}…`);
      }

      setStatus('ok');
      setForm(f => ({
        ...f,
        strategyType: stratType,
        staking:      debouncedStaking,
        poolId:       (stratType !== 'gauge') ? Number(poolId) : undefined,
        pendingRewardsFunctionName: stratType === 'chef' ? (pendingFn.trim() || undefined) : undefined,
        isStable:     stratType === 'gauge' ? form.lpInfo?.isStable : undefined,
      }));
    }).catch(e => { setStatus('error'); setMsg(e.message); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedStaking, stratType, poolId, form.chainId]);

  /* ── Curve coin lookup (Convex only) ──────────────────────────────────────── */
  useEffect(() => {
    if (stratType !== 'convex') return;
    if (!debouncedCurvePool || debouncedCurvePool.length < 42 || coinIndex === '' || !form.chainId) return;

    setCoinStatus('loading');
    setCoinMsg('Looking up coin…');
    api.curveCoin(form.chainId, debouncedCurvePool, coinIndex)
      .then(res => {
        if (!res.ok) { setCoinStatus('error'); setCoinMsg(res.error || 'Failed to look up coin'); setConvexCoin(null); return; }
        setConvexCoin(res);
        setCoinStatus('ok');
        setCoinMsg(`Coin ${coinIndex}: ${res.symbol} (${res.address.slice(0, 10)}…)`);
        setForm(f => ({ ...f, convexCoin: res }));
      })
      .catch(e => { setCoinStatus('error'); setCoinMsg(e.message); setConvexCoin(null); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedCurvePool, coinIndex, stratType, form.chainId]);

  /* ── strategy type switch ─────────────────────────────────────────────────── */
  function handleTypeChange(t) {
    setStratType(t);
    setStatus(''); setMsg('');
    setStakingAddr(''); setPoolId(''); setPendingFn('');
    setCurvePool(''); setCoinIndex(''); setNCoins('2');
    setConvexCoin(null); setCoinStatus(''); setCoinMsg('');
  }

  /* ── LP type mismatch warning ─────────────────────────────────────────────── */
  const expectedLpType = LP_TYPE_MATCH[stratType];
  const actualLpType   = form.lpInfo?.lpType || null;  // null = V2/Solidly
  const lpMismatch     = expectedLpType !== undefined && expectedLpType !== actualLpType;

  /* ── availability guards ──────────────────────────────────────────────────── */
  const chainHasAura   = !!chain?.beefyAddresses?.auraBooster;
  const chainHasConvex = !!chain?.beefyAddresses?.convexBooster;

  /* ── canProceed ───────────────────────────────────────────────────────────── */
  const validationOk = status === 'ok';
  const auraReady    = stratType === 'aura'   && validationOk;
  const convexReady  = stratType === 'convex' && validationOk && convexCoin !== null && nCoins !== '';
  const basicReady   = (stratType === 'chef' || stratType === 'gauge') && validationOk;
  const canProceed   = auraReady || convexReady || basicReady;

  /* ── handleNext: flush all form fields before advancing ──────────────────── */
  function handleNext() {
    setForm(f => ({
      ...f,
      strategyType: stratType,
      staking:      stakingAddr,
      poolId:       (stratType !== 'gauge') ? Number(poolId) : undefined,
      pendingRewardsFunctionName: stratType === 'chef' ? (pendingFn.trim() || undefined) : undefined,
      isStable:     stratType === 'gauge' ? form.lpInfo?.isStable : undefined,
      curvePool:    stratType === 'convex' ? curvePool  : undefined,
      coinIndex:    stratType === 'convex' ? Number(coinIndex) : undefined,
      nCoins:       stratType === 'convex' ? Number(nCoins)    : undefined,
      convexCoin:   stratType === 'convex' ? convexCoin : undefined,
    }));
    onNext();
  }

  /* ── render ───────────────────────────────────────────────────────────────── */
  return (
    <PixelBox variant="gold" style={{ padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ color: 'var(--gold)', fontSize: '11px', marginBottom: '8px' }}>
          ▶ STEP 3 — STAKING CONTRACT
        </div>
        <div style={{ fontSize: '7px', color: 'var(--white)', marginBottom: '16px' }}>
          Which contract stakes this LP token and earns rewards?
        </div>
      </div>

      {/* Strategy type picker — 2×2 grid */}
      <div style={{ marginBottom: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {STRATEGY_OPTS.map(opt => {
          const unavailable = (opt.id === 'aura' && !chainHasAura) || (opt.id === 'convex' && !chainHasConvex);
          return (
            <button
              key={opt.id}
              onClick={() => !unavailable && handleTypeChange(opt.id)}
              className={`btn ${stratType === opt.id ? 'btn--gold' : ''}`}
              disabled={unavailable}
              style={{ flexDirection: 'column', display: 'flex', gap: '4px', opacity: unavailable ? 0.4 : 1 }}
            >
              <div>{opt.label}</div>
              <div style={{ fontSize: '6px', fontFamily: 'sans-serif', opacity: 0.7 }}>
                {unavailable ? 'Not available on this chain' : opt.desc}
              </div>
            </button>
          );
        })}
      </div>

      {/* LP type mismatch warning */}
      {lpMismatch && (
        <PixelBox variant="red" style={{ padding: '10px', marginBottom: '14px' }}>
          <div style={{ fontSize: '7px', color: 'var(--red)' }}>
            ⚠ Your LP token appears to be a <strong>{actualLpType || 'V2/Solidly'}</strong> pool,
            but the <strong>{stratType.toUpperCase()}</strong> strategy expects a{' '}
            <strong>{expectedLpType || 'V2/Solidly'}</strong> pool. Make sure you've selected the
            right strategy type.
          </div>
        </PixelBox>
      )}

      {/* Info banner for Aura / Convex */}
      {(stratType === 'aura' || stratType === 'convex') && (
        <PixelBox style={{ padding: '10px', marginBottom: '14px' }}>
          <div style={{ fontSize: '7px', color: 'var(--cyan)' }}>
            {stratType === 'aura'
              ? '🔷 Aura Finance: harvests BAL + AURA, compounding back into the Balancer pool via single-asset join.'
              : '⚙️ Convex Finance: harvests CRV + CVX, swaps to a chosen Curve pool coin and re-adds liquidity.'}
          </div>
        </PixelBox>
      )}

      {/* ── Staking address ─────────────────────────────────────────────────── */}
      <Field
        label={
          stratType === 'chef'   ? 'MasterChef Address'   :
          stratType === 'gauge'  ? 'Gauge Address'         :
          stratType === 'aura'   ? 'Aura Booster Address'  :
                                   'Convex Booster Address'
        }
        hint={msg}
        hintType={status}
      >
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input
            className={`pixel-input ${status === 'error' ? 'error' : ''} ${status === 'ok' ? 'ok' : ''}`}
            placeholder="0x…"
            value={stakingAddr}
            onChange={e => { setStakingAddr(e.target.value); setStatus(''); setMsg(''); }}
          />
          {status === 'loading' && <Spinner />}
        </div>
      </Field>

      {/* ── Pool ID (chef / aura / convex) ──────────────────────────────────── */}
      {stratType !== 'gauge' && (
        <Field label={stratType === 'chef' ? 'Pool ID (pid)' : stratType === 'aura' ? 'Aura Pool ID' : 'Convex Pool ID'}>
          <input
            className="pixel-input"
            type="number"
            min="0"
            placeholder="0"
            value={poolId}
            onChange={e => { setPoolId(e.target.value); setStatus(''); setMsg(''); }}
            style={{ width: '120px' }}
          />
        </Field>
      )}

      {/* ── Chef: pending rewards function ──────────────────────────────────── */}
      {stratType === 'chef' && (
        <Field
          label="Pending Rewards Function (optional)"
          hint={pendingFn.trim()
            ? `Will call strategy.setPendingRewardsFunctionName("${pendingFn.trim()}")`
            : 'Leave blank if the chef uses the standard deposit(pid,0) trick to claim'}
        >
          <input
            className="pixel-input"
            placeholder='e.g. pendingCake, pendingReward, pending…'
            value={pendingFn}
            onChange={e => setPendingFn(e.target.value)}
            style={{ width: '280px' }}
          />
        </Field>
      )}

      {/* ── Gauge: stable-pair info ──────────────────────────────────────────── */}
      {stratType === 'gauge' && form.lpInfo?.isStable !== undefined && (
        <PixelBox style={{ padding: '10px', marginBottom: '16px' }}>
          <div style={{ fontSize: '7px', color: 'var(--gold)' }}>
            Pair type detected: <span className="tag tag--cyan">{form.lpInfo.isStable ? 'STABLE' : 'VOLATILE'}</span>
            <br /><span style={{ color: 'var(--border)' }}>This is used for route calculation.</span>
          </div>
        </PixelBox>
      )}

      {/* ── Convex: curve pool + coin index + nCoins (shown after validation) ─ */}
      {stratType === 'convex' && status === 'ok' && (
        <>
          <Field
            label="Curve Pool Contract Address"
            hint="The Curve pool contract that handles add_liquidity (may differ from LP token address)"
          >
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input
                className={`pixel-input ${coinStatus === 'error' ? 'error' : ''} ${convexCoin ? 'ok' : ''}`}
                placeholder="0x…"
                value={curvePool}
                onChange={e => { setCurvePool(e.target.value); setConvexCoin(null); setCoinStatus(''); setCoinMsg(''); }}
              />
              {coinStatus === 'loading' && <Spinner />}
            </div>
          </Field>

          <Field
            label="Coin Index (compound into)"
            hint={coinMsg || 'Index of the pool coin to swap rewards into and add as liquidity (0-based)'}
            hintType={coinStatus}
          >
            <input
              className="pixel-input"
              type="number"
              min="0"
              max="2"
              placeholder="0"
              value={coinIndex}
              onChange={e => { setCoinIndex(e.target.value); setConvexCoin(null); setCoinStatus(''); setCoinMsg(''); }}
              style={{ width: '80px' }}
            />
          </Field>

          <Field label="Number of Coins in Pool">
            <div style={{ display: 'flex', gap: '10px' }}>
              {['2', '3'].map(n => (
                <button
                  key={n}
                  onClick={() => setNCoins(n)}
                  className={`btn ${nCoins === n ? 'btn--gold' : ''}`}
                  style={{ width: '60px' }}
                >
                  {n}
                </button>
              ))}
            </div>
          </Field>
        </>
      )}

      {/* ── Navigation ──────────────────────────────────────────────────────── */}
      <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn" onClick={onBack}>◀ BACK</button>
        <button
          className="btn btn--gold"
          disabled={!canProceed}
          onClick={handleNext}
        >
          NEXT ▶
        </button>
      </div>
    </PixelBox>
  );
}
