export default async () => {
  const token = process.env.PRINTFUL_TOKEN;
  if (!token) return new Response('Missing token', { status: 500 });

  const res = await fetch('https://api.printful.com/sync/products', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();

  const products = await Promise.all(
    (data.result || []).map(async (p) => {
      const detail = await fetch(`https://api.printful.com/sync/products/${p.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => r.json()).catch(() => null);
      const price = detail?.result?.sync_variants?.[0]?.retail_price || null;
      return { id: p.id, name: p.name, thumbnail: p.thumbnail_url, price };
    })
  );

  return new Response(JSON.stringify(products), {
    headers: { 'Content-Type': 'application/json' }
  });
};
