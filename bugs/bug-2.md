# Issue Report: SDK Returns Numeric String for Nonce Instead of Hex (Ethers v5 Incompatibility)

**Date:** 2025-10-07
**Reporter:** Bridge Test Suite
**Issue Type:** SDK Compatibility Bug
**Severity:** High
**Status:** Open

## Summary

The Agglayer SDK returns transaction objects with `nonce` as a numeric string (e.g., `"46247"`) instead of a hex-encoded string (e.g., `"0xb497"`), causing compatibility issues with ethers.js v5 which requires hex-encoded values.

## Impact

Transactions on **OKX X Layer (Chain ID 196)** fail with:
```
invalid hexlify value (argument="value", value="46247", code=INVALID_ARGUMENT, version=bytes/5.8.0)
```

This affects:
- All token approval transactions on OKX
- All bridge transactions from OKX
- Specifically blocks OKX → Katana transfers

## Reproduction

### Environment
- **SDK Version:** `@agglayer/sdk@beta`
- **Ethers Version:** `ethers@5.7.2`
- **Chain:** OKX X Layer (Chain ID: 196)
- **Node Version:** v18+

### Steps to Reproduce

1. Initialize SDK with Native Bridge mode for OKX:
```javascript
const sdk = new AggLayerSDK({
  mode: [SDK_MODES.NATIVE],
  native: {
    chains: [{
      chainId: 196,
      networkId: 2,
      name: 'OKX X Layer',
      rpcUrl: 'https://rpc.xlayer.tech',
      bridgeAddress: '0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe'
    }]
  }
});
```

2. Build an approval transaction on OKX:
```javascript
const erc20 = sdk.getNative().erc20(wethAddress, 196);
const approveTx = await erc20.buildApprove(spender, amount, from);
// approveTx has { nonce: "46247", ... } instead of { nonce: "0xb497", ... }
```

3. Attempt to send with ethers v5:
```javascript
const wallet = new ethers.Wallet(privateKey, provider);
await wallet.sendTransaction(approveTx);
// Error: invalid hexlify value
```

## Error Examples from Live Tests

### Error 1: ETH Approval on OKX
```
invalid hexlify value (argument="value", value="46247",
code=INVALID_ARGUMENT, version=bytes/5.8.0)

Transaction: ETH: okx → katana
FromChain: okx
```

### Error 2: WBTC Approval on OKX
```
invalid hexlify value (argument="value", value="46199",
code=INVALID_ARGUMENT, version=bytes/5.8.0)

Transaction: WBTC: okx → katana
FromChain: okx
```

## Affected Transaction Fields

The issue specifically affects the `nonce` field in transaction objects:

**What SDK Returns:**
```json
{
  "from": "0x6797099E7dA33089cAedD8dB72f4b27a96347517",
  "to": "0x5a77f1443d16ee5761d310e38b62f77f726bc71c",
  "data": "0x095ea7b3...",
  "gasLimit": "46247",
  "nonce": "46247"  ❌ Should be hex: "0xb497"
}
```

**What Ethers v5 Expects:**
```json
{
  "from": "0x6797099E7dA33089cAedD8dB72f4b27a96347517",
  "to": "0x5a77f1443d16ee5761d310e38b62f77f726bc71c",
  "data": "0x095ea7b3...",
  "gasLimit": "46247",
  "nonce": "0xb497"  ✅ Hex-encoded string
}
```

## Why Only OKX?

This issue appears to be **OKX-chain specific**. Transactions on other chains (Base, Katana, Ethereum) work correctly, suggesting:
- Different RPC response format from OKX nodes
- SDK may be using different code paths for OKX
- Possible difference in how viem handles OKX chain internally

## Root Cause

The SDK is likely:
1. Fetching nonce from OKX RPC (returns numeric value)
2. Converting to string but not hex-encoding: `nonce.toString()` instead of `ethers.utils.hexValue(nonce)`
3. Returning the decimal string in transaction objects

Ethers v5 requires all numeric transaction fields to be hex-encoded strings with `0x` prefix.

## Related to Bug #1

This is similar to `bug-1.md` (gas/gasLimit issue) - both are SDK compatibility issues with ethers.js v5:
- **Bug #1**: Field name incompatibility (`gas` vs `gasLimit`)
- **Issue #2**: Field value format incompatibility (decimal string vs hex string)

## Workaround

Convert nonce to hex before sending:

```javascript
// WORKAROUND: Convert numeric string nonce to hex
if (unsignedTx.nonce && typeof unsignedTx.nonce === 'string' && !unsignedTx.nonce.startsWith('0x')) {
  unsignedTx.nonce = ethers.utils.hexValue(parseInt(unsignedTx.nonce));
}

// Now safe to send with ethers v5
await wallet.sendTransaction(unsignedTx);
```

Applied in our test suite at:
- `agglayer-bridge-test.js:496-499` (approval transactions)
- `agglayer-bridge-test.js:393-396` (bridge transactions)

## Recommended Fix

The SDK should hex-encode all numeric transaction fields:

```typescript
function buildTransaction(...): UnsignedTransaction {
  const tx = {
    // ... build transaction
  };

  // Ensure ethers v5 compatibility - hex encode numeric fields
  if (tx.nonce !== undefined) {
    tx.nonce = ethers.utils.hexValue(tx.nonce);
  }
  if (tx.gasLimit !== undefined) {
    tx.gasLimit = ethers.utils.hexValue(tx.gasLimit);
  }
  if (tx.gasPrice !== undefined) {
    tx.gasPrice = ethers.utils.hexValue(tx.gasPrice);
  }
  if (tx.value !== undefined) {
    tx.value = ethers.utils.hexValue(tx.value);
  }

  return tx;
}
```

Or use ethers' built-in transaction serialization:
```typescript
import { Transaction } from '@ethersproject/transactions';

function buildTransaction(...): UnsignedTransaction {
  const tx = { /* ... */ };

  // This automatically formats all fields correctly
  return Transaction.from(tx);
}
```

## Test Results

### Affected Tests (2 failures on OKX)
- ❌ ETH: okx → katana - `invalid hexlify value: "46247"`
- ❌ WBTC: okx → katana - `invalid hexlify value: "46199"`

### Working Tests (Other Chains)
- ✅ Base, Katana, Ethereum - All work correctly with current SDK

## Additional Notes

### OKX ETH Bridging Clarification
For **ETH on OKX X Layer**, the native token is actually **WETH** (Wrapped ETH) at address:
```
0x5a77f1443d16ee5761d310e38b62f77f726bc71c
```

When bridging "ETH" from OKX, the test should:
1. Use WETH token address (not AddressZero)
2. Approve WETH for bridge contract
3. Bridge WETH token (not native ETH)

This is a **test configuration issue**, not an SDK bug. The token configuration should reflect:

```javascript
ETH: {
  okx: {
    address: '0x5a77f1443d16ee5761d310e38b62f77f726bc71c',
    symbol: 'WETH',
    decimals: 18,
    isNative: false  // Should be false, not native token
  }
}
```

Current test incorrectly treats it as native ETH, causing approval to be skipped when it should be required.

## Impact Assessment

**Blocking:**
- All OKX → Katana bridges (ETH, WBTC, OKB)
- Any OKX outbound transactions using Native Bridge

**Not Blocking:**
- Core API routes (they don't use Native Bridge approval flow)
- Other chains (Base, Ethereum, Katana) work correctly

## Priority

**High** - This blocks an entire chain (OKX X Layer) from working with the Native Bridge module when using ethers v5.
