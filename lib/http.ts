import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from './supabaseAdmin';

export function methodNotAllowed(res: NextApiResponse, allowed = 'POST') {
  res.setHeader('Allow', allowed);
  return res.status(405).json({ ok: false, error: 'Method not allowed.' });
}

export function getAdminPassword(req: NextApiRequest) {
  const header = req.headers.authorization || '';
  return header.replace(/^Bearer\s+/i, '').trim();
}

export function assertAdmin(req: NextApiRequest) {
  const expected = process.env.SCAVENGER_ADMIN_PASSWORD;
  const actual = getAdminPassword(req);
  return Boolean(expected && actual === expected);
}

export async function verifyTeam(teamId: string | undefined, deviceKey: string | undefined) {
  if (!teamId || !deviceKey) {
    return { team: null, error: 'Missing team credentials.' };
  }

  const { data: team, error } = await supabaseAdmin
    .from('teams')
    .select('*')
    .eq('id', teamId)
    .eq('device_key', deviceKey)
    .maybeSingle();

  if (error) return { team: null, error: error.message };
  if (!team) return { team: null, error: 'Team not found. Please register again or use a recovery code.' };
  return { team, error: null };
}
