import type { NextApiRequest, NextApiResponse } from 'next';
import { randomSecret } from '../../../lib/codes';
import { assertAdmin, methodNotAllowed } from '../../../lib/http';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

const AUDIO_BUCKET = 'hunt-audio';
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
};

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
};

type AudioRequest = {
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
    const body = req.body as AudioRequest;
    if (body.action === 'upload') return uploadAudio(body, res);
    if (body.action === 'delete') return deleteAudio(body, res);
    return res.status(400).json({ ok: false, error: 'Unknown audio action.' });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'Invalid request.' });
  }
}

async function uploadAudio(body: AudioRequest, res: NextApiResponse) {
  const contentType = body.contentType || '';
  const extension = ALLOWED_TYPES[contentType];
  if (!extension) return res.status(400).json({ ok: false, error: 'Use an MP3, M4A, WAV, OGG, or WEBM audio file.' });

  const buffer = decodeBase64(body.base64 || '');
  if (!buffer.length) return res.status(400).json({ ok: false, error: 'No audio data was uploaded.' });
  if (buffer.length > MAX_AUDIO_BYTES) return res.status(413).json({ ok: false, error: 'Audio must be 5 MB or smaller.' });

  const safeName = (body.fileName || 'audio')
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 42) || 'audio';
  const path = `stations/${Date.now()}-${randomSecret(10)}-${safeName}.${extension}`;

  const { error } = await supabaseAdmin.storage.from(AUDIO_BUCKET).upload(path, buffer, { contentType, upsert: false });
  if (error) return res.status(500).json({ ok: false, error: error.message });

  const { data } = supabaseAdmin.storage.from(AUDIO_BUCKET).getPublicUrl(path);
  return res.status(200).json({ ok: true, url: data.publicUrl, path });
}

async function deleteAudio(body: AudioRequest, res: NextApiResponse) {
  const path = storagePathFromPublicUrl(body.url || '');
  if (!path) return res.status(200).json({ ok: true, deleted: false });

  const { error } = await supabaseAdmin.storage.from(AUDIO_BUCKET).remove([path]);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.status(200).json({ ok: true, deleted: true, path });
}

function decodeBase64(value: string) {
  const clean = value.includes(',') ? value.split(',').pop() || '' : value;
  return Buffer.from(clean, 'base64');
}

function storagePathFromPublicUrl(url: string) {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  if (!supabaseUrl || !url.startsWith(`${supabaseUrl}/storage/v1/object/public/${AUDIO_BUCKET}/`)) return null;
  const rawPath = url.slice(`${supabaseUrl}/storage/v1/object/public/${AUDIO_BUCKET}/`.length);
  return decodeURIComponent(rawPath.split('?')[0] || '');
}
