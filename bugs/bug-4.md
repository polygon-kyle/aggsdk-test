# Bug Report: Incorrect Assumption About Native Bridge Fallback for Unsupported Routes

**Date:** 2025-10-08
**Reporter:** Kyle
**Status:** Documentation Issue / Architectural Clarification

---

## Summary

The code contains an incorrect assumption that the Native Bridge will automatically take over routing when LiFi cannot support a particular token or route. This assumption is stated in the console output:

```javascript
console.log(`  ℹ️  Wrapped versions will be auto-resolved by SDK during tests, assuming the Native Bridge takes over the route if Lifi cannot support`);
```

However, this is **not how the system actually works**.

## The Actual Behavior

### How Route Selection Actually Works

The test suite's route selection logic (lines 280-400 in agglayer-bridge-test.js) follows this pattern:

1. **Try Core API (LiFi) first** - Calls `core.getRoutes()`
2. **If Core API fails** - Falls back to Native Bridge module
3. **Native Bridge builds transaction** - Uses `bridge.buildBridgeAsset()`

### The Problem

The Native Bridge fallback does **NOT** mean:
- ❌ "Native Bridge will handle any token LiFi can't support"
- ❌ "Wrapped tokens are automatically created via Native Bridge"
- ❌ "Any failed LiFi route can be completed via Native Bridge"

### What Actually Happens

**For tokens not supported by LiFi:**

1. **Base → Katana (ASTEST)**:
   - LiFi: ❌ No routes (ASTEST not in LiFi's token list for Base)
   - Native Bridge: ❌ ASTEST doesn't exist on Base yet
   - Result: **FAILED** - "Token address not resolved on base"

2. **Katana → OKX (ETH→WETH conversion):**
   - LiFi: ❌ No routes (possibly OKX not fully integrated)
   - Native Bridge: ❌ Execution reverted (bridge contract issue)
   - Result: **FAILED** - "Execution reverted for an unknown reason"

### When Native Bridge Fallback DOES Work

The Native Bridge fallback successfully handles cases where:
- ✅ LiFi doesn't have the route in its database
- ✅ BUT the Native Bridge contract supports it
- ✅ AND the token exists on both chains

**Example:** `WBTC: katana → ethereum`
- LiFi: ❌ No routes available
- Native Bridge: ✅ Succeeds (WBTC exists on both chains, contract supports it)

## Impact

**User Confusion:**
- The console message creates false expectations
- Users may think the Native Bridge will "rescue" any failed LiFi route
- Actual failures are surprising when they occur

**Test Design:**
- Test suite correctly implements try/fallback pattern
- But the assumption documented in the code comment is incorrect

## Root Cause

The confusion stems from two different concepts:

1. **Route Provider Selection** (Core API vs Native Bridge)
   - This IS a fallback mechanism
   - Works for routes that LiFi doesn't know about but Native Bridge supports

2. **Token Support** (whether a token exists and is bridgeable)
   - This is NOT a fallback mechanism
   - Both LiFi and Native Bridge require the token to exist on source chain
   - Both require the bridge contract to support that specific token/chain combination

## Recommended Fix

Update the console message to be more accurate:

```javascript
console.log(`  ℹ️  Wrapped versions will be auto-resolved by SDK during tests`);
console.log(`  ℹ️  Native Bridge may be used as fallback if LiFi routes unavailable`);
console.log(`  ⚠️  Note: Token must exist on source chain for either route to work`);
```

Or even simpler:

```javascript
console.log(`  ℹ️  Wrapped versions will be auto-resolved by SDK where supported`);
```

## Related Issues

- Bug-3: OKB bridging not supported (neither LiFi nor Native Bridge)
- Base → Katana (ASTEST) failure: Token doesn't exist on Base yet

## Technical Details

### Current Code (agglayer-bridge-test.js:198)

```javascript
console.log(`  ℹ️  Wrapped versions will be auto-resolved by SDK during tests, assuming the Native Bridge takes over the route if Lifi cannot support`);
```

### Why This is Misleading

The message implies:
- "If LiFi can't support it, Native Bridge will handle it" ❌

The reality is:
- "If LiFi doesn't have the route, we TRY Native Bridge, which may also fail" ✅

## Severity

**Low** - Documentation/clarity issue only. The code works correctly; only the explanation is misleading.

## Workaround

None needed - this is a documentation issue. The test suite already handles failures appropriately and reports them clearly.
