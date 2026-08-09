import type { NextApiRequest, NextApiResponse } from 'next';
import { methodNotAllowed, verifyTeam } from '../../../lib/http';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { getFinalActiveStation, getLeaderboard, hasUnlockedClue, hasUsedHint, publicStation, stationHasArrivalInfo } from '../../../lib/stationState';

type ContinueBody = {
  teamId?: string;
  deviceKey?: string;
  stationId?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res);

  try {
    const body = req.body as ContinueBody;
    const { team, error: teamError } = await verifyTeam(body.teamId, body.deviceKey);
    if (!team) return res.status(401).json({ ok: false, error: teamError });

    const stationId = body.stationId?.trim();
    if (!stationId) return res.status(400).json({ ok: false, error: 'Missing station id.' });

    const { data: station, error: stationError } = await supabaseAdmin
      .from('stations')
      .select('*')
      .eq('id', stationId)
      .eq('is_active', true)
      .maybeSingle();

    if (stationError) return res.status(500).json({ ok: false, error: stationError.message });
    if (!station) return res.status(404).json({ ok: false, error: 'Station not found.' });
    if (station.sort_order !== team.completed_order) {
      return res.status(409).json({ ok: false, error: 'This is no longer your current station. Reload the hunt to continue.' });
    }

    if (stationHasArrivalInfo(station)) {
      const { error: viewError } = await supabaseAdmin
        .from('station_arrival_views')
        .upsert({ team_id: team.id, station_id: station.id }, { onConflict: 'team_id,station_id' });
      if (viewError) return res.status(500).json({ ok: false, error: viewError.message });
    }

    const finalStation = await getFinalActiveStation();
    const isFinalStation = Boolean(finalStation && station.sort_order === finalStation.sort_order && team.completed_order >= finalStation.sort_order);
    const clueUnlocked = await hasUnlockedClue(team.id, station);

    return res.status(200).json({
      ok: true,
      score: team.total_score,
      completedOrder: team.completed_order,
      isFinalStation,
      leaderboard: isFinalStation ? await getLeaderboard() : [],
      hintAlreadyUsed: await hasUsedHint(team.id, station.id),
      station: publicStation(station, clueUnlocked, true),
    });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'Invalid request.' });
  }
}
