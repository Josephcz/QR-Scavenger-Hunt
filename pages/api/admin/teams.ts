import type { NextApiRequest, NextApiResponse } from 'next';
import { assertAdmin, methodNotAllowed } from '../../../lib/http';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
  if (!assertAdmin(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' });

  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('id, team_name, recovery_code, total_score, completed_order, created_at, updated_at')
    .order('total_score', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ ok: false, error: error.message });

  return res.status(200).json({
    ok: true,
    teams: data.map((team) => ({
      id: team.id,
      name: team.team_name,
      recoveryCode: team.recovery_code,
      score: team.total_score,
      completedOrder: team.completed_order,
      createdAt: team.created_at,
      updatedAt: team.updated_at,
    })),
  });
}
