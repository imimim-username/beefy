import React, { useState } from 'react';

/* ── Data ─────────────────────────────────────────────────────────────────── */

const STEPS = [
  {
    num: 1,
    label: 'NETWORK',
    icon: '🌐',
    body: [
      'Select the chain you want to deploy on.',
      'Beefy\'s contract addresses (StrategyFactory, BeefySwapper, VaultFactory, etc.) are loaded automatically from the built-in chain registry.',
      'If your chain is missing, add it to backend/chains.js before continuing.',
    ],
  },
  {
    num: 2,
    label: 'LP TOKEN',
    icon: '🪙',
    body: [
      'Paste the address of the token you want to vault.',
      'LP tokens (Uniswap V2/V3, Curve, Balancer BPT, Velodrome…) are detected automatically — token0 and token1 are resolved on-chain.',
      'Single-asset tokens (aTokens, ERC-4626 vaults, Morpho vaults, cTokens…) are also accepted. The wizard will adapt the next steps accordingly.',
    ],
  },
  {
    num: 3,
    label: 'STAKING',
    icon: '📍',
    body: [
      'Pick the strategy type that matches the protocol you are vaulting, then fill in the required contract address.',
      'For LP tokens: Chef, Gauge (Velodrome/Aerodrome), Aura/Balancer, Convex, Curve Gauge, or StakeDAO.',
      'For single assets: ERC-4626, Morpho, Aave, Compound V3, Silo V2, Pendle, or Tokemak.',
      'The wizard validates the contract on-chain and confirms the underlying asset matches your want token.',
    ],
  },
  {
    num: 4,
    label: 'REWARDS',
    icon: '🎁',
    body: [
      'Add every reward token the staking contract emits (e.g. OP, ARB, VELO, CRV, CVX…).',
      'BeefySwapper routes each reward token → native → want automatically at harvest time.',
      'For Tokemak strategies rewards are auto-discovered — this step is skipped.',
      'Tip: always include the protocol\'s main emission token even if its value is low.',
    ],
  },
  {
    num: 5,
    label: 'ROUTES',
    icon: '🔀',
    body: [
      'For factory strategies, choose one of the LP\'s underlying tokens as the deposit token.',
      'BeefySwapper converts the native token → deposit token → LP in a single harvest call.',
      'For single-asset strategies this step is skipped — the deposit token is always the want token itself.',
      'For legacy Chef strategies, supply the full swap route arrays (output→native, output→lp0, output→lp1).',
    ],
  },
  {
    num: 6,
    label: 'VAULT NAME',
    icon: '🏷️',
    body: [
      'Set the ERC-20 name and symbol for the vault share token.',
      'Convention: name = "Moo {Protocol} {Token}" (e.g. "Moo Velodrome ETH-USDC"), symbol = "moo{Token}" (e.g. "mooVeloETH-USDC").',
      'These are permanent on-chain — double-check spelling before deploying.',
    ],
  },
  {
    num: 7,
    label: 'REVIEW',
    icon: '🔍',
    body: [
      'All parameters are shown for final review. Click any section header to jump back and edit.',
      'Run a Dry-Run first — this forks mainnet locally and simulates the entire deploy without spending gas.',
      'If the dry-run passes, proceed to the live Deploy step.',
    ],
  },
  {
    num: 8,
    label: 'DEPLOY',
    icon: '🚀',
    body: [
      'The backend runs Hardhat against your chosen network and prints live output.',
      'On success you receive the vault and strategy addresses plus a pre-filled beefy-v2 vault JSON entry.',
      'Copy the JSON into your beefy-v2 PR. Ask in Beefy\'s #-development Discord for listing review.',
    ],
  },
];

const STRATEGIES = [
  {
    id: 'chef',
    label: '🍳 CHEF',
    tag: 'LP',
    desc: 'MasterChef / MiniChef farms. Requires pool ID and swap routes. Uses StrategyCommonChefLP (non-factory, legacy deploy).',
  },
  {
    id: 'gauge',
    label: '📏 GAUGE',
    tag: 'LP',
    desc: 'Velodrome, Aerodrome, and other Solidly-fork gauges. Clones StrategyVelodrome via StrategyFactory. Requires solidlyRouter (auto-set from chain config).',
  },
  {
    id: 'aura',
    label: '⚡ AURA',
    tag: 'LP',
    desc: 'Balancer/Aura pools. Clones StrategyBalancerV3. Requires Aura Booster address + pool ID. gauge and rewardPool are auto-derived from booster.poolInfo().',
  },
  {
    id: 'convex',
    label: '🔺 CONVEX',
    tag: 'LP',
    desc: 'Convex Finance (Ethereum). Uses StrategyConvexL1. Requires Convex Booster + pool ID.',
  },
  {
    id: 'convex_l2',
    label: '🔺 CONVEX L2',
    tag: 'LP',
    desc: 'Convex on L2 chains (Arbitrum, Base, etc.). Uses StrategyConvexL2 which has a slightly different initialize signature.',
  },
  {
    id: 'curvegauge',
    label: '〽️ CURVE GAUGE',
    tag: 'LP',
    desc: 'Native Curve gauge. Uses StrategyCurveGaugeV2. Requires gauge address; minter is auto-set from gauge.',
  },
  {
    id: 'stakedao',
    label: '🏛 STAKE DAO',
    tag: 'LP',
    desc: 'StakeDAO vaults (wraps Curve/Balancer). Uses StrategyStakeDAO. Requires vault + gauge addresses.',
  },
  {
    id: 'erc4626',
    label: '📦 ERC-4626',
    tag: 'SINGLE',
    desc: 'Any ERC-4626 compliant vault (Yearn v3, Spark, Sky USDS, etc.). Optional Merkl claimer address for bonus rewards.',
  },
  {
    id: 'morpho',
    label: '🟦 MORPHO',
    tag: 'SINGLE',
    desc: 'Morpho Blue / MetaMorpho vaults. Structurally identical to ERC-4626 — vault address + optional Merkl claimer.',
  },
  {
    id: 'aave',
    label: '👻 AAVE',
    tag: 'SINGLE',
    desc: 'Aave v3 aToken supply. Paste the aToken address; lendingPool and incentivesController are auto-derived on-chain.',
  },
  {
    id: 'compound',
    label: '🏦 COMPOUND V3',
    tag: 'SINGLE',
    desc: 'Compound V3 Comet. Requires Comet address + CometRewards distributor address. No reward tokens collected (handled internally).',
  },
  {
    id: 'silov2',
    label: '🏦 SILO V2',
    tag: 'SINGLE',
    desc: 'Silo V2 lending vaults. Requires silo address and optional gauge address for extra incentives.',
  },
  {
    id: 'pendle',
    label: '⏳ PENDLE',
    tag: 'SINGLE',
    desc: 'Pendle yield tokens. The simplest initialize — harvestOnDeposit + rewards[] + addresses. Market/router config is factory-baked.',
  },
  {
    id: 'tokemak',
    label: '⚛️ TOKEMAK',
    tag: 'SINGLE',
    desc: 'Tokemak autopilot vaults. Only requires the rewarder address — want, depositToken, and rewards are all auto-derived from the rewarder contract.',
  },
];

const TIPS = [
  '🔑 Always dry-run before deploying live. It catches ABI mismatches, wrong pool IDs, and bad route arrays.',
  '💾 Your session is auto-saved in localStorage — refresh without losing progress.',
  '🔎 Use block explorers (Etherscan, Arbiscan, etc.) to verify contract addresses before pasting them.',
  '💬 Join Beefy\'s Discord #-development channel to get your vault listing reviewed.',
  '📝 The vault JSON shown after deploy is ready to paste into a beefy-v2 PR.',
  '⚡ harvestOnDeposit = true sets lockDuration = 0. Use for liquid stables or high-frequency farms.',
  '🛡 The StrategyFactory clones audited implementations — never deploy a hand-written strategy contract for a Beefy listing.',
];

/* ── Component ────────────────────────────────────────────────────────────── */

export function HelpModal({ onClose }) {
  const [tab, setTab] = useState('steps'); // 'steps' | 'strategies' | 'tips'
  const [openStep, setOpenStep] = useState(null);

  const tabStyle = (id) => ({
    padding: '6px 10px',
    fontSize: '7px',
    fontFamily: 'var(--font)',
    cursor: 'pointer',
    border: '2px solid',
    borderColor: tab === id ? 'var(--cyan)' : 'var(--border)',
    background: tab === id ? 'var(--bg3)' : 'var(--bg)',
    color: tab === id ? 'var(--cyan)' : 'var(--border)',
    marginRight: '4px',
  });

  return (
    /* ── Overlay ── */
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 999,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '12px',
      }}
    >
      {/* ── Panel ── */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '680px', maxHeight: '90vh',
          background: 'var(--bg2)',
          border: '4px solid var(--cyan)',
          boxShadow: '0 0 32px #00e5ff44, 4px 4px 0 var(--shadow)',
          display: 'flex', flexDirection: 'column',
          fontFamily: 'var(--font)',
          overflow: 'hidden',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderBottom: '2px solid var(--border)',
          background: 'var(--bg3)',
        }}>
          <div>
            <div style={{ color: 'var(--gold)', fontSize: '11px', letterSpacing: '2px' }}>
              ❓ HELP &amp; GUIDE
            </div>
            <div style={{ color: 'var(--border)', fontSize: '6px', marginTop: '3px' }}>
              BEEFY VAULT DEPLOYER
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: '2px solid var(--red)',
              color: 'var(--red)', fontFamily: 'var(--font)',
              fontSize: '9px', cursor: 'pointer', padding: '4px 8px',
            }}
          >
            ✕ CLOSE
          </button>
        </div>

        {/* ── Tabs ── */}
        <div style={{ padding: '8px 14px', borderBottom: '2px solid var(--border)' }}>
          <button style={tabStyle('steps')}   onClick={() => setTab('steps')}>📋 STEPS</button>
          <button style={tabStyle('strategies')} onClick={() => setTab('strategies')}>⚙️ STRATEGIES</button>
          <button style={tabStyle('tips')}    onClick={() => setTab('tips')}>💡 TIPS</button>
        </div>

        {/* ── Content ── */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '12px 14px' }}>

          {/* ── Steps tab ── */}
          {tab === 'steps' && (
            <div>
              {STEPS.map(s => (
                <div key={s.num} style={{ marginBottom: '6px' }}>
                  <button
                    onClick={() => setOpenStep(openStep === s.num ? null : s.num)}
                    style={{
                      width: '100%', textAlign: 'left',
                      background: openStep === s.num ? 'var(--bg3)' : 'var(--bg)',
                      border: '2px solid',
                      borderColor: openStep === s.num ? 'var(--cyan)' : 'var(--border)',
                      color: 'var(--white)', fontFamily: 'var(--font)',
                      fontSize: '8px', padding: '7px 10px',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '8px',
                    }}
                  >
                    <span style={{ color: 'var(--gold)', minWidth: '16px' }}>
                      {String(s.num).padStart(2, '0')}
                    </span>
                    <span>{s.icon} {s.label}</span>
                    <span style={{ marginLeft: 'auto', color: 'var(--cyan)', fontSize: '6px' }}>
                      {openStep === s.num ? '▲' : '▼'}
                    </span>
                  </button>
                  {openStep === s.num && (
                    <div style={{
                      background: 'var(--bg)',
                      border: '2px solid var(--cyan)',
                      borderTop: 'none',
                      padding: '10px 12px',
                    }}>
                      {s.body.map((line, i) => (
                        <div key={i} style={{
                          fontSize: '7px', color: 'var(--white)',
                          lineHeight: 1.9, marginBottom: i < s.body.length - 1 ? '8px' : 0,
                          paddingLeft: '8px',
                          borderLeft: '2px solid var(--gold)',
                        }}>
                          {line}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Strategies tab ── */}
          {tab === 'strategies' && (
            <div>
              {['LP', 'SINGLE'].map(group => (
                <div key={group} style={{ marginBottom: '14px' }}>
                  <div style={{
                    fontSize: '7px', color: 'var(--gold)',
                    letterSpacing: '2px', marginBottom: '6px',
                    borderBottom: '1px solid var(--border)', paddingBottom: '4px',
                  }}>
                    ── {group === 'LP' ? '📊 LP / POOL STRATEGIES' : '🔵 SINGLE-ASSET STRATEGIES'} ──
                  </div>
                  {STRATEGIES.filter(s => s.tag === group).map(s => (
                    <div key={s.id} style={{
                      background: 'var(--bg)',
                      border: '2px solid var(--border)',
                      padding: '8px 10px', marginBottom: '4px',
                    }}>
                      <div style={{ fontSize: '8px', color: 'var(--cyan)', marginBottom: '4px' }}>
                        {s.label}
                      </div>
                      <div style={{ fontSize: '6px', color: 'var(--white)', lineHeight: 1.9 }}>
                        {s.desc}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* ── Tips tab ── */}
          {tab === 'tips' && (
            <div>
              {TIPS.map((tip, i) => (
                <div key={i} style={{
                  background: 'var(--bg)',
                  border: '2px solid var(--border)',
                  padding: '10px 12px', marginBottom: '6px',
                  fontSize: '7px', lineHeight: 1.9, color: 'var(--white)',
                }}>
                  {tip}
                </div>
              ))}

              {/* Links */}
              <div style={{
                marginTop: '12px',
                borderTop: '2px solid var(--border)',
                paddingTop: '10px',
                fontSize: '7px',
              }}>
                <div style={{ color: 'var(--gold)', marginBottom: '6px' }}>🔗 USEFUL LINKS</div>
                {[
                  ['Beefy GitHub', 'https://github.com/beefyfinance/beefy-contracts'],
                  ['Beefy v2 Vaults Repo', 'https://github.com/beefyfinance/beefy-v2'],
                  ['Beefy Discord', 'https://discord.gg/yq8wfHd'],
                  ['Beefy Docs', 'https://docs.beefy.finance'],
                ].map(([label, url]) => (
                  <div key={url} style={{ marginBottom: '4px' }}>
                    <span style={{ color: 'var(--border)' }}>→ </span>
                    <a
                      href={url} target="_blank" rel="noreferrer"
                      style={{ color: 'var(--cyan)', textDecoration: 'none' }}
                    >
                      {label}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* ── Footer ── */}
        <div style={{
          borderTop: '2px solid var(--border)',
          padding: '6px 14px',
          fontSize: '6px', color: 'var(--border)',
          background: 'var(--bg3)',
          textAlign: 'center',
        }}>
          CLICK OUTSIDE OR PRESS ESC TO CLOSE · BEEFY VAULT DEPLOYER v1.0
        </div>
      </div>
    </div>
  );
}
