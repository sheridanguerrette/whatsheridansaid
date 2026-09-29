'use strict';
const { json, authorize, writeNewFile } = require('../../lib/github');
const { slugify } = require('../../lib/content');

const MAX_BYTES = 4 * 1024 * 1024;
function sniff(b) {   // trust the file's bytes, not the name the browser sent
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'webp';
  if (b.subarray(0, 4).toString() === 'GIF8') return 'gif';
  return null;
}

exports.handler = async (event) => {
  const denied = await authorize(event); if (denied) return denied;
  let payload; try { payload = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad request.' }); }
  const buf = Buffer.from(String(payload.data || ''), 'base64');
  if (!buf.length) return json(400, { error: 'No image received.' });
  if (buf.length > MAX_BYTES) return json(413, { error: 'That image is too large (4 MB max).' });
  const ext = sniff(buf);
  if (!ext) return json(400, { error: 'Please upload a JPG, PNG, WebP or GIF image.' });
  const base = slugify(String(payload.filename || 'image').replace(/\.[a-z0-9]+$/i, '')) || 'image';
  const name = `${Date.now()}-${base}.${ext}`;
  try {
    await writeNewFile(`src/assets/uploads/${name}`, buf, `Upload image: ${name}`);
    return json(200, { ok: true, url: `assets/uploads/${name}` });
  } catch (e) { return json(502, { error: 'Upload failed: ' + e.message }); }
};
