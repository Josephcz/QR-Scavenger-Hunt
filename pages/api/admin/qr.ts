import type { NextApiRequest, NextApiResponse } from 'next';
import QRCode from 'qrcode-svg';
import { assertAdmin, methodNotAllowed } from '../../../lib/http';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

type QrBody = {
  stationId?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!assertAdmin(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' });
  if (req.method !== 'POST') return methodNotAllowed(res);

  try {
    const stationId = (req.body as QrBody).stationId?.trim();
    if (!stationId) return res.status(400).json({ ok: false, error: 'Missing station id.' });

    const { data: station, error } = await supabaseAdmin
      .from('stations')
      .select('id,sort_order,code,scan_token,title')
      .eq('id', stationId)
      .maybeSingle();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!station) return res.status(404).json({ ok: false, error: 'Station not found.' });
    if (station.sort_order === 0) {
      return res.status(400).json({ ok: false, error: 'Station 0 is the start clue and does not have a QR code.' });
    }
    if (!station.code || !station.scan_token) {
      return res.status(409).json({ ok: false, error: 'This station is missing its QR code credentials.' });
    }

    const baseUrl = requestOrigin(req).replace(/\/$/, '');
    const scanUrl = `${baseUrl}/?c=${encodeURIComponent(station.code)}&t=${encodeURIComponent(station.scan_token)}`;
    const svg = new QRCode({
      content: scanUrl,
      padding: 4,
      width: 1024,
      height: 1024,
      color: '#000000',
      background: '#ffffff',
      ecl: 'M',
      join: true,
      pretty: false,
    }).svg();

    const safeTitle = String(station.title || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || `station-${station.sort_order}`;

    return res.status(200).json({
      ok: true,
      svg,
      scanUrl,
      fileBase: `station-${String(station.sort_order).padStart(2, '0')}-${safeTitle}`,
    });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'Could not generate QR code.' });
  }
}

function requestOrigin(req: NextApiRequest) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || 'http';
  const host = req.headers.host || 'localhost:3000';
  return `${proto}://${host}`;
}
