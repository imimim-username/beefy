import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { PixelBox, Field, Spinner } from './PixelBox.jsx';
import { useDebounce } from '../hooks/useDebounce.js';

export function Step3Staking({ form, setForm, onNext, onBack }) {
  const [stratType,  setStratType]  = useState(form.strategyType || 'chef');
  const [stakingAddr, setStakingAddr] = useState(form.staking || '');
  const [poolId,      setPoolId]     = useState(form.poolId ?? '');
  const [status,   setStatus]   = useState('');
  const [msg,      setMsg]      = useState('');

  const debounced = useDebounce(stakingAddr, 700);

  useEffect(() => {
    if (!debounced || debounced.length < 42 || !form.chainId) return;
    setStatus('loading');

    const validate = stratType === 'chef'
      ? api.validateChef(form.chainId, debounced, poolId)
      : api.validateGauge(form.chainId, debounced);

    validate.then(res => {
      if (!res.ok) { setStatus('error'); setMsg(res.error || 'Validation failed'); return; }

      if (stratType === 'chef') {
        setMsg(`Chef OK — ${res.poolLength} pools total${res.lpInPool ? ` · Pool LP: ${res.lpInPool.slice(0,10)}…` : ''}`);
        // Warn if LP mismatch
        if (res.lpInPool && form.want &&
            res.lpInPool.toLowerCase() !== form.want.toLowerCase()) {
          setMsg(`⚠ Pool ${poolId} LP (${res.lpInPool.slice(0,10)}…) differs from your LP token`);
          setStatus('error');
          return;
        }
      } else {
        setMsg(`Gauge OK${res.stakingToken ? ` · staking token: ${res.stakingToken.slice(0,10)}…` : ''}`);
        // Warn if staking token mismatch
        if (res.stakingToken && form.want &&
            res.stakingToken.toLowerCase() !== form.want.toLowerCase()) {
          setMsg(`⚠ Gauge staking token (${res.stakingToken.slice(0,10)}…) differs from your LP token`);
          setStatus('error');
          return;
        }
      }

      setStatus('ok');
      setForm(f => ({
        ...f,
        strategyType: stratType,
        staking: debounced,
        poolId: stratType === 'chef' ? Number(poolId) : undefined,
        isStable: form.lpInfo?.isStable,
      }));
    }).catch(e => { setStatus('error'); setMsg(e.message); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, stratType, poolId, form.chainId]);

  function handleTypeChange(t) {
    setStratType(t);
    setStatus('');
    setMsg('');
    setStakingAddr('');
    setPoolId('');
  }

  return (
    <PixelBox variant="gold" style={{ padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ color: 'var(--gold)', fontSize: '11px', marginBottom: '8px' }}>
          ▶ STEP 3 — STAKING CONTRACT
        </div>
        <div style={{ fontSize: '7px', color: 'var(--white)', marginBottom: '16px' }}>
          Where does the LP get staked to earn rewards?
        </div>
      </div>

      {/* Strategy type picker */}
      <div style={{ marginBottom: '16px', display: 'flex', gap: '10px' }}>
        {[
          { id: 'chef', label: '👨‍🍳 MASTERCHEF', desc: 'PancakeSwap, SushiSwap, etc.' },
          { id: 'gauge', label: '⚡ GAUGE', desc: 'Velodrome, Aerodrome, Curve…' },
        ].map(opt => (
          <button
            key={opt.id}
            onClick={() => handleTypeChange(opt.id)}
            className={`btn ${stratType === opt.id ? 'btn--gold' : ''}`}
            style={{ flex: 1, flexDirection: 'column', display: 'flex', gap: '4px' }}
          >
            <div>{opt.label}</div>
            <div style={{ fontSize: '6px', fontFamily: 'sans-serif', opacity: 0.7 }}>{opt.desc}</div>
          </button>
        ))}
      </div>

      <Field
        label={stratType === 'chef' ? 'MasterChef Address' : 'Gauge Address'}
        hint={msg}
        hintType={status}
      >
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input
            className={`pixel-input ${status === 'error' ? 'error' : ''} ${status === 'ok' ? 'ok' : ''}`}
            placeholder="0x..."
            value={stakingAddr}
            onChange={e => { setStakingAddr(e.target.value); setStatus(''); setMsg(''); }}
          />
          {status === 'loading' && <Spinner />}
        </div>
      </Field>

      {stratType === 'chef' && (
        <Field label="Pool ID (pid)">
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

      {stratType === 'gauge' && form.lpInfo?.isStable !== undefined && (
        <PixelBox style={{ padding: '10px', marginBottom: '16px' }}>
          <div style={{ fontSize: '7px', color: 'var(--gold)' }}>
            Pair type detected: <span className="tag tag--cyan">{form.lpInfo.isStable ? 'STABLE' : 'VOLATILE'}</span>
            <br /><span style={{ color: 'var(--border)' }}>This is used for route calculation.</span>
          </div>
        </PixelBox>
      )}

      <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn" onClick={onBack}>◀ BACK</button>
        <button
          className="btn btn--gold"
          disabled={status !== 'ok'}
          onClick={onNext}
        >
          NEXT ▶
        </button>
      </div>
    </PixelBox>
  );
}
