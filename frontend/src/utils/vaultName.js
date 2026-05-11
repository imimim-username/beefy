/**
 * vaultName.js — pure utility functions for vault name / moo-token suggestion.
 * Extracted from Step6VaultName.jsx so they can be unit-tested without React.
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
 * Short chain name suffix used in moo-token symbols.
 * Matches the abbreviations seen in Beefy's published vault configs.
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
 * Return the PascalCase platform prefix for the moo-token symbol.
 *
 * Examples (by strategyType, chainId):
 *   gauge  / Optimism → "VelodromeOp"
 *   gauge  / Base     → "AerodromeBase"
 *   gauge  / Fantom   → "SolidlyFtm"
 *   chef   / BSC      → "Bsc"  (DEX name unknown; user should customise)
 *   convex / Ethereum → "CurveEth"
 *   aura   / Arbitrum → "AuraArb"
 *   aave   / Optimism → "AaveV3Op"
 */
export function platformPrefix(stratType, chainId) {
  const c = CHAIN_SHORT[chainId] || '';
  switch (stratType) {
    case 'gauge':
      if (chainId === 10)   return `VelodromeOp`;
      if (chainId === 8453) return `AerodromeBase`;
      return `Solidly${c}`;
    case 'chef':        return c;           // DEX name unknown — chain only
    case 'convex':
    case 'curvegauge':  return `Curve${c}`;
    case 'stakedao':    return `StakeDao${c}`;
    case 'aura':        return `Aura${c}`;
    case 'erc4626':     return c;           // protocol unknown — chain only
    case 'morpho':      return `Morpho${c}`;
    case 'aave':        return `AaveV3${c}`;
    case 'compound':    return `Compound${c}`;
    case 'silov2':      return `Silo${c}`;
    case 'pendle':      return `Pendle${c}`;
    case 'tokemak':     return `Tokemak${c}`;
    default:            return c;
  }
}

/**
 * Build the auto-suggested vault name and moo-token symbol from form state.
 *
 * Vault name follows Beefy convention: plain asset/pair name with NO "Beefy" prefix.
 *   e.g. "USDC-WETH", "crvUSD-scrvUSD", "WETH"
 *
 * Moo symbol: moo + PascalCase platform prefix + pool name (original case preserved).
 *   e.g. "mooVelodromeOpUSDC-WETH", "mooCurveEthcrvUSD-scrvUSD", "mooAaveV3OpWETH"
 *
 * @param {{ strategyType?: string, chainId?: number,
 *           lpInfo?: { lpSymbol?: string, token0?: {symbol:string},
 *                      token1?: {symbol:string}, token2?: {symbol:string} } }} form
 * @returns {{ suggestedName: string, suggestedSymbol: string, poolName: string }}
 */
export function buildSuggestions(form) {
  const lp       = form?.lpInfo        || {};
  const stratType = form?.strategyType || '';
  const chainId   = form?.chainId;

  const lpSymbolClean = cleanLpSymbol(lp.lpSymbol);
  const tokens = [lp.token0?.symbol, lp.token1?.symbol, lp.token2?.symbol].filter(Boolean);
  const poolName = lpSymbolClean || tokens.join('-') || 'LP';

  // Vault name: just the pool/asset name — no "Beefy" prefix (Beefy convention)
  const suggestedName = poolName;

  // Moo symbol: platform prefix + pool name preserving original token case and dashes
  const prefix = platformPrefix(stratType, chainId);
  const suggestedSymbol = `moo${prefix}${poolName}`;

  return { suggestedName, suggestedSymbol, poolName };
}
