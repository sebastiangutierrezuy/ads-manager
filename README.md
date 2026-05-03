# Centro de Publicidad — Atlántico

Webapp para gestionar publicidad en Meta (Instagram + Facebook), pensada para usuarios que **no saben de ads**.

Stack: **Next.js 15** (App Router) · React 19 · JavaScript.

---

## Cómo correrla

```bash
cd Ads
npm install
npm run dev
```

Abrí <http://localhost:3000>.

Si todavía no configuraste Meta, la app arranca igual en **modo demo** con datos de ejemplo. Para ver datos reales, seguí los pasos de abajo.

---

## Cómo conectar tu cuenta de Meta

Necesitás **dos cosas**: un *access token* y el *ID de la cuenta publicitaria*. Ambas viven en `.env.local`, que **nunca se commitea** (está en `.gitignore`).

### 1. Crear `.env.local`

```bash
cp .env.example .env.local
```

### 2. Conseguir el `META_AD_ACCOUNT_ID`

1. Entrá a [Meta Ads Manager](https://adsmanager.facebook.com/).
2. Arriba a la izquierda, debajo del nombre de la cuenta, vas a ver algo como `Cuenta: 1234567890`.
3. Pegalo en `.env.local` con el prefijo `act_`:
   ```
   META_AD_ACCOUNT_ID=act_1234567890
   ```

### 3. Conseguir el `META_ACCESS_TOKEN`

Hay tres caminos. **Para empezar usá el primero — los otros son para producción.**

#### Opción A — Token corto desde Graph API Explorer (5 minutos, dura 1 hora)

Sólo para **probar la conexión**. Después seguí con la Opción B.

1. Andá a <https://developers.facebook.com/tools/explorer/>.
2. Arriba a la derecha, en *"Meta App"*, elegí cualquier app tuya (o creá una nueva tipo *"Business"* — gratis).
3. Click en *"Generate Access Token"*.
4. En *"Permissions"* pedí: `ads_read` y `ads_management`.
5. Aceptá el pop-up de Facebook (te va a pedir que autorices).
6. Copiá el token largo que aparece arriba. Pegalo en `.env.local`:
   ```
   META_ACCESS_TOKEN=EAAxxxxx...
   ```

Reiniciá `npm run dev`. Ya deberías ver datos reales.

#### Opción B — Token de larga duración (60 días)

Cuando ya verificaste que funciona, conviene cambiar al token largo:

1. Conseguí primero un token corto (Opción A).
2. Conseguí también el `App ID` y `App Secret` desde tu app: Meta for Developers → tu app → **Configuración → Información básica**.
3. Pegalos en `.env.local`:
   ```
   META_APP_ID=...
   META_APP_SECRET=...
   ```
4. Pedile a Meta el token largo con `curl`:
   ```bash
   curl "https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=$META_APP_ID&client_secret=$META_APP_SECRET&fb_exchange_token=$META_ACCESS_TOKEN_CORTO"
   ```
5. La respuesta trae el token largo (60 días). Reemplazá el corto en `.env.local`.

#### Opción C — System User Token (no expira nunca, recomendado para producción)

Cuando vayas a deployar:

1. Andá a <https://business.facebook.com/settings/system-users>.
2. Creá un *System User* con rol *Admin* o *Employee*.
3. Asignale tu cuenta publicitaria con permisos sobre *Ads*.
4. Generá un token con permisos `ads_read` + `ads_management`.

Este token es el que va al servidor productivo.

---

## Configurar autenticación (Google Workspace)

La app está protegida — para entrar hace falta una cuenta de Google del dominio de tu Workspace (ej. `@atlanticoestudio.com`).

### 1. Generar el `AUTH_SECRET`

```bash
npx auth secret
```

Te imprime un string. Pegalo en `.env.local` como `AUTH_SECRET=...`. Es lo que firma las cookies de sesión.

### 2. Crear credenciales OAuth en Google Cloud

1. Andá a <https://console.cloud.google.com/>
2. Creá un proyecto nuevo (o seleccioná uno) para *Atlántico Centro de Publicidad*.
3. Menú lateral → **APIs y servicios** → **Pantalla de consentimiento de OAuth**:
   - Tipo de usuario: **"Interno"** (clave — restringe automáticamente al Workspace).
   - Nombre de la app: *Centro de Publicidad*.
   - Correo de soporte / desarrollador: el que uses como admin.
   - Dominios autorizados: agregá tu dominio de Workspace (ej. `atlanticoestudio.com`).
   - Scopes: dejá los defaults (email, profile, openid).
   - Guardar.
4. Menú lateral → **APIs y servicios** → **Credenciales**:
   - Click en **"+ Crear credenciales"** → *ID de cliente de OAuth 2.0*.
   - Tipo: **Aplicación web**.
   - URI de redirección autorizado: `http://localhost:3000/api/auth/callback/google` (para dev). Cuando deployes, agregá también `https://tu-dominio-prod.com/api/auth/callback/google`.
   - Crear.
5. Te aparece un popup con **Client ID** y **Client Secret**. Copialos a `.env.local`:
   ```
   AUTH_GOOGLE_ID=...apps.googleusercontent.com
   AUTH_GOOGLE_SECRET=GOCSPX-...
   ```

### 3. Restringir al dominio del Workspace

En `.env.local`:

```
AUTH_ALLOWED_DOMAIN=atlanticoestudio.com
```

Eso hace dos cosas:
- Le pide a Google que solo muestre cuentas de ese dominio en el selector (`hd` parameter).
- Verifica server-side el email del usuario contra el dominio antes de crear sesión (defense in depth).

Si dejás vacío, cualquier cuenta de Google puede entrar (no recomendado).

### 4. Reiniciar y probar

```bash
npm install   # instala next-auth
npm run dev
```

Abrí <http://localhost:3000> → te redirige a `/login`. Click *"Continuar con Google"* → el popup de Google solo te muestra cuentas de tu Workspace → seleccionás una → vuelve a la app autenticado.

### Notas operativas

- **Tipo "Interno"** evita el proceso de App Verification de Google. Solo cuentas dentro de tu Workspace pueden entrar — no hay límite ni período de prueba.
- **Si querés agregar otro dominio** (ej. consultor externo): cambiar la app a "Externo" + lista de testers, o agregar el segundo dominio en el callback `signIn` de `auth.js`.
- Las sesiones duran 30 días por default. Para cambiar, agregar `session: { maxAge: 60 * 60 * 24 * 7 }` (7 días) a la config en `auth.js`.

## Estructura

```
Ads/
├── app/
│   ├── layout.js           ← layout root, fuentes (Inter + Manrope)
│   ├── globals.css         ← todo el CSS unificado
│   ├── page.js             ← Resumen de hoy (home)
│   └── rendimiento/page.js ← Página de Rendimiento
├── components/
│   └── Sidebar.js          ← navegación compartida
├── lib/
│   ├── meta.js             ← cliente de Marketing API (sólo server)
│   └── mock.js             ← datos de fallback para modo demo
├── _mocks/                 ← HTML originales que diseñamos antes (referencia)
├── .env.example            ← plantilla de variables (sin secretos)
├── .env.local              ← TUS credenciales (NO se commitea)
└── package.json
```

---

## Qué es real y qué es mock

El MVP conecta **estas dos cosas con Meta de verdad**:

- **KPIs principales** (gasto, alcance, clics, interesados) — endpoint `/insights` de la cuenta.
- **Lista de campañas** con sus métricas — endpoint `/campaigns` con insights expandidos.

**Estas piezas todavía usan datos mock** (marcadas con `// TODO` en el código):

- Serie temporal del gráfico → falta agregar `time_increment=1`.
- Audiencia por edad/género → falta `breakdowns=age,gender`.
- Heatmap día/hora → falta `breakdowns=hourly_stats_aggregated_by_advertiser_time_zone`.
- Breakdown por plataforma/dispositivo/ubicación → falta `breakdowns=publisher_platform`, `device_platform`, `region`.
- Embudo (funnel) → falta combinar `actions` con `landing_page_views`.
- Top anuncios → falta query a `/ads`.
- Recomendaciones de la semana → falta el motor de reglas (ver chat anterior).

Cada una es un `fetch` adicional. Conviene agregarlas de a una.

---

## Seguridad

- `.env.local` está en `.gitignore` — los tokens **nunca** llegan al repo.
- El token sólo se usa en *server components* (`lib/meta.js`). Nunca se manda al browser.
- Hay caché de **5 minutos** en `metaFetch()` para no quemar la cuota de la API.
- Si las credenciales fallan, la app cae limpiamente al modo demo en vez de crashearse.

---

## Permisos que necesita Meta App (cuando hagas Login con Facebook)

- `ads_read` — para leer insights
- `ads_management` — para pausar / cambiar presupuesto / crear anuncios desde la app

Si vas a usar Login con Facebook para que **otros usuarios** conecten sus cuentas (en vez de un único token tuyo), vas a necesitar **App Review** de Meta. Eso son 1-3 semanas. Para uso interno alcanza con la app en modo *Development*.
