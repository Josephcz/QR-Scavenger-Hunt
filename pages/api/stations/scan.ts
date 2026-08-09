import type { NextApiRequest, NextApiResponse } from 'next';
import { methodNotAllowed, verifyTeam } from '../../../lib/http';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { getFinalActiveStation, getLeaderboard, getStationByOrder, hasUnlockedClue, hasUsedHint, hasViewedArrival, publicStation } from '../../../lib/stationState';

type ScanBody = {
  teamId?: string;
  deviceKey?: string;
  code?: string;
  token?: string;
};

type ScanMessageKind = 'awarded' | 'current' | 'past' | 'future' | 'finished';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res);

  try {
    const body = req.body as ScanBody;
    const code = body.code?.trim();
    const token = body.token?.trim();

    if (!code || !token) {
      return res.status(400).json({ ok: false, error: 'This station link is incomplete. Please scan the QR code again.' });
    }

    const { team, error: teamError } = await verifyTeam(body.teamId, body.deviceKey);
    if (!team) return res.status(401).json({ ok: false, error: teamError });

    const { data: requestedStation, error: stationError } = await supabaseAdmin
      .from('stations')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .maybeSingle();

    if (stationError) return res.status(500).json({ ok: false, error: stationError.message });
    if (!requestedStation) return res.status(404).json({ ok: false, error: 'Station not found.' });

    if (requestedStation.scan_token !== token) {
      return res.status(403).json({ ok: false, error: 'This page was not opened from the valid QR code.' });
    }

    const finalStation = await getFinalActiveStation();
    if (!finalStation) return res.status(404).json({ ok: false, error: 'No active stations are configured.' });

    if (team.completed_order >= finalStation.sort_order) {
      return res.status(200).json(await currentCluePayload({
        team,
        station: finalStation,
        requestedStation,
        awardedPoints: 0,
        alreadyCompleted: true,
        messageKind: 'finished',
        isFinalStation: true,
      }));
    }

    const nextOrder = team.completed_order + 1;

    if (requestedStation.sort_order === nextOrder) {
      const { data: result, error: completeError } = await supabaseAdmin.rpc('complete_station', {
        p_team_id: team.id,
        p_station_id: requestedStation.id,
        p_station_order: requestedStation.sort_order,
        p_points: requestedStation.points,
      });

      if (completeError) return res.status(409).json({ ok: false, error: completeError.message });

      const row = Array.isArray(result) ? result[0] : result;
      const score = row?.score ?? team.total_score;
      const completedOrder = row?.completed_order ?? requestedStation.sort_order;
      const alreadyCompleted = row?.already_completed ?? false;
      const isFinalStation = requestedStation.sort_order === finalStation.sort_order;

      return res.status(200).json(await currentCluePayload({
        team: { ...team, total_score: score, completed_order: completedOrder },
        station: requestedStation,
        requestedStation,
        awardedPoints: alreadyCompleted ? 0 : requestedStation.points,
        alreadyCompleted,
        messageKind: alreadyCompleted ? 'current' : 'awarded',
        isFinalStation,
      }));
    }

    const currentStation = await getStationByOrder(team.completed_order);

    if (!currentStation) {
      return res.status(409).json({
        ok: false,
        blocked: true,
        error: 'This station is locked. Find and scan the first QR code to begin.',
        currentScore: team.total_score,
        completedOrder: team.completed_order,
        requestedOrder: requestedStation.sort_order,
      });
    }

    const messageKind: ScanMessageKind = requestedStation.sort_order < team.completed_order
      ? 'past'
      : requestedStation.sort_order > team.completed_order
        ? 'future'
        : 'current';
    return res.status(200).json(await currentCluePayload({
      team,
      station: currentStation,
      requestedStation,
      awardedPoints: 0,
      alreadyCompleted: true,
      messageKind,
      isFinalStation: currentStation.sort_order === finalStation.sort_order,
    }));
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid request.' });
  }
}

async function currentCluePayload({
  team,
  station,
  requestedStation,
  awardedPoints,
  alreadyCompleted,
  messageKind,
  isFinalStation,
}: {
  team: any;
  station: any;
  requestedStation: any;
  awardedPoints: number;
  alreadyCompleted: boolean;
  messageKind: ScanMessageKind;
  isFinalStation: boolean;
}) {
  const clueUnlocked = await hasUnlockedClue(team.id, station);
  const arrivalViewed = await hasViewedArrival(team.id, station);
  const leaderboard = isFinalStation && arrivalViewed ? await getLeaderboard() : [];
  return {
    ok: true,
    alreadyCompleted,
    awardedPoints,
    messageKind,
    message: scanMessage(messageKind, awardedPoints),
    requestedOrder: requestedStation.sort_order,
    shownOrder: station.sort_order,
    score: team.total_score,
    completedOrder: team.completed_order,
    isFinalStation,
    leaderboard,
    hintAlreadyUsed: await hasUsedHint(team.id, station.id),
    station: publicStation(station, clueUnlocked, arrivalViewed),
  };
}

function scanMessage(kind: ScanMessageKind, points: number) {
  switch (kind) {
    case 'awarded':
      return `QR scan confirmed. +${points} point${points === 1 ? '' : 's'}.`;
    case 'past':
      return 'That QR is from an earlier station. Returning you to your current station.';
    case 'future':
      return 'That QR is locked for later. Returning you to your current station.';
    case 'finished':
      return 'The final QR was already counted.';
    case 'current':
    default:
      return 'This QR scan was already counted. You are still at this station.';
  }
}
