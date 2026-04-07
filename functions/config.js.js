// Cloudflare Pages Function: serves /config.js with env vars injected
export async function onRequest(context) {
    const url = context.env.SUPABASE_URL || '';
    const key = context.env.SUPABASE_KEY || '';
    const body = `window.APP_CONFIG={SUPABASE_URL:"${url}",SUPABASE_KEY:"${key}"};`;
    return new Response(body, {
        headers: {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
    });
}
