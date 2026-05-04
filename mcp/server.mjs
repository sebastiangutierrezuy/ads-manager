#!/usr/bin/env node
/**
 * Servidor MCP por stdio (uso local). Para uso remoto vía HTTPS, ver
 * app/api/mcp/route.js — comparte las mismas tools.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { TOOLS, isConfigured } from './tools.mjs';

const server = new Server(
  { name: 'atlantico-meta-ads', version: '1.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (!isConfigured()) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Meta API no configurada. Verificá META_ACCESS_TOKEN y META_AD_ACCOUNT_ID en .env.local' }],
    };
  }
  const { name, arguments: args } = req.params;
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) {
    return { isError: true, content: [{ type: 'text', text: `Herramienta desconocida: ${name}` }] };
  }
  try {
    return await tool.handler(args || {});
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: e.message || String(e) }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

console.error(`[mcp] Atlántico Meta Ads MCP server v1.1.0 listo. ${TOOLS.length} tools cargadas.`);
