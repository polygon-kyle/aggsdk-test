require('@nomiclabs/hardhat-ethers');
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
      url: process.env.ETHEREUM_RPC,
      accounts: process.env.TEST_WALLET_PRIVATE_KEY ? [process.env.TEST_WALLET_PRIVATE_KEY] : [],
      chainId: 1
    },
    base: {
      url: process.env.BASE_RPC,
      accounts: process.env.TEST_WALLET_PRIVATE_KEY ? [process.env.TEST_WALLET_PRIVATE_KEY] : [],
      chainId: 8453
    },
    katana: {
      url: process.env.KATANA_RPC,
      accounts: process.env.TEST_WALLET_PRIVATE_KEY ? [process.env.TEST_WALLET_PRIVATE_KEY] : [],
      chainId: 747474
    },
    okx: {
      url: process.env.OKX_RPC,
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
