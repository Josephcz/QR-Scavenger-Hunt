import type { NextApiRequest, NextApiResponse } from 'next';
import { methodNotAllowed, verifyTeam } from '../../../lib/http';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { hasViewedArrival, publicStation } from '../../../lib/stationState';

type UnlockBody = {
  teamId?: string;
  deviceKey?: string;
  stationId?: string;
  stationCode?: string;
  answer?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res);

  try {
    const body = req.body as UnlockBody;
    const { team, error: teamError } = await verifyTeam(body.teamId, body.deviceKey);
    if (!team) return res.status(401).json({ ok: false, error: teamError });

    const stationId = body.stationId?.trim() || '';
    const stationCode = body.stationCode?.trim() || '';
    const submittedAnswer = normalizeAnswer(body.answer || '');
    if (!stationId && !stationCode) return res.status(400).json({ ok: false, error: 'Missing station identifier.' });
    if (!submittedAnswer) return res.status(400).json({ ok: false, error: 'Enter an answer to reveal the clue.' });

    let stationQuery = supabaseAdmin.from('stations').select('*').eq('is_active', true);
    stationQuery = stationId ? stationQuery.eq('id', stationId) : stationQuery.eq('code', stationCode);
    const { data: station, error: stationError } = await stationQuery.maybeSingle();

    if (stationError) return res.status(500).json({ ok: false, error: stationError.message });
    if (!station) return res.status(404).json({ ok: false, error: 'Station not found.' });

    if (team.completed_order < station.sort_order) {
      return res.status(403).json({ ok: false, error: 'This clue is locked until you scan that station in sequence.' });
    }

    if (!(await hasViewedArrival(team.id, station))) {
      return res.status(403).json({ ok: false, error: 'Continue past the station information before solving the next clue.' });
    }

    const answers = Array.isArray(station.clue_answer_keys) ? station.clue_answer_keys.map(normalizeAnswer).filter(Boolean) : [];
    if (!station.clue_requires_solution || answers.length === 0) {
      return res.status(200).json({
        ok: true,
        message: 'This clue is already available.',
        messageKind: 'current',
        station: publicStation(station, true),
      });
    }

    if (!answers.includes(submittedAnswer)) {
      return res.status(403).json({ ok: false, error: 'That answer does not unlock the clue yet.' });
    }

    const { error: insertError } = await supabaseAdmin
      .from('clue_unlocks')
      .upsert({ team_id: team.id, station_id: station.id }, { onConflict: 'team_id,station_id' });

    if (insertError) return res.status(500).json({ ok: false, error: insertError.message });

    return res.status(200).json({
      ok: true,
      message: 'Clue revealed.',
      messageKind: 'current',
      station: publicStation(station, true),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid request.';
    return res.status(400).json({ ok: false, error: message });
  }
}

function normalizeAnswer(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
