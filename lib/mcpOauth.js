/**
 * Helpers para el flujo OAuth 2.0 del endpoint MCP.
 *
 * Usamos JWTs firmados con HMAC para evitar tener que persistir códigos /
 * tokens en una base de datos — todo es stateless y el token es la única
 * fuente de verdad.
 */

import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomBytes } from 'node:crypto';

const SECRET = process.env.MCP_OAUTH_SIGNING_SECRET || process.env.AUTH_SECRET;

function getKey() {
  if (!SECRET) {
    throw new Error('Falta MCP_OAUTH_SIGNING_SECRET o AUTH_SECRET en env vars');
  }
  return new TextEncoder().encode(SECRET);
}

/** Firma un JWT con un payload y expiración (string como '5m', '7d'). */
export async function signJwt(payload, expiresIn) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getKey());
}

/** Verifica un JWT y devuelve el payload. Tira si es inválido o expiró. */
export async function verifyJwt(token) {
  const { payload } = await jwtVerify(token, getKey());
  return payload;
}

/**
 * Para PKCE: SHA256(code_verifier) en base64url.
 * Es el "code_challenge" que el cliente nos manda al /authorize, y que
 * después usamos para validar el code_verifier en /token.
 */
export function sha256base64url(input) {
  return createHash('sha256')
    .update(input)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/** Genera un string random base64url. */
export function randomBase64Url(bytes = 32) {
  return randomBytes(bytes)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Valida que un redirect_uri sea de un dominio confiable de Claude.
 * En producción podés ajustar esta lista o setearla por env.
 */
export function isAllowedRedirectUri(uri) {
  try {
    const url = new URL(uri);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return false;
    const allowed = (process.env.MCP_OAUTH_ALLOWED_REDIRECTS || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    if (allowed.length > 0) {
      // Si está la lista, validar exact match o subdominio.
      return allowed.some(a => {
        if (a === url.origin) return true;
        if (a.endsWith('/*')) return url.origin.startsWith(a.slice(0, -2));
        return false;
      });
    }
    // Default: permitir claude.ai y anthropic.com (con cualquier path)
    return /(\.|^)(claude\.ai|anthropic\.com)$/.test(url.hostname)
        || url.hostname === 'localhost';
  } catch {
    return false;
  }
}

export function getClientId() {
  return process.env.MCP_OAUTH_CLIENT_ID;
}

export function getClientSecret() {
  return process.env.MCP_OAUTH_CLIENT_SECRET;
}

export function isConfigured() {
  return Boolean(SECRET && getClientId() && getClientSecret());
}
