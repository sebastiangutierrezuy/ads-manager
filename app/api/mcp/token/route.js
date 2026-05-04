/**
 * OAuth 2.0 Token endpoint.
 *
 * Claude llama acá con el código que le dimos en /authorize, validamos que
 * todo coincida (incluyendo PKCE) y devolvemos un access_token JWT que va
 * a usar para autenticarse en /api/mcp.
 */

import { signJwt, verifyJwt, sha256base64url, getClientId, getClientSecret, isConfigured } from '@/lib/mcpOauth';

export const runtime = 'nodejs';

function tokenError(error, description, status = 400) {
  return Response.json({ error, error_description: description }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request) {
  if (!isConfigured()) {
    return tokenError('server_error', 'MCP OAuth no configurado', 500);
  }

  // El token endpoint acepta application/x-www-form-urlencoded por OAuth spec,
  // pero algunos clientes mandan JSON. Soportamos ambos.
  let params;
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    params = await request.json().catch(() => ({}));
  } else {
    const form = await request.formData().catch(() => null);
    if (!form) return tokenError('invalid_request', 'Body no parseable');
    params = Object.fromEntries(form.entries());
  }

  // El cliente puede mandar credenciales en body o en Basic auth header
  const authHeader = request.headers.get('authorization') || '';
  let clientId = params.client_id;
  let clientSecret = params.client_secret;
  if (authHeader.toLowerCase().startsWith('basic ')) {
    try {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
      const [id, secret] = decoded.split(':');
      clientId = clientId || id;
      clientSecret = clientSecret || secret;
    } catch { /* ignorar */ }
  }

  // Validar grant type
  if (params.grant_type !== 'authorization_code') {
    return tokenError('unsupported_grant_type', `grant_type ${params.grant_type} no soportado`);
  }

  // Validar credenciales del cliente
  if (clientId !== getClientId() || clientSecret !== getClientSecret()) {
    return tokenError('invalid_client', 'Client ID o secret inválidos', 401);
  }

  // Validar y decodificar el código
  let codePayload;
  try {
    codePayload = await verifyJwt(params.code);
  } catch {
    return tokenError('invalid_grant', 'Código inválido o expirado');
  }

  if (codePayload.type !== 'auth_code') {
    return tokenError('invalid_grant', 'Tipo de token incorrecto');
  }
  if (codePayload.aud !== clientId) {
    return tokenError('invalid_grant', 'Código no fue emitido para este cliente');
  }
  if (codePayload.redirect_uri !== params.redirect_uri) {
    return tokenError('invalid_grant', 'redirect_uri no coincide con el de /authorize');
  }

  // Validar PKCE
  if (!params.code_verifier) {
    return tokenError('invalid_request', 'code_verifier requerido (PKCE)');
  }
  const computedChallenge = sha256base64url(params.code_verifier);
  if (computedChallenge !== codePayload.code_challenge) {
    return tokenError('invalid_grant', 'PKCE verification falló');
  }

  // Emitir access token (JWT, 7 días)
  const accessToken = await signJwt({
    type: 'access_token',
    sub: codePayload.sub,
    aud: clientId,
    scope: codePayload.scope || 'mcp',
  }, '7d');

  return Response.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 60 * 60 * 24 * 7,
    scope: codePayload.scope || 'mcp',
  }, {
    headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache' },
  });
}
