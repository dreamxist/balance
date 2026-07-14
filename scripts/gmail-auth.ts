// One-shot Gmail OAuth bootstrap for gmail-sync.
//
//   deno run --allow-net --allow-env scripts/gmail-auth.ts
//
// Requires GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in the environment (from a
// Google Cloud OAuth client of type "Desktop app" — see docs/setup-gmail.md).
// Prints the consent URL, captures the authorization code on a localhost
// loopback server, exchanges it for a refresh token and prints the
// `supabase secrets set` command to run.

const REDIRECT_PORT = 8377
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}`
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'

export function buildConsentUrl(clientId: string, redirectUri: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', SCOPE)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  return url.toString()
}

export async function exchangeCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<{ refresh_token?: string; error?: string; error_description?: string }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  return await res.json()
}

async function main(): Promise<void> {
  const clientId = Deno.env.get('GMAIL_CLIENT_ID')
  const clientSecret = Deno.env.get('GMAIL_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    console.error('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET first (docs/setup-gmail.md).')
    Deno.exit(1)
  }

  console.log('\n1. Abre esta URL en tu navegador y acepta el acceso de solo lectura a Gmail:\n')
  console.log(buildConsentUrl(clientId, REDIRECT_URI))
  console.log(`\n2. Esperando el código de autorización en ${REDIRECT_URI} ...\n`)

  const code = await new Promise<string>((resolve) => {
    const server = Deno.serve({ port: REDIRECT_PORT, hostname: '127.0.0.1' }, (req) => {
      const url = new URL(req.url)
      const authCode = url.searchParams.get('code')
      if (!authCode) {
        return new Response('Sin código en la URL. Intenta de nuevo.', { status: 400 })
      }
      queueMicrotask(async () => {
        await server.shutdown()
        resolve(authCode)
      })
      return new Response(
        'Listo. Puedes cerrar esta pestaña y volver a la terminal.',
        { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
      )
    })
  })

  const token = await exchangeCode(clientId, clientSecret, code, REDIRECT_URI)
  if (!token.refresh_token) {
    console.error('No llegó refresh_token:', token.error, token.error_description ?? '')
    console.error('Revisa que el cliente OAuth sea de tipo "Desktop app" y reintenta.')
    Deno.exit(1)
  }

  console.log('\nRefresh token obtenido. Configura los secrets del proyecto:\n')
  console.log(
    `supabase secrets set GMAIL_CLIENT_ID='${clientId}' \\\n` +
      `  GMAIL_CLIENT_SECRET='${clientSecret}' \\\n` +
      `  GMAIL_REFRESH_TOKEN='${token.refresh_token}'`,
  )
  console.log('\nRecuerda también GMAIL_USER_ID y CRON_SECRET (docs/setup-gmail.md).')
}

if (import.meta.main) {
  await main()
}
