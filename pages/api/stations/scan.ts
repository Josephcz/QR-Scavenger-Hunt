import type { NextApiRequest, NextApiResponse } from 'next';
import { methodNotAllowed, verifyTeam } from '../../../lib/http';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

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

    const currentStation = team.completed_order > 0 ? await getStationByOrder(team.completed_order) : null;

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

    const messageKind: ScanMessageKind = requestedStation.sort_order <= team.completed_order ? 'past' : 'future';
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
  const leaderboard = isFinalStation ? await getLeaderboard() : [];
  const clueUnlocked = await hasUnlockedClue(team.id, station);
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
    station: publicStation(station, clueUnlocked),
  };
}

function scanMessage(kind: ScanMessageKind, points: number) {
  switch (kind) {
    case 'awarded':
      return `QR scan confirmed. +${points} point${points === 1 ? '' : 's'}.`;
    case 'past':
      return 'That QR is from an earlier station. Here is your current clue.';
    case 'future':
      return 'That QR is locked for later. Here is your current clue.';
    case 'finished':
      return 'You already finished the hunt.';
    case 'current':
    default:
      return 'This QR scan was already counted. Here is your current clue.';
  }
}

async function getFinalActiveStation() {
  const { data, error } = await supabaseAdmin
    .from('stations')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

async function getStationByOrder(order: number) {
  const { data, error } = await supabaseAdmin
    .from('stations')
    .select('*')
    .eq('sort_order', order)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

async function hasUsedHint(teamId: string, stationId: string) {
  const { data } = await supabaseAdmin
    .from('hint_usages')
    .select('id')
    .eq('team_id', teamId)
    .eq('station_id', stationId)
    .maybeSingle();

  return Boolean(data);
}

async function hasUnlockedClue(teamId: string, station: any) {
  if (!station.clue_requires_solution) return true;
  const answers = Array.isArray(station.clue_answer_keys) ? station.clue_answer_keys : [];
  if (answers.length === 0) return true;

  const { data } = await supabaseAdmin
    .from('clue_unlocks')
    .select('id')
    .eq('team_id', teamId)
    .eq('station_id', station.id)
    .maybeSingle();

  return Boolean(data);
}

async function getLeaderboard() {
  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('team_name,total_score,completed_order,updated_at')
    .order('total_score', { ascending: false })
    .order('completed_order', { ascending: false })
    .order('updated_at', { ascending: true })
    .limit(25);

  if (error || !data) return [];
  return data.map((team, index) => ({
    rank: index + 1,
    name: team.team_name,
    score: team.total_score,
    completedOrder: team.completed_order,
  }));
}

function publicStation(station: any, clueUnlocked: boolean) {
  const requiresClueUnlock = Boolean(station.clue_requires_solution && Array.isArray(station.clue_answer_keys) && station.clue_answer_keys.length);
  const canShowClue = !requiresClueUnlock || clueUnlocked;
  return {
    id: station.id,
    order: station.sort_order,
    code: station.code,
    title: station.title,
    body: canShowClue ? station.body_markdown : '',
    imageUrl: canShowClue ? station.image_url : null,
    points: station.points,
    hasHint: Boolean(station.hint_text || station.hint_image_url),
    hintPenalty: station.hint_penalty || 0,
    clueRequiresSolution: requiresClueUnlock,
    clueUnlocked: canShowClue,
    cluePromptText: requiresClueUnlock && !canShowClue ? station.clue_prompt_text : null,
    cluePromptImageUrl: requiresClueUnlock && !canShowClue ? station.clue_prompt_image_url : null,
  };
}
