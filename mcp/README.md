# MCP Server — Atlántico Meta Ads

Servidor [Model Context Protocol](https://modelcontextprotocol.io) que expone los datos de Meta Ads de tu cuenta como herramientas que Claude (u otro LLM compatible con MCP) puede consultar.

## Para qué sirve

Una vez conectado, podés preguntarle a Claude cosas como:

- *"¿Cuánto gasté en Meta los últimos 7 días y cuántos resultados tuve?"*
- *"Mostrame las 5 mejores creatividades del último mes."*
- *"¿Qué edad tiene la mayoría de mi audiencia?"*
- *"Cómo viene la campaña 120214084306210206?"*
- *"¿Cuántos terminan de ver el video del anuncio X?"*

Claude llama al servidor MCP, este consulta la API de Meta con el mismo token que usa el portal web, y le pasa la data a Claude para que la interprete.

## Tools que expone

### Cuenta entera

| Tool | Qué hace |
|---|---|
| `account_summary` | KPIs de la cuenta en un período |
| `account_comparison` | Compara período actual vs período anterior con deltas % |
| `daily_trend` | Serie día por día (gasto, alcance, clics, interesados) |
| `hourly_pattern` | Distribución por hora del día (24 buckets) — best/worst hour |
| `device_breakdown` | Móvil vs desktop con CPR de cada uno |
| `list_campaigns` | Lista de campañas con métricas |
| `audience_breakdown` | Por edad y género (toda la cuenta) |
| `region_breakdown` | Top regiones por alcance |
| `platform_breakdown` | IG Reels, IG Stories, FB Feed, etc. |

### Anuncios

| Tool | Qué hace |
|---|---|
| `list_top_ads` | Top anuncios por clics |
| `ad_detail` | Info y métricas de un ad puntual |
| `video_retention` | Curva de retención de un video (0/25/50/75/95/100) |
| `ad_audience_breakdown` | Edades de UN ad específico |
| `ad_platform_breakdown` | Plataformas/posiciones de UN ad específico |
| `ad_device_breakdown` | Móvil vs desktop de UN ad específico |

### Período: dos formas de especificarlo

Casi todas las tools aceptan estas opciones para definir el período:

- **Preset**: `period` con uno de `today`, `yesterday`, `last_7d`, `last_14d`, `last_30d`, `last_90d`, `this_month`, `last_month`, `maximum` (default: `last_30d`).
- **Rango custom**: `since` + `until` en formato `YYYY-MM-DD`. Si especificás ambos, ignoran el `period`.

Ejemplo de pregunta a Claude que usa rango custom:
*"¿Cuánto gasté entre el 1 y el 15 de marzo?"* → Claude llama `account_summary` con `since: "2026-03-01", until: "2026-03-15"`.

## Instalación

Si no instalaste deps todavía:

```bash
cd Ads
npm install
```

Eso instala `@modelcontextprotocol/sdk` y `dotenv`.

## Cómo conectarlo a Claude

Hay **dos formas** según tu uso:

| Forma | Cómo funciona | Para quién |
|---|---|---|
| **A. HTTP remoto** (`/api/mcp`) | Claude.ai / Desktop / Mobile se conecta al endpoint de Vercel con Bearer token | Para usar desde cualquier lado, equipo, mobile |
| **B. Stdio local** (`mcp/server.mjs`) | Claude Desktop/Code lanza el server como subprocess | Solo para tu compu, sin internet |

### A. Conectar a tu cuenta de Claude (HTTP remoto, recomendado)

**Paso 1**: en Vercel → Settings → Environment Variables, agregá `MCP_BEARER_TOKEN` con un token fuerte:
```bash
openssl rand -base64 32
```
**Production / Preview / Development** todos, mismo valor. Después **Redeploy**.

**Paso 2**: en https://claude.ai → Settings → **Connectors** → **Add custom connector**:
- Name: `Atlántico Meta Ads`
- URL: `https://ads.atlanticoestudio.com/api/mcp`
- Authentication: **Bearer Token**
- Token: el mismo valor que pusiste en Vercel

Guardar. Va a aparecer en tu lista de conectores.

**Paso 3**: en cualquier chat de Claude (web, desktop, mobile), activá el connector con el ícono de tools y preguntale algo como *"¿cuánto gasté los últimos 7 días?"*. Claude llama el endpoint, este consulta Meta, devuelve la data.

**Pro:** funciona desde cualquier dispositivo donde tengas tu cuenta de Claude logueada.
**Contra:** requiere que la app esté deployada y accesible públicamente (vía Bearer auth).

### B. Claude Code (CLI, stdio local)

```bash
claude mcp add meta-ads node /Users/sebastian/Documents/Atlantico/Claudio/Ads/mcp/server.mjs
```

Verificá:
```bash
claude mcp list
```

Después en cualquier sesión de Claude Code podés hablarle de Meta y ya tiene acceso.

### Claude Desktop (stdio local)

Editá `~/Library/Application Support/Claude/claude_desktop_config.json` (créalo si no existe):

```json
{
  "mcpServers": {
    "meta-ads": {
      "command": "node",
      "args": ["/Users/sebastian/Documents/Atlantico/Claudio/Ads/mcp/server.mjs"]
    }
  }
}
```

Reiniciá Claude Desktop. Vas a ver el ícono de tools (martillo) habilitado en el chat.

### Cualquier otro cliente MCP

El servidor habla por **stdio**. Comando: `node mcp/server.mjs`. Sin argumentos extra. Lee credenciales de `.env.local` automáticamente.

## Cómo probarlo manualmente

```bash
cd Ads
npm run mcp
```

Te tira un mensaje en stderr:
```
[mcp] Atlántico Meta Ads MCP server listo. Tools: account_summary, list_campaigns, ...
```

Y se queda esperando. No vas a poder probarlo manualmente en consola — necesita un cliente MCP que le hable. Para test rápido, usá [`mcp-inspector`](https://modelcontextprotocol.io/docs/tools/inspector):

```bash
npx @modelcontextprotocol/inspector node mcp/server.mjs
```

Te abre una UI web donde podés invocar las tools una por una.

## Seguridad

- El servidor lee `.env.local` del proyecto — las mismas credenciales que la webapp.
- Si Claude Desktop o Code corre en tu máquina, las credenciales nunca salen de tu máquina.
- Los tools son **read-only** (consistente con la webapp). Ninguno modifica campañas, presupuestos ni anuncios.
- Si en algún momento agregás tools de write (ej. `pause_campaign`), pensá si querés un step de confirmación extra o un flag separado.

## Cómo agregar una tool nueva

Editá `mcp/server.mjs`. Agregá un objeto al array `TOOLS`:

```js
{
  name: 'mi_tool',
  description: 'Qué hace, en lenguaje natural — esto es lo que ve Claude para decidir cuándo usarla.',
  inputSchema: {
    type: 'object',
    properties: {
      foo: { type: 'string', description: '...' },
    },
    required: ['foo'],
  },
  handler: async ({ foo }) => {
    const data = await algunaCosa(foo);
    return ok(data);
  },
},
```

Reiniciás Claude (Desktop) o reabrís la sesión (Code) para que recargue las tools.

## Troubleshooting

| Síntoma | Probable causa |
|---|---|
| Claude dice "tool not found" | Servidor no se está cargando. Mirá los logs de Claude Desktop o reiniciá. |
| Tool tira `Meta API no configurada` | Falta `META_ACCESS_TOKEN` en `.env.local`. |
| Tool devuelve `data: []` | No hay actividad en ese período. Probá `period: "last_90d"` o `"maximum"`. |
| `Cannot find module '@modelcontextprotocol/sdk'` | Falta correr `npm install`. |
