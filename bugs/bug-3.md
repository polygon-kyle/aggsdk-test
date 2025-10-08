# Bug Report: No Route Available for OKB Token Bridging (OKX → Katana)

**Date:** 2025-10-07
**Reporter:** Bridge Test Suite
**Severity:** Medium
**Status:** Open
**Type:** Missing Route / Unsupported Token Pair

## Summary

The Agglayer SDK's Core API returns "No routes available" when attempting to bridge OKB token from OKX X Layer to Katana. The Native Bridge module also fails with an execution revert, indicating that OKB bridging to Katana is not currently supported by the bridge infrastructure.

## Impact

- Users cannot bridge OKB (OKX's native token) from OKX X Layer to Katana
- This limits cross-chain liquidity for OKB token
- Affects use cases that require OKB on Katana chain

## Reproduction

### Environment
- **SDK Version:** `@agglayer/sdk@beta`
- **Chains:** OKX X Layer (Chain ID: 196) → Katana (Chain ID: 747474)
- **Token:** OKB (Native token on OKX, needs wrapping on Katana)

### Steps to Reproduce

1. Initialize SDK with both Core API and Native Bridge modes:
```javascript
const sdk = new AggLayerSDK({
  mode: [SDK_MODES.CORE, SDK_MODES.NATIVE],
  core: { apiBaseUrl: 'https://arc-api.polygon.technology' },
  native: { chains: [/* OKX and Katana configs */] }
});
```

2. Attempt to get routes for OKB bridging:
```javascript
const routes = await sdk.getCore().getRoutes({
  fromChainId: 196,  // OKX X Layer
  toChainId: 747474, // Katana
  fromTokenAddress: '0x0000000000000000000000000000000000000000', // OKB native
  toTokenAddress: '0x0000000000000000000000000000000000000000',   // Not deployed on Katana
  amount: '1000000000000000',
  fromAddress: walletAddress,
  slippage: 0.5
});
// Result: routes = [] (empty array)
```

3. Fallback to Native Bridge:
```javascript
const bridge = sdk.getNative().bridge(bridgeAddress, 196);
const tx = await bridge.buildBridgeAsset({
  destinationNetwork: 20,  // Katana network ID
  destinationAddress: walletAddress,
  amount: '1000000000000000',
  token: '0x0000000000000000000000000000000000000000',
  forceUpdateGlobalExitRoot: true
}, walletAddress);
// Result: Gas estimation fails with "Execution reverted"
```

## Error Messages

### Core API Response
```
⚠️  Core API failed: No routes available - OKB may not be supported for bridging to katana
```

### Native Bridge Response
```
Execution reverted for an unknown reason.

Estimate Gas Arguments:
  from:  0x6797099E7dA33089cAedD8dB72f4b27a96347517
  to:    0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe
  data:  0xcd58657900000000000000000000000000000000000000000000000000000000000000140000000000000000000000006797099e7da33089caedd8db72f4b27a96347517...

Details: execution reverted
Version: viem@2.37.13
```

## Token Configuration

### OKB on OKX X Layer
- **Address:** `0x0000000000000000000000000000000000000000` (native token)
- **Symbol:** OKB
- **Decimals:** 18
- **Is Native:** true

### OKB on Katana
- **Address:** Not deployed / Not configured
- **Status:** Would need to be created as wrapped token

### OKB on Ethereum (for reference)
- **Address:** `0x75231F58b43240C9718Dd58B4967c5114342a86c`
- **Symbol:** OKB
- **Decimals:** 18
- **Is Native:** false

## Root Cause Analysis

The issue appears to be that OKB bridging routes are not configured in the bridge infrastructure:

1. **Core API:** No third-party bridge providers (LiFi, etc.) support OKB → Katana routes
2. **Native Bridge:** The bridge contract on OKX rejects OKB bridging to Katana network ID (20)
3. **Token Mapping:** OKB may not be registered in the bridge's token mapping for Katana

This is likely because:
- OKB is a relatively chain-specific token (OKX's native token)
- Katana may not have sufficient liquidity/demand for OKB
- Bridge contracts may need explicit configuration to support new token pairs

## Test Results

### Test: OKB: okx → katana
- **Status:** FAILED
- **Method Attempted:** Core API → Native Bridge (both failed)
- **Error:** Execution reverted

### Related Successful Tests
- ✅ WETH: okx → katana (works)
- ✅ WBTC: okx → katana (works)

This indicates the issue is specific to OKB token, not OKX chain connectivity.

## Possible Solutions

### Option 1: Add OKB to Bridge Token Whitelist
Configure the bridge contract to support OKB bridging:
```solidity
// Bridge contract configuration needed
function addTokenMapping(
  address originToken,      // OKB on OKX: 0x0000...
  uint32 destinationNetwork, // Katana: 20
  address wrappedToken       // Deploy wrapped OKB on Katana
) external onlyOwner;
```

### Option 2: Deploy Wrapped OKB on Katana
1. Deploy a wrapped OKB token contract on Katana
2. Configure bridge mapping for OKB → wrapped OKB
3. Add liquidity for wrapped OKB on Katana

### Option 3: Third-Party Bridge Integration
Work with bridge aggregators (LiFi, etc.) to add OKB → Katana routes if there's demand.

## Workaround

**Current Status:** No workaround available. Users cannot bridge OKB to Katana.

**Alternative:** Users can:
1. Swap OKB → WETH or WBTC on OKX
2. Bridge WETH/WBTC to Katana (these work)
3. Swap back to desired token on Katana (if needed)

## Recommended Action

**For SDK Team:**
- Document which token pairs are supported for each chain
- Provide clearer error messages indicating unsupported token pairs
- Consider adding a `getSupportedTokens(fromChainId, toChainId)` method

**For Bridge Infrastructure Team:**
- Evaluate demand for OKB bridging to Katana
- If warranted, configure bridge contracts to support OKB
- Deploy wrapped OKB contract on Katana

## Related Issues

- Similar to how ASTEST (custom token) needed explicit deployment before bridging
- Unlike WETH/WBTC which have established bridge routes
- May affect other chain-specific native tokens (e.g., BNB, MATIC, etc.)

## Test Code Reference

Test was commented out in `agglayer-bridge-test.js` at lines 661-663:
```javascript
// COMMENTED: OKB bridging not supported - no route available (see bug-3.md)
// { from: 'okx', to: 'katana', token: 'OKB', direction: 'OKX→Katana (creates wrapped)' },
```

## Additional Context

This is a **feature gap**, not a bug in the SDK code itself. The SDK correctly reports "No routes available" which is accurate given the current bridge configuration. The issue requires bridge infrastructure changes to resolve.
