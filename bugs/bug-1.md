# Bug Report: SDK Returns `gas` Instead of `gasLimit` (Ethers v5 Incompatibility)

**Date:** 2025-10-07
**Reporter:** Bridge Test Suite
**Severity:** High
**Status:** Open

## Summary

The Agglayer SDK returns transaction objects with the field `gas` instead of `gasLimit`, causing compatibility issues with ethers.js v5 which expects `gasLimit`.

## Impact

All transactions built by the SDK's Native Bridge module fail with the error:
```
invalid transaction key: gas (argument="transaction", code=INVALID_ARGUMENT, version=abstract-signer/5.8.0)
```

This affects:
- Token approval transactions via `erc20.buildApprove()`
- Bridge transactions via `bridge.buildBridgeAsset()`
- All Native Bridge operations

## Reproduction

### Environment
- **SDK Version:** `@agglayer/sdk@beta`
- **Ethers Version:** `ethers@5.7.2`
- **Node Version:** v18+

### Steps to Reproduce

1. Initialize SDK with Native Bridge mode:
```javascript
const sdk = new AggLayerSDK({
  mode: [SDK_MODES.NATIVE],
  native: { chains: [...] }
});
```

2. Build an approval transaction:
```javascript
const erc20 = sdk.getNative().erc20(tokenAddress, chainId);
const approveTx = await erc20.buildApprove(spender, amount, from);
// approveTx has { gas: "46247", ... } instead of { gasLimit: "46247", ... }
```

3. Attempt to send with ethers v5:
```javascript
const wallet = new ethers.Wallet(privateKey, provider);
await wallet.sendTransaction(approveTx);
// Error: invalid transaction key: gas
```

### Example Transaction Object from SDK

**What SDK Returns:**
```json
{
  "from": "0x6797099E7dA33089cAedD8dB72f4b27a96347517",
  "to": "0x5a77f1443d16ee5761d310e38b62f77f726bc71c",
  "data": "0x095ea7b3...",
  "gas": "46247",  ❌ Invalid for ethers v5
  "nonce": "0x0"
}
```

**What Ethers v5 Expects:**
```json
{
  "from": "0x6797099E7dA33089cAedD8dB72f4b27a96347517",
  "to": "0x5a77f1443d16ee5761d310e38b62f77f726bc71c",
  "data": "0x095ea7b3...",
  "gasLimit": "46247",  ✅ Correct field name
  "nonce": "0x0"
}
```

## Affected SDK Methods

1. **Native Bridge - ERC20:**
   - `erc20.buildApprove()`

2. **Native Bridge - Bridge Contract:**
   - `bridge.buildBridgeAsset()`

3. **Potentially others** - Any method that returns unsigned transactions

## Error Examples from Live Tests

### Error 1: Token Approval on OKX
```
invalid transaction key: gas (argument="transaction",
value={"from":"0x6797...","to":"0x5a77...","data":"0x095ea7b3...","gas":"46247","nonce":"0x0"},
code=INVALID_ARGUMENT, version=abstract-signer/5.8.0)
```

### Error 2: Token Approval on Katana
```
invalid transaction key: gas (argument="transaction",
value={"from":"0x6797...","to":"0x0913...","data":"0x095ea7b3...","gas":"55774","nonce":"0x5"},
code=INVALID_ARGUMENT, version=abstract-signer/5.8.0)
```

### Error 3: Token Approval on Ethereum
```
invalid transaction key: gas (argument="transaction",
value={"from":"0x6797...","to":"0x2260...","data":"0x095ea7b3...","gas":"48296","nonce":"0xe"},
code=INVALID_ARGUMENT, version=abstract-signer/5.8.0)
```

## Root Cause

The SDK is using viem internally (v2.37.13), which uses `gas` as the field name. However, when returning transaction objects for external use with ethers.js, the SDK should convert `gas` → `gasLimit` for compatibility.

## Workaround

Add this conversion before sending transactions:

```javascript
// WORKAROUND: SDK returns "gas" but ethers v5 expects "gasLimit"
if (unsignedTx.gas && !unsignedTx.gasLimit) {
  unsignedTx.gasLimit = unsignedTx.gas;
  delete unsignedTx.gas;
}

// Now safe to send with ethers v5
await wallet.sendTransaction(unsignedTx);
```

Applied in our test suite at:
- `agglayer-bridge-test.js:478-482` (approval transactions)
- `agglayer-bridge-test.js:381-385` (bridge transactions)

## Recommended Fix

The SDK should either:

**Option 1: Return ethers-compatible format**
```typescript
// In SDK's transaction builder methods
function buildTransaction(...): UnsignedTransaction {
  const tx = {
    // ... build with viem
  };

  // Convert for ethers compatibility
  if (tx.gas) {
    tx.gasLimit = tx.gas;
    delete tx.gas;
  }

  return tx;
}
```

**Option 2: Document the format and provide converter**
```typescript
// Export utility
export function toEthersTransaction(viemTx) {
  const ethersTx = { ...viemTx };
  if (ethersTx.gas) {
    ethersTx.gasLimit = ethersTx.gas;
    delete ethersTx.gas;
  }
  return ethersTx;
}
```

**Option 3: Support ethers v6**
Update documentation to specify ethers v6 compatibility (which uses `gasLimit`), or support both v5 and v6.

## Test Results

### Before Workaround
- ❌ 15/18 tests failed with `invalid transaction key: gas` errors
- ✅ 3/18 tests succeeded (ETH via Core API - doesn't trigger approvals)

### After Workaround
- Expected: Most approval-related errors should be resolved
- Still may have Native Bridge execution reverts (separate issue)

## Related Issues

- Native bridge execution reverts for certain chain pairs (separate issue - bridge contract configuration)
- Missing approval addresses in some Core API routes (separate issue - API response)

## Additional Context

This issue blocks all Native Bridge functionality in production environments using ethers v5, which is still widely used in the ecosystem.
