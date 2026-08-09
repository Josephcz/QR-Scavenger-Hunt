import { supabaseAdmin } from './supabaseAdmin';

export async function getFinalActiveStation() {
  const { data, error } = await supabaseAdmin
    .from('stations')
    .select('*')
    .eq('is_active', true)
    .gt('sort_order', 0)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

export async function getStationByOrder(order: number) {
  const { data, error } = await supabaseAdmin
    .from('stations')
    .select('*')
    .eq('sort_order', order)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

export async function hasUsedHint(teamId: string, stationId: string) {
  const { data } = await supabaseAdmin
    .from('hint_usages')
    .select('id')
    .eq('team_id', teamId)
    .eq('station_id', stationId)
    .maybeSingle();

  return Boolean(data);
}

export function stationHasArrivalInfo(station: any) {
  return Boolean(station.arrival_title || station.arrival_text || station.arrival_image_url);
}

export async function hasViewedArrival(teamId: string, station: any) {
  if (!stationHasArrivalInfo(station)) return true;

  const { data } = await supabaseAdmin
    .from('station_arrival_views')
    .select('id')
    .eq('team_id', teamId)
    .eq('station_id', station.id)
    .maybeSingle();

  return Boolean(data);
}

export async function hasUnlockedClue(teamId: string, station: any) {
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

export async function getLeaderboard() {
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

export function publicStation(station: any, clueUnlocked: boolean, arrivalViewed = true) {
  const hasArrivalInfo = stationHasArrivalInfo(station);
  const arrivalInfoPending = hasArrivalInfo && !arrivalViewed;
  const requiresClueUnlock = Boolean(
    station.clue_requires_solution &&
    Array.isArray(station.clue_answer_keys) &&
    station.clue_answer_keys.length
  );
  const canShowClue = !arrivalInfoPending && (!requiresClueUnlock || clueUnlocked);
  const canShowPrompt = !arrivalInfoPending && requiresClueUnlock && !clueUnlocked;

  return {
    id: station.id,
    order: station.sort_order,
    code: station.code,
    title: station.title,
    arrivalInfoPending,
    arrivalTitle: arrivalInfoPending ? station.arrival_title : null,
    arrivalText: arrivalInfoPending ? station.arrival_text : null,
    arrivalImageUrl: arrivalInfoPending ? station.arrival_image_url : null,
    body: canShowClue ? station.body_markdown : '',
    imageUrl: canShowClue ? station.image_url : null,
    audioUrl: canShowClue ? station.audio_url : null,
    points: station.sort_order === 0 ? 0 : station.points,
    hasHint: !arrivalInfoPending && Boolean(station.hint_text || station.hint_image_url || station.hint_audio_url),
    hintPenalty: !arrivalInfoPending ? (station.hint_penalty || 0) : 0,
    clueRequiresSolution: canShowPrompt,
    clueUnlocked: canShowClue,
    cluePromptText: canShowPrompt ? station.clue_prompt_text : null,
    cluePromptImageUrl: canShowPrompt ? station.clue_prompt_image_url : null,
    cluePromptAudioUrl: canShowPrompt ? station.clue_prompt_audio_url : null,
  };
}
