import logger from './logger.js';
import { usesServerAuth } from './auth-mode.js';

/**
 * Local Storage Utilities
 * Handles saving/loading credentials with AES-GCM encryption via Web Crypto API
 */

const STORAGE_KEY = 'jira-planner-credentials';

/**
 * Derive an AES-GCM encryption key from domain+email using a per-stored salt
 * The salt is stored alongside the encrypted data (not secret, prevents key reuse)
 */
async function deriveKey(domain, email, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = encoder.encode(`${domain}:${email}`);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    keyMaterial,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt and save credentials to localStorage.
 *
 * NOTE: the AES-GCM key is derived from domain+email, neither of which is
 * secret, so this is obfuscation rather than encryption — it stops casual
 * reading of localStorage, not an attacker with access to the machine or an
 * XSS. Set VITE_AUTH_MODE=proxy to keep tokens out of the browser entirely.
 */
export async function saveCredentials({ domain, email, token }) {
  // Under server auth the proxy owns the credential. Writing one here would
  // put a token back in the browser — the exact thing that mode exists to
  // prevent — so refuse rather than silently storing it.
  if (usesServerAuth()) {
    logger.warn('[Storage] Ignoring credential write: the proxy holds the credential');
    return false;
  }

  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(domain, email, salt);
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(token)
    );

    const payload = {
      domain,
      email,
      salt: Array.from(salt),
      iv: Array.from(iv),
      token: Array.from(new Uint8Array(encrypted))
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (error) {
    logger.error('Failed to save credentials:', error);
    if (error.name === 'QuotaExceededError') {
      alert('Storage full. Please clear browser data or use session mode.');
    } else if (error.name === 'SecurityError') {
      alert('LocalStorage is disabled (private browsing mode). Credentials will not persist.');
    }
    return false;
  }
}

export async function loadCredentials() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const payload = JSON.parse(raw);

    if (payload.token && typeof payload.token === 'string' && !payload.iv) {
      const result = { domain: payload.domain, email: payload.email, token: payload.token };
      saveCredentials(result).catch(() => {});
      return result;
    }

    const salt = new Uint8Array(payload.salt);
    const key = await deriveKey(payload.domain, payload.email, salt);
    const iv = new Uint8Array(payload.iv);
    const encryptedData = new Uint8Array(payload.token);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encryptedData
    );

    const decoder = new TextDecoder();
    return {
      domain: payload.domain,
      email: payload.email,
      token: decoder.decode(decrypted)
    };
  } catch (error) {
    logger.error('Failed to load credentials:', error);
    return null;
  }
}

export function clearCredentials() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    logger.error('Failed to clear credentials:', error);
  }
}

export function saveSelection({ boardId, sprintId }) {
  try {
    localStorage.setItem('jira-planner-selection', JSON.stringify({
      boardId,
      sprintId
    }));
  } catch (error) {
    logger.error('Failed to save selection:', error);
  }
}

export function loadSelection() {
  try {
    const data = localStorage.getItem('jira-planner-selection');
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error('Failed to load selection:', error);
    return null;
  }
}
