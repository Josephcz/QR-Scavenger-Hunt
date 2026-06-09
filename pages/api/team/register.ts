import type { NextApiRequest, NextApiResponse } from 'next';
import { normalizeRecoveryCode, randomCode, randomSecret } from '../../../lib/codes';
import { methodNotAllowed } from '../../../lib/http';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

type RegisterBody = {
  value?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res);

  try {
    const body = req.body as RegisterBody;
    const value = body.value?.trim();

    if (!value || value.length < 2) {
      return res.status(400).json({ ok: false, error: 'Enter a team name or recovery code.' });
    }

    const normalized = normalizeRecoveryCode(value);

    // Recovery flow: if the input matches an existing recovery code, return that team.
    const { data: recovered, error: recoveryError } = await supabaseAdmin
      .from('teams')
      .select('id, team_name, recovery_code, device_key, total_score, completed_order')
      .eq('recovery_code', normalized)
      .maybeSingle();

    if (recoveryError) {
      return res.status(500).json({ ok: false, error: recoveryError.message });
    }

    if (recovered) {
      return res.status(200).json({
        ok: true,
        mode: 'recovered',
        team: {
          id: recovered.id,
          name: recovered.team_name,
          recoveryCode: recovered.recovery_code,
          deviceKey: recovered.device_key,
          score: recovered.total_score,
          completedOrder: recovered.completed_order,
        },
      });
    }

    // Creation flow: otherwise the input is a new team name.
    if (value.length > 80) {
      return res.status(400).json({ ok: false, error: 'Team name is too long.' });
    }

    for (let attempts = 0; attempts < 5; attempts += 1) {
      const recoveryCode = randomCode('REC', 8);
      const deviceKey = randomSecret(24);
      const { data: created, error: createError } = await supabaseAdmin
        .from('teams')
        .insert({
          team_name: value,
          recovery_code: recoveryCode,
          device_key: deviceKey,
        })
        .select('id, team_name, recovery_code, device_key, total_score, completed_order')
        .single();

      if (!createError && created) {
        return res.status(200).json({
          ok: true,
          mode: 'created',
          team: {
            id: created.id,
            name: created.team_name,
            recoveryCode: created.recovery_code,
            deviceKey: created.device_key,
            score: created.total_score,
            completedOrder: created.completed_order,
          },
        });
      }

      if (!createError?.message.includes('duplicate key')) {
        return res.status(500).json({ ok: false, error: createError?.message || 'Could not create team.' });
      }
    }

    return res.status(500).json({ ok: false, error: 'Could not generate a unique recovery code. Try again.' });
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid request.' });
  }
}
