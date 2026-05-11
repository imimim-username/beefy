/**
 * vaultName.js — pure utility functions for vault name / moo-token suggestion.
 * Extracted from Step6VaultName.jsx so they can be unit-tested without React.
 *
 * Beefy naming conventions (verified against deployed contracts and beefy-v2 configs):
 *   ERC-20 name   → "Moo {ShortPlatform} {Pair}"   e.g. "Moo Aero msETH-ETH"
 *   ERC-20 symbol → "moo{PlatformCamel}{Pair}"      e.g. "mooAeromsETH-ETH"
 */

/**
 * Strip Solidly/Velodrome AMM prefixes from LP symbols so the vault name is clean.
 *
 * Examples:
 *   "sAMM-USDC/WETH"  → "USDC-WETH"
 *   "vAMM-OP/WETH"    → "OP-WETH"
 *   "80ALCX-20WETH"   → "80ALCX-20WETH"  (Balancer BPT — unchanged)
 *   "crvFRAX"         → "crvFRAX"         (Curve — unchanged)
 */
export function cleanLpSymbol(sym) {
  if (!sym) return null;
  return sym.replace(/^[vs]AMM-/i, '').replace(/\//g, '-');
}

/**
 * Build a moo-token symbol from a cleaned pool name string.
 * Capitalises the first alphabetic character of each dash-separated segment.
 * Used as a standalone helper; buildSuggestions uses platformPrefix instead.
 *
 * Examples:
 *   "USDC-WETH"        → "mooUsdcWeth"
 *   "80ALCX-20WETH"    → "moo80Alcx20Weth"
 *   "crvFRAX"          → "mooCrvfrax"
 *   "3CRV"             → "moo3Crv"
 */
export function toMooSymbol(poolName) {
  if (!poolName) return '';
  const parts = poolName
    .replace(/\//g, '-')
    .split('-')
    .map(p => {
      if (!p) return '';
      const firstAlpha = p.search(/[a-zA-Z]/);
      if (firstAlpha === -1) return p; // pure number segment — keep as-is
      return (
        p.slice(0, firstAlpha) +
        p[firstAlpha].toUpperCase() +
        p.slice(firstAlpha + 1).toLowerCase()
      );
    });
  return 'moo' + parts.join('');
}

/**
 * Short chain name used in moo-token symbols (camelCase, no spaces).
 * Matches the abbreviations most commonly seen in Beefy's earnedToken field.
 */
const CHAIN_SHORT = {
  1:     'Eth',
  10:    'Op',
  56:    'Bsc',
  137:   'Polygon',
  250:   'Ftm',
  42161: 'Arb',
  8453:  'Base',
  43114: 'Avax',
};

/**
 * Return the camelCase platform prefix for the moo-token symbol.
 *
 * Key conventions verified against beefy-v2 earnedToken field:
 *   - Convex vaults use "Curve" prefix (Convex farms Curve LPs — Beefy labels by AMM)
 *   - Velodrome (Op) → "VeloV2"   Aerodrome (Base) → "Aero"
 *   - Aura on Ethereum → "BalancerEthereum"  Aura on L2 → "Aura{Chain}"
 *   - Silo V2 → "SiloV2{Chain}"
 */
export function platformPrefix(stratType, chainId) {
  const c = CHAIN_SHORT[chainId] || '';
  switch (stratType) {
    case 'gauge':
      if (chainId === 10)   return 'VeloV2';
      if (chainId === 8453) return 'Aero';
      return `Solidly${c}`;
    case 'chef':        return c;           // DEX name unknown — chain only
    case 'convex':
    case 'curvegauge':  return `Curve${c}`;
    case 'stakedao':    return `StakeDao${c}`;
    case 'aura':
      // Ethereum mainnet Aura vaults use "BalancerEthereum" prefix
      return chainId === 1 ? 'BalancerEthereum' : `Aura${c}`;
    case 'erc4626':     return c;           // protocol unknown — chain only
    case 'morpho':      return `Morpho${c}`;
    case 'aave':        return `AaveV3${c}`;
    case 'compound':    return `Compound${c}`;
    case 'silov2':      return `SiloV2${c}`;
    case 'pendle':      return `Pendle${c}`;
    case 'tokemak':     return `Tokemak${c}`;
    default:            return c;
  }
}

/**
 * Return the short human-readable platform name used in the ERC-20 vault name field.
 * Format: "Moo {displayName} {pair}"   e.g. "Moo Aero msETH-ETH"
 *
 * These are the abbreviated platform names seen in deployed Beefy vault contracts.
 */
export function platformDisplayName(stratType, chainId) {
  switch (stratType) {
    case 'gauge':
      if (chainId === 10)   return 'Velo';
      if (chainId === 8453) return 'Aero';
      return 'Solidly';
    case 'chef':        return '';          // DEX name unknown — omit
    case 'convex':
    case 'curvegauge':  return 'Curve';
    case 'stakedao':    return 'StakeDAO';
    case 'aura':        return 'Aura';
    case 'erc4626':     return '';          // protocol unknown — omit
    case 'morpho':      return 'Morpho';
    case 'aave':        return 'Aave';
    case 'compound':    return 'Compound';
    case 'silov2':      return 'Silo';
    case 'pendle':      return 'Pendle';
    case 'tokemak':     return 'Tokemak';
    default:            return '';
  }
}

/**
 * Build the auto-suggested vault name and moo-token symbol from form state.
 *
 * ERC-20 name:   "Moo {Platform} {Pair}"  — e.g. "Moo Aero msETH-ETH"
 * ERC-20 symbol: "moo{PlatformCamel}{Pair}" — e.g. "mooAeromsETH-ETH"
 *
 * @param {{ strategyType?: string, chainId?: number,
 *           lpInfo?: { lpSymbol?: string, token0?: {symbol:string},
 *                      token1?: {symbol:string}, token2?: {symbol:string} } }} form
 * @returns {{ suggestedName: string, suggestedSymbol: string, poolName: string }}
 */
export function buildSuggestions(form) {
  const lp        = form?.lpInfo        || {};
  const stratType = form?.strategyType  || '';
  const chainId   = form?.chainId;

  const lpSymbolClean = cleanLpSymbol(lp.lpSymbol);
  const tokens = [lp.token0?.symbol, lp.token1?.symbol, lp.token2?.symbol].filter(Boolean);
  const poolName = lpSymbolClean || tokens.join('-') || 'LP';

  // ERC-20 name: "Moo {Platform} {Pair}" — platform omitted when unknown (chef/erc4626)
  const display = platformDisplayName(stratType, chainId);
  const suggestedName = display ? `Moo ${display} ${poolName}` : `Moo ${poolName}`;

  // ERC-20 symbol: moo + camelCase platform prefix + pool name (original case preserved)
  const prefix = platformPrefix(stratType, chainId);
  const suggestedSymbol = `moo${prefix}${poolName}`;

  return { suggestedName, suggestedSymbol, poolName };
}
