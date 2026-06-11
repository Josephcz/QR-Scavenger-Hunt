import type { NextApiRequest, NextApiResponse } from 'next';
import { randomCode, randomSecret } from '../../../lib/codes';
import { assertAdmin, methodNotAllowed } from '../../../lib/http';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

type StationBody = {
  sortOrder?: number;
  title?: string;
  body?: string;
  imageUrl?: string;
  points?: number;
  hintPromptText?: string;
  hintPromptImageUrl?: string;
  hintAnswerKey?: string;
  hintText?: string;
  hintImageUrl?: string;
  hintPenalty?: number;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!assertAdmin(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' });

  if (req.method === 'GET') return getStations(req, res);
  if (req.method === 'POST') return createStation(req, res);
  return methodNotAllowed(res, 'GET, POST');
}

async function getStations(req: NextApiRequest, res: NextApiResponse) {
  const { data, error } = await supabaseAdmin
    .from('stations')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) return res.status(500).json({ ok: false, error: error.message });

  const baseUrl = requestOrigin(req);

  return res.status(200).json({
    ok: true,
    stations: data.map((station) => publicAdminStation(station, baseUrl)),
  });
}

async function createStation(req: NextApiRequest, res: NextApiResponse) {
  try {
    const body = req.body as StationBody;
    const sortOrder = Number(body.sortOrder);
    const points = Number.isFinite(Number(body.points)) ? Number(body.points) : 10;
    const hintPenalty = Number.isFinite(Number(body.hintPenalty)) ? Number(body.hintPenalty) : 0;

    if (!Number.isInteger(sortOrder) || sortOrder < 1) {
      return res.status(400).json({ ok: false, error: 'Station order must be a positive integer.' });
    }
    if (!body.title?.trim()) return res.status(400).json({ ok: false, error: 'Station title is required.' });

    for (let attempts = 0; attempts < 5; attempts += 1) {
      const code = randomCode('ST', 8);
      const scanToken = `scan_${randomSecret(12)}`;
      const { data, error } = await supabaseAdmin
        .from('stations')
        .insert({
          sort_order: sortOrder,
          code,
          scan_token: scanToken,
          title: body.title.trim(),
          body_markdown: body.body?.trim() || '',
          image_url: body.imageUrl?.trim() || null,
          question_text: '',
          answer_key: null,
          points,
          hint_prompt_text: body.hintPromptText?.trim() || null,
          hint_prompt_image_url: body.hintPromptImageUrl?.trim() || null,
          hint_answer_key: body.hintAnswerKey?.trim() || null,
          hint_text: body.hintText?.trim() || null,
          hint_image_url: body.hintImageUrl?.trim() || null,
          hint_penalty: hintPenalty,
        })
        .select('*')
        .single();

      if (!error && data) {
        const baseUrl = requestOrigin(req);
        return res.status(200).json({ ok: true, station: publicAdminStation(data, baseUrl) });
      }

      if (!error?.message.includes('duplicate key')) {
        return res.status(500).json({ ok: false, error: error?.message || 'Could not create station.' });
      }
    }

    return res.status(500).json({ ok: false, error: 'Could not generate a unique station code.' });
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid request.' });
  }
}

function requestOrigin(req: NextApiRequest) {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'http';
  const host = req.headers.host || 'localhost:3000';
  return `${proto}://${host}`;
}

function publicAdminStation(station: any, baseUrl: string) {
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  const qrUrl = `${cleanBaseUrl}/?c=${encodeURIComponent(station.code)}&t=${encodeURIComponent(station.scan_token)}`;
  return {
    id: station.id,
    order: station.sort_order,
    code: station.code,
    scanToken: station.scan_token,
    title: station.title,
    body: station.body_markdown,
    imageUrl: station.image_url,
    points: station.points,
    hintPromptText: station.hint_prompt_text,
    hintPromptImageUrl: station.hint_prompt_image_url,
    hintAnswerKey: station.hint_answer_key,
    hintText: station.hint_text,
    hintImageUrl: station.hint_image_url,
    hintPenalty: station.hint_penalty,
    isActive: station.is_active,
    qrUrl,
  };
}
