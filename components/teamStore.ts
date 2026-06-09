export type CachedTeam = {
  id: string;
  name: string;
  recoveryCode: string;
  deviceKey: string;
  score: number;
  completedOrder: number;
};

const STORAGE_KEY = 'qrhunt.team.v1';

export function getCachedTeam(): CachedTeam | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedTeam;
    if (!parsed.id || !parsed.deviceKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setCachedTeam(team: CachedTeam) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(team));
}

export function clearCachedTeam() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}
