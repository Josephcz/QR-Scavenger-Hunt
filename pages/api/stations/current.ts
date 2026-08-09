import type { NextApiRequest, NextApiResponse } from 'next';
import { methodNotAllowed, verifyTeam } from '../../../lib/http';
import { getFinalActiveStation, getLeaderboard, getStationByOrder, hasUnlockedClue, hasUsedHint, hasViewedArrival, publicStation } from '../../../lib/stationState';

type CurrentBody = {
  teamId?: string;
  deviceKey?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res);

  try {
    const body = req.body as CurrentBody;
    const { team, error: teamError } = await verifyTeam(body.teamId, body.deviceKey);
    if (!team) return res.status(401).json({ ok: false, error: teamError });

    const station = await getStationByOrder(team.completed_order);
    if (!station) {
      return res.status(404).json({
        ok: false,
        error: team.completed_order === 0
          ? 'The start clue (station 0) has not been configured yet. Ask an admin to create it.'
          : 'Your current clue is unavailable. Ask an admin to check the active station order.',
      });
    }

    const finalStation = await getFinalActiveStation();
    const isFinalStation = Boolean(finalStation && team.completed_order >= finalStation.sort_order && station.sort_order === finalStation.sort_order);
    const clueUnlocked = await hasUnlockedClue(team.id, station);
    const arrivalViewed = await hasViewedArrival(team.id, station);
    const showFinalResults = isFinalStation && arrivalViewed;

    return res.status(200).json({
      ok: true,
      alreadyCompleted: true,
      awardedPoints: 0,
      messageKind: isFinalStation ? 'finished' : 'current',
      message: '',
      requestedOrder: station.sort_order,
      shownOrder: station.sort_order,
      score: team.total_score,
      completedOrder: team.completed_order,
      isFinalStation,
      leaderboard: showFinalResults ? await getLeaderboard() : [],
      hintAlreadyUsed: await hasUsedHint(team.id, station.id),
      station: publicStation(station, clueUnlocked, arrivalViewed),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid request.';
    return res.status(400).json({ ok: false, error: message });
  }
}
