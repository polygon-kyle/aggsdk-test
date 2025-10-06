#!/usr/bin/env node

/**
 * Track Agglayer Bridge Transaction Status
 *
 * This utility tracks the status of a bridge transaction across chains,
 * showing pending status, confirmations, and when claim is ready.
 *
 * Usage:
 *   node scripts/track-transaction.js <txHash> [chainId]
 *
 * Example:
 *   node scripts/track-transaction.js 0x1234... 8453
 */

require('dotenv').config();
const { ethers } = require('ethers');

// Import configurations
const { CHAINS } = require('../agglayer-bridge-test.js');

// Import SDK
let AggLayerSDK, SDK_MODES;
try {
  const sdk = require('@agglayer/sdk');
  AggLayerSDK = sdk.AggLayerSDK;
  SDK_MODES = sdk.SDK_MODES;
} catch (error) {
  console.error('❌ @agglayer/sdk not installed. Run: npm install @agglayer/sdk@beta');
  process.exit(1);
}

class TransactionTracker {
  constructor(txHash, chainId) {
    this.txHash = txHash;
    this.chainId = chainId;
    this.sdk = null;
    this.core = null;
    this.provider = null;
    this.chainName = null;
  }

  async initialize() {
    console.log('🔧 Initializing transaction tracker...\n');

    // Find chain name from chain ID
    for (const [name, config] of Object.entries(CHAINS)) {
      if (config.chainId === this.chainId) {
        this.chainName = name;
        this.provider = new ethers.providers.JsonRpcProvider(config.rpc);
        break;
      }
    }

    if (!this.chainName) {
      throw new Error(`Unknown chain ID: ${this.chainId}`);
    }

    // Initialize SDK
    this.sdk = new AggLayerSDK({
      mode: [SDK_MODES.CORE, SDK_MODES.NATIVE],
      core: {
        apiBaseUrl: process.env.ARC_API_BASE_URL || 'https://arc-api.polygon.technology',
        apiTimeout: 60000
      },
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

    this.core = this.sdk.getCore();
    this.native = this.sdk.getNative();
  }

  async getTransactionReceipt() {
    try {
      const receipt = await this.provider.getTransactionReceipt(this.txHash);
      return receipt;
    } catch (error) {
      console.warn('⚠️ Could not get transaction receipt:', error.message);
      return null;
    }
  }

  async getTransactionDetails() {
    try {
      const tx = await this.provider.getTransaction(this.txHash);
      return tx;
    } catch (error) {
      console.warn('⚠️ Could not get transaction details:', error.message);
      return null;
    }
  }

  async trackWithSDK() {
    try {
      console.log('🔍 Querying Agglayer API for transaction status...\n');

      // Query transaction from Core module
      const txHistory = await this.core.getTransactions({
        limit: 100
      });

      // Find our transaction
      const ourTx = txHistory.transactions?.find(
        tx => tx.hash?.toLowerCase() === this.txHash.toLowerCase()
      );

      if (ourTx) {
        return ourTx;
      }

      console.warn('⚠️ Transaction not found in Agglayer API yet');
      console.warn('   It may take a few moments to be indexed\n');
      return null;

    } catch (error) {
      console.warn('⚠️ Could not query Agglayer API:', error.message);
      return null;
    }
  }

  async checkClaimStatus(receipt) {
    if (!receipt || !receipt.logs) {
      return null;
    }

    try {
      // Parse bridge event from logs
      const bridgeEventTopic = ethers.utils.id('BridgeEvent(uint8,uint32,address,uint32,address,uint256,bytes,uint32)');

      const bridgeLog = receipt.logs.find(
        log => log.topics[0] === bridgeEventTopic
      );

      if (!bridgeLog) {
        console.log('ℹ️ Not a bridge transaction (no BridgeEvent found)\n');
        return null;
      }

      console.log('🌉 Bridge transaction detected!\n');

      // Decode bridge event (simplified)
      const iface = new ethers.utils.Interface([
        'event BridgeEvent(uint8 leafType, uint32 originNetwork, address originAddress, uint32 destinationNetwork, address destinationAddress, uint256 amount, bytes metadata, uint32 depositCount)'
      ]);

      const decodedLog = iface.parseLog(bridgeLog);
      const { originNetwork, destinationNetwork, depositCount } = decodedLog.args;

      console.log('  Bridge Details:');
      console.log(`    Origin Network ID: ${originNetwork}`);
      console.log(`    Destination Network ID: ${destinationNetwork}`);
      console.log(`    Deposit Count: ${depositCount}`);

      // Check if claim is ready
      const destChain = Object.values(CHAINS).find(c => c.networkId === destinationNetwork);
      if (destChain) {
        console.log(`    Destination Chain: ${destChain.name}\n`);

        // Check if already claimed
        const bridge = this.native.bridge(destChain.bridgeAddress, destChain.chainId);
        const isClaimed = await bridge.isClaimed({
          leafIndex: depositCount,
          sourceBridgeNetwork: originNetwork
        });

        if (isClaimed) {
          console.log('  ✅ Status: Already claimed on destination chain');
        } else {
          console.log('  ⏳ Status: Ready to claim on destination chain');
          console.log('\n  To claim, run:');
          console.log(`    node scripts/claim-transaction.js ${this.txHash} ${this.chainId}`);
        }
      }

      return {
        originNetwork,
        destinationNetwork,
        depositCount,
        destChain
      };

    } catch (error) {
      console.warn('⚠️ Could not check claim status:', error.message);
      return null;
    }
  }

  formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  }

  async track() {
    console.log('📍 Transaction Hash:', this.txHash);
    console.log('📍 Chain:', CHAINS[this.chainName].name, `(Chain ID: ${this.chainId})`);
    console.log('');

    // Get on-chain data
    console.log('🔍 Fetching on-chain data...\n');

    const receipt = await this.getTransactionReceipt();
    const tx = await this.getTransactionDetails();

    if (!receipt) {
      console.log('⏳ Transaction Status: PENDING (not yet mined)');
      console.log('\n   Waiting for confirmation...');
      console.log('   Run this script again in a few moments\n');
      return;
    }

    // Display transaction status
    console.log('${'='.repeat(70)}');
    console.log('ON-CHAIN STATUS');
    console.log('='.repeat(70) + '\n');

    if (receipt.status === 0) {
      console.log('❌ Transaction Status: FAILED');
      console.log(`   Reverted in block ${receipt.blockNumber}\n`);
      return;
    }

    console.log('✅ Transaction Status: CONFIRMED');
    console.log(`   Block Number: ${receipt.blockNumber}`);
    console.log(`   Confirmations: ${receipt.confirmations || 'N/A'}`);
    console.log(`   Gas Used: ${receipt.gasUsed.toString()}`);

    if (tx) {
      console.log(`   From: ${tx.from}`);
      console.log(`   To: ${tx.to}`);
      console.log(`   Value: ${ethers.utils.formatEther(tx.value || '0')} ETH`);
      if (tx.blockNumber) {
        const block = await this.provider.getBlock(tx.blockNumber);
        console.log(`   Timestamp: ${this.formatTimestamp(block.timestamp)}`);
      }
    }

    console.log('');

    // Check if this is a bridge transaction
    const bridgeInfo = await this.checkClaimStatus(receipt);

    // Track with SDK
    console.log('\n' + '='.repeat(70));
    console.log('AGGLAYER BRIDGE STATUS');
    console.log('='.repeat(70) + '\n');

    const aggTx = await this.trackWithSDK();

    if (aggTx) {
      console.log('  API Status:', aggTx.status || 'UNKNOWN');
      console.log('  Protocol:', aggTx.protocol || 'Agglayer');

      if (aggTx.sourceChain) {
        console.log(`  Source Chain: ${aggTx.sourceChain}`);
      }
      if (aggTx.destinationChain) {
        console.log(`  Destination Chain: ${aggTx.destinationChain}`);
      }
      if (aggTx.amount) {
        console.log(`  Amount: ${aggTx.amount}`);
      }
      if (aggTx.token) {
        console.log(`  Token: ${aggTx.token}`);
      }
    }

    console.log('\n' + '='.repeat(70));

    // Explorer link
    const explorerUrl = this.getExplorerLink(this.chainId, this.txHash);
    if (explorerUrl) {
      console.log(`\n🔗 View on Explorer: ${explorerUrl}`);
    }
  }

  getExplorerLink(chainId, txHash) {
    const explorers = {
      1: `https://etherscan.io/tx/${txHash}`,
      8453: `https://basescan.org/tx/${txHash}`,
      747474: `https://katana-explorer.com/tx/${txHash}`,
      66: `https://www.oklink.com/okc/tx/${txHash}`
    };

    return explorers[chainId];
  }

  async watchTransaction(pollInterval = 5000) {
    console.log(`\n👀 Watching transaction (polling every ${pollInterval / 1000}s)...`);
    console.log('Press Ctrl+C to stop\n');

    let lastStatus = null;

    while (true) {
      try {
        const receipt = await this.getTransactionReceipt();

        if (!receipt) {
          if (lastStatus !== 'pending') {
            console.log(`[${new Date().toLocaleTimeString()}] ⏳ Transaction pending...`);
            lastStatus = 'pending';
          }
        } else {
          if (lastStatus !== 'confirmed') {
            console.log(`[${new Date().toLocaleTimeString()}] ✅ Transaction confirmed in block ${receipt.blockNumber}!`);
            lastStatus = 'confirmed';

            // Check for bridge event
            await this.checkClaimStatus(receipt);

            console.log('\n✅ Transaction tracking complete!');
            break;
          }
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));

      } catch (error) {
        console.error(`[${new Date().toLocaleTimeString()}] ❌ Error:`, error.message);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
  }
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('📊 AGGLAYER TRANSACTION TRACKER');
  console.log('='.repeat(70) + '\n');

  // Parse arguments
  const txHash = process.argv[2];
  const chainId = process.argv[3] ? parseInt(process.argv[3]) : null;
  const watch = process.argv.includes('--watch') || process.argv.includes('-w');

  if (!txHash) {
    console.error('❌ Transaction hash required\n');
    console.log('Usage:');
    console.log('  node scripts/track-transaction.js <txHash> [chainId] [--watch]\n');
    console.log('Examples:');
    console.log('  node scripts/track-transaction.js 0x1234... 8453');
    console.log('  node scripts/track-transaction.js 0x1234... 8453 --watch\n');
    process.exit(1);
  }

  // Validate tx hash format
  if (!txHash.match(/^0x[0-9a-fA-F]{64}$/)) {
    console.error(`❌ Invalid transaction hash format: ${txHash}\n`);
    process.exit(1);
  }

  // Auto-detect chain ID if not provided
  let detectedChainId = chainId;
  if (!detectedChainId) {
    console.log('🔍 Chain ID not provided, trying all chains...\n');

    for (const [name, config] of Object.entries(CHAINS)) {
      try {
        const provider = new ethers.providers.JsonRpcProvider(config.rpc);
        const receipt = await provider.getTransactionReceipt(txHash);

        if (receipt) {
          detectedChainId = config.chainId;
          console.log(`✅ Transaction found on ${config.name} (Chain ID: ${config.chainId})\n`);
          break;
        }
      } catch (error) {
        // Continue to next chain
      }
    }

    if (!detectedChainId) {
      console.error('❌ Transaction not found on any configured chain\n');
      process.exit(1);
    }
  }

  const tracker = new TransactionTracker(txHash, detectedChainId);

  try {
    await tracker.initialize();

    if (watch) {
      await tracker.watchTransaction();
    } else {
      await tracker.track();
    }

    console.log('\n✅ Tracking complete!\n');

  } catch (error) {
    console.error('\n❌ Tracking failed:', error.message);
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

module.exports = { TransactionTracker };
