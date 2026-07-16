import type { NextApiRequest, NextApiResponse } from 'next';
import { randomCode, randomSecret } from '../../../lib/codes';
import { assertAdmin, methodNotAllowed } from '../../../lib/http';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

const IMAGE_BUCKET = 'hunt-images';
const IMAGE_FIELDS = ['imageUrl', 'cluePromptImageUrl', 'hintImageUrl'] as const;
type ImageField = (typeof IMAGE_FIELDS)[number];

type StationBody = {
  id?: string;
  sortOrder?: number;
  title?: string;
  body?: string;
  imageUrl?: string;
  points?: number;
  clueRequiresSolution?: boolean;
  cluePromptText?: string;
  cluePromptImageUrl?: string;
  clueAnswerKeys?: string[];
  hintText?: string;
  hintImageUrl?: string;
  hintPenalty?: number;
  isActive?: boolean;
};

type ImageUrlMap = Record<ImageField, string | null>;

type ValidatedStationValues = {
  imageUrls: ImageUrlMap;
  dbPayload: Record<string, unknown>;
};

type ValidationResult =
  | { ok: true; values: ValidatedStationValues }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!assertAdmin(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' });

  if (req.method === 'GET') return getStations(req, res);
  if (req.method === 'POST') return createStation(req, res);
  if (req.method === 'PUT') return updateStation(req, res);
  return methodNotAllowed(res, 'GET, POST, PUT');
}

async function getStations(req: NextApiRequest, res: NextApiResponse) {
  const { data, error } = await supabaseAdmin
    .from('stations')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) return res.status(500).json({ ok: false, error: error.message });

  const baseUrl = requestOrigin(req);

  return res.status(200).json({
    ok: true,
    stations: data.map((station) => publicAdminStation(station, baseUrl)),
  });
}

async function createStation(req: NextApiRequest, res: NextApiResponse) {
  try {
    const body = req.body as StationBody;
    const validated = validateStationBody(body);
    if (!validated.ok) return res.status(400).json({ ok: false, error: validated.error });

    const reuseError = await findImageReuseError(validated.values.imageUrls, null);
    if (reuseError) return res.status(409).json({ ok: false, error: reuseError });

    for (let attempts = 0; attempts < 5; attempts += 1) {
      const code = randomCode('ST', 8);
      const scanToken = `scan_${randomSecret(12)}`;
      const { data, error } = await supabaseAdmin
        .from('stations')
        .insert({
          ...validated.values.dbPayload,
          code,
          scan_token: scanToken,
        })
        .select('*')
        .single();

      if (!error && data) {
        const baseUrl = requestOrigin(req);
        return res.status(200).json({ ok: true, station: publicAdminStation(data, baseUrl) });
      }

      if (!error?.message.includes('duplicate key')) {
        return res.status(500).json({ ok: false, error: friendlyStationError(error?.message || 'Could not create station.') });
      }
    }

    return res.status(500).json({ ok: false, error: 'Could not generate a unique station code.' });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'Invalid request.' });
  }
}

async function updateStation(req: NextApiRequest, res: NextApiResponse) {
  try {
    const body = req.body as StationBody;
    const stationId = body.id?.trim();
    if (!stationId) return res.status(400).json({ ok: false, error: 'Missing station id.' });

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('stations')
      .select('*')
      .eq('id', stationId)
      .maybeSingle();

    if (existingError) return res.status(500).json({ ok: false, error: existingError.message });
    if (!existing) return res.status(404).json({ ok: false, error: 'Station not found.' });

    const validated = validateStationBody(body);
    if (!validated.ok) return res.status(400).json({ ok: false, error: validated.error });

    const reuseError = await findImageReuseError(validated.values.imageUrls, stationId);
    if (reuseError) return res.status(409).json({ ok: false, error: reuseError });

    const { data, error } = await supabaseAdmin
      .from('stations')
      .update({
        ...validated.values.dbPayload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', stationId)
      .select('*')
      .single();

    if (error) return res.status(500).json({ ok: false, error: friendlyStationError(error.message) });

    const deletionWarnings = await deleteRemovedSupabaseImages(existing, data);
    const baseUrl = requestOrigin(req);
    return res.status(200).json({
      ok: true,
      station: publicAdminStation(data, baseUrl),
      deletionWarnings,
    });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'Invalid request.' });
  }
}

function validateStationBody(body: StationBody): ValidationResult {
  const values = validatedStationValues(body);
  if ('error' in values) return { ok: false, error: values.error };
  return { ok: true, values };
}

function validatedStationValues(body: StationBody): ValidatedStationValues | { error: string } {
  const sortOrder = Number(body.sortOrder);
  const points = Number.isFinite(Number(body.points)) ? Number(body.points) : 10;
  const hintPenalty = Number.isFinite(Number(body.hintPenalty)) ? Number(body.hintPenalty) : 0;
  const clueRequiresSolution = Boolean(body.clueRequiresSolution);
  const clueAnswerKeys = cleanAnswerKeys(body.clueAnswerKeys || []);
  const imageUrl = cleanOptionalString(body.imageUrl);
  const cluePromptImageUrl = cleanOptionalString(body.cluePromptImageUrl);
  const hintImageUrl = cleanOptionalString(body.hintImageUrl);

  if (!Number.isInteger(sortOrder) || sortOrder < 1) {
    return { error: 'Station order must be a positive integer.' };
  }
  if (!Number.isInteger(points) || points < 0) {
    return { error: 'Points must be a non-negative integer.' };
  }
  if (!Number.isInteger(hintPenalty) || hintPenalty < 0) {
    return { error: 'Hint penalty must be a non-negative integer.' };
  }
  if (!body.title?.trim()) return { error: 'Station title is required.' };
  if (clueRequiresSolution && clueAnswerKeys.length === 0) {
    return { error: 'Add at least one accepted answer when hiding the clue behind a prompt.' };
  }

  const imageUrls = {
    imageUrl,
    cluePromptImageUrl: clueRequiresSolution ? cluePromptImageUrl : null,
    hintImageUrl,
  };
  const duplicateFieldError = duplicateSubmittedImageError(imageUrls);
  if (duplicateFieldError) return { error: duplicateFieldError };

  return {
    imageUrls,
    dbPayload: {
      sort_order: sortOrder,
      title: body.title.trim(),
      body_markdown: body.body?.trim() || '',
      image_url: imageUrl,
      question_text: '',
      answer_key: null,
      points,
      clue_requires_solution: clueRequiresSolution,
      clue_prompt_text: clueRequiresSolution ? cleanOptionalString(body.cluePromptText) : null,
      clue_prompt_image_url: clueRequiresSolution ? cluePromptImageUrl : null,
      clue_answer_keys: clueRequiresSolution ? clueAnswerKeys : [],
      hint_prompt_text: null,
      hint_prompt_image_url: null,
      hint_answer_key: null,
      hint_text: cleanOptionalString(body.hintText),
      hint_image_url: hintImageUrl,
      hint_penalty: hintPenalty,
      is_active: body.isActive !== false,
    },
  };
}

function cleanAnswerKeys(values: string[]) {
  return Array.from(new Set(values.map((value) => normalizeAnswer(value)).filter(Boolean)));
}

function normalizeAnswer(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function cleanOptionalString(value?: string) {
  const clean = value?.trim();
  return clean || null;
}

function duplicateSubmittedImageError(imageUrls: ImageUrlMap) {
  const seen = new Map<string, ImageField>();
  for (const field of IMAGE_FIELDS) {
    const url = imageUrls[field];
    if (!url) continue;
    const existingField = seen.get(url);
    if (existingField) {
      return `Use a different image for ${fieldLabel(existingField)} and ${fieldLabel(field)}. Reusing the same image URL is blocked so removed uploads can be safely deleted.`;
    }
    seen.set(url, field);
  }
  return '';
}

async function findImageReuseError(imageUrls: ImageUrlMap, allowedStationId: string | null) {
  const submitted = new Set(Object.values(imageUrls).filter(Boolean) as string[]);
  if (!submitted.size) return '';

  const { data, error } = await supabaseAdmin
    .from('stations')
    .select('id,title,image_url,clue_prompt_image_url,hint_image_url');

  if (error) return error.message;

  for (const station of data || []) {
    if (allowedStationId && station.id === allowedStationId) continue;
    const existing: Array<[string, string | null]> = [
      ['clue image', station.image_url],
      ['prompt image', station.clue_prompt_image_url],
      ['hint image', station.hint_image_url],
    ];
    for (const [label, url] of existing) {
      if (url && submitted.has(url)) {
        return `That image URL is already used as the ${label} for “${station.title}”. Reusing images is blocked so deletion is safe.`;
      }
    }
  }

  return '';
}

async function deleteRemovedSupabaseImages(oldStation: any, newStation: any) {
  const oldUrls = stationImageUrls(oldStation);
  const newUrls = new Set(stationImageUrls(newStation));
  const warnings: string[] = [];

  for (const oldUrl of oldUrls) {
    if (newUrls.has(oldUrl)) continue;
    const path = storagePathFromPublicUrl(oldUrl);
    if (!path) continue;
    const { error } = await supabaseAdmin.storage.from(IMAGE_BUCKET).remove([path]);
    if (error) warnings.push(`Could not delete old image ${path}: ${error.message}`);
  }

  return warnings;
}

function stationImageUrls(station: any) {
  return [station.image_url, station.clue_prompt_image_url, station.hint_image_url].filter(Boolean) as string[];
}

function storagePathFromPublicUrl(url: string) {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  if (!supabaseUrl || !url.startsWith(`${supabaseUrl}/storage/v1/object/public/${IMAGE_BUCKET}/`)) return null;
  const rawPath = url.slice(`${supabaseUrl}/storage/v1/object/public/${IMAGE_BUCKET}/`.length);
  return decodeURIComponent(rawPath.split('?')[0] || '');
}

function friendlyStationError(message: string) {
  if (message.includes('stations_sort_order_key') || (message.includes('duplicate key') && message.includes('sort_order'))) {
    return 'Another station already uses that station order. Pick a different order first.';
  }
  return message;
}

function fieldLabel(field: ImageField) {
  if (field === 'imageUrl') return 'the clue image';
  if (field === 'cluePromptImageUrl') return 'the prompt image';
  return 'the paid hint image';
}

function requestOrigin(req: NextApiRequest) {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'http';
  const host = req.headers.host || 'localhost:3000';
  return `${proto}://${host}`;
}

function publicAdminStation(station: any, baseUrl: string) {
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  const qrUrl = `${cleanBaseUrl}/?c=${encodeURIComponent(station.code)}&t=${encodeURIComponent(station.scan_token)}`;
  return {
    id: station.id,
    order: station.sort_order,
    code: station.code,
    scanToken: station.scan_token,
    title: station.title,
    body: station.body_markdown,
    imageUrl: station.image_url,
    points: station.points,
    clueRequiresSolution: Boolean(station.clue_requires_solution),
    cluePromptText: station.clue_prompt_text,
    cluePromptImageUrl: station.clue_prompt_image_url,
    clueAnswerKeys: station.clue_answer_keys || [],
    hintText: station.hint_text,
    hintImageUrl: station.hint_image_url,
    hintPenalty: station.hint_penalty,
    isActive: station.is_active,
    qrUrl,
  };
}
