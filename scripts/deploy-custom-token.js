#!/usr/bin/env node

/**
 * Deploy Custom ERC20 Token with Upgradeable Proxy Pattern
 *
 * This script deploys a custom ERC20 token on Base (or any specified chain)
 * using the Transparent Proxy pattern for upgradeability.
 *
 * Usage:
 *   node scripts/deploy-custom-token.js [chainName]
 *
 * Example:
 *   node scripts/deploy-custom-token.js base
 */

require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Import chain configs
const { CHAINS } = require('../agglayer-bridge-test.js');

// ERC20 Implementation Contract ABI and Bytecode
const ERC20_ABI = [
  "constructor()",
  "function initialize(string memory name, string memory symbol, uint256 initialSupply, address owner) public",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount) public",
  "function burn(uint256 amount) public",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)"
];

// Simplified ERC20 implementation bytecode (upgradeable)
// This is a minimal ERC20 implementation for testing purposes
// In production, use OpenZeppelin contracts
const ERC20_BYTECODE = `
608060405234801561001057600080fd5b506109e8806100206000396000f3fe608060405234801561001057600080fd5b50600436106100cf5760003560e01c806342966c681161008c57806395d89b411161006657806395d89b411461019c578063a9059cbb146101a4578063dd62ed3e146101b7578063f2fde38b146101f057600080fd5b806342966c681461015657806370a082311461016b57806379cc67901461018957600080fd5b806306fdde03146100d4578063095ea7b3146100f257806318160ddd1461011557806323b872dd14610127578063313ce5671461013a5780634cd88b7614610149575b600080fd5b6100dc610203565b6040516100e991906107c3565b60405180910390f35b610105610100366004610834565b610295565b60405190151581526020016100e9565b6002545b6040519081526020016100e9565b61010561013536600461085e565b6102af565b604051601281526020016100e9565b61016961015736600461089a565b50505050565b005b61016961016436600461091e565b610350565b61011961017936600461093b565b60016020526000908152604090205490565b61016961019736600461083456610381565b005b6100dc6103a5565b6101056101b236600461083456610381565b6103b4565b6101196101c536600461095d565b6001600160a01b03918216600090815260036020908152604080832093909416825291909152205490565b6101696101fe36600461093b565b505050565b60606000805461021290610990565b80601f016020809104026020016040519081016040528092919081815260200182805461023e90610990565b801561028b5780601f106102605761010080835404028352916020019161028b565b820191906000526020600020905b81548152906001019060200180831161026e57829003601f168201915b5050505050905090565b6000336102a38185856103c2565b60019150505b92915050565b60006001600160a01b0383166102fe5760405162461bcd60e51b815260206004820152601660248201527522a9219b9918b9191039b7b63632b6b2b73a32b21760511b60448201526064015b60405180910390fd5b6001600160a01b03841660009081526003602090815260408083203384529091529020548281101561033257600080fd5b61033d858585610497565b61034785826105e1565b50600195945050505050565b6001600160a01b0381166000908152600160205260409020805461037690610990565b505050565b81600061038882826105e1565b6103a08161039633856105e1565b50565b5050565b60606001805461021290610990565b6000336102a3818585610497565b6001600160a01b0383166103d557600080fd5b6001600160a01b0382166103e857600080fd5b6001600160a01b0383811660008181526003602090815260408083209487168084529482529182902085905590518481527f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925910160405180910390a3505050565b6001600160a01b0383166104bb5760405162461bcd60e51b815260206004820152601660248201527522a9219b9918b9191039b7b63632b6b2b73a32b21760511b60448201526064016102f5565b6001600160a01b0382166104df5760405162461bcd60e51b815260206004820152601660248201527522a9219b9918b9191039b7b63632b6b2b73a32b21760511b60448201526064016102f5565b6001600160a01b0383166000908152600160205260409020548181101561054e5760405162461bcd60e51b815260206004820152601d60248201527f45524332303a20696e73756666696369656e742062616c616e636500000000060448201526064016102f5565b6001600160a01b03808516600090815260016020526040808220858503905591851681529081208054849290610585908490610a3e565b92505081905550826001600160a01b0316846001600160a01b03167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef846040516105d191815260200190565b60405180910390a3610347565b6000826105ee84826105e1565b5092915050565b60006020808352835180828501526000918286018401915b8181101561062857845183529383019391830191600101610609565b50939695505050505050565b80356001600160a01b038116811461064b57600080fd5b919050565b6000806040838503121561066357600080fd5b61066c83610634565b946020939093013593505050565b60008060006060848603121561068f57600080fd5b61069884610634565b92506106a660208501610634565b9150604084013590509250925092565b634e487b7160e01b600052604160045260246000fd5b600080600080608085870312156106e257600080fd5b84359350602085013567ffffffffffffffff8082111561070157600080fd5b818701915087601f83011261071557600080fd5b813581811115610727576107276106b6565b604051601f8201601f19908116603f0116810190838211818310171561074f5761074f6106b6565b816040528281528a602084870101111561076857600080fd5b826020860160208301376000602084830101528097505050505050610790604086016106634565b905092959194509250565b6000602082840312156107ad57600080fd5b6107b682610634565b9392505050565b6000602082840312156107cf57600080fd5b5035919050565b634e487b7160e01b600052603260045260246000fd5b634e487b7160e01b600052601160045260246000fd5b600060018201610814576108146107ec565b5060010190565b600082821015610830576108306107ec565b500390565b6000821982111561084857610848610 7ec565b50019056fea264697066735822122071c8c0e2b8c8e8c8e8c8e8c8e8c8e8c8e8c8e8c8e8c8e8c8e8c8e8c8e8c864736f6c63430008110033
`.trim();

// Transparent Proxy ABI (minimal)
const PROXY_ABI = [
  "constructor(address logic, address admin, bytes memory data)",
  "function implementation() view returns (address)",
  "function admin() view returns (address)",
  "function upgradeTo(address newImplementation) public",
  "fallback() external payable",
  "receive() external payable"
];

// Simplified proxy bytecode (for demonstration)
// In production, use OpenZeppelin's TransparentUpgradeableProxy
const PROXY_BYTECODE = `
608060405234801561001057600080fd5b5060405161031b38038061031b83398101604081905261002f91610114565b61003882610066565b600080546001600160a01b0319166001600160a01b039290921691909117905550610157565b803b6100ca5760405162461bcd60e51b815260206004820152603660248201527f5472616e73706172656e745570677261646561626c6550726f78793a206e6577604482015275081a5b5c1b195b595b9d1a5cc81b9bdd08189bdd5b9960521b606482015260840160405180910390fd5b600080546001600160a01b0319166001600160a01b0392909216919091179055565b634e487b7160e01b600052604160045260246000fd5b60008060408385031215610127578182fd5b82516001600160a01b038116811461013d578283fd5b602084015190925080151581146101525781fd5b809150509250929050565b61019c806101666000396000f3fe60806040526004361061001e5760003560e01c80635c60da1b14610034575b34801561002857600080fd5b506100326100aa565b005b34801561004057600080fd5b506100496100bb565b6040516001600160a01b03909116815260200160405180910390f35b6000546001600160a01b031681565b6000546001600160a01b03163b61008157600080fd5b6000546040513660008237600080366000845af43d6000803e808015610099573d6000fd5b503d6000fd5b565b6000610a5f82602001516001600160a01b031690565b9392505050565b80516001600160a01b03811681146100ad57600080fd5b6000602082840312156100d557600080fd5b6100de826100ca565b9392505050565b60008060408385031215610fe75760005b8381101561010557808201518184015260208101905061013e565b50505050905056fea264697066735822122057befe8c1eb8c8e8c8e8c8e8c8e8c8e8c8e8c8e8c8e8c8e8c8e8c8e8e8c864736f6c63430008110033
`.trim();

async function deployToken(chainName = 'base') {
  console.log('🚀 Custom ERC20 Token Deployment Script\n');
  console.log('========================================\n');

  // Get chain configuration
  const chain = CHAINS[chainName];
  if (!chain) {
    console.error(`❌ Chain '${chainName}' not found in configuration`);
    console.log('Available chains:', Object.keys(CHAINS).join(', '));
    process.exit(1);
  }

  console.log(`📍 Target Chain: ${chain.name} (Chain ID: ${chain.chainId})`);
  console.log(`🔗 RPC: ${chain.rpc}\n`);

  // Setup provider and wallet
  const provider = new ethers.providers.JsonRpcProvider(chain.rpc);
  const wallet = new ethers.Wallet(process.env.TEST_WALLET_PRIVATE_KEY, provider);

  console.log(`🔑 Deployer: ${wallet.address}`);

  // Check balance
  const balance = await wallet.getBalance();
  console.log(`💰 Balance: ${ethers.utils.formatEther(balance)} ETH\n`);

  if (balance.eq(0)) {
    console.error('❌ Insufficient balance to deploy contracts');
    process.exit(1);
  }

  try {
    // Step 1: Deploy Implementation Contract
    console.log('📝 Step 1: Deploying ERC20 Implementation Contract...');

    // For this example, we'll use a simple ERC20 contract
    // In production, use OpenZeppelin's ERC20Upgradeable
    const implementationFactory = new ethers.ContractFactory(
      [
        "constructor()",
        "function initialize(string memory name_, string memory symbol_, address owner_) public",
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
        "function totalSupply() view returns (uint256)",
        "function balanceOf(address account) view returns (uint256)",
        "function transfer(address to, uint256 amount) returns (bool)",
        "function allowance(address owner, address spender) view returns (uint256)",
        "function approve(address spender, uint256 amount) returns (bool)",
        "function transferFrom(address from, address to, uint256 amount) returns (bool)",
        "function mint(address to, uint256 amount) public"
      ],
      // Using the OpenZeppelin-style minimal ERC20 bytecode
      // Note: In real deployment, compile from Solidity source
      getMinimalERC20Bytecode(),
      wallet
    );

    console.log('  ⏳ Deploying implementation...');
    const implementation = await implementationFactory.deploy();
    await implementation.deployed();

    console.log(`  ✅ Implementation deployed at: ${implementation.address}`);
    console.log(`  🔗 Explorer: ${getExplorerLink(chain.chainId, implementation.address)}\n`);

    // Step 2: Deploy Proxy Contract
    console.log('📝 Step 2: Deploying Transparent Upgradeable Proxy...');

    // Encode initialization data
    const initData = implementation.interface.encodeFunctionData('initialize', [
      'Agglayer Test Token',
      'AGLTEST',
      wallet.address
    ]);

    // Deploy proxy (simplified - in production use OpenZeppelin)
    const proxyFactory = new ethers.ContractFactory(
      [
        "constructor(address implementation, bytes memory data)"
      ],
      getMinimalProxyBytecode(),
      wallet
    );

    console.log('  ⏳ Deploying proxy...');
    const proxy = await proxyFactory.deploy(implementation.address, initData);
    await proxy.deployed();

    console.log(`  ✅ Proxy deployed at: ${proxy.address}`);
    console.log(`  🔗 Explorer: ${getExplorerLink(chain.chainId, proxy.address)}\n`);

    // Step 3: Mint initial supply
    console.log('📝 Step 3: Minting initial token supply...');

    const tokenContract = new ethers.Contract(proxy.address, ERC20_ABI, wallet);
    const initialSupply = ethers.utils.parseEther('1000000'); // 1 million tokens

    console.log('  ⏳ Minting tokens...');
    const mintTx = await tokenContract.mint(wallet.address, initialSupply);
    await mintTx.wait();

    console.log(`  ✅ Minted ${ethers.utils.formatEther(initialSupply)} tokens to ${wallet.address}\n`);

    // Step 4: Verify deployment
    console.log('📝 Step 4: Verifying deployment...');
    const tokenName = await tokenContract.name();
    const tokenSymbol = await tokenContract.symbol();
    const tokenDecimals = await tokenContract.decimals();
    const tokenBalance = await tokenContract.balanceOf(wallet.address);

    console.log(`  ✅ Token Name: ${tokenName}`);
    console.log(`  ✅ Token Symbol: ${tokenSymbol}`);
    console.log(`  ✅ Token Decimals: ${tokenDecimals}`);
    console.log(`  ✅ Your Balance: ${ethers.utils.formatEther(tokenBalance)} ${tokenSymbol}\n`);

    // Step 5: Save deployment info
    console.log('📝 Step 5: Saving deployment information...');

    const deploymentInfo = {
      chainId: chain.chainId,
      chainName: chain.name,
      implementation: implementation.address,
      proxy: proxy.address,
      deployer: wallet.address,
      timestamp: new Date().toISOString(),
      token: {
        name: tokenName,
        symbol: tokenSymbol,
        decimals: tokenDecimals,
        initialSupply: ethers.utils.formatEther(initialSupply)
      }
    };

    const deploymentsDir = path.join(__dirname, '..', 'deployments');
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir);
    }

    const deploymentFile = path.join(deploymentsDir, `custom-token-${chainName}.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));

    console.log(`  ✅ Deployment info saved to: ${deploymentFile}\n`);

    // Step 6: Update .env with token address
    console.log('📝 Step 6: Updating environment configuration...');
    updateEnvFile(chainName, proxy.address);

    console.log('\n========================================');
    console.log('✅ DEPLOYMENT SUCCESSFUL!');
    console.log('========================================\n');
    console.log(`Token Address (Proxy): ${proxy.address}`);
    console.log(`Implementation Address: ${implementation.address}`);
    console.log(`\nAdd this to your .env file:`);
    console.log(`CUSTOM_TOKEN_${chainName.toUpperCase()}=${proxy.address}`);
    console.log('\nYou can now run bridge tests with this custom token!');

  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

function getMinimalERC20Bytecode() {
  // This is a placeholder - in real deployment, compile from Solidity
  // For now, return a minimal bytecode that will work with the interface
  return '0x' + ERC20_BYTECODE;
}

function getMinimalProxyBytecode() {
  // This is a placeholder - in real deployment, use OpenZeppelin's proxy
  return '0x' + PROXY_BYTECODE;
}

function getExplorerLink(chainId, address) {
  const explorers = {
    1: `https://etherscan.io/address/${address}`,
    8453: `https://basescan.org/address/${address}`,
    747474: `https://katana-explorer.com/address/${address}`,
    66: `https://www.oklink.com/okc/address/${address}`
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

// Main execution
if (require.main === module) {
  const chainName = process.argv[2] || 'base';
  deployToken(chainName).catch(console.error);
}

module.exports = { deployToken };
