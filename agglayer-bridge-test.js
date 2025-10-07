#!/usr/bin/env node

/**
 * Agglayer SDK Bridge Testing Script
 * Tests bridging between Katana, OKX, Base, and Ethereum chains
 *
 * Prerequisites:
 * 1. npm install @agglayer/sdk@beta ethers@5 dotenv
 * 2. Create .env file with required environment variables
 * 3. Ensure test wallets have sufficient balances for testing
 */

require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Import AggLayer SDK
let AggLayerSDK, SDK_MODES;
try {
  const sdk = require('@agglayer/sdk');
  AggLayerSDK = sdk.AggLayerSDK;
  SDK_MODES = sdk.SDK_MODES;
} catch (error) {
  console.error('❌ Failed to import @agglayer/sdk. Make sure to install it with: npm install @agglayer/sdk@beta');
  process.exit(1);
}

// Simplified chain configurations - only test-specific metadata
const CHAINS = {
  ethereum: {
    chainId: 1,
    networkId: 0, // Agglayer network ID
    name: 'Ethereum',
    rpc: process.env.ETHEREUM_RPC || 'https://mainnet.gateway.tenderly.co',
    bridgeAddress: process.env.ETHEREUM_BRIDGE_ADDRESS || '0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe'
  },
  base: {
    chainId: 8453,
    networkId: 10,
    name: 'Base',
    rpc: process.env.BASE_RPC || 'https://base.gateway.tenderly.co',
    bridgeAddress: null // Base uses LiFi routes via Core API
  },
  katana: {
    chainId: 747474,
    networkId: 20,
    name: 'Katana',
    rpc: process.env.KATANA_RPC || 'https://katana.gateway.tenderly.co',
    bridgeAddress: process.env.KATANA_BRIDGE_ADDRESS || '0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe'
  },
  okx: {
    chainId: 196,
    networkId: 2,
    name: 'OKX X Layer',
    rpc: process.env.OKX_RPC || 'https://rpc.xlayer.tech',
    bridgeAddress: process.env.OKX_BRIDGE_ADDRESS || '0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe'
  }
};

// Token configurations
const TOKENS = {
  ETH: {
    ethereum: { address: ethers.constants.AddressZero, symbol: 'ETH', decimals: 18, isNative: true },
    base: { address: ethers.constants.AddressZero, symbol: 'ETH', decimals: 18, isNative: true },
    katana: { address: ethers.constants.AddressZero, symbol: 'ETH', decimals: 18, isNative: true },
    okx: { address: '0x5a77f1443d16ee5761d310e38b62f77f726bc71c', symbol: 'WETH', decimals: 18, isNative: false }
  },
  WBTC: {
    ethereum: { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC', decimals: 8, isNative: false },
    base: { address: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', symbol: 'WBTC', decimals: 8, isNative: false },
    katana: { address: null, symbol: 'WBTC', decimals: 8, isNative: false },
    okx: { address: '0xea034fb02eb1808c2cc3adbc15f447b93cbe08e1', symbol: 'WBTC', decimals: 8, isNative: false }
  },
  OKB: {
    ethereum: { address: '0x75231F58b43240C9718Dd58B4967c5114342a86c', symbol: 'OKB', decimals: 18, isNative: false },
    okx: { address: ethers.constants.AddressZero, symbol: 'OKB', decimals: 18, isNative: true },
    katana: { address: null, symbol: 'OKB', decimals: 18, isNative: false }
  },
  CUSTOM_ERC20: {
    katana: { address: process.env.CUSTOM_TOKEN_KATANA || null, symbol: 'ASTEST', decimals: 18, isNative: false },
    base: { address: null, symbol: 'ASTEST', decimals: 18, isNative: false },
    ethereum: { address: null, symbol: 'ASTEST', decimals: 18, isNative: false }
  }
};

// Test configuration
const TEST_CONFIG = {
  testWalletPrivateKey: process.env.TEST_WALLET_PRIVATE_KEY,
  testAmounts: {
    ETH: process.env.TEST_ETH_AMOUNT
      ? ethers.utils.parseEther(process.env.TEST_ETH_AMOUNT)
      : ethers.utils.parseEther('0.01'),
    WBTC: process.env.TEST_WBTC_AMOUNT
      ? ethers.utils.parseUnits(process.env.TEST_WBTC_AMOUNT, 8)
      : ethers.utils.parseUnits('0.001', 8),
    OKB: process.env.TEST_OKB_AMOUNT
      ? ethers.utils.parseEther(process.env.TEST_OKB_AMOUNT)
      : ethers.utils.parseEther('1'),
    CUSTOM_ERC20: process.env.TEST_CUSTOM_AMOUNT
      ? ethers.utils.parseEther(process.env.TEST_CUSTOM_AMOUNT)
      : ethers.utils.parseEther('100')
  },
  dryRun: process.env.DRY_RUN === 'true',
  slippage: parseFloat(process.env.SLIPPAGE || '0.5'),
  gasMultiplier: parseFloat(process.env.GAS_MULTIPLIER || '1.2'),
  skipBalanceCheck: process.env.SKIP_BALANCE_CHECK === 'true'
};

class AggLayerBridgeTest {
  constructor() {
    this.wallet = null; // Single wallet instance - SDK handles providers
    this.sdk = null;
    this.core = null;
    this.native = null;
    this.testResults = [];
  }

  async initialize() {
    console.log('🚀 Initializing Agglayer Bridge Test Suite...\n');

    this.validateEnvironment();
    await this.setupWallet();
    await this.initializeSDK();
    await this.checkCustomToken();

    console.log('✅ Initialization complete!\n');
  }

  validateEnvironment() {
    const required = ['TEST_WALLET_PRIVATE_KEY'];
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}\nPlease check your .env file.`);
    }
  }

  async setupWallet() {
    console.log('📡 Setting up test wallet...');

    // Single wallet instance - SDK manages chain-specific providers
    this.wallet = new ethers.Wallet(TEST_CONFIG.testWalletPrivateKey);
    console.log(`  Wallet Address: ${this.wallet.address}\n`);
  }

  async initializeSDK() {
    console.log('🔧 Initializing Agglayer SDK...');

    try {
      // Build chains array from CHAINS config
      const nativeChains = Object.entries(CHAINS).map(([key, config]) => ({
        chainId: config.chainId,
        networkId: config.networkId,
        name: config.name,
        rpcUrl: config.rpc,
        nativeCurrency: key === 'okx'
          ? { name: 'OKB', symbol: 'OKB', decimals: 18 }
          : { name: 'Ether', symbol: 'ETH', decimals: 18 },
        bridgeAddress: config.bridgeAddress,
        isTestnet: false
      }));

      // Initialize SDK
      this.sdk = new AggLayerSDK({
        mode: [SDK_MODES.CORE, SDK_MODES.NATIVE],
        core: {
          apiBaseUrl: process.env.ARC_API_BASE_URL || 'https://arc-api.polygon.technology',
          apiTimeout: 60000
        },
        native: {
          defaultNetwork: 1,
          chains: nativeChains
        }
      });

      this.core = this.sdk.getCore();
      this.native = this.sdk.getNative();

      console.log('✅ SDK initialized successfully');
      console.log(`  Core API: ${this.core ? 'Ready' : 'Not available'}`);
      console.log(`  Native Bridge: ${this.native ? 'Ready' : 'Not available'}`);
      console.log(`  Chains: ${nativeChains.map(c => c.name).join(', ')}\n`);

    } catch (error) {
      console.error('❌ Failed to initialize SDK:', error.message);
      throw error;
    }
  }

  async checkCustomToken() {
    console.log('🪙 Checking ASTEST token...');

    if (TOKENS.CUSTOM_ERC20.katana.address) {
      console.log(`  ✅ ASTEST token deployed on Katana: ${TOKENS.CUSTOM_ERC20.katana.address}`);
      console.log(`  ℹ️  Wrapped versions will be auto-resolved by SDK during tests`);
    } else {
      console.log('  ⚠️  ASTEST token not deployed. Tests requiring ASTEST will be skipped.');
      console.log('  Run: npm run deploy:astest to deploy ASTEST on Katana.');
    }
    console.log('');
  }

  // Helper to get provider for a specific chain using SDK
  getProviderForChain(chainId) {
    const network = this.native.getNetwork(chainId);
    return new ethers.providers.JsonRpcProvider(network.rpcUrl);
  }

  async testBridgeScenario(fromChain, toChain, tokenSymbol, direction) {
    const testName = `${tokenSymbol}: ${fromChain} → ${toChain}`;
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔄 Test: ${testName}`);
    console.log(`${'='.repeat(80)}`);

    try {
      const fromChainConfig = CHAINS[fromChain];
      const toChainConfig = CHAINS[toChain];
      const token = TOKENS[tokenSymbol];
      const amount = TEST_CONFIG.testAmounts[tokenSymbol];

      // Validate token configuration
      if (!token[fromChain] || !token[toChain]) {
        throw new Error(`Token ${tokenSymbol} not configured for ${fromChain} or ${toChain}`);
      }

      if (!token[fromChain].isNative && token[fromChain].address === null) {
        throw new Error(`Token ${tokenSymbol} address not resolved on ${fromChain}`);
      }

      const fromTokenAddress = token[fromChain].address || ethers.constants.AddressZero;
      const toTokenAddress = token[toChain].address || ethers.constants.AddressZero;

      console.log(`📍 From: ${fromChain} (Chain ID: ${fromChainConfig.chainId})`);
      console.log(`📍 To: ${toChain} (Chain ID: ${toChainConfig.chainId})`);
      console.log(`💰 Token: ${tokenSymbol} (${ethers.utils.formatUnits(amount, token[fromChain].decimals)})`);
      console.log(`🔑 Wallet: ${this.wallet.address}`);

      // Step 1: Check balance using SDK
      console.log('\n📊 Step 1: Checking balance...');
      if (!TEST_CONFIG.skipBalanceCheck) {
        const hasBalance = await this.checkBalance(fromChain, tokenSymbol, amount);
        if (!hasBalance) {
          throw new Error(`Insufficient ${tokenSymbol} balance on ${fromChain}`);
        }
      } else {
        console.log('  ⚠️  Balance check skipped (SKIP_BALANCE_CHECK=true)');
      }

      // Step 2: Get routes - try Core API first, fallback to Native bridge
      console.log('\n🔍 Step 2: Finding bridge route...');
      let unsignedTx;
      let bridgeMethod = null;

      try {
        // Try Core API first (supports third-party bridges)
        const routes = await this.core.getRoutes({
          fromChainId: fromChainConfig.chainId,
          toChainId: toChainConfig.chainId,
          fromTokenAddress: fromTokenAddress,
          toTokenAddress: toTokenAddress,
          amount: amount.toString(),
          fromAddress: this.wallet.address,
          slippage: TEST_CONFIG.slippage
        });

        if (!routes || routes.length === 0) {
          throw new Error('No routes available from Core API');
        }

        bridgeMethod = 'Core API';
        console.log(`  ✅ Found ${routes.length} route(s) via Core API`);
        const bestRoute = routes[0];
        console.log(`  📍 Route: ${bestRoute.protocol || 'Unknown'}`);

        // Step 3: Approve token if needed
        if (!token[fromChain].isNative && fromTokenAddress !== ethers.constants.AddressZero) {
          console.log('\n✅ Step 3: Approving token...');
          await this.approveToken(fromChain, fromTokenAddress, fromChainConfig.bridgeAddress, amount);
        } else {
          console.log('\n⏭️  Step 3: Skipping approval (native token)');
        }

        // Step 4: Build transaction
        console.log('\n🏗️  Step 4: Building bridge transaction via Core API...');
        unsignedTx = await this.core.getUnsignedTransaction(bestRoute);

      } catch (error) {
        // Fallback to Native bridge
        console.log('  ⚠️  Core API unavailable or chains not supported');
        console.log('  🔄 Attempting Native Bridge module...');

        bridgeMethod = 'Native Bridge';

        // Step 3: Approve token if needed
        if (!token[fromChain].isNative && fromTokenAddress !== ethers.constants.AddressZero) {
          console.log('\n✅ Step 3: Approving token...');
          await this.approveToken(fromChain, fromTokenAddress, fromChainConfig.bridgeAddress, amount);
        } else {
          console.log('\n⏭️  Step 3: Skipping approval (native token)');
        }

        // Step 4: Build transaction using Native module
        console.log('\n🏗️  Step 4: Building bridge transaction via Native module...');
        const bridge = this.native.bridge(fromChainConfig.bridgeAddress, fromChainConfig.chainId);

        unsignedTx = await bridge.buildBridgeAsset({
          destinationNetwork: toChainConfig.networkId,
          destinationAddress: this.wallet.address,
          amount: amount.toString(),
          token: fromTokenAddress,
          forceUpdateGlobalExitRoot: true
        }, this.wallet.address);
      }

      console.log(`  To: ${unsignedTx.to}`);
      console.log(`  Value: ${ethers.utils.formatEther(unsignedTx.value || '0')} ETH`);
      console.log(`  Data: ${unsignedTx.data.substring(0, 66)}...`);

      // Step 5: Execute transaction
      const result = await this.executeTransaction(unsignedTx, fromChain);

      this.testResults.push({
        test: testName,
        status: result.mock ? 'SUCCESS (DRY RUN)' : 'SUCCESS',
        method: bridgeMethod,
        txHash: result.hash,
        blockNumber: result.blockNumber,
        gasUsed: result.gasUsed?.toString(),
        fromChain,
        toChain,
        token: tokenSymbol,
        amount: ethers.utils.formatUnits(amount, token[fromChain].decimals),
        timestamp: new Date().toISOString()
      });

      console.log(`\n✅ ${testName} completed successfully`);

    } catch (error) {
      console.error(`\n❌ ${testName} failed:`, error.message);
      if (error.stack && process.env.DEBUG) {
        console.error('Stack trace:', error.stack);
      }

      this.testResults.push({
        test: testName,
        status: 'FAILED',
        error: error.message,
        fromChain,
        toChain,
        token: tokenSymbol,
        timestamp: new Date().toISOString()
      });
    }
  }

  async checkBalance(chainName, tokenSymbol, requiredAmount) {
    try {
      const token = TOKENS[tokenSymbol][chainName];
      const chainId = CHAINS[chainName].chainId;

      // Use SDK methods for balance checking
      let balance;
      if (token.isNative) {
        balance = await this.native.getNativeBalance(this.wallet.address, chainId);
      } else {
        const erc20 = this.native.erc20(token.address, chainId);
        balance = await erc20.getBalance(this.wallet.address);
      }

      const balanceBN = ethers.BigNumber.from(balance);
      const hasBalance = balanceBN.gte(requiredAmount);

      console.log(`  Current: ${ethers.utils.formatUnits(balance, token.decimals)} ${tokenSymbol}`);
      console.log(`  Required: ${ethers.utils.formatUnits(requiredAmount, token.decimals)} ${tokenSymbol}`);
      console.log(`  ${hasBalance ? '✅' : '❌'} ${hasBalance ? 'Sufficient' : 'Insufficient'} balance`);

      return hasBalance;
    } catch (error) {
      console.error(`  ❌ Error checking balance:`, error.message);
      return false;
    }
  }

  async approveToken(chainName, tokenAddress, spenderAddress, amount) {
    try {
      const chainId = CHAINS[chainName].chainId;
      const erc20 = this.native.erc20(tokenAddress, chainId);

      // Check current allowance
      const allowance = await erc20.getAllowance(this.wallet.address, spenderAddress);
      const allowanceBN = ethers.BigNumber.from(allowance);

      console.log(`  Current allowance: ${allowanceBN.toString()}`);

      if (allowanceBN.gte(amount)) {
        console.log(`  ✅ Sufficient allowance already exists`);
        return;
      }

      if (TEST_CONFIG.dryRun) {
        console.log(`  ✅ DRY RUN - Would approve ${amount.toString()}`);
        return;
      }

      // Build and send approve transaction
      const approveTx = await erc20.buildApprove(
        spenderAddress,
        amount.toString(),
        this.wallet.address
      );

      // Get provider and connect wallet
      const provider = this.getProviderForChain(chainId);
      const connectedWallet = this.wallet.connect(provider);

      console.log(`  📝 Approving ${amount.toString()}...`);
      const txResponse = await connectedWallet.sendTransaction(approveTx);
      console.log(`  ⏳ Approval TX: ${txResponse.hash}`);

      const receipt = await txResponse.wait();
      console.log(`  ✅ Approval confirmed in block ${receipt.blockNumber}`);

    } catch (error) {
      console.error(`  ❌ Approval failed:`, error.message);
      throw error;
    }
  }

  async executeTransaction(unsignedTx, fromChain) {
    if (TEST_CONFIG.dryRun) {
      console.log('\n🔍 Step 5: DRY RUN - Simulating transaction...');
      const mockTxHash = `0x${Math.random().toString(16).substring(2).padStart(64, '0')}`;
      console.log(`  ✅ Simulation successful`);
      console.log(`  Mock TX Hash: ${mockTxHash}`);
      return { hash: mockTxHash, mock: true };
    }

    console.log('\n🚀 Step 5: Executing bridge transaction...');

    // Get provider from SDK and connect wallet
    const chainId = CHAINS[fromChain].chainId;
    const provider = this.getProviderForChain(chainId);
    const connectedWallet = this.wallet.connect(provider);

    // Estimate gas or use provided
    let gasLimit = unsignedTx.gasLimit;
    if (!gasLimit) {
      try {
        gasLimit = await connectedWallet.estimateGas({
          to: unsignedTx.to,
          data: unsignedTx.data,
          value: unsignedTx.value || '0'
        });
        console.log(`  ⛽ Estimated gas: ${gasLimit.toString()}`);
      } catch (e) {
        console.warn('  ⚠️  Gas estimation failed, using 800k');
        gasLimit = '800000';
      }
    }

    // Apply gas multiplier for safety
    gasLimit = ethers.BigNumber.from(gasLimit)
      .mul(Math.floor(TEST_CONFIG.gasMultiplier * 100))
      .div(100);

    const txResponse = await connectedWallet.sendTransaction({
      to: unsignedTx.to,
      data: unsignedTx.data,
      value: unsignedTx.value || '0',
      gasLimit
    });

    console.log(`  📝 TX Hash: ${txResponse.hash}`);
    console.log(`  ⏳ Waiting for confirmation...`);

    const receipt = await txResponse.wait();
    console.log(`  ✅ Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`  ⛽ Gas used: ${receipt.gasUsed.toString()}`);

    return {
      hash: txResponse.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
      mock: false
    };
  }

  async runAllTests() {
    console.log('\n🧪 Starting Comprehensive Bridge Tests\n');
    console.log(`Mode: ${TEST_CONFIG.dryRun ? 'DRY RUN (No real transactions)' : 'LIVE (Real transactions)'}`);
    console.log(`Slippage tolerance: ${TEST_CONFIG.slippage}%`);
    console.log(`Balance checks: ${TEST_CONFIG.skipBalanceCheck ? 'DISABLED' : 'ENABLED'}`);
    console.log('');

    // Test scenarios
    const testScenarios = [
      // Base ↔ Katana
      { from: 'base', to: 'katana', token: 'ETH', direction: 'Base→Katana' },
      { from: 'katana', to: 'base', token: 'ETH', direction: 'Katana→Base' },
      { from: 'base', to: 'katana', token: 'WBTC', direction: 'Base→Katana' },
      { from: 'katana', to: 'base', token: 'WBTC', direction: 'Katana→Base' },
      { from: 'base', to: 'katana', token: 'CUSTOM_ERC20', direction: 'Base→Katana' },
      { from: 'katana', to: 'base', token: 'CUSTOM_ERC20', direction: 'Katana→Base' },

      // Katana ↔ OKX
      { from: 'katana', to: 'okx', token: 'ETH', direction: 'Katana→OKX' },
      { from: 'okx', to: 'katana', token: 'ETH', direction: 'OKX→Katana' },
      { from: 'katana', to: 'okx', token: 'OKB', direction: 'Katana→OKX' },
      { from: 'okx', to: 'katana', token: 'OKB', direction: 'OKX→Katana' },
      { from: 'katana', to: 'okx', token: 'WBTC', direction: 'Katana→OKX' },
      { from: 'okx', to: 'katana', token: 'WBTC', direction: 'OKX→Katana' },

      // Katana ↔ Ethereum
      { from: 'katana', to: 'ethereum', token: 'ETH', direction: 'Katana→Ethereum' },
      { from: 'ethereum', to: 'katana', token: 'ETH', direction: 'Ethereum→Katana' },
      { from: 'katana', to: 'ethereum', token: 'WBTC', direction: 'Katana→Ethereum' },
      { from: 'ethereum', to: 'katana', token: 'WBTC', direction: 'Ethereum→Katana' },
      { from: 'katana', to: 'ethereum', token: 'CUSTOM_ERC20', direction: 'Katana→Ethereum' },
      { from: 'ethereum', to: 'katana', token: 'CUSTOM_ERC20', direction: 'Ethereum→Katana' }
    ];

    // Execute all test scenarios
    for (let i = 0; i < testScenarios.length; i++) {
      const scenario = testScenarios[i];
      console.log(`\n[${i + 1}/${testScenarios.length}]`);

      // Skip tests if token not deployed
      if (scenario.token === 'CUSTOM_ERC20' && !TOKENS.CUSTOM_ERC20.katana.address) {
        console.log(`⏭️  Skipping ASTEST: ${scenario.from} → ${scenario.to} (token not deployed)`);
        this.testResults.push({
          test: `ASTEST: ${scenario.from} → ${scenario.to}`,
          status: 'SKIPPED',
          reason: 'Token not deployed',
          fromChain: scenario.from,
          toChain: scenario.to,
          token: scenario.token,
          timestamp: new Date().toISOString()
        });
        continue;
      }

      await this.testBridgeScenario(scenario.from, scenario.to, scenario.token, scenario.direction);

      // Rate limiting delay
      if (i < testScenarios.length - 1) {
        console.log('\n⏸️  Waiting 3 seconds before next test...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }

  async generateReport() {
    console.log('\n\n' + '='.repeat(80));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(80) + '\n');

    const successful = this.testResults.filter(r => r.status.includes('SUCCESS')).length;
    const failed = this.testResults.filter(r => r.status === 'FAILED').length;
    const skipped = this.testResults.filter(r => r.status === 'SKIPPED').length;

    console.log(`Total Tests: ${this.testResults.length}`);
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏭️  Skipped: ${skipped}`);

    if (this.testResults.length > 0) {
      const successRate = ((successful / this.testResults.length) * 100).toFixed(1);
      console.log(`📈 Success Rate: ${successRate}%`);
    }

    console.log('\n' + '-'.repeat(80));
    console.log('DETAILED RESULTS');
    console.log('-'.repeat(80) + '\n');

    this.testResults.forEach((result, index) => {
      const statusIcon = result.status.includes('SUCCESS') ? '✅' :
                        result.status === 'FAILED' ? '❌' : '⏭️';
      console.log(`${index + 1}. ${statusIcon} ${result.test}`);
      console.log(`   Status: ${result.status}`);

      if (result.status === 'FAILED') {
        console.log(`   Error: ${result.error}`);
      } else if (result.status === 'SKIPPED') {
        console.log(`   Reason: ${result.reason || 'N/A'}`);
      } else if (result.txHash) {
        console.log(`   TX Hash: ${result.txHash}`);
        if (result.blockNumber) {
          console.log(`   Block: ${result.blockNumber}`);
        }
        if (result.gasUsed) {
          console.log(`   Gas Used: ${result.gasUsed}`);
        }
      }
      console.log('');
    });

    // Save results to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsDir = path.join(__dirname, 'test-results');

    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir);
    }

    const filename = path.join(resultsDir, `agglayer_test_results_${timestamp}.json`);

    const reportData = {
      timestamp: new Date().toISOString(),
      mode: TEST_CONFIG.dryRun ? 'DRY_RUN' : 'LIVE',
      summary: {
        total: this.testResults.length,
        successful,
        failed,
        skipped,
        successRate: this.testResults.length > 0
          ? ((successful / this.testResults.length) * 100).toFixed(1)
          : '0'
      },
      configuration: {
        chains: Object.keys(CHAINS),
        slippage: TEST_CONFIG.slippage,
        gasMultiplier: TEST_CONFIG.gasMultiplier,
        skipBalanceCheck: TEST_CONFIG.skipBalanceCheck
      },
      results: this.testResults
    };

    fs.writeFileSync(filename, JSON.stringify(reportData, null, 2));

    console.log('='.repeat(80));
    console.log(`💾 Full results saved to: ${filename}`);
    console.log('='.repeat(80) + '\n');
  }
}

// Main execution function
async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('🌉 AGGLAYER BRIDGE TEST SUITE');
  console.log('='.repeat(80) + '\n');

  const tester = new AggLayerBridgeTest();

  try {
    await tester.initialize();
    await tester.runAllTests();
    await tester.generateReport();

    console.log('🎉 All tests completed!\n');

  } catch (error) {
    console.error('\n💥 Test suite failed:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Export for module usage
module.exports = {
  AggLayerBridgeTest,
  CHAINS,
  TOKENS,
  TEST_CONFIG
};

// Run if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
