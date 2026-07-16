import type { NextApiRequest, NextApiResponse } from 'next';
import { randomSecret } from '../../../lib/codes';
import { assertAdmin, methodNotAllowed } from '../../../lib/http';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

const IMAGE_BUCKET = 'hunt-images';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

type ImageRequest = {
  action?: 'upload' | 'delete';
  fileName?: string;
  contentType?: string;
  base64?: string;
  url?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!assertAdmin(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' });
  if (req.method !== 'POST') return methodNotAllowed(res);

  try {
    const body = req.body as ImageRequest;
    if (body.action === 'upload') return uploadImage(body, res);
    if (body.action === 'delete') return deleteImage(body, res);
    return res.status(400).json({ ok: false, error: 'Unknown image action.' });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'Invalid request.' });
  }
}

async function uploadImage(body: ImageRequest, res: NextApiResponse) {
  const contentType = body.contentType || '';
  const extension = ALLOWED_TYPES[contentType];
  if (!extension) {
    return res.status(400).json({ ok: false, error: 'Use a PNG, JPG, WEBP, or GIF image.' });
  }

  const buffer = decodeBase64Image(body.base64 || '');
  if (!buffer.length) return res.status(400).json({ ok: false, error: 'No image data was uploaded.' });
  if (buffer.length > MAX_IMAGE_BYTES) return res.status(413).json({ ok: false, error: 'Image must be 5 MB or smaller.' });

  const safeName = (body.fileName || 'image')
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 42) || 'image';
  const path = `stations/${Date.now()}-${randomSecret(10)}-${safeName}.${extension}`;

  const { error } = await supabaseAdmin.storage.from(IMAGE_BUCKET).upload(path, buffer, {
    contentType,
    upsert: false,
  });

  if (error) return res.status(500).json({ ok: false, error: error.message });

  const { data } = supabaseAdmin.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  return res.status(200).json({ ok: true, url: data.publicUrl, path });
}

async function deleteImage(body: ImageRequest, res: NextApiResponse) {
  const path = storagePathFromPublicUrl(body.url || '');
  if (!path) return res.status(200).json({ ok: true, deleted: false });

  const { error } = await supabaseAdmin.storage.from(IMAGE_BUCKET).remove([path]);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.status(200).json({ ok: true, deleted: true, path });
}

function decodeBase64Image(value: string) {
  const clean = value.includes(',') ? value.split(',').pop() || '' : value;
  return Buffer.from(clean, 'base64');
}

function storagePathFromPublicUrl(url: string) {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  if (!supabaseUrl || !url.startsWith(`${supabaseUrl}/storage/v1/object/public/${IMAGE_BUCKET}/`)) return null;
  const rawPath = url.slice(`${supabaseUrl}/storage/v1/object/public/${IMAGE_BUCKET}/`.length);
  return decodeURIComponent(rawPath.split('?')[0] || '');
}
