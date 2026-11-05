import crypto from 'node:crypto';

export default async (req) => {
  const raw = await req.text();
  const hdr = req.headers.get('stripe-signature') || '';
  const t = (hdr.match(/t=(\d+)/) || [])[1];
  const v1s = [...hdr.matchAll(/v1=([0-9a-f]+)/g)].map(m => m[1]);
  const expected = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET || '')
    .update(`${t}.${raw}`).digest('hex');
  const valid = t && Math.abs(Date.now() / 1000 - Number(t)) < 300 &&
    v1s.some(v => v.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(v), Buffer.from(expected)));
  if (!valid) return new Response('bad signature', { status: 400 });

  const ev = JSON.parse(raw);
  if (ev.type !== 'checkout.session.completed') return new Response('ok');
  const s = ev.data.object;
  if (s.payment_status !== 'paid') return new Response('not paid');

  const sd = s.collected_information?.shipping_details || s.shipping_details;
  const a = sd?.address;
  if (!a) { console.error('No shipping address on', s.id); return new Response('no address', { status: 500 }); }

  const order = {
    external_id: s.id.slice(-32),
    recipient: {
      name: sd.name,
      address1: a.line1,
      address2: a.line2 || '',
      city: a.city,
      state_code: a.state || '',
      country_code: a.country,
      zip: a.postal_code,
      email: s.customer_details?.email
    },
    items: [{ sync_variant_id: Number(s.metadata.sync_variant_id), quantity: 1 }]
  };

  const confirm = process.env.PRINTFUL_CONFIRM === 'true';
  const res = await fetch(`https://api.printful.com/orders?confirm=${confirm}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.PRINTFUL_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(order)
  });
  if (!res.ok) {
    console.error('Printful order failed', res.status, await res.text());
    return new Response('printful error', { status: 500 });
  }
  return new Response('ok');
};
