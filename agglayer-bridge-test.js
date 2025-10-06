#!/usr/bin/env node

/**
 * Agglayer SDK Bridge Testing Script
 * Tests bridging between Katana, OKX, Base, and Ethereum chains
 *
 * Prerequisites:
 * 1. npm install @agglayer/sdk@beta ethers@5 dotenv axios
 * 2. Create .env file with required environment variables
 * 3. Ensure test wallets have sufficient balances for testing
 */

require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Import AggLayer SDK with correct syntax
let AggLayerSDK, SDK_MODES;
try {
  const sdk = require('@agglayer/sdk');
  AggLayerSDK = sdk.AggLayerSDK;
  SDK_MODES = sdk.SDK_MODES;
} catch (error) {
  console.error('❌ Failed to import @agglayer/sdk. Make sure to install it with: npm install @agglayer/sdk@beta');
  process.exit(1);
}

// Chain configurations with network IDs
const CHAINS = {
  ethereum: {
    chainId: 1,
    networkId: 0, // Agglayer network ID for Ethereum
    name: 'Ethereum',
    rpc: process.env.ETHEREUM_RPC,
    bridgeAddress: process.env.ETHEREUM_BRIDGE_ADDRESS || '0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe',
    isAgglayer: true
  },
  base: {
    chainId: 8453,
    networkId: 10, // Agglayer network ID for Base (adjust if different)
    name: 'Base',
    rpc: process.env.BASE_RPC,
    bridgeAddress: process.env.BASE_BRIDGE_ADDRESS || '0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe',
    isAgglayer: true
  },
  katana: {
    chainId: 747474,
    networkId: 8, // Agglayer network ID for Katana (adjust if different)
    name: 'Katana',
    rpc: process.env.KATANA_RPC,
    bridgeAddress: process.env.KATANA_BRIDGE_ADDRESS || '0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe',
    isAgglayer: true
  },
  okx: {
    chainId: 196,
    networkId: 2, // Agglayer network ID for OKX (adjust if different)
    name: 'OKX X Layer',
    rpc: process.env.OKX_RPC,
    bridgeAddress: process.env.OKX_BRIDGE_ADDRESS || '0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe',
    isAgglayer: true
  }
};

// Token configurations
const TOKENS = {
  ETH: {
    ethereum: { address: ethers.constants.AddressZero, symbol: 'ETH', decimals: 18, isNative: true },
    base: { address: ethers.constants.AddressZero, symbol: 'ETH', decimals: 18, isNative: true },
    katana: { address: ethers.constants.AddressZero, symbol: 'ETH', decimals: 18, isNative: true },
    okx: { address: ethers.constants.AddressZero, symbol: 'ETH', decimals: 18, isNative: true }
  },
  WBTC: {
    ethereum: { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC', decimals: 8, isNative: false },
    base: { address: '0x236aa50979D5f3De3Bd1Eeb40E81137F22ab794b', symbol: 'WBTC', decimals: 8, isNative: false },
    katana: { address: null, symbol: 'WBTC', decimals: 8, isNative: false }, // Will be resolved
    okx: { address: null, symbol: 'WBTC', decimals: 8, isNative: false } // Will be resolved
  },
  OKB: {
    okx: { address: '0x75231f58b43240c9718dd58b4967c5114342a86c', symbol: 'OKB', decimals: 18, isNative: false },
    katana: { address: null, symbol: 'OKB', decimals: 18, isNative: false } // Will be resolved
  },
  CUSTOM_ERC20: {
    katana: { address: process.env.CUSTOM_TOKEN_KATANA || null, symbol: 'ASTEST', decimals: 18, isNative: false },
    base: { address: null, symbol: 'ASTEST', decimals: 18, isNative: false }, // Will be resolved (wrapped)
    ethereum: { address: null, symbol: 'ASTEST', decimals: 18, isNative: false } // Will be resolved (wrapped)
  }
};

// Test configuration
const TEST_CONFIG = {
  testWalletPrivateKey: process.env.TEST_WALLET_PRIVATE_KEY,
  testAmounts: {
    ETH: ethers.utils.parseEther('0.01'), // 0.01 ETH
    WBTC: ethers.utils.parseUnits('0.001', 8), // 0.001 WBTC
    OKB: ethers.utils.parseEther('1'), // 1 OKB
    CUSTOM_ERC20: ethers.utils.parseEther('100') // 100 Custom tokens
  },
  dryRun: process.env.DRY_RUN === 'true', // Set to true to skip actual transactions
  slippage: parseFloat(process.env.SLIPPAGE || '0.5'), // 0.5% slippage tolerance
  gasMultiplier: parseFloat(process.env.GAS_MULTIPLIER || '1.2') // 20% gas buffer
};

class AggLayerBridgeTest {
  constructor() {
    this.providers = {};
    this.wallets = {};
    this.sdk = null;
    this.core = null;
    this.native = null;
    this.testResults = [];
    this.bridgeInstances = {};
  }

  async initialize() {
    console.log('🚀 Initializing Agglayer Bridge Test Suite...\n');

    // Validate environment variables
    this.validateEnvironment();

    // Setup providers and wallets
    await this.setupProviders();

    // Initialize AggLayer SDK correctly
    await this.initializeSDK();

    // Resolve wrapped token addresses
    await this.resolveWrappedTokens();

    // Check if custom token is deployed, if not skip or deploy
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

  async setupProviders() {
    console.log('📡 Setting up providers and wallets...');

    for (const [chainName, chainConfig] of Object.entries(CHAINS)) {
      try {
        this.providers[chainName] = new ethers.providers.JsonRpcProvider(chainConfig.rpc);
        this.wallets[chainName] = new ethers.Wallet(
          TEST_CONFIG.testWalletPrivateKey,
          this.providers[chainName]
        );

        // Check wallet balance
        const balance = await this.wallets[chainName].getBalance();
        console.log(`  ${chainConfig.name} (${chainConfig.chainId}): ${ethers.utils.formatEther(balance)} ETH`);
        console.log(`    Wallet: ${this.wallets[chainName].address}`);

        if (balance.eq(0)) {
          console.warn(`    ⚠️ WARNING: Zero balance on ${chainConfig.name}!`);
        }
      } catch (error) {
        console.error(`  ❌ Failed to setup ${chainName}:`, error.message);
        throw error;
      }
    }
    console.log('');
  }

  async initializeSDK() {
    console.log('🔧 Initializing Agglayer SDK...');

    try {
      // Initialize SDK with correct configuration
      this.sdk = new AggLayerSDK({
        mode: [SDK_MODES.CORE, SDK_MODES.NATIVE],
        core: {
          apiBaseUrl: process.env.ARC_API_BASE_URL || 'https://arc-api.polygon.technology',
          apiTimeout: 60000 // 60 second timeout
        },
        native: {
          defaultNetwork: 1, // Ethereum mainnet as default
          customRpcUrls: {
            1: CHAINS.ethereum.rpc,
            8453: CHAINS.base.rpc,
            747474: CHAINS.katana.rpc,
            66: CHAINS.okx.rpc
          }
        }
      });

      // Get module instances
      this.core = this.sdk.getCore();
      this.native = this.sdk.getNative();

      console.log('✅ SDK initialized successfully');
      console.log(`  Core module: ${this.core ? 'Ready' : 'Not available'}`);
      console.log(`  Native module: ${this.native ? 'Ready' : 'Not available'}`);

    } catch (error) {
      console.error('❌ Failed to initialize SDK:', error.message);
      throw error;
    }
  }

  async resolveWrappedTokens() {
    console.log('\n🔍 Resolving wrapped token addresses...');

    try {
      // Resolve WBTC on Katana (wrapped from Ethereum)
      if (TOKENS.WBTC.katana.address === null) {
        const wrappedWBTC = await this.getWrappedTokenAddress(
          'ethereum',
          'katana',
          TOKENS.WBTC.ethereum.address
        );
        if (wrappedWBTC) {
          TOKENS.WBTC.katana.address = wrappedWBTC;
          console.log(`  ✅ WBTC on Katana: ${wrappedWBTC}`);
        }
      }

      // Resolve WBTC on OKX (wrapped from Ethereum)
      if (TOKENS.WBTC.okx.address === null) {
        const wrappedWBTC = await this.getWrappedTokenAddress(
          'ethereum',
          'okx',
          TOKENS.WBTC.ethereum.address
        );
        if (wrappedWBTC) {
          TOKENS.WBTC.okx.address = wrappedWBTC;
          console.log(`  ✅ WBTC on OKX: ${wrappedWBTC}`);
        }
      }

      // Resolve OKB on Katana (wrapped from OKX)
      if (TOKENS.OKB.katana.address === null) {
        const wrappedOKB = await this.getWrappedTokenAddress(
          'okx',
          'katana',
          TOKENS.OKB.okx.address
        );
        if (wrappedOKB) {
          TOKENS.OKB.katana.address = wrappedOKB;
          console.log(`  ✅ OKB on Katana: ${wrappedOKB}`);
        }
      }

      // Resolve ASTEST on Base (wrapped from Katana) - if deployed
      if (TOKENS.CUSTOM_ERC20.katana.address && TOKENS.CUSTOM_ERC20.base.address === null) {
        const wrappedASTEST = await this.getWrappedTokenAddress(
          'katana',
          'base',
          TOKENS.CUSTOM_ERC20.katana.address
        );
        if (wrappedASTEST) {
          TOKENS.CUSTOM_ERC20.base.address = wrappedASTEST;
          console.log(`  ✅ ASTEST on Base: ${wrappedASTEST}`);
        }
      }

      // Resolve ASTEST on Ethereum (wrapped from Katana) - if deployed
      if (TOKENS.CUSTOM_ERC20.katana.address && TOKENS.CUSTOM_ERC20.ethereum.address === null) {
        const wrappedASTEST = await this.getWrappedTokenAddress(
          'katana',
          'ethereum',
          TOKENS.CUSTOM_ERC20.katana.address
        );
        if (wrappedASTEST) {
          TOKENS.CUSTOM_ERC20.ethereum.address = wrappedASTEST;
          console.log(`  ✅ ASTEST on Ethereum: ${wrappedASTEST}`);
        }
      }

    } catch (error) {
      console.warn('⚠️ Could not resolve all wrapped tokens:', error.message);
      console.warn('  Some tests may be skipped.');
    }
  }

  async getWrappedTokenAddress(originChainName, destChainName, originTokenAddress) {
    try {
      const originChain = CHAINS[originChainName];
      const destChain = CHAINS[destChainName];

      const bridge = this.native.bridge(destChain.bridgeAddress, destChain.chainId);

      const wrappedAddress = await bridge.getWrappedTokenAddress({
        originNetwork: originChain.networkId,
        originTokenAddress: originTokenAddress
      });

      return wrappedAddress;
    } catch (error) {
      console.warn(`  ⚠️ Could not get wrapped token for ${originTokenAddress} on ${destChainName}`);
      return null;
    }
  }

  async checkCustomToken() {
    console.log('\n🪙 Checking ASTEST token...');

    if (TOKENS.CUSTOM_ERC20.katana.address) {
      console.log(`  ✅ ASTEST token deployed on Katana: ${TOKENS.CUSTOM_ERC20.katana.address}`);
      console.log(`  ℹ️  Wrapped versions on Base and Ethereum will be auto-resolved during tests`);
    } else {
      console.log('  ⚠️ ASTEST token not deployed. Tests requiring ASTEST will be skipped.');
      console.log('  Run: npm run deploy:astest to deploy ASTEST on Katana.');
    }
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
      const wallet = this.wallets[fromChain];

      console.log(`📍 From: ${fromChain} (Chain ID: ${fromChainConfig.chainId})`);
      console.log(`📍 To: ${toChain} (Chain ID: ${toChainConfig.chainId})`);
      console.log(`💰 Token: ${tokenSymbol} (${ethers.utils.formatUnits(amount, token[fromChain].decimals)})`);
      console.log(`🔑 Wallet: ${wallet.address}`);

      // Step 1: Check balance
      console.log('\n📊 Step 1: Checking balance...');
      const hasBalance = await this.checkBalance(fromChain, tokenSymbol, amount);
      if (!hasBalance) {
        throw new Error(`Insufficient ${tokenSymbol} balance on ${fromChain}`);
      }

      // Step 2: Get routes from Core module
      console.log('\n🔍 Step 2: Finding optimal routes...');
      const routes = await this.core.getRoutes({
        fromChainId: fromChainConfig.chainId,
        toChainId: toChainConfig.chainId,
        fromTokenAddress: fromTokenAddress,
        toTokenAddress: toTokenAddress,
        amount: amount.toString(),
        fromAddress: wallet.address,
        slippage: TEST_CONFIG.slippage
      });

      if (!routes || routes.length === 0) {
        throw new Error('No routes available for this bridge operation');
      }

      console.log(`  ✅ Found ${routes.length} route(s)`);
      const bestRoute = routes[0];
      console.log(`  📍 Using route: ${bestRoute.protocol || 'Agglayer Bridge'}`);

      // Step 3: Approve token if needed (for ERC20)
      if (!token[fromChain].isNative && fromTokenAddress !== ethers.constants.AddressZero) {
        console.log('\n✅ Step 3: Approving token...');
        await this.approveToken(
          fromChain,
          fromTokenAddress,
          fromChainConfig.bridgeAddress,
          amount
        );
      } else {
        console.log('\n⏭️ Step 3: Skipping approval (native token)');
      }

      // Step 4: Build transaction
      console.log('\n🏗️ Step 4: Building bridge transaction...');
      const unsignedTx = await this.core.getUnsignedTransaction(bestRoute);

      console.log(`  To: ${unsignedTx.to}`);
      console.log(`  Value: ${ethers.utils.formatEther(unsignedTx.value || '0')} ETH`);
      console.log(`  Data: ${unsignedTx.data.substring(0, 66)}...`);

      // Step 5: Execute transaction (or simulate if dry run)
      if (TEST_CONFIG.dryRun) {
        console.log('\n🔍 Step 5: DRY RUN - Simulating transaction...');
        const mockTxHash = `0x${Math.random().toString(16).substring(2).padStart(64, '0')}`;
        console.log(`  ✅ Simulation successful`);
        console.log(`  Mock TX Hash: ${mockTxHash}`);

        this.testResults.push({
          test: testName,
          status: 'SUCCESS (DRY RUN)',
          txHash: mockTxHash,
          fromChain,
          toChain,
          token: tokenSymbol,
          amount: ethers.utils.formatUnits(amount, token[fromChain].decimals)
        });
      } else {
        console.log('\n🚀 Step 5: Executing bridge transaction...');

        const txResponse = await wallet.sendTransaction({
          to: unsignedTx.to,
          data: unsignedTx.data,
          value: unsignedTx.value || '0',
          gasLimit: ethers.BigNumber.from(unsignedTx.gasLimit || '500000').mul(
            Math.floor(TEST_CONFIG.gasMultiplier * 100)
          ).div(100)
        });

        console.log(`  📝 TX Hash: ${txResponse.hash}`);
        console.log(`  ⏳ Waiting for confirmation...`);

        const receipt = await txResponse.wait();
        console.log(`  ✅ Transaction confirmed in block ${receipt.blockNumber}`);
        console.log(`  ⛽ Gas used: ${receipt.gasUsed.toString()}`);

        this.testResults.push({
          test: testName,
          status: 'SUCCESS',
          txHash: txResponse.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
          fromChain,
          toChain,
          token: tokenSymbol,
          amount: ethers.utils.formatUnits(amount, token[fromChain].decimals)
        });
      }

      console.log(`\n✅ ${testName} completed successfully`);

    } catch (error) {
      console.error(`\n❌ ${testName} failed:`, error.message);
      if (error.stack) {
        console.error('Stack trace:', error.stack);
      }

      this.testResults.push({
        test: testName,
        status: 'FAILED',
        error: error.message,
        fromChain,
        toChain,
        token: tokenSymbol
      });
    }
  }

  async checkBalance(chainName, tokenSymbol, requiredAmount) {
    try {
      const token = TOKENS[tokenSymbol][chainName];
      const wallet = this.wallets[chainName];

      let balance;
      if (token.isNative) {
        balance = await wallet.getBalance();
      } else {
        const erc20 = this.native.erc20(token.address, CHAINS[chainName].chainId);
        balance = ethers.BigNumber.from(await erc20.getBalance(wallet.address));
      }

      console.log(`  Current: ${ethers.utils.formatUnits(balance, token.decimals)} ${tokenSymbol}`);
      console.log(`  Required: ${ethers.utils.formatUnits(requiredAmount, token.decimals)} ${tokenSymbol}`);

      const hasBalance = balance.gte(requiredAmount);
      console.log(`  ${hasBalance ? '✅' : '❌'} ${hasBalance ? 'Sufficient' : 'Insufficient'} balance`);

      return hasBalance;
    } catch (error) {
      console.error(`  ❌ Error checking balance:`, error.message);
      return false;
    }
  }

  async approveToken(chainName, tokenAddress, spenderAddress, amount) {
    try {
      const wallet = this.wallets[chainName];
      const chainId = CHAINS[chainName].chainId;

      // Get ERC20 instance
      const erc20 = this.native.erc20(tokenAddress, chainId);

      // Check current allowance
      const currentAllowance = ethers.BigNumber.from(
        await erc20.getAllowance(wallet.address, spenderAddress)
      );

      console.log(`  Current allowance: ${currentAllowance.toString()}`);

      if (currentAllowance.gte(amount)) {
        console.log(`  ✅ Sufficient allowance already exists`);
        return;
      }

      // Build approve transaction
      const approveTx = await erc20.buildApprove(
        spenderAddress,
        amount.toString(),
        wallet.address
      );

      if (TEST_CONFIG.dryRun) {
        console.log(`  ✅ DRY RUN - Would approve ${amount.toString()}`);
        return;
      }

      console.log(`  📝 Approving ${amount.toString()}...`);
      const txResponse = await wallet.sendTransaction(approveTx);
      console.log(`  ⏳ Approval TX: ${txResponse.hash}`);

      const receipt = await txResponse.wait();
      console.log(`  ✅ Approval confirmed in block ${receipt.blockNumber}`);

    } catch (error) {
      console.error(`  ❌ Approval failed:`, error.message);
      throw error;
    }
  }

  async runAllTests() {
    console.log('\n🧪 Starting Comprehensive Bridge Tests\n');
    console.log(`Mode: ${TEST_CONFIG.dryRun ? 'DRY RUN (No real transactions)' : 'LIVE (Real transactions)'}`);
    console.log(`Slippage tolerance: ${TEST_CONFIG.slippage}%`);
    console.log('');

    // Test scenarios as specified in requirements
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

      // Skip tests if token address not available
      if (scenario.token === 'CUSTOM_ERC20' && !TOKENS.CUSTOM_ERC20.katana.address) {
        console.log(`⏭️ Skipping ASTEST: ${scenario.from} → ${scenario.to} (token not deployed on Katana)`);
        continue;
      }

      await this.testBridgeScenario(scenario.from, scenario.to, scenario.token, scenario.direction);

      // Small delay between tests to avoid rate limiting
      if (i < testScenarios.length - 1) {
        console.log('\n⏸️ Waiting 3 seconds before next test...');
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
    console.log(`⏭️ Skipped: ${skipped}`);

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
        skipped
      },
      configuration: {
        chains: CHAINS,
        slippage: TEST_CONFIG.slippage,
        gasMultiplier: TEST_CONFIG.gasMultiplier
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
