export default async (req) => {
  const token = process.env.PRINTFUL_TOKEN;
  const id = new URL(req.url).searchParams.get('id');
  if (!token || !/^\d+$/.test(id || '')) return json({ error: 'bad request' }, 400);

  const d = await fetch(`https://api.printful.com/sync/products/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  }).then(r => r.json()).catch(() => null);

  const sp = d?.result?.sync_product;
  if (!sp) return json({ error: 'not found' }, 404);
  const sv = (d.result.sync_variants || []).filter(v => !v.is_ignored);

  const images = [...new Set([
    sp.thumbnail_url,
    ...sv.flatMap(v => (v.files || []).filter(f => f.type === 'preview').map(f => f.preview_url))
  ].filter(Boolean))];

  return json({
    id: sp.id,
    name: sp.name,
    thumbnail: sp.thumbnail_url,
    images,
    variants: sv.map(v => ({
      id: v.id,
      size: v.size || v.name,
      format: v.product?.name || '',
      price: v.retail_price
    }))
  });
};

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
