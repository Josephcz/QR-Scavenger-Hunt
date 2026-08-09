import type { NextApiRequest, NextApiResponse } from 'next';
import { randomCode, randomSecret } from '../../../lib/codes';
import { assertAdmin, methodNotAllowed } from '../../../lib/http';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

const IMAGE_BUCKET = 'hunt-images';
const AUDIO_BUCKET = 'hunt-audio';
const IMAGE_FIELDS = ['arrivalImageUrl', 'imageUrl', 'cluePromptImageUrl', 'hintImageUrl'] as const;
const AUDIO_FIELDS = ['audioUrl', 'cluePromptAudioUrl', 'hintAudioUrl'] as const;
type ImageField = (typeof IMAGE_FIELDS)[number];
type AudioField = (typeof AUDIO_FIELDS)[number];

type StationBody = {
  id?: string;
  sortOrder?: number;
  title?: string;
  arrivalTitle?: string;
  arrivalText?: string;
  arrivalImageUrl?: string;
  body?: string;
  imageUrl?: string;
  audioUrl?: string;
  points?: number;
  clueRequiresSolution?: boolean;
  cluePromptText?: string;
  cluePromptImageUrl?: string;
  cluePromptAudioUrl?: string;
  clueAnswerKeys?: string[];
  hintText?: string;
  hintImageUrl?: string;
  hintAudioUrl?: string;
  hintPenalty?: number;
  isActive?: boolean;
};

type ImageUrlMap = Record<ImageField, string | null>;
type AudioUrlMap = Record<AudioField, string | null>;

type ValidatedStationValues = {
  imageUrls: ImageUrlMap;
  audioUrls: AudioUrlMap;
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
    if (validated.ok === false) return res.status(400).json({ ok: false, error: validated.error });

    const reuseError = await findMediaReuseError(validated.values.imageUrls, validated.values.audioUrls, null);
    if (reuseError) return res.status(409).json({ ok: false, error: reuseError });

    const sortOrder = Number(validated.values.dbPayload.sort_order);
    const { data: orderConflict, error: orderConflictError } = await supabaseAdmin
      .from('stations')
      .select('id,title')
      .eq('sort_order', sortOrder)
      .maybeSingle();
    if (orderConflictError) return res.status(500).json({ ok: false, error: orderConflictError.message });
    if (orderConflict) {
      return res.status(409).json({ ok: false, error: `Station order ${sortOrder} is already used by “${orderConflict.title}”. Choose a different order.` });
    }

    const maxAttempts = sortOrder === 0 ? 1 : 5;
    for (let attempts = 0; attempts < maxAttempts; attempts += 1) {
      const code = sortOrder === 0 ? null : randomCode('ST', 8);
      const scanToken = sortOrder === 0 ? null : `scan_${randomSecret(12)}`;
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

      if (error && isSortOrderDuplicate(error.message)) {
        return res.status(409).json({ ok: false, error: friendlyStationError(error.message) });
      }
      if (sortOrder === 0 || !error?.message.includes('duplicate key')) {
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
    if (validated.ok === false) return res.status(400).json({ ok: false, error: validated.error });

    const reuseError = await findMediaReuseError(validated.values.imageUrls, validated.values.audioUrls, stationId);
    if (reuseError) return res.status(409).json({ ok: false, error: reuseError });

    const nextOrder = Number(validated.values.dbPayload.sort_order);
    const crossingFromStart = existing.sort_order === 0 && nextOrder > 0;
    const crossingToStart = existing.sort_order > 0 && nextOrder === 0;
    const qrIdentityUpdate = crossingToStart
      ? { code: null, scan_token: null }
      : crossingFromStart
        ? { code: randomCode('ST', 8), scan_token: `scan_${randomSecret(12)}` }
        : {};

    const { data, error } = await supabaseAdmin
      .from('stations')
      .update({
        ...validated.values.dbPayload,
        ...qrIdentityUpdate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', stationId)
      .select('*')
      .single();

    if (error) {
      const status = isSortOrderDuplicate(error.message) ? 409 : 500;
      return res.status(status).json({ ok: false, error: friendlyStationError(error.message) });
    }

    const deletionWarnings = await deleteRemovedSupabaseMedia(existing, data);
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
  const arrivalTitle = cleanOptionalString(body.arrivalTitle);
  const arrivalText = cleanOptionalString(body.arrivalText);
  const arrivalImageUrl = cleanOptionalString(body.arrivalImageUrl);
  const clueAnswerKeys = cleanAnswerKeys(body.clueAnswerKeys || []);
  const imageUrl = cleanOptionalString(body.imageUrl);
  const cluePromptImageUrl = cleanOptionalString(body.cluePromptImageUrl);
  const hintImageUrl = cleanOptionalString(body.hintImageUrl);
  const audioUrl = cleanOptionalString(body.audioUrl);
  const cluePromptAudioUrl = cleanOptionalString(body.cluePromptAudioUrl);
  const hintAudioUrl = cleanOptionalString(body.hintAudioUrl);

  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    return { error: 'Station order must be zero or a positive integer.' };
  }
  if (!Number.isInteger(points) || points < 0) {
    return { error: 'Points must be a non-negative integer.' };
  }
  if (!Number.isInteger(hintPenalty) || hintPenalty < 0) {
    return { error: 'Hint penalty must be a non-negative integer.' };
  }
  if (!body.title?.trim()) return { error: 'Station title is required.' };
  const hasArrivalInfo = Boolean(arrivalTitle || arrivalText || arrivalImageUrl);
  if (hasArrivalInfo && (!arrivalTitle || !arrivalText)) {
    return { error: 'Arrival information needs both an arrival title and arrival description. The image is optional.' };
  }
  if (clueRequiresSolution && clueAnswerKeys.length === 0) {
    return { error: 'Add at least one accepted answer when hiding the clue behind a prompt.' };
  }

  const imageUrls = {
    arrivalImageUrl,
    imageUrl,
    cluePromptImageUrl: clueRequiresSolution ? cluePromptImageUrl : null,
    hintImageUrl,
  };
  const duplicateFieldError = duplicateSubmittedImageError(imageUrls);
  if (duplicateFieldError) return { error: duplicateFieldError };
  const audioUrls = {
    audioUrl,
    cluePromptAudioUrl: clueRequiresSolution ? cluePromptAudioUrl : null,
    hintAudioUrl,
  };
  const duplicateAudioError = duplicateSubmittedAudioError(audioUrls);
  if (duplicateAudioError) return { error: duplicateAudioError };

  return {
    imageUrls,
    audioUrls,
    dbPayload: {
      sort_order: sortOrder,
      title: body.title.trim(),
      arrival_title: arrivalTitle,
      arrival_text: arrivalText,
      arrival_image_url: arrivalImageUrl,
      body_markdown: body.body?.trim() || '',
      image_url: imageUrl,
      audio_url: audioUrl,
      question_text: '',
      answer_key: null,
      points: sortOrder === 0 ? 0 : points,
      clue_requires_solution: clueRequiresSolution,
      clue_prompt_text: clueRequiresSolution ? cleanOptionalString(body.cluePromptText) : null,
      clue_prompt_image_url: clueRequiresSolution ? cluePromptImageUrl : null,
      clue_prompt_audio_url: clueRequiresSolution ? cluePromptAudioUrl : null,
      clue_answer_keys: clueRequiresSolution ? clueAnswerKeys : [],
      hint_prompt_text: null,
      hint_prompt_image_url: null,
      hint_answer_key: null,
      hint_text: cleanOptionalString(body.hintText),
      hint_image_url: hintImageUrl,
      hint_audio_url: hintAudioUrl,
      hint_penalty: hintPenalty,
      is_active: sortOrder === 0 ? true : body.isActive !== false,
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

function duplicateSubmittedAudioError(audioUrls: AudioUrlMap) {
  const seen = new Map<string, AudioField>();
  for (const field of AUDIO_FIELDS) {
    const url = audioUrls[field];
    if (!url) continue;
    const existingField = seen.get(url);
    if (existingField) {
      return `Use different audio for ${audioFieldLabel(existingField)} and ${audioFieldLabel(field)}. Reusing the same audio URL is blocked so removed uploads can be safely deleted.`;
    }
    seen.set(url, field);
  }
  return '';
}

async function findMediaReuseError(imageUrls: ImageUrlMap, audioUrls: AudioUrlMap, allowedStationId: string | null) {
  const submittedImages = new Set(Object.values(imageUrls).filter(Boolean) as string[]);
  const submittedAudio = new Set(Object.values(audioUrls).filter(Boolean) as string[]);
  if (!submittedImages.size && !submittedAudio.size) return '';

  const { data, error } = await supabaseAdmin
    .from('stations')
    .select('id,title,arrival_image_url,image_url,clue_prompt_image_url,hint_image_url,audio_url,clue_prompt_audio_url,hint_audio_url');

  if (error) return error.message;

  for (const station of data || []) {
    if (allowedStationId && station.id === allowedStationId) continue;
    const existingImages: Array<[string, string | null]> = [
      ['arrival image', station.arrival_image_url],
      ['clue image', station.image_url],
      ['prompt image', station.clue_prompt_image_url],
      ['hint image', station.hint_image_url],
    ];
    for (const [label, url] of existingImages) {
      if (url && submittedImages.has(url)) {
        return `That image URL is already used as the ${label} for “${station.title}”. Reusing images is blocked so deletion is safe.`;
      }
    }

    const existingAudio: Array<[string, string | null]> = [
      ['clue audio', station.audio_url],
      ['prompt audio', station.clue_prompt_audio_url],
      ['paid hint audio', station.hint_audio_url],
    ];
    for (const [label, url] of existingAudio) {
      if (url && submittedAudio.has(url)) {
        return `That audio URL is already used as the ${label} for “${station.title}”. Reusing audio is blocked so deletion is safe.`;
      }
    }
  }

  return '';
}

async function deleteRemovedSupabaseMedia(oldStation: any, newStation: any) {
  const oldUrls = stationImageUrls(oldStation);
  const newUrls = new Set(stationImageUrls(newStation));
  const warnings: string[] = [];

  for (const oldUrl of oldUrls) {
    if (newUrls.has(oldUrl)) continue;
    const path = storagePathFromPublicUrl(oldUrl, IMAGE_BUCKET);
    if (!path) continue;
    const { error } = await supabaseAdmin.storage.from(IMAGE_BUCKET).remove([path]);
    if (error) warnings.push(`Could not delete old image ${path}: ${error.message}`);
  }

  const oldAudioUrls = stationAudioUrls(oldStation);
  const newAudioUrls = new Set(stationAudioUrls(newStation));
  for (const oldAudioUrl of oldAudioUrls) {
    if (newAudioUrls.has(oldAudioUrl)) continue;
    const path = storagePathFromPublicUrl(oldAudioUrl, AUDIO_BUCKET);
    if (!path) continue;
    const { error } = await supabaseAdmin.storage.from(AUDIO_BUCKET).remove([path]);
    if (error) warnings.push(`Could not delete old audio ${path}: ${error.message}`);
  }

  return warnings;
}

function stationImageUrls(station: any) {
  return [station.arrival_image_url, station.image_url, station.clue_prompt_image_url, station.hint_image_url].filter(Boolean) as string[];
}

function stationAudioUrls(station: any) {
  return [station.audio_url, station.clue_prompt_audio_url, station.hint_audio_url].filter(Boolean) as string[];
}

function storagePathFromPublicUrl(url: string, bucket: string) {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  if (!supabaseUrl || !url.startsWith(`${supabaseUrl}/storage/v1/object/public/${bucket}/`)) return null;
  const rawPath = url.slice(`${supabaseUrl}/storage/v1/object/public/${bucket}/`.length);
  return decodeURIComponent(rawPath.split('?')[0] || '');
}

function isSortOrderDuplicate(message: string) {
  return message.includes('stations_sort_order_key') || (message.includes('duplicate key') && message.includes('sort_order'));
}

function friendlyStationError(message: string) {
  if (isSortOrderDuplicate(message)) {
    return 'Another station already uses that station order. Pick a different order first.';
  }
  return message;
}

function fieldLabel(field: ImageField) {
  if (field === 'arrivalImageUrl') return 'the arrival image';
  if (field === 'imageUrl') return 'the clue image';
  if (field === 'cluePromptImageUrl') return 'the prompt image';
  return 'the paid hint image';
}

function audioFieldLabel(field: AudioField) {
  if (field === 'audioUrl') return 'the clue audio';
  if (field === 'cluePromptAudioUrl') return 'the prompt audio';
  return 'the paid hint audio';
}

function requestOrigin(req: NextApiRequest) {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'http';
  const host = req.headers.host || 'localhost:3000';
  return `${proto}://${host}`;
}

function publicAdminStation(station: any, baseUrl: string) {
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  const qrUrl = station.sort_order === 0
    ? cleanBaseUrl
    : `${cleanBaseUrl}/?c=${encodeURIComponent(station.code)}&t=${encodeURIComponent(station.scan_token)}`;
  return {
    id: station.id,
    order: station.sort_order,
    code: station.code,
    scanToken: station.scan_token,
    title: station.title,
    arrivalTitle: station.arrival_title,
    arrivalText: station.arrival_text,
    arrivalImageUrl: station.arrival_image_url,
    body: station.body_markdown,
    imageUrl: station.image_url,
    audioUrl: station.audio_url,
    points: station.points,
    clueRequiresSolution: Boolean(station.clue_requires_solution),
    cluePromptText: station.clue_prompt_text,
    cluePromptImageUrl: station.clue_prompt_image_url,
    cluePromptAudioUrl: station.clue_prompt_audio_url,
    clueAnswerKeys: station.clue_answer_keys || [],
    hintText: station.hint_text,
    hintImageUrl: station.hint_image_url,
    hintAudioUrl: station.hint_audio_url,
    hintPenalty: station.hint_penalty,
    isActive: station.is_active,
    qrUrl,
  };
}
