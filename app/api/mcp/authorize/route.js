/**
 * OAuth 2.0 Authorization endpoint.
 *
 * Flujo:
 *  1. Claude redirige al usuario acá con ?client_id=...&redirect_uri=...&code_challenge=...
 *  2. Si no hay sesión NextAuth, redirigimos a /login con callbackUrl = esta misma URL
 *  3. Una vez logueado (con email del Workspace autorizado), generamos un código
 *     (JWT firmado con expiración corta) y redirigimos de vuelta a Claude.
 *  4. Claude después llama al endpoint /token con ese código.
 */

import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { signJwt, isAllowedRedirectUri, getClientId, isConfigured } from '@/lib/mcpOauth';

export const runtime = 'nodejs';

function badRequest(error, description) {
  return Response.json({ error, error_description: description }, { status: 400 });
}

export async function GET(request) {
  if (!isConfigured()) {
    return badRequest('server_error', 'MCP OAuth no configurado en el servidor (faltan vars en env)');
  }

  const url = new URL(request.url);
  const clientId = url.searchParams.get('client_id');
  const redirectUri = url.searchParams.get('redirect_uri');
  const responseType = url.searchParams.get('response_type');
  const codeChallenge = url.searchParams.get('code_challenge');
  const codeChallengeMethod = url.searchParams.get('code_challenge_method') || 'S256';
  const state = url.searchParams.get('state');
  const scope = url.searchParams.get('scope') || 'mcp';

  // Validaciones
  if (responseType !== 'code') {
    return badRequest('unsupported_response_type', 'Solo se soporta response_type=code');
  }
  if (clientId !== getClientId()) {
    return badRequest('invalid_client', 'Client ID no reconocido');
  }
  if (!redirectUri || !isAllowedRedirectUri(redirectUri)) {
    return badRequest('invalid_request', `redirect_uri no permitido: ${redirectUri}`);
  }
  if (!codeChallenge) {
    return badRequest('invalid_request', 'PKCE requerido (code_challenge)');
  }
  if (codeChallengeMethod !== 'S256') {
    return badRequest('invalid_request', 'Solo se soporta code_challenge_method=S256');
  }

  // Verificar sesión del usuario
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    // Mandamos al login con callbackUrl que regrese acá (con todos los params)
    const loginUrl = new URL('/login', url.origin);
    loginUrl.searchParams.set('callbackUrl', request.url);
    return Response.redirect(loginUrl, 302);
  }

  // Generar código de autorización (JWT con todos los datos para validar después)
  const code = await signJwt({
    type: 'auth_code',
    sub: session.user.email,
    aud: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    scope,
  }, '5m');

  // Redirigir de vuelta a Claude con el código
  const back = new URL(redirectUri);
  back.searchParams.set('code', code);
  if (state) back.searchParams.set('state', state);
  return Response.redirect(back, 302);
}
