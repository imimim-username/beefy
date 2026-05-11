'use strict';
/**
 * _strategyFactory.cjs — shared helpers for interacting with Beefy's StrategyFactory.
 *
 * Extracted so deploy scripts can share common logic and so it can be unit-tested
 * without Hardhat.
 */

const ZERO = '0x0000000000000000000000000000000000000000';

/**
 * ABI fragments needed by every deploy script that clones from StrategyFactory.
 */
const STRATEGY_FACTORY_ABI = [
  'function createStrategy(string calldata _strategyName) external returns (address)',
  'function getImplementation(string calldata _strategyName) external view returns (address)',
];

/**
 * Verify a strategy name is registered on the given StrategyFactory instance
 * before attempting createStrategy(), which reverts with ERC1967InvalidBeacon(address(0))
 * if the strategy is not registered.
 *
 * @param {object} factory         — ethers Contract instance (must expose getImplementation)
 * @param {string} stratName       — strategy name, e.g. 'StakeDaoV2'
 * @param {string} factoryAddress  — factory contract address (for error messages)
 * @param {number} chainId         — numeric chain ID (for error messages)
 * @returns {Promise<string>}       — resolves with the implementation address on success
 * @throws {Error}                  — with a human-readable message if not registered
 */
async function assertStrategyRegistered(factory, stratName, factoryAddress, chainId) {
  const implAddress = await factory.getImplementation(stratName);
  if (!implAddress || implAddress === ZERO) {
    throw new Error(
      `${stratName} is not registered on this chain's StrategyFactory (${factoryAddress}). ` +
      `Check that the strategy is deployed on chain ${chainId}. ` +
      `Note: StakeDaoV2 is only available on Ethereum mainnet — StakeDAO's gauge system ` +
      `does not exist on other chains.`
    );
  }
  return implAddress;
}

module.exports = { STRATEGY_FACTORY_ABI, assertStrategyRegistered, ZERO };
