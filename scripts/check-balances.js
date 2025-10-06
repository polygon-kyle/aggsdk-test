#!/usr/bin/env node

/**
 * Check Token Balances Across All Chains
 *
 * This utility checks the balance of various tokens across all configured chains
 * for the test wallet address.
 *
 * Usage:
 *   node scripts/check-balances.js [walletAddress]
 *
 * Example:
 *   node scripts/check-balances.js
 *   node scripts/check-balances.js 0x1234...
 */

require('dotenv').config();
const { ethers } = require('ethers');

// Import configurations
const { CHAINS, TOKENS } = require('../agglayer-bridge-test.js');

// Import SDK for balance checking
let AggLayerSDK, SDK_MODES;
try {
  const sdk = require('@agglayer/sdk');
  AggLayerSDK = sdk.AggLayerSDK;
  SDK_MODES = sdk.SDK_MODES;
} catch (error) {
  console.warn('⚠️ @agglayer/sdk not available, using direct RPC calls only');
}

class BalanceChecker {
  constructor(walletAddress) {
    this.walletAddress = walletAddress;
    this.providers = {};
    this.balances = {};
    this.sdk = null;
    this.native = null;
  }

  async initialize() {
    console.log('🔧 Initializing balance checker...\n');

    // Setup providers
    for (const [chainName, chainConfig] of Object.entries(CHAINS)) {
      this.providers[chainName] = new ethers.providers.JsonRpcProvider(chainConfig.rpc);
    }

    // Initialize SDK if available
    if (AggLayerSDK && SDK_MODES) {
      try {
        this.sdk = new AggLayerSDK({
          mode: [SDK_MODES.NATIVE],
          native: {
            defaultNetwork: 1,
            customRpcUrls: {
              1: CHAINS.ethereum.rpc,
              8453: CHAINS.base.rpc,
              747474: CHAINS.katana.rpc,
              66: CHAINS.okx.rpc
            }
          }
        });
        this.native = this.sdk.getNative();
      } catch (error) {
        console.warn('⚠️ Could not initialize SDK:', error.message);
      }
    }
  }

  async checkNativeBalance(chainName) {
    try {
      const provider = this.providers[chainName];
      const balance = await provider.getBalance(this.walletAddress);
      return {
        balance: balance.toString(),
        formatted: ethers.utils.formatEther(balance),
        decimals: 18,
        symbol: 'ETH'
      };
    } catch (error) {
      return {
        error: error.message,
        balance: '0',
        formatted: '0',
        decimals: 18,
        symbol: 'ETH'
      };
    }
  }

  async checkERC20Balance(chainName, tokenAddress, decimals, symbol) {
    try {
      const provider = this.providers[chainName];

      // Try SDK first
      if (this.native) {
        try {
          const chainId = CHAINS[chainName].chainId;
          const erc20 = this.native.erc20(tokenAddress, chainId);
          const balance = await erc20.getBalance(this.walletAddress);
          return {
            balance: balance.toString(),
            formatted: ethers.utils.formatUnits(balance, decimals),
            decimals,
            symbol
          };
        } catch (sdkError) {
          // Fall through to direct call
        }
      }

      // Direct ERC20 call
      const erc20ABI = [
        "function balanceOf(address) view returns (uint256)"
      ];
      const contract = new ethers.Contract(tokenAddress, erc20ABI, provider);
      const balance = await contract.balanceOf(this.walletAddress);

      return {
        balance: balance.toString(),
        formatted: ethers.utils.formatUnits(balance, decimals),
        decimals,
        symbol
      };
    } catch (error) {
      return {
        error: error.message,
        balance: '0',
        formatted: '0',
        decimals,
        symbol
      };
    }
  }

  async checkAllBalances() {
    console.log('💰 Checking balances for:', this.walletAddress);
    console.log('');

    for (const [chainName, chainConfig] of Object.entries(CHAINS)) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`📍 ${chainConfig.name} (Chain ID: ${chainConfig.chainId})`);
      console.log(`${'='.repeat(70)}\n`);

      // Check native token (ETH)
      console.log('  Native Token (ETH):');
      const nativeBalance = await this.checkNativeBalance(chainName);
      if (nativeBalance.error) {
        console.log(`    ❌ Error: ${nativeBalance.error}`);
      } else {
        const isLow = parseFloat(nativeBalance.formatted) < 0.01;
        const icon = isLow ? '⚠️' : '✅';
        console.log(`    ${icon} Balance: ${nativeBalance.formatted} ETH`);
        if (isLow) {
          console.log(`    ⚠️ Low balance! You may need more ETH for gas fees.`);
        }
      }

      // Check ERC20 tokens
      console.log('\n  ERC20 Tokens:');

      for (const [tokenSymbol, tokenConfig] of Object.entries(TOKENS)) {
        if (tokenSymbol === 'ETH') continue; // Skip native token

        const tokenData = tokenConfig[chainName];
        if (!tokenData || !tokenData.address || tokenData.isNative) continue;

        console.log(`\n    ${tokenSymbol}:`);
        console.log(`      Address: ${tokenData.address}`);

        const balance = await this.checkERC20Balance(
          chainName,
          tokenData.address,
          tokenData.decimals,
          tokenData.symbol
        );

        if (balance.error) {
          console.log(`      ❌ Error: ${balance.error}`);
        } else {
          const hasBalance = parseFloat(balance.formatted) > 0;
          const icon = hasBalance ? '✅' : '⭕';
          console.log(`      ${icon} Balance: ${balance.formatted} ${balance.symbol}`);

          if (!hasBalance) {
            console.log(`      ℹ️ No balance - bridge some tokens to this chain to test`);
          }
        }
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  generateSummaryReport() {
    console.log('\n\n' + '='.repeat(70));
    console.log('📊 BALANCE SUMMARY');
    console.log('='.repeat(70) + '\n');

    console.log(`Wallet Address: ${this.walletAddress}\n`);

    console.log('Native Token (ETH) Balances:');
    console.log('-'.repeat(70));

    let totalETH = ethers.BigNumber.from(0);
    for (const [chainName, chainConfig] of Object.entries(CHAINS)) {
      const balance = this.balances[chainName]?.ETH;
      if (balance && !balance.error) {
        const amount = ethers.utils.parseEther(balance.formatted || '0');
        totalETH = totalETH.add(amount);
        console.log(`  ${chainConfig.name}: ${balance.formatted} ETH`);
      }
    }
    console.log(`  ${'─'.repeat(66)}`);
    console.log(`  Total ETH (across all chains): ${ethers.utils.formatEther(totalETH)} ETH`);

    console.log('\n\nReadiness Check:');
    console.log('-'.repeat(70));

    const checks = {
      hasETHOnEthereum: false,
      hasETHOnBase: false,
      hasETHOnKatana: false,
      hasETHOnOKX: false,
      hasWBTCOnEthereum: false,
      hasWBTCOnBase: false,
      hasOKBOnOKX: false
    };

    // Perform checks (would need to store balances in this.balances)
    console.log('  ✅ = Ready for testing');
    console.log('  ⚠️ = May have issues (low balance or missing tokens)');
    console.log('  ❌ = Not ready (no balance)');

    console.log('\n  Bridge Testing Readiness:');
    console.log('    Base ↔ Katana:     ⚠️ (Check ETH and WBTC balances above)');
    console.log('    Katana ↔ OKX:      ⚠️ (Check ETH, OKB, and WBTC balances above)');
    console.log('    Katana ↔ Ethereum: ⚠️ (Check ETH and WBTC balances above)');

    console.log('\n\n' + '='.repeat(70));
  }

  async checkPrices() {
    console.log('\n\n💵 Checking token prices (approximate)...\n');

    try {
      // Note: In production, integrate with real price API
      // For now, use approximate values
      const prices = {
        ETH: 2000,  // USD
        WBTC: 42000, // USD
        OKB: 45,     // USD
        CUSTOM: 0    // Custom token has no market price
      };

      console.log('  Current Prices (approximate):');
      for (const [symbol, price] of Object.entries(prices)) {
        if (price > 0) {
          console.log(`    ${symbol}: $${price.toLocaleString()}`);
        } else {
          console.log(`    ${symbol}: No market price`);
        }
      }

      return prices;
    } catch (error) {
      console.warn('  ⚠️ Could not fetch prices:', error.message);
      return {};
    }
  }
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('💰 AGGLAYER BRIDGE - BALANCE CHECKER');
  console.log('='.repeat(70) + '\n');

  // Get wallet address from args or env
  let walletAddress = process.argv[2];

  if (!walletAddress) {
    if (process.env.TEST_WALLET_PRIVATE_KEY) {
      const wallet = new ethers.Wallet(process.env.TEST_WALLET_PRIVATE_KEY);
      walletAddress = wallet.address;
      console.log('Using wallet address from TEST_WALLET_PRIVATE_KEY\n');
    } else {
      console.error('❌ No wallet address provided and TEST_WALLET_PRIVATE_KEY not set');
      console.log('\nUsage:');
      console.log('  node scripts/check-balances.js [walletAddress]');
      console.log('\nOr set TEST_WALLET_PRIVATE_KEY in your .env file');
      process.exit(1);
    }
  }

  // Validate address
  if (!ethers.utils.isAddress(walletAddress)) {
    console.error(`❌ Invalid Ethereum address: ${walletAddress}`);
    process.exit(1);
  }

  const checker = new BalanceChecker(walletAddress);

  try {
    await checker.initialize();
    await checker.checkAllBalances();
    await checker.checkPrices();
    checker.generateSummaryReport();

    console.log('\n✅ Balance check complete!\n');

  } catch (error) {
    console.error('\n❌ Balance check failed:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { BalanceChecker };
