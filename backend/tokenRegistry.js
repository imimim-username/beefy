'use strict';
/**
 * tokenRegistry.js — per-network reward token registry.
 *
 * Stored in registry/tokens.json as:
 * {
 *   "56": [
 *     { "address": "0x...", "symbol": "CAKE", "name": "PancakeSwap Token", "decimals": 18 },
 *     ...
 *   ],
 *   ...
 * }
 *
 * The registry grows automatically as users deploy new vaults.
 */

const fs   = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, '..', 'registry', 'tokens.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  } catch (_e) {
    return {};
  }
}

function save(data) {
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(data, null, 2) + '\n');
}

/**
 * Get all known reward tokens for a chain.
 * @param {number|string} chainId
 * @returns {Array<{address, symbol, name, decimals}>}
 */
function getTokens(chainId) {
  const data = load();
  return data[String(chainId)] || [];
}

/**
 * Add a token to the registry for a chain (no-op if already present by address).
 * @param {number|string} chainId
 * @param {{ address, symbol, name, decimals }} token
 * @returns {boolean} true if it was newly added
 */
function addToken(chainId, token) {
  const data = load();
  const key  = String(chainId);
  if (!data[key]) data[key] = [];

  const already = data[key].some(
    t => t.address.toLowerCase() === token.address.toLowerCase()
  );
  if (already) return false;

  data[key].push(token);
  save(data);
  return true;
}

/**
 * Remove a token from the registry.
 */
function removeToken(chainId, address) {
  const data = load();
  const key  = String(chainId);
  if (!data[key]) return;
  data[key] = data[key].filter(t => t.address.toLowerCase() !== address.toLowerCase());
  save(data);
}

module.exports = { getTokens, addToken, removeToken };
