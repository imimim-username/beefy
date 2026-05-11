import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { PixelBox, Field, Spinner } from './PixelBox.jsx';
import { useDebounce } from '../hooks/useDebounce.js';
import { CHAINS_INFO } from '../chainInfo.js';

const STRATEGY_OPTS = [
  { id: 'chef',       label: '👨‍🍳 MASTERCHEF',   desc: 'PancakeSwap, SushiSwap, etc.'        },
  { id: 'gauge',      label: '⚡ GAUGE',          desc: 'Velodrome, Aerodrome, Solidly…'       },
  { id: 'aura',       label: '🔷 AURA',           desc: 'Balancer LP staked on Aura'           },
  { id: 'convex',     label: '⚙️ CONVEX',         desc: 'Curve LP staked on Convex'            },
  { id: 'curvegauge', label: '〽️ CURVE GAUGE',   desc: 'Curve native LiquidityGauge'          },
  { id: 'stakedao',   label: '🟣 STAKEDAO',       desc: 'StakeDAO gauge (sd-gauge)'            },
];

// Strategy options for single-asset tokens (supply / lending protocols)
const SINGLE_ASSET_OPTS = [
  { id: 'erc4626',  label: '📦 ERC-4626',    desc: 'Yearn v3, Spark, Sky, or any ERC-4626 vault'     },
  { id: 'morpho',   label: '🟦 MORPHO',      desc: 'Morpho Blue vault (ERC-4626 compatible)'          },
  { id: 'aave',     label: '👻 AAVE',        desc: 'Aave v3 supply-only (via aToken)'                 },
  { id: 'compound', label: '🏦 COMPOUND V3', desc: 'Compound V3 Comet supply'                         },
  { id: 'silov2',   label: '🏦 SILO V2',     desc: 'Silo V2 lending market (ERC-4626 compatible)'     },
  { id: 'pendle',   label: '🌀 PENDLE',      desc: 'Pendle PT/SY/LP token — hold + harvest rewards'  },
  { id: 'tokemak',  label: '⚡ TOKEMAK',     desc: 'Tokemak staking — want auto-derived from rewarder'},
];

// LP type → recommended strategy type(s) — shown as a suggestion banner in the UI
const LP_TYPE_SUGGESTION = {
  solidly:  { primary: 'gauge',      label: '⚡ Solidly/Velodrome LP detected — Gauge strategy recommended.' },
  balancer: { primary: 'aura',       label: '🔷 Balancer LP detected — Aura strategy recommended.' },
  curve:    { primary: 'curvegauge', label: '〽️ Curve LP detected — Curve Gauge strategy recommended (or Convex / StakeDAO).' },
  univ2:    { primary: 'chef',       label: '👨‍🍳 Uni-V2 LP detected — MasterChef strategy recommended.' },
};

// Which actual LP types are COMPATIBLE with each strategy (array = any match is OK)
const LP_TYPE_COMPATIBLE = {
  chef:       ['univ2', 'solidly'],   // chef works with standard AMM LPs
  gauge:      ['solidly', 'univ2'],   // gauge works with AMM LPs (Velodrome is solidly-type)
  aura:       ['balancer'],
  convex:     ['curve'],
  curvegauge: ['curve'],
  stakedao:   ['curve'],
};

// Strategies that use Curve pool fields (deposit token is a Curve coin)
const USES_CURVE_POOL = new Set(['convex', 'curvegauge', 'stakedao']);

// Strategies that need a pool ID from the booster
const NEEDS_POOL_ID = new Set(['chef', 'aura', 'convex']);

// Strategies where pool ID can be auto-detected by scanning the booster
const AUTO_POOL_ID = new Set(['aura', 'convex']);

// Single-asset strategy IDs — shown when lpType === 'single'
const SINGLE_ASSET_IDS = new Set(['erc4626', 'morpho', 'aave', 'compound', 'silov2', 'pendle', 'tokemak']);

// Default strategy for each token type
function defaultStrategyType(lpType) {
  if (lpType === 'single') return 'erc4626';
  return 'chef';
}

export function Step3Staking({ form, setForm, onNext, onBack }) {
  const chain = CHAINS_INFO[form.chainId];
  const isSingleAsset = form.lpInfo?.lpType === 'single';

  /* ── local state ──────────────────────────────────────────────────────────── */
  const [stratType,   setStratType]   = useState(
    form.strategyType || defaultStrategyType(form.lpInfo?.lpType)
  );
  const [stakingAddr, setStakingAddr] = useState(form.staking || '');
  const [poolId,      setPoolId]      = useState(form.poolId !== undefined ? String(form.poolId) : '');
  const [pendingFn,   setPendingFn]   = useState(form.pendingRewardsFunctionName || '');

  // Single-asset extra fields
  const [merklClaimer,        setMerklClaimer]        = useState(form.merkl            || '');
  const [compoundDistributor, setCompoundDistributor] = useState(form.compoundDistributor || '');
  const [siloGauge,           setSiloGauge]           = useState(form.siloGauge         || '');
  const [harvestOnDeposit,    setHarvestOnDeposit]    = useState(form.harvestOnDeposit  ?? false);

  // Pool ID auto-detection state
  const [pidSearching,  setPidSearching]  = useState(false);
  const [pidAutoMsg,    setPidAutoMsg]    = useState('');
  const [pidAutoFound,  setPidAutoFound]  = useState(false);

  // Curve-pool fields (shared by convex / curvegauge / stakedao)
  const [curvePool,  setCurvePool]  = useState(form.curvePool  || '');
  const [coinIndex,  setCoinIndex]  = useState(form.coinIndex  !== undefined ? String(form.coinIndex) : '');
  const [nCoins,     setNCoins]     = useState(form.nCoins     !== undefined ? String(form.nCoins) : '2');
  const [convexCoin, setConvexCoin] = useState(form.convexCoin || null);
  const [coinStatus, setCoinStatus] = useState('');
  const [coinMsg,    setCoinMsg]    = useState('');

  // All coins in the Curve pool — fetched once curvePool address is known
  const [allCoins,        setAllCoins]        = useState([]); // [{ index, address, symbol, name, decimals }]
  const [coinsLoading,    setCoinsLoading]    = useState(false);

  // Staking validation
  const [status, setStatus] = useState('');
  const [msg,    setMsg]    = useState('');

  const debouncedStaking   = useDebounce(stakingAddr, 700);
  const debouncedCurvePool = useDebounce(curvePool,   700);

  /* ── auto-fill addresses from chain config ─────────────────────────────────── */
  useEffect(() => {
    if (!form.chainId || !chain) return;
    if (stratType === 'aura'   && !stakingAddr && chain.beefyAddresses?.auraBooster) {
      setStakingAddr(chain.beefyAddresses.auraBooster);
    } else if (stratType === 'convex' && !stakingAddr && chain.beefyAddresses?.convexBooster) {
      setStakingAddr(chain.beefyAddresses.convexBooster);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stratType, form.chainId]);

  /* ── nCoins auto-fill from LP info ───────────────────────────────────────────
   * When the LP token was identified as a Curve pool with a known coin count,
   * pre-fill nCoins so the user doesn't have to select it manually.
   */
  useEffect(() => {
    if (!USES_CURVE_POOL.has(stratType)) return;
    if (form.lpInfo?.nCoins && !form.nCoins) {
      setNCoins(String(form.lpInfo.nCoins));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stratType]);

  /* ── pool ID auto-detection (Aura / Convex only) ─────────────────────────────
   * Once the booster address is set and we have the LP token address (form.want),
   * automatically scan booster.poolInfo() to find the matching pool ID.
   * Only fires when poolId is empty (doesn't overwrite a manually entered value).
   */
  useEffect(() => {
    if (!AUTO_POOL_ID.has(stratType)) return;
    if (!debouncedStaking || debouncedStaking.length < 42) return;
    if (!form.want) return;
    if (poolId.trim() !== '') return; // don't overwrite manual entry

    setPidSearching(true);
    setPidAutoMsg('Scanning booster pools for your LP…');
    setPidAutoFound(false);

    api.findPoolId(form.chainId, debouncedStaking, form.want)
      .then(res => {
        if (res.ok && res.found) {
          setPoolId(String(res.pid));
          setPidAutoMsg(`Auto-detected: pool #${res.pid} (of ${res.poolLength})`);
          setPidAutoFound(true);
        } else if (res.ok && !res.found) {
          setPidAutoMsg(`Not found in ${res.poolLength} pools — enter manually`);
        } else {
          setPidAutoMsg('Could not scan pools — enter manually');
        }
        setPidSearching(false);
      })
      .catch(() => {
        setPidAutoMsg('Pool ID scan failed — enter manually');
        setPidSearching(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedStaking, stratType, form.want, form.chainId]);

  /* ── Pendle: no staking address needed — auto-pass validation on type select ── */
  useEffect(() => {
    if (stratType !== 'pendle') return;
    setStatus('ok');
    setMsg('Pendle strategy ready — no staking contract required');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stratType]);

  /* ── main staking validation ──────────────────────────────────────────────── */
  useEffect(() => {
    // Pendle has no staking address — handled by the effect above
    if (stratType === 'pendle') return;

    if (!debouncedStaking || debouncedStaking.length < 42 || !form.chainId) return;

    // LP strategies that require pool ID: skip until pool ID is set
    if (NEEDS_POOL_ID.has(stratType) && poolId.trim() === '') return;

    // CompoundV3: also requires distributor address before we can proceed
    if (stratType === 'compound' && compoundDistributor.length < 42) return;

    setStatus('loading');
    setMsg('Validating…');

    let validate;
    if (SINGLE_ASSET_IDS.has(stratType)) {
      // Single-asset strategies — validate the protocol vault/market/token
      const want = form.want || undefined;
      if      (stratType === 'erc4626')  validate = api.validateERC4626(form.chainId, debouncedStaking, want);
      else if (stratType === 'morpho')   validate = api.validateERC4626(form.chainId, debouncedStaking, want); // same interface
      else if (stratType === 'aave')     validate = api.validateAave(form.chainId, debouncedStaking, want);
      else if (stratType === 'compound') validate = api.validateCompound(form.chainId, debouncedStaking, want);
      else if (stratType === 'tokemak')  validate = api.validateTokemak(form.chainId, debouncedStaking);
      else                               validate = api.validateSiloV2(form.chainId, debouncedStaking, want);
    } else if (stratType === 'chef')       { validate = api.validateChef(form.chainId, debouncedStaking, poolId); }
    else if   (stratType === 'gauge')      { validate = api.validateGauge(form.chainId, debouncedStaking); }
    else if   (stratType === 'aura')       { validate = api.validateAura(form.chainId, debouncedStaking, poolId); }
    else if   (stratType === 'convex')     { validate = api.validateConvex(form.chainId, debouncedStaking, poolId); }
    else if   (stratType === 'curvegauge') { validate = api.validateCurveGauge(form.chainId, debouncedStaking); }
    else                                   { validate = api.validateStakeDao(form.chainId, debouncedStaking); }

    validate.then(res => {
      if (!res.ok) { setStatus('error'); setMsg(res.error || 'Validation failed'); return; }

      // Build status message
      if (stratType === 'erc4626' || stratType === 'morpho') {
        const u = res.underlying;
        setMsg(`${stratType === 'morpho' ? 'Morpho' : 'ERC-4626'} vault OK · underlying: ${u ? u.slice(0, 10) + '…' : '✓'}`);
      } else if (stratType === 'aave') {
        const u = res.underlying;
        setMsg(`aToken OK · underlying: ${u ? u.slice(0, 10) + '…' : '✓'}`);
      } else if (stratType === 'compound') {
        const bt = res.baseToken;
        setMsg(`Comet OK · baseToken: ${bt ? bt.slice(0, 10) + '…' : '✓'}`);
      } else if (stratType === 'silov2') {
        const u = res.underlying;
        setMsg(`Silo V2 OK · underlying: ${u ? u.slice(0, 10) + '…' : '✓'}`);
      } else if (stratType === 'tokemak') {
        const { stakingToken, underlying, rewardToken } = res;
        setMsg(`Rewarder OK · want: ${stakingToken ? stakingToken.slice(0, 10) + '…' : '✓'} · reward: ${rewardToken ? rewardToken.slice(0, 10) + '…' : '?'}`);
        // Auto-update form.want to the strategy-derived staking token
        if (stakingToken) {
          setForm(f => ({
            ...f,
            want:         stakingToken,
            depositToken: underlying || stakingToken,
          }));
        }
      } else {
        // LP strategies
        const lpToken = res.lpInPool || res.stakingToken;
        if (lpToken && form.want && lpToken.toLowerCase() !== form.want.toLowerCase()) {
          setStatus('error');
          setMsg(`⚠ Gauge LP (${lpToken.slice(0, 10)}…) differs from your LP token`);
          return;
        }
        if      (stratType === 'chef')       setMsg(`Chef OK — ${res.poolLength} pools · Pool LP: ${res.lpInPool?.slice(0, 10)}…`);
        else if (stratType === 'gauge')      setMsg(`Gauge OK${res.stakingToken ? ` · staking token: ${res.stakingToken.slice(0, 10)}…` : ''}`);
        else if (stratType === 'aura')       setMsg(`Aura OK — ${res.poolLength} pools · BPT: ${res.lpInPool?.slice(0, 10)}…`);
        else if (stratType === 'convex')     setMsg(`Convex OK — ${res.poolLength} pools · LP: ${res.lpInPool?.slice(0, 10)}…`);
        else if (stratType === 'curvegauge') setMsg(`Curve gauge OK${res.stakingToken ? ` · lp_token: ${res.stakingToken.slice(0, 10)}…` : ''}`);
        else                                 setMsg(`StakeDAO gauge OK${res.stakingToken ? ` · lp_token: ${res.stakingToken.slice(0, 10)}…` : ''}`);
      }

      setStatus('ok');

      // Auto-fill Curve pool address from gauge.pool() when the validator returns it
      if (USES_CURVE_POOL.has(stratType) && res.pool && !curvePool) {
        setCurvePool(res.pool);
      }

      // Save common LP strategy fields
      if (!SINGLE_ASSET_IDS.has(stratType)) {
        setForm(f => ({
          ...f,
          strategyType: stratType,
          staking:      debouncedStaking,
          poolId:       NEEDS_POOL_ID.has(stratType) ? Number(poolId) : undefined,
          pendingRewardsFunctionName: stratType === 'chef' ? (pendingFn.trim() || undefined) : undefined,
          isStable:     stratType === 'gauge' ? form.lpInfo?.isStable : undefined,
          rewardPool:   (stratType === 'aura' || stratType === 'convex') ? res.rewardPool : undefined,
          // Clear single-asset fields
          merkl: undefined, compoundDistributor: undefined, siloGauge: undefined, harvestOnDeposit: undefined,
        }));
      } else {
        // Single-asset strategy fields
        setForm(f => ({
          ...f,
          strategyType: stratType,
          staking:      debouncedStaking,
          merkl:               (stratType === 'erc4626' || stratType === 'morpho') ? (merklClaimer.trim() || undefined) : undefined,
          compoundDistributor: stratType === 'compound' ? compoundDistributor.trim() : undefined,
          siloGauge:           stratType === 'silov2'   ? (siloGauge.trim() || undefined) : undefined,
          harvestOnDeposit:    (stratType === 'erc4626' || stratType === 'morpho' || stratType === 'aave' || stratType === 'pendle') ? harvestOnDeposit : undefined,
          // Clear LP strategy fields
          poolId: undefined, pendingRewardsFunctionName: undefined, isStable: undefined, rewardPool: undefined,
          curvePool: undefined, coinIndex: undefined, nCoins: undefined, convexCoin: undefined,
        }));
      }
    }).catch(e => { setStatus('error'); setMsg(e.message); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedStaking, stratType, poolId, compoundDistributor, form.chainId]);

  /* ── Fetch ALL coins from Curve pool (for dropdown) ────────────────────────── */
  useEffect(() => {
    if (!USES_CURVE_POOL.has(stratType)) return;
    if (!debouncedCurvePool || debouncedCurvePool.length < 42 || !form.chainId) return;
    setAllCoins([]);
    setCoinsLoading(true);
    api.curveCoins(form.chainId, debouncedCurvePool)
      .then(res => {
        if (res.ok && res.coins?.length > 0) {
          setAllCoins(res.coins);
          // Auto-update nCoins from actual pool data
          setNCoins(String(res.coins.length));
          // If only one option, auto-select it
          if (res.coins.length === 1 && coinIndex === '') {
            setCoinIndex('0');
          }
        }
      })
      .catch(() => {})
      .finally(() => setCoinsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedCurvePool, stratType, form.chainId]);

  /* ── Curve coin lookup (convex / curvegauge / stakedao) ────────────────────── */
  useEffect(() => {
    if (!USES_CURVE_POOL.has(stratType)) return;
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
    setAllCoins([]); setCoinsLoading(false);
    setPidSearching(false); setPidAutoMsg(''); setPidAutoFound(false);
    setMerklClaimer(''); setCompoundDistributor(''); setSiloGauge('');
  }

  /* ── LP type suggestion + mismatch warning ────────────────────────────────── */
  const actualLpType    = form.lpInfo?.lpType || null;
  const suggestion      = actualLpType && actualLpType !== 'single' ? LP_TYPE_SUGGESTION[actualLpType] : null;
  const compatibleTypes = LP_TYPE_COMPATIBLE[stratType] || [];
  // Only warn if we know the LP type AND it's incompatible with the chosen strategy
  // (single-asset strategies are always compatible with single-asset tokens)
  const lpMismatch      = actualLpType !== null && actualLpType !== 'single' && compatibleTypes.length > 0
    && !compatibleTypes.includes(actualLpType);

  /* ── availability guards ──────────────────────────────────────────────────── */
  const chainHasAura   = !!chain?.beefyAddresses?.auraBooster;
  const chainHasConvex = !!chain?.beefyAddresses?.convexBooster;

  function isUnavailable(id) {
    if (id === 'aura')   return !chainHasAura;
    if (id === 'convex') return !chainHasConvex;
    return false;
  }

  /* ── canProceed ───────────────────────────────────────────────────────────── */
  const validationOk   = status === 'ok';
  const curvePoolReady = validationOk && convexCoin !== null && nCoins !== '';
  // CompoundV3 needs distributor address in addition to staking validation
  const compoundReady  = validationOk && compoundDistributor.length >= 42;
  const canProceed =
    stratType === 'pendle'                                              ||   // no staking contract needed
    SINGLE_ASSET_IDS.has(stratType) && stratType !== 'compound' && stratType !== 'pendle' && validationOk ||
    stratType === 'compound'                        && compoundReady              ||
    (stratType === 'chef' || stratType === 'gauge') && validationOk              ||
    stratType === 'aura'                            && validationOk              ||
    USES_CURVE_POOL.has(stratType)                  && curvePoolReady;

  /* ── handleNext ───────────────────────────────────────────────────────────── */
  function handleNext() {
    if (SINGLE_ASSET_IDS.has(stratType)) {
      setForm(f => ({
        ...f,
        strategyType: stratType,
        // Pendle has no staking contract; Tokemak uses the rewarder address
        staking: stratType === 'pendle' ? undefined : stakingAddr,
        merkl:               (stratType === 'erc4626' || stratType === 'morpho') ? (merklClaimer.trim() || undefined) : undefined,
        compoundDistributor: stratType === 'compound' ? compoundDistributor.trim() : undefined,
        siloGauge:           stratType === 'silov2'   ? (siloGauge.trim() || undefined) : undefined,
        harvestOnDeposit:    (stratType === 'erc4626' || stratType === 'morpho' || stratType === 'aave' || stratType === 'pendle') ? harvestOnDeposit : undefined,
        // Clear LP-only fields
        poolId: undefined, pendingRewardsFunctionName: undefined, isStable: undefined, rewardPool: undefined,
        curvePool: undefined, coinIndex: undefined, nCoins: undefined, convexCoin: undefined,
        minterEnabled: undefined, minter: undefined, balancerV3Router: undefined,
      }));
    } else {
      setForm(f => ({
        ...f,
        strategyType: stratType,
        staking:      stakingAddr,
        poolId:       NEEDS_POOL_ID.has(stratType) ? Number(poolId) : undefined,
        pendingRewardsFunctionName: stratType === 'chef' ? (pendingFn.trim() || undefined) : undefined,
        isStable:     stratType === 'gauge' ? form.lpInfo?.isStable : undefined,
        curvePool:    USES_CURVE_POOL.has(stratType) ? curvePool    : undefined,
        coinIndex:    USES_CURVE_POOL.has(stratType) ? Number(coinIndex) : undefined,
        nCoins:       USES_CURVE_POOL.has(stratType) ? Number(nCoins)    : undefined,
        convexCoin:   USES_CURVE_POOL.has(stratType) ? convexCoin   : undefined,
        minterEnabled: stratType === 'curvegauge' ? true : stratType === 'stakedao' ? false : undefined,
        minter: stratType === 'curvegauge' ? (chain?.beefyAddresses?.crvMinter || null) : undefined,
        balancerV3Router: stratType === 'aura' && form.lpInfo?.balancerVersion === 3
          ? (chain?.beefyAddresses?.balancerV3Router || null) : undefined,
        // Clear single-asset fields
        merkl: undefined, compoundDistributor: undefined, siloGauge: undefined, harvestOnDeposit: undefined,
      }));
    }
    onNext();
  }

  /* ── staking address label ────────────────────────────────────────────────── */
  const stakingLabel =
    stratType === 'chef'       ? 'MasterChef Address'         :
    stratType === 'gauge'      ? 'Gauge Address'               :
    stratType === 'aura'       ? 'Aura Booster Address'        :
    stratType === 'convex'     ? 'Convex Booster Address'      :
    stratType === 'curvegauge' ? 'Curve Gauge Address'         :
    stratType === 'stakedao'   ? 'StakeDAO Gauge Address'      :
    stratType === 'erc4626'    ? 'ERC-4626 Vault Address'      :
    stratType === 'morpho'     ? 'Morpho Blue Vault Address'   :
    stratType === 'aave'       ? 'Aave aToken Address'         :
    stratType === 'compound'   ? 'Compound V3 Comet Address'   :
    stratType === 'tokemak'    ? 'Tokemak Rewarder Address'    :
                                 'Silo V2 Market Address';

  /* ── pool ID label ────────────────────────────────────────────────────────── */
  const poolIdLabel =
    stratType === 'chef'   ? 'Pool ID (pid)'   :
    stratType === 'aura'   ? 'Aura Pool ID'    :
                             'Convex Pool ID';

  /* ── render ───────────────────────────────────────────────────────────────── */
  return (
    <PixelBox variant="gold" style={{ padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ color: 'var(--gold)', fontSize: '11px', marginBottom: '8px' }}>
          ▶ STEP 3 — {isSingleAsset ? 'SUPPLY STRATEGY' : 'STAKING CONTRACT'}
        </div>
        <div style={{ fontSize: '7px', color: 'var(--white)', marginBottom: '16px' }}>
          {isSingleAsset
            ? 'Choose which protocol to supply this asset to for yield.'
            : 'Which contract stakes this LP token and earns rewards?'}
        </div>
      </div>

      {/* LP type suggestion banner (LP strategies only) */}
      {!isSingleAsset && suggestion && (
        <div style={{
          fontSize: '7px',
          color: 'var(--cyan)',
          border: '1px solid var(--cyan)',
          padding: '8px 12px',
          marginBottom: '12px',
          background: 'rgba(0,255,200,0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <span style={{ flex: 1 }}>{suggestion.label}</span>
          {stratType !== suggestion.primary && (
            <button
              className="btn btn--sm"
              onClick={() => handleTypeChange(suggestion.primary)}
              style={{ fontSize: '6px', padding: '2px 8px' }}
            >
              USE {suggestion.primary.toUpperCase()}
            </button>
          )}
          {stratType === suggestion.primary && (
            <span style={{ color: 'var(--green)', fontSize: '6px' }}>✓ selected</span>
          )}
        </div>
      )}

      {/* Strategy type picker */}
      {isSingleAsset ? (
        /* Single-asset: 3-column grid for supply strategies */
        <div style={{ marginBottom: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
          {SINGLE_ASSET_OPTS.map(opt => (
            <button
              key={opt.id}
              onClick={() => handleTypeChange(opt.id)}
              className={`btn ${stratType === opt.id ? 'btn--gold' : ''}`}
              style={{ flexDirection: 'column', display: 'flex', gap: '4px' }}
            >
              <div style={{ fontSize: '9px' }}>{opt.label}</div>
              <div style={{ fontSize: '6px', fontFamily: 'sans-serif', opacity: 0.7 }}>{opt.desc}</div>
            </button>
          ))}
        </div>
      ) : (
        /* LP strategies: existing 3×2 grid */
        <div style={{ marginBottom: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
          {STRATEGY_OPTS.map(opt => {
            const unavailable = isUnavailable(opt.id);
            return (
              <button
                key={opt.id}
                onClick={() => !unavailable && handleTypeChange(opt.id)}
                className={`btn ${stratType === opt.id ? 'btn--gold' : ''}`}
                disabled={unavailable}
                style={{ flexDirection: 'column', display: 'flex', gap: '4px', opacity: unavailable ? 0.4 : 1 }}
              >
                <div style={{ fontSize: '9px' }}>{opt.label}</div>
                <div style={{ fontSize: '6px', fontFamily: 'sans-serif', opacity: 0.7 }}>
                  {unavailable ? 'Not on this chain' : opt.desc}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* LP type mismatch warning */}
      {lpMismatch && (
        <PixelBox variant="red" style={{ padding: '10px', marginBottom: '14px' }}>
          <div style={{ fontSize: '7px', color: 'var(--red)' }}>
            ⚠ Your LP token appears to be a <strong>{actualLpType}</strong> pool,
            but the <strong>{stratType.toUpperCase()}</strong> strategy expects a{' '}
            <strong>{compatibleTypes.join(' or ')}</strong> pool.
          </div>
        </PixelBox>
      )}

      {/* Single-asset info banners */}
      {isSingleAsset && (
        <PixelBox style={{ padding: '10px', marginBottom: '14px' }}>
          <div style={{ fontSize: '7px', color: 'var(--cyan)' }}>
            {stratType === 'erc4626'  && '📦 Wraps any ERC-4626 compatible vault (Yearn v3, Spark, Sky Savings Rate…). Optionally claims Merkl airdrop rewards.'}
            {stratType === 'morpho'   && '🟦 Wraps a Morpho Blue vault (also ERC-4626). Optionally claims Merkl airdrop rewards via MorphoMerkl strategy.'}
            {stratType === 'aave'     && '👻 Supplies the asset to Aave v3 and accrues interest via the aToken. Enter the aToken address (e.g. aOptUSDC).'}
            {stratType === 'compound' && '🏦 Supplies the base token to a Compound V3 Comet and auto-claims COMP via the CometRewards distributor.'}
            {stratType === 'silov2'   && '🏦 Supplies the asset to a Silo V2 lending market (ERC-4626 compatible). Optionally stakes in a gauge for extra rewards.'}
            {stratType === 'pendle'   && '🌀 Holds a Pendle PT, SY, or LP token. No staking contract required — yield comes from token accrual. Configure reward tokens (PENDLE + protocol tokens) in Step 4.'}
            {stratType === 'tokemak'  && '⚡ Tokemak staking: enter the Rewarder contract address. The strategy auto-derives the staking token (want) and underlying asset from the rewarder on-chain — no need to specify them manually.'}
          </div>
        </PixelBox>
      )}

      {/* LP strategy info banners */}
      {!isSingleAsset && (stratType === 'aura' || stratType === 'convex' || stratType === 'curvegauge' || stratType === 'stakedao') && (
        <PixelBox style={{ padding: '10px', marginBottom: '14px' }}>
          <div style={{ fontSize: '7px', color: 'var(--cyan)' }}>
            {stratType === 'aura'       && '🔷 Aura Finance: harvests BAL + AURA, joins Balancer pool (v2 or v3), restakes.'}
            {stratType === 'convex'     && '⚙️ Convex Finance: harvests CRV + CVX, swaps to a Curve coin, re-adds liquidity.'}
            {stratType === 'curvegauge' && '〽️ Curve native gauge: CRV via Minter + extra rewards via claim_rewards(), re-adds to Curve pool.'}
            {stratType === 'stakedao'   && '🟣 StakeDAO gauge: claim_rewards(address) distributes CRV + SDT + extras — no external Minter call.'}
          </div>
        </PixelBox>
      )}

      {/* Balancer v3 note (LP only) */}
      {!isSingleAsset && stratType === 'aura' && form.lpInfo?.balancerVersion === 3 && (
        <PixelBox style={{ padding: '10px', marginBottom: '14px' }}>
          <div style={{ fontSize: '7px', color: 'var(--cyan)' }}>
            ℹ Balancer v3 pool detected — the strategy will use the v3 Router
            (<code>addLiquidityUnbalanced</code>) instead of the v2 Vault <code>joinPool</code>.
            Router address auto-filled from chain config.
          </div>
        </PixelBox>
      )}

      {/* Curve gauge: warn if no CRV Minter configured for this chain (LP only) */}
      {!isSingleAsset && stratType === 'curvegauge' && !chain?.beefyAddresses?.crvMinter && (
        <PixelBox variant="red" style={{ padding: '10px', marginBottom: '14px' }}>
          <div style={{ fontSize: '7px', color: 'var(--red)' }}>
            ⚠ No CRV Minter address configured for this chain. Curve native gauges on L2s
            typically don't use the Minter — consider <strong>StakeDAO</strong> or ensure your
            gauge streams CRV via <code>claim_rewards()</code>.
          </div>
        </PixelBox>
      )}

      {/* ── Staking address (hidden for Pendle — no staking contract needed) ───── */}
      {stratType !== 'pendle' && (
        <Field label={stakingLabel} hint={msg} hintType={status}>
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
      )}

      {/* ── Pendle: auto-pass notice ──────────────────────────────────────────── */}
      {stratType === 'pendle' && (
        <div style={{ fontSize: '7px', color: 'var(--green)', marginBottom: '12px', display: 'flex', gap: '6px', alignItems: 'center' }}>
          ✓ {msg || 'No staking contract required'}
        </div>
      )}

      {/* ── Tokemak: show auto-derived want + depositToken after validation ───── */}
      {stratType === 'tokemak' && status === 'ok' && form.want && (
        <PixelBox style={{ padding: '10px', marginBottom: '12px' }}>
          <div style={{ fontSize: '7px', color: '#aaa', lineHeight: '1.8' }}>
            <div><span style={{ color: 'var(--gold)' }}>Auto-derived want: </span>
              <span className="addr">{form.want}</span></div>
            {form.depositToken && form.depositToken !== form.want && (
              <div><span style={{ color: 'var(--gold)' }}>Auto-derived depositToken: </span>
                <span className="addr">{form.depositToken}</span></div>
            )}
            <div style={{ color: 'var(--cyan)', marginTop: '4px' }}>
              ℹ These are set by the strategy contract from the rewarder — you do not need to configure them manually.
            </div>
          </div>
        </PixelBox>
      )}

      {/* ── Single-asset: Merkl claimer (ERC4626 / Morpho) ─────────────────── */}
      {isSingleAsset && (stratType === 'erc4626' || stratType === 'morpho') && (
        <Field
          label="Merkl Distributor Address (optional)"
          hint={merklClaimer.trim()
            ? 'MorphoMerkl / ERC4626Merkl strategy will be used — claims Merkl airdrop rewards'
            : 'Leave empty if no Merkl rewards — uses plain Morpho / ERC4626 strategy'}
          hintType={merklClaimer.trim() ? 'ok' : ''}
        >
          <input
            className="pixel-input"
            placeholder="0x… or leave blank"
            value={merklClaimer}
            onChange={e => setMerklClaimer(e.target.value)}
          />
        </Field>
      )}

      {/* ── Single-asset: Compound V3 distributor (required) ─────────────── */}
      {isSingleAsset && stratType === 'compound' && (
        <Field
          label="CometRewards Distributor Address"
          hint="The Compound V3 CometRewards contract address (required for COMP claims)"
          hintType={compoundDistributor.length >= 42 ? 'ok' : ''}
        >
          <input
            className={`pixel-input ${compoundDistributor.length > 0 && compoundDistributor.length < 42 ? 'error' : ''}`}
            placeholder="0x…"
            value={compoundDistributor}
            onChange={e => { setCompoundDistributor(e.target.value); setStatus(''); setMsg(''); }}
          />
        </Field>
      )}

      {/* ── Single-asset: Silo V2 gauge (optional) ───────────────────────── */}
      {isSingleAsset && stratType === 'silov2' && (
        <Field
          label="Silo Gauge Address (optional)"
          hint={siloGauge.trim()
            ? 'Strategy will stake into the gauge for extra rewards'
            : 'Leave empty if no gauge — interest-only strategy'}
          hintType={siloGauge.trim() ? 'ok' : ''}
        >
          <input
            className="pixel-input"
            placeholder="0x… or leave blank"
            value={siloGauge}
            onChange={e => setSiloGauge(e.target.value)}
          />
        </Field>
      )}

      {/* ── Single-asset: harvestOnDeposit toggle (ERC4626 / Morpho / Aave / Pendle) ── */}
      {isSingleAsset && (stratType === 'erc4626' || stratType === 'morpho' || stratType === 'aave' || stratType === 'pendle') && (
        <Field
          label="Harvest On Deposit"
          hint={harvestOnDeposit
            ? 'Strategy will harvest rewards on every deposit — best for low-TVL vaults'
            : 'Strategy only harvests when callFeeRecipient triggers — saves gas for high-TVL vaults'}
        >
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setHarvestOnDeposit(true)}
              className={`btn ${harvestOnDeposit ? 'btn--gold' : ''}`}
              style={{ width: '80px' }}
            >
              ON
            </button>
            <button
              onClick={() => setHarvestOnDeposit(false)}
              className={`btn ${!harvestOnDeposit ? 'btn--gold' : ''}`}
              style={{ width: '80px' }}
            >
              OFF
            </button>
          </div>
        </Field>
      )}

      {/* ── Pool ID (chef / aura / convex) — LP strategies only ────────────── */}
      {!isSingleAsset && NEEDS_POOL_ID.has(stratType) && (
        <Field
          label={poolIdLabel}
          hint={
            // For aura/convex show the auto-detection status; for chef just show empty hint
            AUTO_POOL_ID.has(stratType)
              ? pidAutoMsg || (form.want ? 'Will auto-scan booster once address is entered' : 'Enter LP token in Step 2 first to enable auto-scan')
              : ''
          }
          hintType={
            AUTO_POOL_ID.has(stratType)
              ? pidSearching ? 'loading' : pidAutoFound ? 'ok' : pidAutoMsg ? '' : ''
              : ''
          }
        >
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              className="pixel-input"
              type="number"
              min="0"
              placeholder="0"
              value={poolId}
              onChange={e => {
                setPoolId(e.target.value);
                setStatus(''); setMsg('');
                // Clear auto-detection state when user types manually
                if (pidAutoFound) { setPidAutoFound(false); setPidAutoMsg(''); }
              }}
              style={{ width: '120px' }}
            />
            {pidSearching && <Spinner />}
            {!pidSearching && pidAutoFound && (
              <span style={{ fontSize: '6px', color: 'var(--green)', border: '1px solid var(--green)', padding: '1px 4px' }}>
                AUTO
              </span>
            )}
          </div>
        </Field>
      )}

      {/* ── Chef: pending rewards function (LP only) ────────────────────────── */}
      {!isSingleAsset && stratType === 'chef' && (
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

      {/* ── Solidly Gauge: stable-pair info (LP only) ───────────────────────── */}
      {!isSingleAsset && stratType === 'gauge' && form.lpInfo?.isStable !== undefined && (
        <PixelBox style={{ padding: '10px', marginBottom: '16px' }}>
          <div style={{ fontSize: '7px', color: 'var(--gold)' }}>
            Pair type detected: <span className="tag tag--cyan">{form.lpInfo.isStable ? 'STABLE' : 'VOLATILE'}</span>
            <br /><span style={{ color: 'var(--border)' }}>This is used for route calculation.</span>
          </div>
        </PixelBox>
      )}

      {/* ── Curve pool fields (LP only, shown after validation succeeds) ──────── */}
      {!isSingleAsset && USES_CURVE_POOL.has(stratType) && status === 'ok' && (
        <>
          <Field
            label="Curve Pool Contract Address"
            hint={curvePool
              ? "Auto-filled from gauge's pool() — override if incorrect"
              : 'The Curve pool contract that handles add_liquidity (may differ from LP token address)'}
            hintType={curvePool ? 'ok' : ''}
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
            label="Coin to compound into"
            hint={
              coinsLoading ? 'Loading pool coins…' :
              coinMsg ||
              (allCoins.length > 0
                ? 'Select which pool coin to swap rewards into on each harvest'
                : 'Index of the pool coin to swap rewards into (0-based)')
            }
            hintType={coinsLoading ? 'loading' : coinStatus}
          >
            {coinsLoading && <Spinner />}

            {/* Dropdown when we have real coin data */}
            {!coinsLoading && allCoins.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {allCoins.map(coin => (
                  <label
                    key={coin.index}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      cursor: 'pointer', fontSize: '7px',
                      color: String(coinIndex) === String(coin.index) ? 'var(--white)' : '#aaa',
                    }}
                  >
                    <input
                      type="radio"
                      name="coinIndex"
                      value={String(coin.index)}
                      checked={String(coinIndex) === String(coin.index)}
                      onChange={() => {
                        setCoinIndex(String(coin.index));
                        setConvexCoin(null); setCoinStatus(''); setCoinMsg('');
                      }}
                    />
                    <span>
                      <span style={{ color: 'var(--gold)' }}>{coin.symbol}</span>
                      {' '}
                      <span style={{ color: '#888' }}>{coin.address.slice(0, 20)}…</span>
                      {' '}
                      <span style={{ color: '#666' }}>(coin {coin.index})</span>
                      {/* Suggest most-liquid coins (USDC, USDT, WETH, etc.) */}
                      {['usdc','usdt','weth','dai','frax'].includes(coin.symbol?.toLowerCase()) && (
                        <span style={{
                          marginLeft: '6px', fontSize: '6px',
                          color: 'var(--green)', border: '1px solid var(--green)', padding: '0 3px',
                        }}>LIQUID</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {/* Fallback number input when coins couldn't be loaded */}
            {!coinsLoading && allCoins.length === 0 && (
              <input
                className="pixel-input"
                type="number"
                min="0"
                max="3"
                placeholder="0"
                value={coinIndex}
                onChange={e => { setCoinIndex(e.target.value); setConvexCoin(null); setCoinStatus(''); setCoinMsg(''); }}
                style={{ width: '80px' }}
              />
            )}
          </Field>

          {/* nCoins — auto-set from allCoins length; show toggle only as fallback */}
          {allCoins.length === 0 && (
            <Field
              label="Number of Coins in Pool"
              hint={form.lpInfo?.nCoins ? `Auto-detected ${form.lpInfo.nCoins} coins from LP token` : ''}
              hintType={form.lpInfo?.nCoins ? 'ok' : ''}
            >
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
          )}
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
