# Security Measures for NFT Data Sanitization

This document outlines the security measures implemented to prevent XSS (Cross-Site Scripting) attacks and malicious code injection from NFT metadata.

## Overview

All NFT metadata fetched from on-chain contracts and external sources is sanitized before being displayed in the UI to prevent:
- HTML/JavaScript injection attacks
- XSS via malicious metadata
- Prototype pollution attacks
- Dangerous URL protocols (javascript:, data: with malicious content)
- DoS attacks via oversized payloads

## Security Layers

### 1. Text Content Sanitization

**Location**: `src/utils/sanitize.ts` → `sanitizeText()`

**Protection**:
- Removes null bytes and control characters
- Escapes HTML entities using DOM textContent
- Strips script-like patterns (`<script>`, `javascript:`, `on*=` event handlers)
- Removes dangerous HTML tags (`<iframe>`, `<object>`, `<embed>`)

**Applied to**:
- NFT names (`metadata.nftName`, `metadata.name`)
- NFT descriptions (`metadata.nftDescription`)
- Token symbols (`metadata.symbol`)
- Token IDs
- Collection names

### 2. URL Sanitization

**Location**: `src/utils/sanitize.ts` → `sanitizeUrl()`, `sanitizeImageUrl()`

**Protection**:
- Blocks dangerous protocols: `javascript:`, `vbscript:`, `data:text/html`, `data:application/javascript`
- Only allows safe protocols: `http://`, `https://`, `ipfs://`, `ar://`, `data:image/`
- Validates data URI MIME types (only allows image types)
- Validates IPFS hashes and Arweave transaction IDs format
- Returns `null` for invalid/dangerous URLs (prevents rendering)

**Applied to**:
- Image URLs (`metadata.imageUrl`)
- Token URIs (`metadata.tokenURI`)
- Links in modals and components

### 3. Image URL Validation

**Location**: `src/utils/sanitize.ts` → `sanitizeImageUrl()`

**Additional Protection**:
- More restrictive than general URL sanitization
- Only allows image-related protocols
- Validates data URI image MIME types strictly
- Ensures base64 encoding for data URIs (except SVG)

**Applied to**:
- All `<img src="">` attributes
- Image links in NFT modals

### 4. JSON Parsing Security

**Location**: `src/utils/sanitize.ts` → `safeJsonParse()`, `sanitizeObject()`

**Protection**:
- Blocks prototype pollution attempts (`__proto__`, `constructor`, `prototype` keys)
- Prevents function/symbol types in parsed JSON
- Recursively sanitizes nested objects
- Size limits (1MB max) to prevent DoS

**Applied to**:
- NFT metadata JSON from `tokenURI`
- Base64-encoded JSON in data URIs
- URL-encoded JSON in data URIs

### 5. Size Limits

**Location**: `src/utils/sanitize.ts` → `truncateText()`, size checks in JSON parsing

**Protection**:
- Text content: 10,000 characters max (configurable)
- JSON responses: 1MB max
- Base64 data URIs: 1MB max
- Token URIs: 2,000 characters max

**Prevents**: DoS attacks via oversized payloads

## Implementation Details

### Components Updated

1. **`useTokenMetadata.ts`**
   - Sanitizes all metadata fields when fetched
   - Sanitizes JSON parsing
   - Validates image URLs before storing

2. **`NFTModal.tsx`**
   - Sanitizes all text content before rendering
   - Validates image URLs before setting `src`
   - Sanitizes URLs in links
   - Uses `crossOrigin="anonymous"` for images

3. **`TokenInfo.tsx`**
   - Sanitizes token names, symbols, NFT names
   - Validates URLs before creating links
   - Sanitizes all displayed text

4. **`CreateSwap.tsx`**
   - Sanitizes token symbols in labels

### Security Best Practices

1. **Defense in Depth**: Multiple layers of validation
2. **Fail Secure**: Invalid data returns `null` or empty string, never renders
3. **Whitelist Approach**: Only allow known-safe protocols and formats
4. **Input Validation**: Validate at fetch time, not just display time
5. **Output Encoding**: Always sanitize before rendering, even if data was sanitized earlier

## Testing Recommendations

To verify security measures:

1. **XSS Test**: Try NFT with metadata containing:
   ```json
   {
     "name": "<script>alert('XSS')</script>",
     "description": "javascript:alert('XSS')",
     "image": "javascript:alert('XSS')"
   }
   ```
   Expected: All dangerous content should be stripped/escaped

2. **Prototype Pollution Test**: Try metadata with:
   ```json
   {
     "__proto__": {"isAdmin": true},
     "constructor": {"prototype": {}}
   }
   ```
   Expected: Dangerous keys should be blocked

3. **URL Protocol Test**: Try image URL:
   - `javascript:alert('XSS')` → Should be blocked
   - `data:text/html,<script>alert('XSS')</script>` → Should be blocked
   - `data:image/png;base64,...` → Should be allowed

4. **Size Limit Test**: Try extremely large metadata
   Expected: Should be truncated or rejected

## Additional Security Considerations

1. **Content Security Policy (CSP)**: Consider adding CSP headers to further restrict script execution
2. **Subresource Integrity**: For external images, consider SRI where possible
3. **Rate Limiting**: Consider rate limiting metadata fetches to prevent abuse
4. **CORS**: External metadata fetches respect CORS; images loaded via `<img>` tag bypass CORS but are still sanitized

## Compliance

These measures align with:
- OWASP Top 10 (A03:2021 - Injection)
- OWASP XSS Prevention Cheat Sheet
- React Security Best Practices

