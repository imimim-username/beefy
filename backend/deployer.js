'use strict';
/**
 * deployer.js — orchestrates vault + strategy deployment via Hardhat.
 *
 * Two-phase flow:
 *   1. dryRun(params)   — forks the target chain, deploys on the fork, returns preview
 *   2. execute(params)  — deploys for real on the live network
 *
 * Both phases use the same Hardhat deploy script; the difference is the
 * --network flag: 'hardhat' (forked) vs the real network name.
 */

const { execFile } = require('child_process');
const path  = require('path');
const fs    = require('fs');
const { CHAINS } = require('./chains.js');

const ROOT = path.join(__dirname, '..');

/**
 * Build the deploy script parameters as a JSON file so we can pass them
 * safely to the Hardhat script (avoids shell injection).
 */
function writeParamsFile(params) {
  const file = path.join(ROOT, 'scripts', '_deploy_params.json');
  fs.writeFileSync(file, JSON.stringify(params, null, 2));
  return file;
}

/**
 * Run a Hardhat deploy script and return { stdout, stderr, exitCode }.
 */
function runHardhat(args, env = {}) {
  return new Promise((resolve) => {
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const proc = execFile(npx, ['hardhat', 'run', ...args], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      timeout: 5 * 60 * 1000, // 5 min
    }, (err, stdout, stderr) => {
      resolve({
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: err ? (err.code || 1) : 0,
      });
    });

    // Stream logs in real-time to the server console
    proc.stdout?.on('data', d => process.stdout.write('[hardhat] ' + d));
    proc.stderr?.on('data', d => process.stderr.write('[hardhat] ' + d));
  });
}

/**
 * Parse DEPLOY_RESULT=<json> line from Hardhat stdout.
 * The deploy scripts print exactly one such line.
 */
function parseResult(stdout) {
  const match = stdout.match(/DEPLOY_RESULT=(\{.*\})/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

/**
 * @typedef {Object} DeployParams
 * @property {number}   chainId
 * @property {string}   strategyType    'chef' | 'gauge'
 * @property {string}   want            LP token address
 * @property {string}   staking         MasterChef or Gauge address
 * @property {number}   [poolId]        required for 'chef' strategies
 * @property {string[]} rewardTokens    array of reward token addresses
 * @property {string[][]} outputToNativeRoute
 * @property {string[][]} outputToLp0Route
 * @property {string[][]} outputToLp1Route
 * @property {string}   vaultName       e.g. "Beefy CAKE-BNB"
 * @property {string}   vaultSymbol     e.g. "mooCakeBNB"
 * @property {string}   [unirouter]     override default router
 * @property {boolean}  [isStable]      Solidly stable pair flag (gauge only)
 */

/**
 * Dry-run on a forked chain.
 * @param {DeployParams} params
 * @returns {Promise<{ok, result?, error?}>}
 */
async function dryRun(params) {
  const chain = CHAINS[params.chainId];
  if (!chain) return { ok: false, error: `Unknown chainId ${params.chainId}` };

  const forkUrl = process.env[chain.rpcEnvKey] || chain.rpcFallback;
  // Inject beefyAddresses from server-side chain config (authoritative)
  const fullParams = { ...params, beefyAddresses: chain.beefyAddresses, dryRun: true };
  writeParamsFile(fullParams);

  const script = `scripts/deploy_${params.strategyType}.cjs`;
  const { stdout, stderr, exitCode } = await runHardhat(
    [script, '--network', 'hardhat'],
    { FORK_URL: forkUrl }
  );

  if (exitCode !== 0) {
    return { ok: false, error: stderr || 'Hardhat exited with code ' + exitCode, stdout };
  }

  const result = parseResult(stdout);
  if (!result) {
    return { ok: false, error: 'Deploy script did not return DEPLOY_RESULT', stdout };
  }
  return { ok: true, result };
}

/**
 * Execute on the real network.
 * Retries up to MAX_RETRIES times on transient RPC errors (502/503/504).
 * @param {DeployParams} params
 * @returns {Promise<{ok, result?, error?}>}
 */
async function execute(params) {
  const chain = CHAINS[params.chainId];
  if (!chain) return { ok: false, error: `Unknown chainId ${params.chainId}` };

  const fullParams = { ...params, beefyAddresses: chain.beefyAddresses, dryRun: false };
  writeParamsFile(fullParams);

  const script = `scripts/deploy_${params.strategyType}.cjs`;
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 5000;

  const isTransientError = (stderr) =>
    /error code: 50[234]|ECONNRESET|ETIMEDOUT|ECONNREFUSED|socket hang up/i.test(stderr);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const { stdout, stderr, exitCode } = await runHardhat(
      [script, '--network', chain.hardhatNetwork]
    );

    if (exitCode === 0) {
      const result = parseResult(stdout);
      if (!result) {
        return { ok: false, error: 'Deploy script did not return DEPLOY_RESULT', stdout };
      }
      return { ok: true, result };
    }

    const isTransient = isTransientError(stderr + stdout);
    if (isTransient && attempt < MAX_RETRIES) {
      const delay = RETRY_DELAY_MS * attempt;
      process.stderr.write(
        `[deployer] RPC error on attempt ${attempt}/${MAX_RETRIES} — retrying in ${delay / 1000}s...\n`
      );
      await new Promise(r => setTimeout(r, delay));
      continue;
    }

    return { ok: false, error: stderr || 'Hardhat exited with code ' + exitCode, stdout };
  }
}

module.exports = { dryRun, execute };
