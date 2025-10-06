# Agglayer Bridge Test Suite

Comprehensive testing suite for the Agglayer SDK bridge functionality across Ethereum, Base, Katana, and OKX chains.

## 🎯 Overview

This test suite validates bridge operations between:
- **Base ↔ Katana**: ETH, WBTC, Custom ERC20 ($ASTEST)
- **Katana ↔ OKX**: ETH, OKB, WBTC
- **Katana ↔ Ethereum**: ETH, WBTC, Custom ERC20 ($ASTEST)


## ✨ Features
- ✅ Complete SDK integration with correct initialization
- ✅ Automatic wrapped token address resolution
- ✅ Token approval handling for ERC20 bridges
- ✅ Dry-run mode for safe testing
- ✅ Balance checking across all chains
- ✅ Transaction tracking and status monitoring
- ✅ Custom ERC20 deployment with upgradeable proxy
- ✅ Comprehensive test reporting with JSON export
- ✅ Gas estimation and slippage configuration

## 📋 Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Test wallet** with funds on all chains:
  - Ethereum: 0.1+ ETH, 0.005+ WBTC
  - Base: 0.1+ ETH, 0.005+ WBTC
  - Katana: 0.1+ ETH
  - OKX X Layer: 0.1+ ETH, 0.2+ OKB

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
# Copy the template
cp .env.template .env

# Edit .env and add your keys
nano .env  # or other editor
```

Required environment variables:
```env
TEST_WALLET_PRIVATE_KEY=0x...  # Your test wallet private key
```

### 3. Check Balances

Before running tests, verify your wallet has sufficient funds:

```bash
npm run check:balances
```

### 4. Run Tests

**Dry Run (Recommended First)**
```bash
npm run test:dry-run
```

**Live Tests (Real Transactions)**
```bash
npm test
```

## 📚 Available Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run full test suite with real transactions |
| `npm run test:dry-run` | Simulate tests without executing transactions |
| `npm run check:balances` | Check token balances across all chains |
| `npm run deploy:custom-token` | Deploy custom ERC20 on Base |
| `npm run deploy:custom-token:ethereum` | Deploy custom ERC20 on Ethereum |
| `npm run track:tx <hash> <chainId>` | Track bridge transaction status |

## 🔧 Configuration

### Environment Variables

See [.env.template](.env.template) for all available configuration options.

**Key Settings:**

```env
# Test amounts
TEST_ETH_AMOUNT=0.0005
TEST_WBTC_AMOUNT=0.00002
TEST_OKB_AMOUNT=0.01
TEST_CUSTOM_AMOUNT=10

# Bridge configuration
SLIPPAGE=0.5              # 0.5% slippage tolerance
GAS_MULTIPLIER=1.2        # 20% gas buffer
DRY_RUN=false             # Set to true for simulation only

# Custom RPC endpoints (optional)
ETHEREUM_RPC=https://...
BASE_RPC=https://...
KATANA_RPC=https://...
```

### Chain Configuration

Chains are configured in `agglayer-bridge-test.js`:

```javascript
const CHAINS = {
  ethereum: { chainId: 1, networkId: 0, rpc: 'https://mainnet.gateway.tenderly.co/...' },
  base: { chainId: 8453, networkId: 10, rpc: 'https://base.gateway.tenderly.co/...' },
  katana: { chainId: 747474, networkId: 8, rpc: 'https://katana.gateway.tenderly.co/...' },
  okx: { chainId: 66, networkId: 2, rpc: 'https://rpc.xlayer.tech' }
};
```

**Note**: Network IDs are Agglayer-specific identifiers (different from Chain IDs).

## 🪙 ASTEST Token Deployment

### Overview

**ASTEST** is anupgradeable ERC20 token deployed on **Katana**.

**Token Features:**
- ✅ **ERC1363** - Payable token with callback support
- ✅ **ERC20Burnable** - Token burning capability
- ✅ **ERC20Pausable** - Emergency pause/unpause
- ✅ **ERC20Permit** - Gasless approvals (EIP-2612)
- ✅ **Ownable** - Access control for admin functions
- ✅ **UUPS Upgradeable** - Gas-efficient upgradeability

**Token Details:**
- **Name**: ASTEST
- **Symbol**: AST
- **Decimals**: 18
- **Initial Supply**: 1,000,000,000 (1 billion tokens)
- **Origin Chain**: Katana

### Deployment Steps

**1. Install Dependencies**
```bash
npm install
```

Installs:
- `@openzeppelin/contracts` v5.4.0
- `@openzeppelin/contracts-upgradeable` v5.4.0
- `hardhat` v2.22.0
- Other required dependencies

**2. Compile Contracts**
```bash
npm run compile
```

This compiles `contracts/ASTEST.sol` and generates artifacts in `artifacts/`.

**3. Deploy to Katana**
```bash
npm run deploy:astest
```

The deployment script will:
1. ✅ Deploy UUPS implementation contract
2. ✅ Deploy ERC1967 proxy contract
3. ✅ Initialize with 1 billion tokens to your wallet
4. ✅ Save deployment info to `deployments/astest-katana.json`
5. ✅ Update `.env` with `CUSTOM_TOKEN_KATANA` address


### Upgrading ASTEST

To upgrade ASTEST to a new implementation:

**1. Deploy New Implementation:**
```bash
# Create contracts/ASTESTv2.sol with new features
# Then compile
npm run compile
```

**2. Upgrade via Script:**
```javascript
const { ethers } = require('hardhat');

async function upgrade() {
  const [owner] = await ethers.getSigners();
  const proxyAddress = '0x...'; // Your Katana proxy address

  // Deploy new implementation
  const ASTESTv2 = await ethers.getContractFactory('ASTESTv2');
  const newImpl = await ASTESTv2.deploy();
  await newImpl.deployed();

  // Upgrade proxy
  const astest = await ethers.getContractAt('ASTEST', proxyAddress);
  await astest.upgradeTo(newImpl.address);

  console.log('Upgraded to:', newImpl.address);
}
```

**3. Verify Upgrade:**
```bash
npm run check:balances
# Balances should remain unchanged
```

## 🧪 Test Scenarios

The test suite covers 18 scenarios:

### Base ↔ Katana (6 tests)
- ✅ ETH: Base → Katana
- ✅ ETH: Katana → Base
- ✅ WBTC: Base → Katana
- ✅ WBTC: Katana → Base
- ✅ ASTEST: Katana → Base (creates wrapped ASTEST on Base)
- ✅ ASTEST: Base → Katana (burns wrapped, returns original)

### Katana ↔ OKX (6 tests)
- ✅ ETH: Katana → OKX
- ✅ ETH: OKX → Katana
- ✅ OKB: Katana → OKX
- ✅ OKB: OKX → Katana
- ✅ WBTC: Katana → OKX
- ✅ WBTC: OKX → Katana

### Katana ↔ Ethereum (6 tests)
- ✅ ETH: Katana → Ethereum
- ✅ ETH: Ethereum → Katana
- ✅ WBTC: Katana → Ethereum
- ✅ WBTC: Ethereum → Katana
- ✅ ASTEST: Katana → Ethereum (creates wrapped ASTEST on Ethereum)
- ✅ ASTEST: Ethereum → Katana (burns wrapped, returns original)

## 📊 Test Reports

Test results are automatically saved to `test-results/`

## 🔍 Tracking Transactions

Track the status of a bridge transaction:

```bash
# With chain ID
npm run track:tx 0x1234... 8453

# Auto-detect chain
npm run track:tx 0x1234...

# Watch mode (continuous polling)
npm run track:tx 0x1234... 8453 --watch
```

## 🏗️ Project Structure

```
agglayer-bridge-tests/
├── agglayer-bridge-test.js   # Main test suite
├── scripts/
│   ├── deploy-custom-token.js   # ERC20 deployment
│   ├── check-balances.js        # Balance checker
│   └── track-transaction.js     # TX tracker
├── deployments/              # Deployment records
├── test-results/             # Test reports (JSON)
├── .env.template             # Environment template
├── .env                      # Your config (gitignored)
├── package.json
└── README.md
```

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details