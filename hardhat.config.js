require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    ethereum: {
      url: process.env.ETHEREUM_RPC || 'https://mainnet.gateway.tenderly.co/74Oft2UTCAgT84v4XwtxpL',
      accounts: process.env.TEST_WALLET_PRIVATE_KEY ? [process.env.TEST_WALLET_PRIVATE_KEY] : [],
      chainId: 1
    },
    base: {
      url: process.env.BASE_RPC || 'https://base.gateway.tenderly.co/5HeH5RETKLOYLiGVpxpZRu',
      accounts: process.env.TEST_WALLET_PRIVATE_KEY ? [process.env.TEST_WALLET_PRIVATE_KEY] : [],
      chainId: 8453
    },
    katana: {
      url: process.env.KATANA_RPC || 'https://katana.gateway.tenderly.co/24cZC95Eknn4OZZzVfHSTq',
      accounts: process.env.TEST_WALLET_PRIVATE_KEY ? [process.env.TEST_WALLET_PRIVATE_KEY] : [],
      chainId: 747474
    },
    okx: {
      url: process.env.OKX_RPC || 'https://rpc.xlayer.tech',
      accounts: process.env.TEST_WALLET_PRIVATE_KEY ? [process.env.TEST_WALLET_PRIVATE_KEY] : [],
      chainId: 66
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};
