/**
 * Security utilities for sanitizing user-controlled data from NFT metadata
 * to prevent XSS attacks and malicious code injection.
 */

import { logger } from './logger';

/**
 * Sanitize text content to prevent HTML/JavaScript injection
 * Removes all HTML tags and dangerous characters
 */
export function sanitizeText(text: string | null | undefined): string {
  if (!text || typeof text !== 'string') return '';
  
  // Remove null bytes and control characters
  let sanitized = text.replace(/[\x00-\x1F\x7F]/g, '');
  
  // Escape HTML entities
  const div = document.createElement('div');
  div.textContent = sanitized;
  sanitized = div.innerHTML;
  
  // Additional safety: remove any remaining script-like patterns
  sanitized = sanitized
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/<script/gi, '')
    .replace(/<\/script>/gi, '')
    .replace(/<iframe/gi, '')
    .replace(/<object/gi, '')
    .replace(/<embed/gi, '');
  
  return sanitized;
}

/**
 * Validate and sanitize URLs to prevent javascript: and other dangerous protocols
 * Returns null if URL is invalid or dangerous
 */
export function sanitizeUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  
  // Remove whitespace
  url = url.trim();
  
  if (url.length === 0) return null;
  
  // Block dangerous protocols
  const lowerUrl = url.toLowerCase();
  const dangerousProtocols = [
    'javascript:',
    'vbscript:',
    'data:text/html',
    'data:application/javascript',
    'data:application/x-javascript',
    'data:application/ecmascript',
  ];
  
  for (const protocol of dangerousProtocols) {
    if (lowerUrl.startsWith(protocol)) {
      logger.warn('Blocked dangerous URL protocol:', url);
      return null;
    }
  }
  
  // Allow safe protocols
  const safeProtocols = [
    'http://',
    'https://',
    'ipfs://',
    'ar://',
    'data:image/', // Only allow image data URIs
  ];
  
  const isSafe = safeProtocols.some(protocol => lowerUrl.startsWith(protocol));
  
  if (!isSafe) {
    // If no protocol, assume it's a relative path or IPFS hash
    // Allow more characters for valid URLs (query params, fragments, etc.)
    // But still block obvious script injection attempts
    if (/^[a-zA-Z0-9\/\.\-_?#=&%:]+$/.test(url) && !lowerUrl.includes('javascript') && !lowerUrl.includes('<script')) {
      return url;
    }
    logger.warn('Blocked potentially unsafe URL:', url);
    return null;
  }
  
  // Validate data:image URIs more strictly
  if (lowerUrl.startsWith('data:image/')) {
    // Only allow common image MIME types
    const validImageTypes = [
      'data:image/png',
      'data:image/jpeg',
      'data:image/jpg',
      'data:image/gif',
      'data:image/webp',
      'data:image/svg+xml',
      'data:image/bmp',
      'data:image/avif',
    ];
    
    const isValidImageType = validImageTypes.some(type => lowerUrl.startsWith(type));
    if (!isValidImageType) {
      logger.warn('Blocked non-image data URI:', url);
      return null;
    }
    
    // Check for base64 encoding (data URIs should be base64)
    if (!lowerUrl.includes(';base64,')) {
      // SVG can be inline, but we'll be cautious
      if (!lowerUrl.startsWith('data:image/svg+xml')) {
        logger.warn('Blocked non-base64 data URI:', url);
        return null;
      }
    }
  }
  
  return url;
}

/**
 * Sanitize image URL specifically - more restrictive than general URL sanitization
 */
export function sanitizeImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') {
    logger.log('sanitizeImageUrl: null or not string', url);
    return null;
  }
  
  logger.log('sanitizeImageUrl input:', url);
  
  // Handle IPFS and Arweave first (before general sanitization)
  if (url.startsWith('ipfs://')) {
    const hash = url.slice(7);
    if (hash.length > 0 && hash.length < 200 && !hash.includes('<') && !hash.includes('>')) {
      const resolved = `https://cloudflare-ipfs.com/ipfs/${hash}`;
      logger.log('sanitizeImageUrl: resolved IPFS to', resolved);
      return resolved;
    }
    logger.warn('sanitizeImageUrl: Invalid IPFS hash');
    return null;
  }
  
  if (url.startsWith('ar://')) {
    const txId = url.slice(5);
    if (txId.length > 0 && txId.length < 200 && /^[a-zA-Z0-9_-]+$/.test(txId)) {
      const resolved = `https://arweave.net/${txId}`;
      logger.log('sanitizeImageUrl: resolved Arweave to', resolved);
      return resolved;
    }
    logger.warn('sanitizeImageUrl: Invalid Arweave tx ID');
    return null;
  }
  
  const sanitized = sanitizeUrl(url);
  logger.log('sanitizeImageUrl: sanitizeUrl returned', sanitized);
  
  if (!sanitized) {
    // Fallback: if it's already HTTP/HTTPS, allow it with basic check
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const lowerUrl = url.toLowerCase();
      if (!lowerUrl.includes('javascript:') && !lowerUrl.includes('<script')) {
        logger.log('sanitizeImageUrl: allowing HTTP/HTTPS URL after basic check', url);
        return url;
      }
    }
    logger.warn('sanitizeImageUrl: URL blocked', url);
    return null;
  }
  
  const lowerUrl = sanitized.toLowerCase();
  
  // Only allow image-related protocols and IPFS/Arweave
  const allowedForImages = [
    'http://',
    'https://',
    'ipfs://',
    'ar://',
    'data:image/',
  ];
  
  const isAllowed = allowedForImages.some(protocol => lowerUrl.startsWith(protocol));
  
  if (!isAllowed) {
    logger.warn('sanitizeImageUrl: Blocked non-image URL:', sanitized);
    return null;
  }
  
  logger.log('sanitizeImageUrl: returning', sanitized);
  return sanitized;
}

/**
 * Sanitize JSON parsing to prevent prototype pollution and other attacks
 */
export function safeJsonParse<T = unknown>(jsonString: string): T | null {
  try {
    // Remove potential prototype pollution attempts
    if (jsonString.includes('__proto__') || 
        jsonString.includes('constructor') ||
        jsonString.includes('prototype')) {
      logger.warn('Blocked potentially malicious JSON with prototype pollution attempt');
      return null;
    }
    
    const parsed = JSON.parse(jsonString);
    
    // Additional check: ensure it's a plain object/array, not a function or other dangerous type
    if (typeof parsed === 'function' || typeof parsed === 'symbol') {
      logger.warn('Blocked dangerous JSON type');
      return null;
    }
    
    return parsed as T;
  } catch (err) {
    logger.error('JSON parse error:', err);
    return null;
  }
}

/**
 * Validate that a string is a valid base64 string
 */
export function isValidBase64(str: string): boolean {
  try {
    // Remove data URI prefix if present
    const base64Part = str.includes(',') ? str.split(',')[1] : str;
    
    // Check if it's valid base64
    const decoded = atob(base64Part);
    // Try to re-encode to verify
    const reencoded = btoa(decoded);
    return reencoded === base64Part;
  } catch {
    return false;
  }
}

/**
 * Sanitize object keys to prevent prototype pollution
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const sanitized = {} as T;
  
  for (const [key, value] of Object.entries(obj)) {
    // Block dangerous keys
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      logger.warn('Blocked dangerous object key:', key);
      continue;
    }
    
    // Recursively sanitize nested objects
    if (value && typeof value === 'object' && !Array.isArray(value) && value !== null) {
      sanitized[key as keyof T] = sanitizeObject(value as Record<string, unknown>) as T[keyof T];
    } else {
      sanitized[key as keyof T] = value as T[keyof T];
    }
  }
  
  return sanitized;
}

/**
 * Truncate text to a safe maximum length to prevent DoS
 */
export function truncateText(text: string | null | undefined, maxLength: number = 10000): string {
  if (!text || typeof text !== 'string') return '';
  
  if (text.length > maxLength) {
    logger.warn('Truncated text exceeding max length:', text.length);
    return text.slice(0, maxLength) + '...';
  }
  
  return text;
}

