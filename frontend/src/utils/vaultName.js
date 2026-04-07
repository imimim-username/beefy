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
 *
 * Examples:
 *   "USDC-WETH"        → "mooUsdcWeth"
 *   "80ALCX-20WETH"    → "moo80Alcx20Weth"
 *   "crvFRAX"          → "mooCrvfrax"
 *   "3CRV"             → "moo3Crv"  (first alpha 'C' upcased, 'RV' lowercased)
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
 * Build the auto-suggested vault name and moo-token symbol from form.lpInfo.
 *
 * @param {{ lpInfo?: { lpSymbol?: string, token0?: {symbol:string}, token1?: {symbol:string}, token2?: {symbol:string} } }} form
 * @returns {{ suggestedName: string, suggestedSymbol: string, poolName: string }}
 */
export function buildSuggestions(form) {
  const lp = form?.lpInfo || {};
  const tokens = [lp.token0?.symbol, lp.token1?.symbol, lp.token2?.symbol].filter(Boolean);

  const lpSymbolClean = cleanLpSymbol(lp.lpSymbol);
  const poolName = lpSymbolClean || tokens.join('-') || 'LP';

  return {
    suggestedName:   `Beefy ${poolName}`,
    suggestedSymbol: toMooSymbol(poolName),
    poolName,
  };
}
