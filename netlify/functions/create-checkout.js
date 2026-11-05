export default async (req) => {
  if (req.method !== 'POST') return out({ error: 'POST only' }, 405);
  const { productId, variantId } = await req.json().catch(() => ({}));
  const pf = process.env.PRINTFUL_TOKEN;
  const sk = process.env.STRIPE_SECRET_KEY;
  if (!pf || !sk || !/^\d+$/.test(String(productId))) return out({ error: 'bad request' }, 400);

  const d = await fetch(`https://api.printful.com/sync/products/${productId}`, {
    headers: { Authorization: `Bearer ${pf}` }
  }).then(r => r.json()).catch(() => null);

  const sp = d?.result?.sync_product;
  const v = (d?.result?.sync_variants || []).find(x => x.id === variantId && !x.is_ignored);
  if (!sp || !v) return out({ error: 'not found' }, 404);

  const origin = new URL(req.url).origin;
  const p = new URLSearchParams();
  p.set('mode', 'payment');
  p.set('success_url', origin + '/thanks.html');
  p.set('cancel_url', origin + '/product.html?id=' + productId);
  p.set('line_items[0][quantity]', '1');
  p.set('line_items[0][price_data][currency]', (v.currency || 'USD').toLowerCase());
  p.set('line_items[0][price_data][unit_amount]', String(Math.round(parseFloat(v.retail_price) * 100)));
  p.set('line_items[0][price_data][product_data][name]', `${sp.name} — ${v.size || v.name}`);
  if (sp.thumbnail_url) p.set('line_items[0][price_data][product_data][images][0]', sp.thumbnail_url);
  ['US', 'CA', 'GB', 'AU', 'NZ', 'IE', 'DE', 'FR', 'NL', 'SE'].forEach((c, i) =>
    p.set(`shipping_address_collection[allowed_countries][${i}]`, c));
  p.set('metadata[sync_variant_id]', String(v.id));

  const ship = parseInt(process.env.SHIPPING_CENTS || '0', 10);
  if (ship > 0) {
    p.set('shipping_options[0][shipping_rate_data][display_name]', 'Shipping');
    p.set('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
    p.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]', String(ship));
    p.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]', (v.currency || 'USD').toLowerCase());
  }

  const s = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sk}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: p
  }).then(r => r.json()).catch(() => null);

  return s?.url ? out({ url: s.url }) : out({ error: 'checkout failed' }, 502);
};

const out = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
