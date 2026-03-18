/**
 * chainInfo.js — static chain metadata for the frontend.
 * Mirrors backend/chains.js but lives in the browser bundle.
 * Keep in sync with chains.js if you add networks.
 */
export const CHAINS_INFO = {
  1: {
    id: 1, name: 'Ethereum', nativeSymbol: 'ETH',
    nativeToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    blockExplorer: 'https://etherscan.io',
    beefyAddresses: {
      vaultFactory:      '0x0000000000000000000000000000000000000000',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0xF153f047cBBD23C0BbBfA6dC8ac2AfaEaEEEb07B',
      beefyFeeConfig:    '0x97b14039e6F8D5eD85a2E3B0AC28dA46F29Cc836',
      unirouter:         '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    },
  },
  56: {
    id: 56, name: 'BNB Chain', nativeSymbol: 'BNB',
    nativeToken: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    blockExplorer: 'https://bscscan.com',
    beefyAddresses: {
      vaultFactory:      '0x0000000000000000000000000000000000000000',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0xF153f047cBBD23C0BbBfA6dC8ac2AfaEaEEEb07B',
      beefyFeeConfig:    '0x97b14039e6F8D5eD85a2E3B0AC28dA46F29Cc836',
      unirouter:         '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    },
  },
  137: {
    id: 137, name: 'Polygon', nativeSymbol: 'MATIC',
    nativeToken: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    blockExplorer: 'https://polygonscan.com',
    beefyAddresses: {
      vaultFactory:      '0x0000000000000000000000000000000000000000',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0xF153f047cBBD23C0BbBfA6dC8ac2AfaEaEEEb07B',
      beefyFeeConfig:    '0x97b14039e6F8D5eD85a2E3B0AC28dA46F29Cc836',
      unirouter:         '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
    },
  },
  42161: {
    id: 42161, name: 'Arbitrum', nativeSymbol: 'ETH',
    nativeToken: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    blockExplorer: 'https://arbiscan.io',
    beefyAddresses: {
      vaultFactory:      '0x0000000000000000000000000000000000000000',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0xF153f047cBBD23C0BbBfA6dC8ac2AfaEaEEEb07B',
      beefyFeeConfig:    '0x97b14039e6F8D5eD85a2E3B0AC28dA46F29Cc836',
      unirouter:         '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
    },
  },
  10: {
    id: 10, name: 'Optimism', nativeSymbol: 'ETH',
    nativeToken: '0x4200000000000000000000000000000000000006',
    blockExplorer: 'https://optimistic.etherscan.io',
    beefyAddresses: {
      vaultFactory:      '0x0000000000000000000000000000000000000000',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0xF153f047cBBD23C0BbBfA6dC8ac2AfaEaEEEb07B',
      beefyFeeConfig:    '0x97b14039e6F8D5eD85a2E3B0AC28dA46F29Cc836',
      unirouter:         '0x9c12939390052919aF3155f41Bf4160Fd3666A6f',
    },
  },
  8453: {
    id: 8453, name: 'Base', nativeSymbol: 'ETH',
    nativeToken: '0x4200000000000000000000000000000000000006',
    blockExplorer: 'https://basescan.org',
    beefyAddresses: {
      vaultFactory:      '0x0000000000000000000000000000000000000000',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0xF153f047cBBD23C0BbBfA6dC8ac2AfaEaEEEb07B',
      beefyFeeConfig:    '0x97b14039e6F8D5eD85a2E3B0AC28dA46F29Cc836',
      unirouter:         '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
    },
  },
  43114: {
    id: 43114, name: 'Avalanche', nativeSymbol: 'AVAX',
    nativeToken: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
    blockExplorer: 'https://snowtrace.io',
    beefyAddresses: {
      vaultFactory:      '0x0000000000000000000000000000000000000000',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0xF153f047cBBD23C0BbBfA6dC8ac2AfaEaEEEb07B',
      beefyFeeConfig:    '0x97b14039e6F8D5eD85a2E3B0AC28dA46F29Cc836',
      unirouter:         '0x60aE616a2155Ee3d9A68541Ba4544862310933d4',
    },
  },
  250: {
    id: 250, name: 'Fantom', nativeSymbol: 'FTM',
    nativeToken: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
    blockExplorer: 'https://ftmscan.com',
    beefyAddresses: {
      vaultFactory:      '0x0000000000000000000000000000000000000000',
      keeper:            '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619',
      beefyFeeRecipient: '0xF153f047cBBD23C0BbBfA6dC8ac2AfaEaEEEb07B',
      beefyFeeConfig:    '0x97b14039e6F8D5eD85a2E3B0AC28dA46F29Cc836',
      unirouter:         '0xF491e7B69E4244ad4002BC14e878a34207E38c29',
    },
  },
};
