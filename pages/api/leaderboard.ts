import type { NextApiRequest, NextApiResponse } from 'next';
import { methodNotAllowed } from '../../lib/http';
import { supabaseAdmin } from '../../lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET');

  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('team_name,total_score,completed_order,updated_at')
    .order('total_score', { ascending: false })
    .order('completed_order', { ascending: false })
    .order('updated_at', { ascending: true })
    .limit(25);

  if (error) return res.status(500).json({ ok: false, error: error.message });

  return res.status(200).json({
    ok: true,
    teams: (data || []).map((team, index) => ({
      rank: index + 1,
      name: team.team_name,
      score: team.total_score,
      completedOrder: team.completed_order,
    })),
  });
}
