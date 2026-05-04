/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414).
 * Claude.ai consulta este endpoint para descubrir dónde están los endpoints
 * de authorize y token, qué grant types soportamos, etc.
 */

export const runtime = 'nodejs';

export async function GET(request) {
  // Build the issuer URL desde el host del request — funciona tanto en local
  // (localhost:3000) como en producción (ads.atlanticoestudio.com).
  const baseUrl = process.env.NEXTAUTH_URL || `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('host')}`;

  return Response.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/mcp/authorize`,
    token_endpoint: `${baseUrl}/api/mcp/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
    scopes_supported: ['mcp'],
  }, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
