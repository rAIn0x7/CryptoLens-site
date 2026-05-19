import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const LS_WEBHOOK_SECRET = Deno.env.get('LS_WEBHOOK_SECRET') ?? ''

async function verifySignature(body: string, signature: string): Promise<boolean> {
  if (!LS_WEBHOOK_SECRET) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(LS_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const computed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const computedHex = Array.from(new Uint8Array(computed))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return computedHex === signature
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const body = await req.text()
  const signature = req.headers.get('x-signature') ?? ''

  if (!(await verifySignature(body, signature))) {
    return new Response('Invalid signature', { status: 401 })
  }

  const payload = JSON.parse(body)
  const eventName: string = payload.meta?.event_name ?? ''
  const attrs = payload.data?.attributes ?? {}
  const userId: string = payload.meta?.custom_data?.user_id ?? ''
  const email: string = attrs.user_email ?? ''
  const lsCustomerId = String(attrs.customer_id ?? '')
  const lsSubId = String(payload.data?.id ?? '')
  const status: string = attrs.status ?? ''

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const isPro = status === 'active' || status === 'on_trial'

  const lookup = userId ? { column: 'id', value: userId } : { column: 'email', value: email }

  if (['subscription_created', 'subscription_updated', 'subscription_resumed'].includes(eventName)) {
    await supabase.from('users')
      .update({
        is_pro: isPro,
        lemon_squeezy_customer_id: lsCustomerId,
        lemon_squeezy_subscription_id: lsSubId,
      })
      .eq(lookup.column, lookup.value)
  }

  if (['subscription_expired', 'subscription_paused'].includes(eventName)) {
    await supabase.from('users')
      .update({ is_pro: false })
      .eq(lookup.column, lookup.value)
  }

  // subscription_cancelled: user cancelled but still active until period ends —
  // keep is_pro as-is; it will flip to false when subscription_expired fires.

  return new Response('OK', { status: 200 })
})
