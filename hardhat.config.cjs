require('dotenv').config();
require('@nomicfoundation/hardhat-ethers');

const pk = process.env.DEPLOYER_PK || '0x0000000000000000000000000000000000000000000000000000000000000001';

const rpc = (envKey, fallback) => process.env[envKey] || fallback;

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: '0.8.28',
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'paris',
    },
  },
  networks: {
    ethereum: {
      url: rpc('RPC_ETH', 'https://eth.llamarpc.com'),
      chainId: 1,
      accounts: [pk],
    },
    hardhat: {
      forking: {
        // Overridden at runtime by the deploy scripts via --fork flag
        url: rpc('FORK_URL', 'https://bsc-dataseed.binance.org/'),
        blockNumber: undefined, // latest
      },
      chainId: 31337,
    },
    bsc: {
      url: rpc('RPC_BSC', 'https://bsc-dataseed.binance.org/'),
      chainId: 56,
      accounts: [pk],
    },
    polygon: {
      url: rpc('RPC_POLYGON', 'https://polygon-rpc.com'),
      chainId: 137,
      accounts: [pk],
    },
    arbitrum: {
      url: rpc('RPC_ARBITRUM', 'https://arb1.arbitrum.io/rpc'),
      chainId: 42161,
      accounts: [pk],
    },
    optimism: {
      url: rpc('RPC_OPTIMISM', 'https://mainnet.optimism.io'),
      chainId: 10,
      accounts: [pk],
    },
    base: {
      url: rpc('RPC_BASE', 'https://mainnet.base.org'),
      chainId: 8453,
      accounts: [pk],
    },
    avax: {
      url: rpc('RPC_AVAX', 'https://api.avax.network/ext/bc/C/rpc'),
      chainId: 43114,
      accounts: [pk],
    },
    fantom: {
      url: rpc('RPC_FANTOM', 'https://rpc.ftm.tools'),
      chainId: 250,
      accounts: [pk],
    },
    celo: {
      url: rpc('RPC_CELO', 'https://forno.celo.org'),
      chainId: 42220,
      accounts: [pk],
    },
    moonbeam: {
      url: rpc('RPC_MOONBEAM', 'https://rpc.api.moonbeam.network'),
      chainId: 1284,
      accounts: [pk],
    },
    cronos: {
      url: rpc('RPC_CRONOS', 'https://evm.cronos.org'),
      chainId: 25,
      accounts: [pk],
    },
  },
  paths: {
    sources: './contracts',
    artifacts: './artifacts',
    cache: './cache',
  },
};
