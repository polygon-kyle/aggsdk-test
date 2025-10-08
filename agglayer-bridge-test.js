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
    rpc: process.env.ETHEREUM_RPC,
    bridgeAddress: process.env.ETHEREUM_BRIDGE_ADDRESS || '0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe'
  },
  base: {
    chainId: 8453,
    networkId: 10,
    name: 'Base',
    rpc: process.env.BASE_RPC,
    bridgeAddress: null // Base uses LiFi routes via Core API
  },
  katana: {
    chainId: 747474,
    networkId: 20,
    name: 'Katana',
    rpc: process.env.KATANA_RPC,
    bridgeAddress: process.env.KATANA_BRIDGE_ADDRESS || '0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe'
  },
  okx: {
    chainId: 196,
    networkId: 3, // Corrected via SDK validation (was 2)
    name: 'OKX X Layer',
    rpc: process.env.OKX_RPC,
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
    katana: { address: '0x0913DA6Da4b42f538B445599b46Bb4622342Cf52', symbol: 'WBTC', decimals: 8, isNative: false },
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
    ethereum: { address: null, symbol: 'ASTEST', decimals: 18, isNative: false } // Resolved via SDK token mappings
  }
};

// Test configuration
const TEST_CONFIG = {
  testWalletPrivateKey: process.env.TEST_WALLET_PRIVATE_KEY,
  testAmounts: {
    ETH: process.env.TEST_ETH_AMOUNT
      ? ethers.utils.parseEther(process.env.TEST_ETH_AMOUNT)
      : ethers.utils.parseEther('0.001'),
    WBTC: process.env.TEST_WBTC_AMOUNT
      ? ethers.utils.parseUnits(process.env.TEST_WBTC_AMOUNT, 8)
      : ethers.utils.parseUnits('0.0001', 8),
    OKB: process.env.TEST_OKB_AMOUNT
      ? ethers.utils.parseEther(process.env.TEST_OKB_AMOUNT)
      : ethers.utils.parseEther('0.01'),
    CUSTOM_ERC20: process.env.TEST_CUSTOM_AMOUNT
      ? ethers.utils.parseEther(process.env.TEST_CUSTOM_AMOUNT)
      : ethers.utils.parseEther('1')
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
    this.pendingClaims = []; // Track bridges that need claiming
  }

  async initialize() {
    console.log('🚀 Initializing Agglayer Bridge Test Suite...\n');

    this.validateEnvironment();
    await this.setupWallet();
    await this.initializeSDK();
    await this.checkCustomToken();
    await this.resolveWrappedTokenAddresses();

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
        proofApiUrl: 'https://api-gateway.polygon.technology/api/v3/proof/mainnet/', // Required for claiming
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
    } else {
      console.log('  ⚠️  ASTEST token not deployed. Tests requiring ASTEST will be skipped.');
      console.log('  Run: npm run deploy:astest to deploy ASTEST on Katana.');
    }
    console.log('');
  }

  async validateChainConfiguration() {
    console.log('✅ Validating chain configuration with SDK...\n');

    try {
      // Fetch all chains from SDK
      const response = await this.core.getAllChains();

      if (!response || !response.chains || response.chains.length === 0) {
        console.log('  ⚠️  No chains returned from SDK, skipping validation\n');
        return;
      }

      // Build lookup map of SDK chains by chainId
      const sdkChainMap = new Map();
      response.chains.forEach(chain => {
        sdkChainMap.set(chain.chainId, chain);
      });

      // Validate each of our configured chains
      for (const [chainName, config] of Object.entries(CHAINS)) {
        const sdkChain = sdkChainMap.get(config.chainId);

        if (!sdkChain) {
          console.log(`  ⚠️  ${chainName}: chainId ${config.chainId} not found in SDK registry`);
          continue;
        }

        // Check if networkId matches
        if (sdkChain.networkId !== config.networkId) {
          console.log(`  ⚠️  ${chainName}: networkId mismatch! Ours: ${config.networkId}, SDK: ${sdkChain.networkId}`);
        } else {
          console.log(`  ✅ ${chainName}: Configuration validated (chainId: ${config.chainId}, networkId: ${config.networkId})`);
        }
      }

      console.log('');
    } catch (error) {
      console.log(`  ⚠️  Could not validate chains: ${error.message}`);
      console.log(`  Continuing with local configuration...\n`);
    }
  }

  async resolveWrappedTokenAddresses() {
    console.log('🔍 Discovering wrapped token addresses from ARC API...\n');

    try {
      // Resolve wrapped versions of ASTEST if it exists on Katana
      if (TOKENS.CUSTOM_ERC20.katana.address) {
        console.log(`  Looking up wrapped versions of ASTEST...`);
        const mappings = await this.core.getTokenMappings({
          tokenAddress: TOKENS.CUSTOM_ERC20.katana.address
        });

        if (mappings && mappings.length > 0) {
          for (const mapping of mappings) {
            // Find which chain this wrappedTokenNetwork belongs to
            const chainEntry = Object.entries(CHAINS).find(
              ([_, config]) => config.networkId === mapping.wrappedTokenNetwork
            );

            if (chainEntry) {
              const [chainName] = chainEntry;
              // Update our TOKENS config with discovered address
              TOKENS.CUSTOM_ERC20[chainName].address = mapping.wrappedTokenAddress;
              console.log(`  ✅ Found wrapped ASTEST on ${chainName}: ${mapping.wrappedTokenAddress}`);
            }
          }
        } else {
          console.log(`  ℹ️  No wrapped versions found yet (bridge TO other chains first)`);
        }
      }

      // Could add more tokens here (WBTC, etc.) if needed
      console.log('');
    } catch (error) {
      console.log(`  ⚠️  Could not fetch token mappings: ${error.message}`);
      console.log(`  Continuing with hardcoded addresses...\n`);
    }
  }

  // Helper to get provider for a specific chain using SDK
  getProviderForChain(chainId) {
    const network = this.native.getNetwork(chainId);
    return new ethers.providers.JsonRpcProvider(network.rpcUrl);
  }

  async testBridgeScenario(fromChain, toChain, tokenSymbol, direction) {
    const token = TOKENS[tokenSymbol];

    // Get actual token symbols on each chain (e.g., ETH on most chains, but WETH on OKX)
    const fromTokenSymbol = token[fromChain].symbol;
    const toTokenSymbol = token[toChain].symbol;

    // Create test name showing actual tokens being used
    const testName = fromTokenSymbol === toTokenSymbol
      ? `${fromTokenSymbol}: ${fromChain} → ${toChain}`
      : `${fromTokenSymbol}→${toTokenSymbol}: ${fromChain} → ${toChain}`;

    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔄 Test: ${testName}`);
    console.log(`${'='.repeat(80)}`);

    try {
      const fromChainConfig = CHAINS[fromChain];
      const toChainConfig = CHAINS[toChain];
      const amount = TEST_CONFIG.testAmounts[tokenSymbol];

      // Validate token configuration
      if (!token[fromChain] || !token[toChain]) {
        throw new Error(`Token ${tokenSymbol} not configured for ${fromChain} or ${toChain}`);
      }

      // Validate source chain has token address (must exist to bridge FROM)
      if (!token[fromChain].isNative && token[fromChain].address === null) {
        throw new Error(`Token ${tokenSymbol} address not resolved on ${fromChain}`);
      }

      const fromTokenAddress = token[fromChain].address;
      if (!fromTokenAddress) {
        throw new Error(`Token ${tokenSymbol} address is missing on ${fromChain}`);
      }

      // For native tokens use AddressZero, for ERC20 use actual address
      // Note: Native Bridge can create wrapped tokens during execution,
      // but we cannot predict the wrapped token address ahead of time
      const toTokenAddress = token[toChain].isNative
        ? ethers.constants.AddressZero
        : (token[toChain].address || ethers.constants.AddressZero);

      console.log(`📍 From: ${fromChain} (Chain ID: ${fromChainConfig.chainId}) - ${fromTokenSymbol}`);
      console.log(`📍 To: ${toChain} (Chain ID: ${toChainConfig.chainId}) - ${toTokenSymbol}`);
      console.log(`💰 Amount: ${ethers.utils.formatUnits(amount, token[fromChain].decimals)}`);
      console.log(`🔑 Wallet: ${this.wallet.address}`);

      // // Step 1: Check balance using SDK
      // console.log('\n📊 Step 1: Checking balance...');
      // if (!TEST_CONFIG.skipBalanceCheck) {
      //   const hasBalance = await this.checkBalance(fromChain, tokenSymbol, amount);
      //   if (!hasBalance) {
      //     throw new Error(`Insufficient ${tokenSymbol} balance on ${fromChain}`);
      //   }
      // } else {
      //   console.log('  ⚠️  Balance check skipped (SKIP_BALANCE_CHECK=true)');
      // }

      // Step 2: Get routes - try Core API first, fallback to Native bridge
      console.log('\n🔍 Step 2: Finding bridge route...');
      console.log(`  Bridge: ${fromTokenSymbol} (${fromTokenAddress}) → ${toTokenSymbol} (${toTokenAddress})`);

      let unsignedTx;
      let bridgeMethod = null;

/// ~~~~~~ start of SDK testing ~~~~~~ 


      try {
        // Try Core API first (supports third-party bridges like LiFi)
        const routeRequest = {
          fromChainId: fromChainConfig.chainId,
          toChainId: toChainConfig.chainId,
          fromTokenAddress: fromTokenAddress,
          toTokenAddress: toTokenAddress,
          amount: amount.toString(),
          fromAddress: this.wallet.address,
          slippage: TEST_CONFIG.slippage
        };

        if (fromTokenSymbol !== toTokenSymbol && process.env.DEBUG) {
          console.log(`  🔍 Bridge route request:`, JSON.stringify({
            ...routeRequest,
            fromToken: fromTokenSymbol,
            toToken: toTokenSymbol,
            note: 'Token conversion/wrapping required'
          }, null, 2));
        }

        const routes = await this.core.getRoutes(routeRequest);

        if (!routes || routes.length === 0) {
          throw new Error('No routes available from Core API');
        }

        bridgeMethod = 'Core API';
        console.log(`  ✅ Found ${routes.length} route(s) via Core API`);
        const bestRoute = routes[0];

        // Validate route structure
        if (!bestRoute.steps || bestRoute.steps.length === 0) {
          if (!bestRoute.transactionRequest) {
            throw new Error('Route missing both steps and transactionRequest - invalid route structure');
          }
        }

        // Debug logging for route inspection
        if (process.env.DEBUG) {
          console.log(`  🔍 Route structure:`, JSON.stringify({
            hasSteps: !!bestRoute.steps && bestRoute.steps.length > 0,
            stepsCount: bestRoute.steps?.length || 0,
            hasTransactionRequest: !!bestRoute.transactionRequest,
            provider: bestRoute.provider,
            isQuote: bestRoute.isQuote
          }, null, 2));
        }

        console.log(`  📍 Provider: ${bestRoute.provider?.join(', ') || 'Unknown'}`);
        console.log(`  📍 Route type: ${bestRoute.isQuote ? 'Quote (executable)' : 'Route (requires build)'}`);

        // Step 3: Determine approval address from route
        let approvalAddress = null;
        if (bestRoute.steps && bestRoute.steps.length > 0) {
          // Get approval address from first step's estimate
          approvalAddress = bestRoute.steps[0].estimate?.approvalAddress;
        }

        // Validate approval address is a valid Ethereum address
        if (approvalAddress && !approvalAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
          console.log(`  ⚠️  Invalid approval address from route: ${approvalAddress}`);
          approvalAddress = null;
        }

        // Fallback to bridge address if no approval address in route
        if (!approvalAddress && fromChainConfig.bridgeAddress) {
          approvalAddress = fromChainConfig.bridgeAddress;
        }

        // Approve token if needed
        if (!token[fromChain].isNative && fromTokenAddress !== ethers.constants.AddressZero) {
          if (!approvalAddress) {
            throw new Error(`No approval address found for token approval. Route missing approvalAddress and chain has no bridge address.`);
          } else {
            console.log('\n✅ Step 3: Approving token...');
            console.log(`  Spender: ${approvalAddress}`);
            await this.approveToken(fromChain, fromTokenAddress, approvalAddress, amount);
          }
        } else {
          console.log('\n⏭️  Step 3: Skipping approval (native token)');
        }

        // Step 4: Build transaction
        console.log('\n🏗️  Step 4: Building bridge transaction via Core API...');
        unsignedTx = await this.core.getUnsignedTransaction(bestRoute);

      } catch (error) {
        // Fallback to Native bridge
        console.log(`  ⚠️  Core API failed: ${error.message}`);
        if (process.env.DEBUG) {
          console.log('  🔍 Error details:', error);
        }
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

      // WORKAROUND: SDK returns "gas" but ethers v5 expects "gasLimit"
      if (unsignedTx.gas && !unsignedTx.gasLimit) {
        unsignedTx.gasLimit = unsignedTx.gas;
        delete unsignedTx.gas;
      }

      // WORKAROUND: SDK returns numeric string nonce, ethers v5 expects hex
      if (unsignedTx.nonce && typeof unsignedTx.nonce === 'string' && !unsignedTx.nonce.startsWith('0x')) {
        unsignedTx.nonce = ethers.utils.hexValue(parseInt(unsignedTx.nonce));
      }

      // WORKAROUND: Normalize all transaction fields to proper types for ethers v5
      const normalizedTx = {
        ...unsignedTx,
        to: unsignedTx.to,
        data: unsignedTx.data,
        value: unsignedTx.value ? ethers.BigNumber.from(unsignedTx.value).toHexString() : '0x0',
        gasLimit: unsignedTx.gasLimit ? ethers.BigNumber.from(unsignedTx.gasLimit).toHexString() : undefined,
        gasPrice: unsignedTx.gasPrice ? ethers.BigNumber.from(unsignedTx.gasPrice).toHexString() : undefined,
        nonce: unsignedTx.nonce,
        chainId: unsignedTx.chainId ? parseInt(unsignedTx.chainId) : fromChainConfig.chainId
      };

      // Remove undefined fields
      Object.keys(normalizedTx).forEach(key => {
        if (normalizedTx[key] === undefined) {
          delete normalizedTx[key];
        }
      });

      unsignedTx = normalizedTx;

      console.log(`  To: ${unsignedTx.to}`);
      console.log(`  Value: ${ethers.utils.formatEther(unsignedTx.value || '0')} ETH`);
      console.log(`  Data: ${unsignedTx.data.substring(0, 66)}...`);

      // Step 5: Execute transaction
      const result = await this.executeTransaction(unsignedTx, fromChain);

      // Track for claiming - fetch depositCount from SDK for all successful bridges
      if (!result.mock) {
        console.log(`  🔍 Fetching depositCount from SDK...`);

        try {
          // Query recent transactions to find this one
          const txResponse = await this.core.getTransactions({
            address: this.wallet.address,
            limit: 20
          });

          // Find our transaction
          const ourTx = txResponse.transactions.find(tx =>
            tx.transactionHash.toLowerCase() === result.hash.toLowerCase()
          );

          if (ourTx && ourTx.depositCount !== null) {
            this.pendingClaims.push({
              testName,
              txHash: result.hash,
              depositCount: ourTx.depositCount,
              fromChain,
              fromChainId: fromChainConfig.chainId,
              fromNetworkId: fromChainConfig.networkId,
              toChain,
              toChainId: toChainConfig.chainId,
              toNetworkId: toChainConfig.networkId,
              token: tokenSymbol,
              amount: ethers.utils.formatUnits(amount, token[fromChain].decimals),
              timestamp: new Date().toISOString()
            });
            console.log(`  📋 Added to pending claims (depositCount: ${ourTx.depositCount})`);
          } else {
            console.log(`  ⚠️  Transaction not yet indexed by API or no depositCount - will retry at claim time`);
            // Still add to pending claims, we'll fetch depositCount later
            this.pendingClaims.push({
              testName,
              txHash: result.hash,
              depositCount: null, // Will be fetched at claim time
              fromChain,
              fromChainId: fromChainConfig.chainId,
              fromNetworkId: fromChainConfig.networkId,
              toChain,
              toChainId: toChainConfig.chainId,
              toNetworkId: toChainConfig.networkId,
              token: tokenSymbol,
              amount: ethers.utils.formatUnits(amount, token[fromChain].decimals),
              timestamp: new Date().toISOString()
            });
          }
        } catch (error) {
          console.log(`  ⚠️  Could not fetch transaction from API: ${error.message}`);
          // Still add to pending claims
          this.pendingClaims.push({
            testName,
            txHash: result.hash,
            depositCount: null,
            fromChain,
            fromChainId: fromChainConfig.chainId,
            fromNetworkId: fromChainConfig.networkId,
            toChain,
            toChainId: toChainConfig.chainId,
            toNetworkId: toChainConfig.networkId,
            token: tokenSymbol,
            amount: ethers.utils.formatUnits(amount, token[fromChain].decimals),
            timestamp: new Date().toISOString()
          });
        }
      }

      this.testResults.push({
        test: testName,
        status: result.mock ? 'SUCCESS (DRY RUN)' : 'SUCCESS',
        method: bridgeMethod,
        txHash: result.hash,
        blockNumber: result.blockNumber,
        gasUsed: result.gasUsed?.toString(),
        fromChain,
        fromToken: fromTokenSymbol,
        toChain,
        toToken: toTokenSymbol,
        tokenConfig: tokenSymbol,
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
        fromToken: fromTokenSymbol,
        toChain,
        toToken: toTokenSymbol,
        tokenConfig: tokenSymbol,
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

      // WORKAROUND: SDK returns "gas" but ethers v5 expects "gasLimit"
      if (approveTx.gas && !approveTx.gasLimit) {
        approveTx.gasLimit = approveTx.gas;
        delete approveTx.gas;
      }

      // WORKAROUND: SDK returns numeric string nonce, ethers v5 expects hex
      if (approveTx.nonce && typeof approveTx.nonce === 'string' && !approveTx.nonce.startsWith('0x')) {
        approveTx.nonce = ethers.utils.hexValue(parseInt(approveTx.nonce));
      }

      // WORKAROUND: Normalize all transaction fields to proper types for ethers v5
      const normalizedApproveTx = {
        ...approveTx,
        to: approveTx.to,
        data: approveTx.data,
        value: approveTx.value ? ethers.BigNumber.from(approveTx.value).toHexString() : '0x0',
        gasLimit: approveTx.gasLimit ? ethers.BigNumber.from(approveTx.gasLimit).toHexString() : undefined,
        gasPrice: approveTx.gasPrice ? ethers.BigNumber.from(approveTx.gasPrice).toHexString() : undefined,
        nonce: approveTx.nonce,
        chainId: approveTx.chainId ? parseInt(approveTx.chainId) : chainId
      };

      // Remove undefined fields
      Object.keys(normalizedApproveTx).forEach(key => {
        if (normalizedApproveTx[key] === undefined) {
          delete normalizedApproveTx[key];
        }
      });

      // Get provider and connect wallet
      const provider = this.getProviderForChain(chainId);
      const connectedWallet = this.wallet.connect(provider);

      console.log(`  📝 Approving ${amount.toString()}...`);
      const txResponse = await connectedWallet.sendTransaction(normalizedApproveTx);
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

  async checkForExistingClaims() {
    console.log('\n🔍 Checking for pending claims via SDK...\n');

    try {
      // Query recent transactions from SDK
      const response = await this.core.getTransactions({
        limit: 100,
        sort: 'desc'
      });

      const transactions = response.transactions || [];
      console.log(`  📊 Found ${transactions.length} recent transactions from SDK\n`);

      if (transactions.length === 0) {
        console.log('  No transactions found.\n');
        return;
      }

      // Filter for BRIDGED status transactions (ready to claim but not yet claimed)
      const potentialClaims = transactions.filter(tx =>
        tx.status === 'BRIDGED' &&
        tx.protocols &&
        tx.protocols.includes('agglayer')
      );

      if (potentialClaims.length === 0) {
        console.log('  ✅ No pending bridge transactions found.\n');
        return;
      }

      console.log(`  📋 Found ${potentialClaims.length} BRIDGED transaction(s) to check:\n`);

      // Build list of claims - SDK status already indicates they need claiming
      const needsClaiming = [];
      for (const tx of potentialClaims) {
        if (!tx.sending || !tx.receiving || tx.receiving.length === 0) continue;

        const fromChainId = tx.sending.network.chainId;
        const toChainId = tx.receiving[0].network.chainId;

        // Find chain configs
        const fromChainEntry = Object.entries(CHAINS).find(([_, c]) => c.chainId === fromChainId);
        const toChainEntry = Object.entries(CHAINS).find(([_, c]) => c.chainId === toChainId);

        if (!fromChainEntry || !toChainEntry) {
          console.log(`  ⚠️  Skipping transaction with unknown chains (${fromChainId} -> ${toChainId})\n`);
          continue;
        }

        const [fromChainName, fromChainConfig] = fromChainEntry;
        const [toChainName, toChainConfig] = toChainEntry;

        console.log(`  Found: ${fromChainName} → ${toChainName}`);
        console.log(`    TX: ${tx.transactionHash}`);
        console.log(`    Deposit Count: ${tx.depositCount}`);
        console.log(`    Status: ${tx.status}`);
        console.log(`    ⏳ Ready to claim!\n`);

        needsClaiming.push({
          testName: `${fromChainName} → ${toChainName}`,
          txHash: tx.transactionHash,
          bridgeHash: tx.bridgeHash,
          fromChain: fromChainName,
          toChain: toChainName,
          fromChainId: fromChainConfig.chainId,
          fromNetworkId: fromChainConfig.networkId,
          toChainId: toChainConfig.chainId,
          toNetworkId: toChainConfig.networkId,
          amount: tx.sending.amount,
          timestamp: tx.timestamp,
          depositCount: tx.depositCount
        });
      }

      if (needsClaiming.length === 0) {
        console.log('  ✅ All bridges have been claimed!\n');
        return;
      }

      // Automatically claim all ready transactions
      console.log(`\n💡 Found ${needsClaiming.length} bridge(s) ready to claim before running new tests!\n`);
      console.log('🚀 Automatically claiming all ready bridges...\n');

      await this.executeClaims(needsClaiming);
      console.log('\n✅ Pre-test claims processed. Continuing with tests...\n');

    } catch (error) {
      console.error('  ⚠️  Error checking for existing claims:', error.message);
      console.log('  Continuing with tests...\n');
    }
  }

  async checkAndProcessClaims() {
    if (this.pendingClaims.length === 0) {
      return;
    }

    console.log('\n\n' + '='.repeat(80));
    console.log('🔔 PENDING CLAIMS DETECTED');
    console.log('='.repeat(80) + '\n');

    console.log(`Found ${this.pendingClaims.length} bridge(s) that need to be claimed on destination chains.\n`);

    // Automatically attempt to claim all pending transactions
    // The SDK's buildClaimAssetFromHash will handle checking if ready and extracting depositCount
    console.log(`🚀 Automatically claiming ${this.pendingClaims.length} bridge transaction(s)...\n`);

    await this.executeClaims(this.pendingClaims);
    console.log('\n✅ Post-test claim processing complete!\n');
  }

  async executeClaims(claims) {
    console.log('\n🚀 Executing claims...\n');

    for (const claim of claims) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`🎁 Claiming: ${claim.testName}`);
      console.log(`${'='.repeat(80)}`);

      try {
        console.log(`  Source TX: ${claim.txHash}`);
        console.log(`  Destination Chain: ${claim.toChain}`);

        // Get depositCount if not already available
        let depositCount = claim.depositCount;
        if (depositCount === null || depositCount === undefined) {
          console.log(`  🔍 Fetching depositCount from SDK...`);
          const txResponse = await this.core.getTransactions({
            address: this.wallet.address,
            limit: 50
          });

          const ourTx = txResponse.transactions.find(tx =>
            tx.transactionHash.toLowerCase() === claim.txHash.toLowerCase()
          );

          if (!ourTx || ourTx.depositCount === null) {
            throw new Error('Transaction not found in SDK or depositCount not available yet');
          }

          depositCount = ourTx.depositCount;
          console.log(`  📋 Found depositCount: ${depositCount}`);
        }

        // Build claim transaction using Core API (works for all AggLayer transactions)
        console.log(`  🔨 Building claim transaction via Core API...`);
        const claimTx = await this.core.getClaimUnsignedTransaction({
          sourceNetworkId: claim.fromNetworkId,
          depositCount: depositCount
        });

        // Normalize transaction
        const normalizedClaimTx = {
          ...claimTx,
          to: claimTx.to,
          data: claimTx.data,
          value: claimTx.value ? ethers.BigNumber.from(claimTx.value).toHexString() : '0x0',
          gasLimit: claimTx.gasLimit ? ethers.BigNumber.from(claimTx.gasLimit).toHexString() : claimTx.gas ? ethers.BigNumber.from(claimTx.gas).toHexString() : undefined,
          gasPrice: claimTx.gasPrice ? ethers.BigNumber.from(claimTx.gasPrice).toHexString() : undefined,
          nonce: claimTx.nonce && typeof claimTx.nonce === 'string' && !claimTx.nonce.startsWith('0x')
            ? ethers.utils.hexValue(parseInt(claimTx.nonce))
            : claimTx.nonce,
          chainId: claimTx.chainId ? parseInt(claimTx.chainId) : claim.toChainId
        };

        // Remove undefined and SDK-specific fields
        delete normalizedClaimTx.gas;
        Object.keys(normalizedClaimTx).forEach(key => {
          if (normalizedClaimTx[key] === undefined) {
            delete normalizedClaimTx[key];
          }
        });

        // Get provider and connect wallet
        const provider = this.getProviderForChain(claim.toChainId);
        const connectedWallet = this.wallet.connect(provider);

        // Execute claim
        console.log(`  📝 Claiming ${claim.amount} ${claim.token || 'tokens'}...`);
        const txResponse = await connectedWallet.sendTransaction(normalizedClaimTx);
        console.log(`  ⏳ Claim TX: ${txResponse.hash}`);

        const receipt = await txResponse.wait();
        console.log(`  ✅ Claim confirmed in block ${receipt.blockNumber}`);
        console.log(`  ⛽ Gas used: ${receipt.gasUsed.toString()}`);

      } catch (error) {
        console.error(`  ❌ Claim failed: ${error.message}`);
        if (process.env.DEBUG && error.stack) {
          console.error('Stack trace:', error.stack);
        }
      }
    }

    console.log('\n✅ All claims processed!\n');
  }

  async runAllTests() {
    console.log('\n🧪 Starting Comprehensive Bridge Tests\n');
    console.log(`Mode: ${TEST_CONFIG.dryRun ? 'DRY RUN (No real transactions)' : 'LIVE (Real transactions)'}`);
    console.log(`Slippage tolerance: ${TEST_CONFIG.slippage}%`);
    console.log(`Balance checks: ${TEST_CONFIG.skipBalanceCheck ? 'DISABLED' : 'ENABLED'}`);
    console.log('');

    // Test scenarios - ORDERED TO CREATE WRAPPED TOKENS FIRST
    // Strategy: Bridge TO destination first (creates wrapped), then bridge back
    const testScenarios = [
      // === PHASE 1: Native tokens that exist everywhere ===
      // ETH - exists natively on all chains (except OKX uses WETH)
      { from: 'base', to: 'katana', token: 'ETH', direction: 'Base→Katana' },
      { from: 'katana', to: 'base', token: 'ETH', direction: 'Katana→Base' },
      { from: 'ethereum', to: 'katana', token: 'ETH', direction: 'Ethereum→Katana' },
      { from: 'katana', to: 'ethereum', token: 'ETH', direction: 'Katana→Ethereum' },

      // OKX uses WETH (not native ETH) - bridge TO OKX first to create balance, then FROM
      { from: 'katana', to: 'okx', token: 'ETH', direction: 'Katana(ETH)→OKX(WETH) - creates balance' },
      { from: 'okx', to: 'katana', token: 'ETH', direction: 'OKX(WETH)→Katana - uses created balance' },

      // === PHASE 2: Create wrapped tokens on Katana (bridge TO Katana first) ===
      // COMMENTED: OKB bridging not supported - no route available (see bug-3.md)
      // { from: 'okx', to: 'katana', token: 'OKB', direction: 'OKX→Katana (creates wrapped)' },
      // { from: 'katana', to: 'okx', token: 'OKB', direction: 'Katana→OKX (uses wrapped)' },

      // WBTC: Already exists on Katana, bridge TO destinations first to build balances
      { from: 'base', to: 'katana', token: 'WBTC', direction: 'Base→Katana' },
      { from: 'katana', to: 'base', token: 'WBTC', direction: 'Katana→Base' },
      { from: 'ethereum', to: 'katana', token: 'WBTC', direction: 'Ethereum→Katana' },
      { from: 'katana', to: 'ethereum', token: 'WBTC', direction: 'Katana→Ethereum' },
      // Bridge TO OKX first to create WBTC balance, then bridge FROM OKX
      { from: 'katana', to: 'okx', token: 'WBTC', direction: 'Katana→OKX - creates balance' },
      { from: 'okx', to: 'katana', token: 'WBTC', direction: 'OKX→Katana - uses created balance' },

      // === PHASE 3: Create wrapped tokens on Base/Ethereum (bridge FROM Katana first) ===
      // ASTEST: Katana → Base (creates wrapped ASTEST on Base)
      { from: 'katana', to: 'base', token: 'CUSTOM_ERC20', direction: 'Katana→Base (creates wrapped)' },
      // Bridge back: Base → Katana (wrapped token now exists on Base)
      { from: 'base', to: 'katana', token: 'CUSTOM_ERC20', direction: 'Base→Katana (uses wrapped)' },

      // ASTEST: Katana → Ethereum (creates wrapped ASTEST on Ethereum)
      { from: 'katana', to: 'ethereum', token: 'CUSTOM_ERC20', direction: 'Katana→Ethereum (creates wrapped)' },
      // Bridge back: Ethereum → Katana (wrapped token now exists on Ethereum)
      { from: 'ethereum', to: 'katana', token: 'CUSTOM_ERC20', direction: 'Ethereum→Katana (uses wrapped)' }
    ];

    // Execute all test scenarios
    for (let i = 0; i < testScenarios.length; i++) {
      const scenario = testScenarios[i];
      console.log(`\n[${i + 1}/${testScenarios.length}]`);

      // Skip tests if token not deployed
      if (scenario.token === 'CUSTOM_ERC20' && !TOKENS.CUSTOM_ERC20.katana.address) {
        const token = TOKENS[scenario.token];
        const fromTokenSymbol = token[scenario.from]?.symbol || 'ASTEST';
        const toTokenSymbol = token[scenario.to]?.symbol || 'ASTEST';
        const testName = fromTokenSymbol === toTokenSymbol
          ? `${fromTokenSymbol}: ${scenario.from} → ${scenario.to}`
          : `${fromTokenSymbol}→${toTokenSymbol}: ${scenario.from} → ${scenario.to}`;

        console.log(`⏭️  Skipping ${testName} (token not deployed)`);
        this.testResults.push({
          test: testName,
          status: 'SKIPPED',
          reason: 'Token not deployed',
          fromChain: scenario.from,
          fromToken: fromTokenSymbol,
          toChain: scenario.to,
          toToken: toTokenSymbol,
          tokenConfig: scenario.token,
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

    // Validate chain configuration with SDK
    await tester.validateChainConfiguration();

    // Check for pending claims BEFORE running tests
    await tester.checkForExistingClaims();

    await tester.runAllTests();
    await tester.generateReport();

    console.log('🎉 All tests completed!\n');

    // Wait 3 minutes for transactions to finalize before checking claims
    if (tester.pendingClaims.length > 0) {
      console.log(`⏳ Waiting 3 minutes for ${tester.pendingClaims.length} bridge transaction(s) to finalize...\n`);
      await new Promise(resolve => setTimeout(resolve, 180000)); // 3 minutes
    }

    // Check and process any pending claims from THIS run
    await tester.checkAndProcessClaims();

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
