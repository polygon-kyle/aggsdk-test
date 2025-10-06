#!/usr/bin/env node

/**
 * Deploy ASTEST Token with UUPS Upgradeable Proxy Pattern
 *
 * This script deploys the ASTEST ERC20 token using Hardhat and the UUPS proxy pattern.
 * ASTEST features: ERC1363, Burnable, Pausable, Permit, Ownable, and Upgradeable.
 *
 * Usage:
 *   node scripts/deploy-astest.js [chainName]
 *
 * Example:
 *   node scripts/deploy-astest.js base
 *   node scripts/deploy-astest.js ethereum
 */

const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  const chainName = process.argv[2] || 'base';

  console.log('\n' + '='.repeat(80));
  console.log('🚀 ASTEST TOKEN DEPLOYMENT');
  console.log('='.repeat(80) + '\n');

  // Get network info
  const network = await hre.ethers.provider.getNetwork();
  console.log(`📍 Network: ${network.name} (Chain ID: ${network.chainId})`);

  const [deployer] = await hre.ethers.getSigners();
  console.log(`🔑 Deployer: ${deployer.address}`);

  const balance = await deployer.getBalance();
  console.log(`💰 Balance: ${hre.ethers.utils.formatEther(balance)} ETH\n`);

  if (balance.eq(0)) {
    console.error('❌ Insufficient balance to deploy contracts');
    process.exit(1);
  }

  try {
    // Step 1: Deploy Implementation
    console.log('📝 Step 1: Deploying ASTEST Implementation Contract...');

    const ASTEST = await hre.ethers.getContractFactory('ASTEST');
    const implementation = await ASTEST.deploy();
    await implementation.deployed();

    console.log(`  ✅ Implementation deployed at: ${implementation.address}`);
    console.log(`  🔗 Explorer: ${getExplorerLink(network.chainId, implementation.address)}\n`);

    // Step 2: Deploy UUPS Proxy
    console.log('📝 Step 2: Deploying UUPS Proxy...');

    // Encode initialization call
    const initData = ASTEST.interface.encodeFunctionData('initialize', [
      deployer.address, // recipient (gets initial supply)
      deployer.address  // initialOwner
    ]);

    // Deploy ERC1967Proxy
    const ERC1967Proxy = await hre.ethers.getContractFactory(
      '@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy'
    );

    const proxy = await ERC1967Proxy.deploy(implementation.address, initData);
    await proxy.deployed();

    console.log(`  ✅ Proxy deployed at: ${proxy.address}`);
    console.log(`  🔗 Explorer: ${getExplorerLink(network.chainId, proxy.address)}\n`);

    // Step 3: Interact with proxy as ASTEST
    console.log('📝 Step 3: Verifying deployment...');

    const astest = ASTEST.attach(proxy.address);

    const name = await astest.name();
    const symbol = await astest.symbol();
    const decimals = await astest.decimals();
    const totalSupply = await astest.totalSupply();
    const deployerBalance = await astest.balanceOf(deployer.address);
    const owner = await astest.owner();

    console.log(`  ✅ Token Name: ${name}`);
    console.log(`  ✅ Token Symbol: ${symbol}`);
    console.log(`  ✅ Decimals: ${decimals}`);
    console.log(`  ✅ Total Supply: ${hre.ethers.utils.formatEther(totalSupply)} ${symbol}`);
    console.log(`  ✅ Deployer Balance: ${hre.ethers.utils.formatEther(deployerBalance)} ${symbol}`);
    console.log(`  ✅ Owner: ${owner}\n`);

    // Step 4: Save deployment info
    console.log('📝 Step 4: Saving deployment information...');

    const deploymentInfo = {
      network: network.name,
      chainId: network.chainId,
      chainName: chainName,
      implementation: implementation.address,
      proxy: proxy.address,
      deployer: deployer.address,
      timestamp: new Date().toISOString(),
      token: {
        name,
        symbol,
        decimals: decimals.toString(),
        totalSupply: hre.ethers.utils.formatEther(totalSupply),
        features: [
          'ERC1363 (Payable Token)',
          'ERC20Burnable',
          'ERC20Pausable',
          'ERC20Permit (Gasless Approvals)',
          'Ownable',
          'UUPS Upgradeable'
        ]
      },
      transactions: {
        implementation: implementation.deployTransaction.hash,
        proxy: proxy.deployTransaction.hash
      }
    };

    const deploymentsDir = path.join(__dirname, '..', 'deployments');
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir);
    }

    const deploymentFile = path.join(deploymentsDir, `astest-${chainName}.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));

    console.log(`  ✅ Deployment info saved to: ${deploymentFile}\n`);

    // Step 5: Update .env file
    console.log('📝 Step 5: Updating environment configuration...');
    updateEnvFile(chainName, proxy.address);

    console.log('\n' + '='.repeat(80));
    console.log('✅ DEPLOYMENT SUCCESSFUL!');
    console.log('='.repeat(80) + '\n');

    console.log(`Token Address (Proxy): ${proxy.address}`);
    console.log(`Implementation Address: ${implementation.address}`);
    console.log(`\nAdd this to your .env file:`);
    console.log(`CUSTOM_TOKEN_${chainName.toUpperCase()}=${proxy.address}`);
    console.log('\n📋 Token Features:');
    deploymentInfo.token.features.forEach(feature => {
      console.log(`  ✅ ${feature}`);
    });
    console.log('\n🌉 Bridge Testing Strategy:');
    console.log('  1️⃣  ASTEST is deployed on Katana (origin chain)');
    console.log('  2️⃣  When you bridge to Base/Ethereum, wrapped versions are auto-created');
    console.log('  3️⃣  The test suite auto-resolves wrapped token addresses');
    console.log('\n✨ You can now run bridge tests with ASTEST token!');
    console.log('\nUseful Commands:');
    console.log(`  Check balances: npm run check:balances`);
    console.log(`  Run dry-run test: npm run test:dry-run`);
    console.log(`  Run live tests: npm test\n`);

  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

function getExplorerLink(chainId, address) {
  const explorers = {
    1: `https://etherscan.io/address/${address}`,
    8453: `https://basescan.org/address/${address}`,
    747474: `https://katana-explorer.com/address/${address}`,
    66: `https://www.oklink.com/xlayer/address/${address}`
  };

  return explorers[chainId] || `https://blockscan.com/address/${address}`;
}

function updateEnvFile(chainName, tokenAddress) {
  const envPath = path.join(__dirname, '..', '.env');

  if (!fs.existsSync(envPath)) {
    console.warn('  ⚠️ .env file not found, skipping update');
    return;
  }

  let envContent = fs.readFileSync(envPath, 'utf8');
  const envVar = `CUSTOM_TOKEN_${chainName.toUpperCase()}`;
  const envLine = `${envVar}=${tokenAddress}`;

  if (envContent.includes(envVar)) {
    // Update existing line
    envContent = envContent.replace(
      new RegExp(`${envVar}=.*`, 'g'),
      envLine
    );
  } else {
    // Add new line
    envContent += `\n${envLine}\n`;
  }

  fs.writeFileSync(envPath, envContent);
  console.log(`  ✅ Updated .env file with ${envVar}`);
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
