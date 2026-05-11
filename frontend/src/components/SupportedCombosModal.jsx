import React, { useState } from 'react';

// ─── Data ─────────────────────────────────────────────────────────────────────

/**
 * LP strategies per chain.
 * Each entry: { id, tag, examples[] }
 * Only include chains / strategies where the required on-chain infra exists.
 */
const LP_CHAINS = [
  {
    chainId: 1, chain: 'Ethereum', flag: '🟦',
    lp: [
      { id: 'chef',       tag: 'CHEF',       examples: ['SushiSwap', 'Frax Swap'] },
      { id: 'aura',       tag: 'AURA',       examples: ['Balancer → Aura'] },
      { id: 'convex',     tag: 'CONVEX',     examples: ['Curve → Convex'] },
      { id: 'curvegauge', tag: 'CURVE',      examples: ['Curve native gauge', 'CRV minter'] },
      { id: 'stakedao',   tag: 'STAKEDAO',   examples: ['StakeDAO sd-gauge'] },
    ],
  },
  {
    chainId: 56, chain: 'BNB Chain', flag: '🟡',
    lp: [
      { id: 'chef',       tag: 'CHEF',       examples: ['PancakeSwap', 'SushiSwap', 'BiSwap'] },
      { id: 'curvegauge', tag: 'CURVE',      examples: ['Ellipsis / Curve'] },
    ],
  },
  {
    chainId: 137, chain: 'Polygon', flag: '🟣',
    lp: [
      { id: 'chef',       tag: 'CHEF',       examples: ['QuickSwap', 'SushiSwap'] },
      { id: 'aura',       tag: 'AURA',       examples: ['Balancer → Aura'] },
      { id: 'curvegauge', tag: 'CURVE',      examples: ['Curve native gauge'] },
    ],
  },
  {
    chainId: 42161, chain: 'Arbitrum', flag: '🔵',
    lp: [
      { id: 'chef',       tag: 'CHEF',       examples: ['SushiSwap', 'Camelot'] },
      { id: 'gauge',      tag: 'GAUGE',      examples: ['Ramses', 'Chronos'] },
      { id: 'aura',       tag: 'AURA',       examples: ['Balancer → Aura'] },
      { id: 'convex',     tag: 'CONVEX',     examples: ['Curve → Convex'] },
      { id: 'curvegauge', tag: 'CURVE',      examples: ['Curve native gauge'] },
    ],
  },
  {
    chainId: 10, chain: 'Optimism', flag: '🔴',
    lp: [
      { id: 'gauge',      tag: 'GAUGE',      examples: ['Velodrome V2'] },
      { id: 'aura',       tag: 'AURA',       examples: ['Balancer → Aura'] },
      { id: 'curvegauge', tag: 'CURVE',      examples: ['Curve native gauge'] },
      { id: 'stakedao',   tag: 'STAKEDAO',   examples: ['StakeDAO sd-gauge'] },
    ],
  },
  {
    chainId: 8453, chain: 'Base', flag: '🔷',
    lp: [
      { id: 'gauge',      tag: 'GAUGE',      examples: ['Aerodrome'] },
      { id: 'aura',       tag: 'AURA',       examples: ['Balancer → Aura'] },
      { id: 'curvegauge', tag: 'CURVE',      examples: ['Curve native gauge'] },
    ],
  },
  {
    chainId: 43114, chain: 'Avalanche', flag: '🔺',
    lp: [
      { id: 'chef',       tag: 'CHEF',       examples: ['Trader Joe', 'Pangolin'] },
      { id: 'curvegauge', tag: 'CURVE',      examples: ['Curve native gauge'] },
    ],
  },
  {
    chainId: 250, chain: 'Fantom', flag: '👻',
    lp: [
      { id: 'chef',       tag: 'CHEF',       examples: ['SpookySwap', 'SpiritSwap'] },
      { id: 'gauge',      tag: 'GAUGE',      examples: ['Equalizer (Solidly)'] },
    ],
  },
];

/**
 * Single-asset strategy coverage across networks.
 * chains: human-readable short list.
 */
const SINGLE_ASSET_COVERAGE = [
  {
    id: 'erc4626', icon: '📦', label: 'ERC-4626',
    desc: 'Any ERC-4626 vault (Yearn v3, Spark, Sky…)',
    chains: 'All supported networks',
    allChains: true,
  },
  {
    id: 'morpho', icon: '🟦', label: 'Morpho',
    desc: 'Morpho Blue vault (MetaMorpho)',
    chains: 'Ethereum · Base',
  },
  {
    id: 'aave', icon: '👻', label: 'Aave v3',
    desc: 'Aave v3 supply-only via aToken',
    chains: 'Ethereum · Polygon · Arbitrum · Optimism · Base · Avalanche',
  },
  {
    id: 'compound', icon: '🏦', label: 'Compound V3',
    desc: 'Compound V3 Comet supply position',
    chains: 'Ethereum · Polygon · Arbitrum · Optimism · Base',
  },
  {
    id: 'silov2', icon: '🏦', label: 'Silo V2',
    desc: 'Silo V2 lending market (ERC-4626 compatible)',
    chains: 'Ethereum · Arbitrum · Optimism',
  },
  {
    id: 'pendle', icon: '🌀', label: 'Pendle',
    desc: 'Pendle PT/YT — hold & harvest yield',
    chains: 'Ethereum · Arbitrum · BNB Chain · Base · Optimism',
  },
  {
    id: 'tokemak', icon: '⚡', label: 'Tokemak',
    desc: 'Tokemak Autopool — want auto-derived from rewarder',
    chains: 'Ethereum · Arbitrum',
  },
];

const TAG_COLORS = {
  CHEF:     'var(--gold)',
  GAUGE:    'var(--green)',
  AURA:     '#6eb8ff',
  CONVEX:   '#ff9c3c',
  CURVE:    '#d47fff',
  STAKEDAO: '#5fffb8',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Pill({ tag }) {
  return (
    <span style={{
      display: 'inline-block',
      fontSize: '5px',
      fontFamily: 'var(--font)',
      padding: '1px 5px',
      border: `1px solid ${TAG_COLORS[tag] || 'var(--border)'}`,
      color: TAG_COLORS[tag] || 'var(--border)',
      letterSpacing: '0.05em',
      lineHeight: 1.6,
      whiteSpace: 'nowrap',
    }}>
      {tag}
    </span>
  );
}

function ChainRow({ entry }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: '1px solid var(--border)', padding: '6px 0' }}>
      {/* Header row */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <span style={{ fontSize: '8px' }}>{entry.flag}</span>
        <span style={{ fontSize: '7px', color: 'var(--white)', flex: 1 }}>{entry.chain}</span>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {entry.lp.map(s => <Pill key={s.id} tag={s.tag} />)}
        </div>
        <span style={{ fontSize: '6px', color: 'var(--border)', marginLeft: '4px' }}>
          {open ? '▲' : '▼'}
        </span>
      </div>

      {/* Expanded DEX examples */}
      {open && (
        <div style={{ marginTop: '6px', paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {entry.lp.map(s => (
            <div key={s.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <Pill tag={s.tag} />
              <span style={{ fontSize: '6px', color: 'var(--border)', lineHeight: 1.8 }}>
                {s.examples.join(' · ')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SingleAssetRow({ entry }) {
  return (
    <div style={{
      display: 'flex', gap: '8px', alignItems: 'flex-start',
      padding: '5px 0', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: '8px', minWidth: '14px' }}>{entry.icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
          <span style={{ fontSize: '7px', color: 'var(--gold)', fontWeight: 'bold' }}>{entry.label}</span>
          {entry.allChains && (
            <span style={{
              fontSize: '5px', padding: '1px 4px',
              border: '1px solid var(--green)', color: 'var(--green)',
            }}>ALL CHAINS</span>
          )}
        </div>
        <div style={{ fontSize: '6px', color: 'var(--border)', marginBottom: '3px' }}>{entry.desc}</div>
        <div style={{ fontSize: '6px', color: 'var(--cyan)' }}>{entry.chains}</div>
      </div>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function SupportedCombosModal({ onClose }) {
  const [tab, setTab] = useState('lp');

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.82)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9000,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg)',
        border: '2px solid var(--gold)',
        width: 'min(520px, 96vw)',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font)',
        boxShadow: '4px 4px 0 var(--gold)',
      }}>
        {/* Title bar */}
        <div style={{
          background: 'var(--gold)', padding: '5px 10px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: '8px', color: 'var(--bg)', fontWeight: 'bold' }}>
            📋 SUPPORTED CHAINS &amp; STRATEGIES
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--bg)', fontSize: '9px', lineHeight: 1, padding: 0,
            }}
          >✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {[
            { id: 'lp',     label: '🔗 LP STRATEGIES' },
            { id: 'single', label: '📦 SINGLE-ASSET'  },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1, padding: '5px', fontSize: '6px',
                fontFamily: 'var(--font)', cursor: 'pointer',
                background: tab === t.id ? 'var(--gold)' : 'none',
                color: tab === t.id ? 'var(--bg)' : 'var(--border)',
                border: 'none',
                borderRight: '1px solid var(--border)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '10px 14px', flex: 1 }}>
          {tab === 'lp' && (
            <>
              <p style={{ fontSize: '6px', color: 'var(--border)', marginBottom: '10px' }}>
                Click a network to see supported DEX examples. Strategy tags indicate which
                staking type can be used with LP tokens from that chain.
              </p>
              <div style={{ marginBottom: '4px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {Object.entries(TAG_COLORS).map(([tag, color]) => (
                  <span key={tag} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <Pill tag={tag} />
                  </span>
                ))}
              </div>
              <div style={{ marginTop: '8px' }}>
                {LP_CHAINS.map(entry => <ChainRow key={entry.chainId} entry={entry} />)}
              </div>
            </>
          )}

          {tab === 'single' && (
            <>
              <p style={{ fontSize: '6px', color: 'var(--border)', marginBottom: '10px' }}>
                Single-asset strategies wrap a yield-bearing token directly — no LP minting.
                Chain support depends on where the underlying protocol is deployed.
              </p>
              <div>
                {SINGLE_ASSET_COVERAGE.map(entry => (
                  <SingleAssetRow key={entry.id} entry={entry} />
                ))}
              </div>
              <div style={{ marginTop: '10px', fontSize: '6px', color: 'var(--border)' }}>
                ⚠ Availability changes as protocols expand to new chains. Always verify
                on-chain before deploying.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
