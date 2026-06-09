import type { NextApiRequest, NextApiResponse } from 'next';
import { methodNotAllowed, verifyTeam } from '../../../lib/http';

type StatusBody = {
  teamId?: string;
  deviceKey?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res);

  try {
    const body = req.body as StatusBody;
    const { team, error } = await verifyTeam(body.teamId, body.deviceKey);
    if (!team) return res.status(401).json({ ok: false, error });

    return res.status(200).json({
      ok: true,
      team: {
        id: team.id,
        name: team.team_name,
        recoveryCode: team.recovery_code,
        score: team.total_score,
        completedOrder: team.completed_order,
      },
    });
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid request.' });
  }
}
