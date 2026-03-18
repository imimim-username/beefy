'use strict';
/**
 * chains.js — supported networks + Beefy address book per chain.
 *
 * vaultFactory   : BeefyVaultV7Factory — call cloneVault() to create a new vault
 * keeper         : Beefy keeper / harvester (set in strategy as keeper)
 * beefyFeeRecipient : receives Beefy's cut of harvests
 * beefyFeeConfig : on-chain fee config contract
 * unirouter      : default DEX router on this chain (can be overridden per vault)
 * nativeToken    : wrapped native (WBNB, WMATIC, etc.)
 */
const CHAINS = {
  56: {
    id: 56,
    name: 'BNB Chain',
    shortName: 'bsc',
    rpcEnvKey: 'RPC_BSC',
    rpcFallback: 'https://bsc-dataseed.binance.org/',
    nativeSymbol: 'BNB',
    nativeToken: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
    beefyAddresses: {
      vaultFactory:      '0x0000000000000000000000000000000000000000', // placeholder
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0xF153f047cBBD23C0BbBfA6dC8ac2AfaEaEEEb07B',
      beefyFeeConfig:    '0x97b14039e6F8D5eD85a2E3B0AC28dA46F29Cc836',
      unirouter:         '0x10ED43C718714eb63d5aA57B78B54704E256024E', // PancakeSwap v2
    },
    blockExplorer: 'https://bscscan.com',
    hardhatNetwork: 'bsc',
  },
  137: {
    id: 137,
    name: 'Polygon',
    shortName: 'polygon',
    rpcEnvKey: 'RPC_POLYGON',
    rpcFallback: 'https://polygon-rpc.com',
    nativeSymbol: 'MATIC',
    nativeToken: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC
    beefyAddresses: {
      vaultFactory:      '0x0000000000000000000000000000000000000000',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0xF153f047cBBD23C0BbBfA6dC8ac2AfaEaEEEb07B',
      beefyFeeConfig:    '0x97b14039e6F8D5eD85a2E3B0AC28dA46F29Cc836',
      unirouter:         '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff', // QuickSwap
    },
    blockExplorer: 'https://polygonscan.com',
    hardhatNetwork: 'polygon',
  },
  42161: {
    id: 42161,
    name: 'Arbitrum',
    shortName: 'arbitrum',
    rpcEnvKey: 'RPC_ARBITRUM',
    rpcFallback: 'https://arb1.arbitrum.io/rpc',
    nativeSymbol: 'ETH',
    nativeToken: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH
    beefyAddresses: {
      vaultFactory:      '0x0000000000000000000000000000000000000000',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0xF153f047cBBD23C0BbBfA6dC8ac2AfaEaEEEb07B',
      beefyFeeConfig:    '0x97b14039e6F8D5eD85a2E3B0AC28dA46F29Cc836',
      unirouter:         '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', // SushiSwap
    },
    blockExplorer: 'https://arbiscan.io',
    hardhatNetwork: 'arbitrum',
  },
  10: {
    id: 10,
    name: 'Optimism',
    shortName: 'optimism',
    rpcEnvKey: 'RPC_OPTIMISM',
    rpcFallback: 'https://mainnet.optimism.io',
    nativeSymbol: 'ETH',
    nativeToken: '0x4200000000000000000000000000000000000006', // WETH
    beefyAddresses: {
      vaultFactory:      '0x0000000000000000000000000000000000000000',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0xF153f047cBBD23C0BbBfA6dC8ac2AfaEaEEEb07B',
      beefyFeeConfig:    '0x97b14039e6F8D5eD85a2E3B0AC28dA46F29Cc836',
      unirouter:         '0x9c12939390052919aF3155f41Bf4160Fd3666A6f', // Velodrome
    },
    blockExplorer: 'https://optimistic.etherscan.io',
    hardhatNetwork: 'optimism',
  },
  8453: {
    id: 8453,
    name: 'Base',
    shortName: 'base',
    rpcEnvKey: 'RPC_BASE',
    rpcFallback: 'https://mainnet.base.org',
    nativeSymbol: 'ETH',
    nativeToken: '0x4200000000000000000000000000000000000006', // WETH
    beefyAddresses: {
      vaultFactory:      '0x0000000000000000000000000000000000000000',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0xF153f047cBBD23C0BbBfA6dC8ac2AfaEaEEEb07B',
      beefyFeeConfig:    '0x97b14039e6F8D5eD85a2E3B0AC28dA46F29Cc836',
      unirouter:         '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43', // Aerodrome
    },
    blockExplorer: 'https://basescan.org',
    hardhatNetwork: 'base',
  },
  43114: {
    id: 43114,
    name: 'Avalanche',
    shortName: 'avax',
    rpcEnvKey: 'RPC_AVAX',
    rpcFallback: 'https://api.avax.network/ext/bc/C/rpc',
    nativeSymbol: 'AVAX',
    nativeToken: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', // WAVAX
    beefyAddresses: {
      vaultFactory:      '0x0000000000000000000000000000000000000000',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0xF153f047cBBD23C0BbBfA6dC8ac2AfaEaEEEb07B',
      beefyFeeConfig:    '0x97b14039e6F8D5eD85a2E3B0AC28dA46F29Cc836',
      unirouter:         '0x60aE616a2155Ee3d9A68541Ba4544862310933d4', // TraderJoe
    },
    blockExplorer: 'https://snowtrace.io',
    hardhatNetwork: 'avax',
  },
  250: {
    id: 250,
    name: 'Fantom',
    shortName: 'fantom',
    rpcEnvKey: 'RPC_FANTOM',
    rpcFallback: 'https://rpc.ftm.tools',
    nativeSymbol: 'FTM',
    nativeToken: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83', // WFTM
    beefyAddresses: {
      vaultFactory:      '0x0000000000000000000000000000000000000000',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0xF153f047cBBD23C0BbBfA6dC8ac2AfaEaEEEb07B',
      beefyFeeConfig:    '0x97b14039e6F8D5eD85a2E3B0AC28dA46F29Cc836',
      unirouter:         '0xF491e7B69E4244ad4002BC14e878a34207E38c29', // SpookySwap
    },
    blockExplorer: 'https://ftmscan.com',
    hardhatNetwork: 'fantom',
  },
};

module.exports = { CHAINS };
