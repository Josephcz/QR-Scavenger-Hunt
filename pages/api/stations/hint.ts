import type { NextApiRequest, NextApiResponse } from 'next';
import { methodNotAllowed, verifyTeam } from '../../../lib/http';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

type HintBody = {
  teamId?: string;
  deviceKey?: string;
  stationCode?: string;
  answer?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res);

  try {
    const body = req.body as HintBody;
    const { team, error: teamError } = await verifyTeam(body.teamId, body.deviceKey);
    if (!team) return res.status(401).json({ ok: false, error: teamError });

    const stationCode = body.stationCode?.trim() || '';
    const { data: station, error: stationError } = await supabaseAdmin
      .from('stations')
      .select('*')
      .eq('code', stationCode)
      .eq('is_active', true)
      .maybeSingle();

    if (stationError) return res.status(500).json({ ok: false, error: stationError.message });
    if (!station) return res.status(404).json({ ok: false, error: 'Station not found.' });
    if (!station.hint_text && !station.hint_image_url) {
      return res.status(404).json({ ok: false, error: 'No extra hint is available for this station.' });
    }

    if (team.completed_order < station.sort_order) {
      return res.status(403).json({ ok: false, error: 'This hint is locked until you scan that station in sequence.' });
    }

    const { data: existingUsage, error: usageLookupError } = await supabaseAdmin
      .from('hint_usages')
      .select('id')
      .eq('team_id', team.id)
      .eq('station_id', station.id)
      .maybeSingle();

    if (usageLookupError) return res.status(500).json({ ok: false, error: usageLookupError.message });

    if (!existingUsage && station.hint_answer_key) {
      const submitted = normalizeAnswer(body.answer || '');
      const expected = normalizeAnswer(station.hint_answer_key);
      if (!submitted) {
        return res.status(400).json({
          ok: false,
          requiresAnswer: true,
          error: 'Enter the hint unlock answer first.',
        });
      }
      if (submitted !== expected) {
        return res.status(403).json({ ok: false, requiresAnswer: true, error: 'That does not unlock the extra hint yet.' });
      }
    }

    const { data: result, error: hintError } = await supabaseAdmin.rpc('use_hint', {
      p_team_id: team.id,
      p_station_id: station.id,
      p_penalty: station.hint_penalty || 0,
    });

    if (hintError) return res.status(409).json({ ok: false, error: hintError.message });

    const row = Array.isArray(result) ? result[0] : result;
    return res.status(200).json({
      ok: true,
      hint: {
        text: station.hint_text,
        imageUrl: station.hint_image_url,
        penalty: station.hint_penalty || 0,
      },
      alreadyUsed: row?.already_used ?? false,
      score: row?.score ?? team.total_score,
    });
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid request.' });
  }
}

function normalizeAnswer(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
