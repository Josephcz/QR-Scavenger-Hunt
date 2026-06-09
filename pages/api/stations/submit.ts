import type { NextApiRequest, NextApiResponse } from 'next';
import { methodNotAllowed } from '../../../lib/http';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res);

  return res.status(410).json({
    ok: false,
    error: 'Answer submissions are disabled in this version. Scanning the correct QR code awards points automatically.',
  });
}
