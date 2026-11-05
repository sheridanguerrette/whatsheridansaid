export default async () => {
  const token = process.env.PRINTFUL_TOKEN;
  if (!token) return new Response('Missing token', { status: 500 });

  const res = await fetch('https://api.printful.com/sync/products', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();

  const products = await Promise.all(
    (data.result || [])
      .filter(p => !p.is_ignored)
      .map(async (p) => {
        const detail = await fetch(`https://api.printful.com/sync/products/${p.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        }).then(r => r.json()).catch(() => null);

        const variants = detail?.result?.sync_variants || [];
        const price = variants[0]?.retail_price || null;
        const formats = [...new Set(variants.map(v => v.product?.name).filter(Boolean))];
        const sizes = [...new Set(variants.map(v => v.size).filter(Boolean))];

        return {
          id: p.id,
          name: p.name,
          thumbnail: p.thumbnail_url,
          price,
          formats: formats.join(', '),
          sizes: sizes.join(', ')
        };
      })
  );

  return new Response(JSON.stringify(products), {
    headers: { 'Content-Type': 'application/json' }
  });
};
