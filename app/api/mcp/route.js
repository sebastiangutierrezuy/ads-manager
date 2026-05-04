/**
 * Endpoint HTTP del MCP server. Implementa el protocolo MCP vía JSON-RPC 2.0
 * sobre POST. Permite que clientes MCP remotos (Claude.ai web, Claude Desktop,
 * mobile, etc.) consulten las tools sin necesidad de tener el código local.
 *
 * Auth: Bearer token (env var MCP_BEARER_TOKEN). Es lo que protege que
 * cualquiera del internet llame a tus tools.
 *
 * Métodos soportados:
 *   - initialize          → handshake inicial
 *   - tools/list          → lista las 15 tools
 *   - tools/call          → invoca una tool
 *   - notifications/initialized → ack del initialize (sin respuesta)
 *   - ping                → keepalive
 */

import { TOOLS, isConfigured } from '@/mcp/tools.mjs';
import { verifyJwt } from '@/lib/mcpOauth';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'atlantico-meta-ads', version: '1.1.0' };

// Forzamos node runtime — algunas APIs de meta.js usan fetch con next.revalidate
// que existe en Edge pero las cosas como JSON.stringify de objetos grandes son
// más estables en node.
export const runtime = 'nodejs';

function jsonRpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

async function handleRpc(req) {
  const { id, method, params } = req;

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        },
      };

    case 'notifications/initialized':
      return null; // notifications no tienen respuesta

    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };

    case 'tools/list':
      return {
        jsonrpc: '2.0', id,
        result: {
          tools: TOOLS.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        },
      };

    case 'tools/call': {
      const tool = TOOLS.find(t => t.name === params?.name);
      if (!tool) return jsonRpcError(id, -32601, `Unknown tool: ${params?.name}`);
      if (!isConfigured()) {
        return {
          jsonrpc: '2.0', id,
          result: {
            isError: true,
            content: [{ type: 'text', text: 'Meta API no configurada en producción. Verificá META_ACCESS_TOKEN y META_AD_ACCOUNT_ID en Vercel env vars.' }],
          },
        };
      }
      try {
        const result = await tool.handler(params?.arguments || {});
        return { jsonrpc: '2.0', id, result };
      } catch (e) {
        return {
          jsonrpc: '2.0', id,
          result: {
            isError: true,
            content: [{ type: 'text', text: e.message || String(e) }],
          },
        };
      }
    }

    default:
      return jsonRpcError(id, -32601, `Method not found: ${method}`);
  }
}

function unauthorized(request) {
  // Le indicamos a Claude (u otro cliente MCP) dónde están los metadatos
  // OAuth, así puede iniciar el flujo si se autenticó mal.
  const baseUrl = process.env.NEXTAUTH_URL || `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('host')}`;
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer realm="mcp", resource_metadata="${baseUrl}/.well-known/oauth-authorization-server"`,
    },
  });
}

/**
 * Acepta autenticación por:
 *   - JWT emitido por nuestro OAuth flow (Claude.ai web/desktop/mobile)
 *   - Bearer estático MCP_BEARER_TOKEN (uso local / scripts / curl)
 */
async function checkAuth(request) {
  const auth = request.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return false;
  const token = auth.slice(7).trim();

  // 1) ¿Es nuestro Bearer estático?
  const staticToken = process.env.MCP_BEARER_TOKEN;
  if (staticToken && token === staticToken) return true;

  // 2) ¿Es un JWT emitido por nuestro OAuth?
  try {
    const payload = await verifyJwt(token);
    if (payload.type === 'access_token') return true;
  } catch {
    // JWT inválido o expirado — caer en false
  }

  return false;
}

export async function POST(request) {
  if (!(await checkAuth(request))) return unauthorized(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 });
  }

  // Soporte de batches (array de requests) — opcional pero útil
  if (Array.isArray(body)) {
    const results = await Promise.all(body.map(handleRpc));
    const filtered = results.filter(r => r !== null);
    return Response.json(filtered);
  }

  const result = await handleRpc(body);
  if (result === null) {
    // Notifications no esperan respuesta
    return new Response(null, { status: 202 });
  }
  return Response.json(result);
}

export async function GET(request) {
  // Algunos clientes hacen GET para verificar que el endpoint existe.
  // Devolvemos info pública del server (sin tools — eso requiere auth).
  if (!(await checkAuth(request))) return unauthorized(request);
  return Response.json({
    name: SERVER_INFO.name,
    version: SERVER_INFO.version,
    protocolVersion: PROTOCOL_VERSION,
    transport: 'http',
    toolCount: TOOLS.length,
  });
}
