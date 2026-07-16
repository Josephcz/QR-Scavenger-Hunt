import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

type Team = {
  id: string;
  name: string;
  recoveryCode: string;
  score: number;
  completedOrder: number;
  createdAt: string;
  updatedAt: string;
};

type Station = {
  id: string;
  order: number;
  code: string;
  scanToken: string;
  title: string;
  body: string;
  imageUrl?: string | null;
  points: number;
  clueRequiresSolution: boolean;
  cluePromptText?: string | null;
  cluePromptImageUrl?: string | null;
  clueAnswerKeys: string[];
  hintText?: string | null;
  hintImageUrl?: string | null;
  hintPenalty: number;
  isActive: boolean;
  qrUrl: string;
};

type StationPayload = {
  id?: string;
  sortOrder: number;
  points: number;
  title: string;
  body: string;
  imageUrl: string;
  clueRequiresSolution: boolean;
  cluePromptText: string;
  cluePromptImageUrl: string;
  clueAnswerKeys: string[];
  hintText: string;
  hintImageUrl: string;
  hintPenalty: number;
  isActive: boolean;
};

type Tab = 'leaderboard' | 'stations' | 'create' | 'restore';
type AdminFetch = (path: string, init?: RequestInit, overridePassword?: string) => Promise<Response>;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export function AdminClient() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<Tab>('leaderboard');
  const [teams, setTeams] = useState<Team[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdMessage, setCreatedMessage] = useState('');

  useEffect(() => {
    const saved = window.sessionStorage.getItem('qrhunt.adminPassword');
    if (saved) {
      setPassword(saved);
      setAuthed(true);
      loadAll(saved);
    }
  }, []);

  async function adminFetch(path: string, init: RequestInit = {}, overridePassword?: string) {
    return fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${overridePassword || password}`,
        ...(init.headers || {}),
      },
    });
  }

  async function loadAll(pw = password) {
    setLoading(true);
    setError('');
    try {
      const [teamResponse, stationResponse] = await Promise.all([
        adminFetch('/api/admin/teams', {}, pw),
        adminFetch('/api/admin/stations', {}, pw),
      ]);
      const teamPayload = await teamResponse.json();
      const stationPayload = await stationResponse.json();

      if (!teamPayload.ok) throw new Error(teamPayload.error || 'Could not load teams.');
      if (!stationPayload.ok) throw new Error(stationPayload.error || 'Could not load stations.');

      setTeams(teamPayload.teams);
      setStations(stationPayload.stations);
      if (editingStation) {
        const refreshed = stationPayload.stations.find((station: Station) => station.id === editingStation.id) || null;
        setEditingStation(refreshed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load admin data.');
    } finally {
      setLoading(false);
    }
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    window.sessionStorage.setItem('qrhunt.adminPassword', password);
    setAuthed(true);
    await loadAll(password);
  }

  function logout() {
    window.sessionStorage.removeItem('qrhunt.adminPassword');
    setAuthed(false);
    setPassword('');
  }

  function openCreateTab() {
    setEditingStation(null);
    setTab('create');
    setCreatedMessage('');
    setError('');
  }

  function openEditTab(station: Station) {
    setEditingStation(station);
    setTab('create');
    setCreatedMessage('');
    setError('');
  }

  async function saveStation(payload: StationPayload) {
    setError('');
    setCreatedMessage('');
    const isEdit = Boolean(payload.id);
    const response = await adminFetch('/api/admin/stations', {
      method: isEdit ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!result.ok) {
      setError(result.error || (isEdit ? 'Could not update station.' : 'Could not create station.'));
      return;
    }

    const warningText = result.deletionWarnings?.length ? ` Old image cleanup warning: ${result.deletionWarnings.join(' ')}` : '';
    setCreatedMessage(`${isEdit ? 'Updated' : 'Created'} station #${result.station.order}: ${result.station.title}.${warningText}`);
    setEditingStation(null);
    await loadAll();
    setTab('stations');
  }

  if (!authed) {
    return (
      <main className="page-shell">
        <div className="container">
          <div className="card" style={{ maxWidth: 520, margin: '0 auto' }}>
            <div className="kicker">Admin</div>
            <h1>Control room</h1>
            <form className="form" onSubmit={login}>
              <label>
                <div className="label">Admin password</div>
                <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              <button className="button" type="submit">Open admin</button>
            </form>
            {error ? <p className="notice error small">{error}</p> : null}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <div className="container">
        <header className="header">
          <div className="brand">
            <div className="logo" />
            <div>
              <div className="kicker">Admin</div>
              <div className="small muted">Teams, scan points, recovery codes, clue gates, paid hints, and QR links</div>
            </div>
          </div>
          <div className="row">
            <button className="button secondary" onClick={() => loadAll()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
            <button className="button secondary" onClick={logout}>Lock</button>
          </div>
        </header>

        {error ? <p className="notice error small">{error}</p> : null}
        {createdMessage ? <p className="notice success small">{createdMessage}</p> : null}

        <div className="card">
          <div className="tabs">
            <TabButton active={tab === 'leaderboard'} onClick={() => setTab('leaderboard')}>Leaderboard</TabButton>
            <TabButton active={tab === 'stations'} onClick={() => setTab('stations')}>Stations & QR links</TabButton>
            <TabButton active={tab === 'create'} onClick={openCreateTab}>{editingStation ? 'Edit station' : 'Create station'}</TabButton>
            <TabButton active={tab === 'restore'} onClick={() => setTab('restore')}>Restore team</TabButton>
          </div>

          {tab === 'leaderboard' ? <Leaderboard teams={teams} /> : null}
          {tab === 'stations' ? <Stations stations={stations} onEdit={openEditTab} /> : null}
          {tab === 'create' ? (
            <StationForm
              adminFetch={adminFetch}
              station={editingStation}
              nextOrder={(stations.at(-1)?.order || 0) + 1}
              onCancel={() => {
                setEditingStation(null);
                setTab('stations');
              }}
              onSubmit={saveStation}
            />
          ) : null}
          {tab === 'restore' ? <RestoreTeams teams={teams} /> : null}
        </div>
      </div>
    </main>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button className={`button ${active ? '' : 'secondary'}`} onClick={onClick} type="button">
      {children}
    </button>
  );
}

function Leaderboard({ teams }: { teams: Team[] }) {
  const sorted = [...teams].sort((a, b) => b.score - a.score || b.completedOrder - a.completedOrder || a.updatedAt.localeCompare(b.updatedAt));
  return (
    <section>
      <h2>Leaderboard</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Team</th>
              <th>Score</th>
              <th>Stations</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((team, index) => (
              <tr key={team.id}>
                <td>{index + 1}</td>
                <td>{team.name}</td>
                <td>{team.score}</td>
                <td>{team.completedOrder}</td>
                <td>{new Date(team.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Stations({ stations, onEdit }: { stations: Station[]; onEdit: (station: Station) => void }) {
  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      window.alert('QR link copied.');
    } catch {
      window.prompt('Copy this QR link:', url);
    }
  }

  return (
    <section>
      <h2>Stations & QR links</h2>
      <p>Use the scan link for each QR code. This table includes the code, token, clue-gate answers, and paid-hint details needed to unlock or debug everything.</p>
      <div className="table-wrap">
        <table className="stations-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Station</th>
              <th>QR link</th>
              <th>Clue gate</th>
              <th>Clue</th>
              <th>Paid hint</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {stations.map((station) => (
              <tr key={station.id}>
                <td>{station.order}</td>
                <td>
                  <strong>{station.title}</strong><br />
                  <span className="small muted">Points: <span className="score">{station.points}</span></span><br />
                  <span className="small muted">Code: <span className="code inline-code">{station.code}</span></span><br />
                  <span className="small muted">Token: <span className="code inline-code">{station.scanToken}</span></span>
                </td>
                <td>
                  <div className="action-stack">
                    <a className="button secondary compact-button" href={station.qrUrl} target="_blank" rel="noreferrer">Open scan link</a>
                    <button className="button secondary compact-button" type="button" onClick={() => copyUrl(station.qrUrl)}>Copy URL</button>
                  </div>
                </td>
                <td>
                  {station.clueRequiresSolution ? (
                    <div className="small">
                      <strong>Hidden until solved</strong>
                      {station.cluePromptText ? <><br /><span className="muted">Prompt:</span> {station.cluePromptText}</> : null}
                      {station.cluePromptImageUrl ? <><br /><span className="muted">Prompt image:</span> <a href={station.cluePromptImageUrl} target="_blank" rel="noreferrer">Open</a></> : null}
                      <br />
                      <span className="muted">Answers:</span> {station.clueAnswerKeys.length ? station.clueAnswerKeys.map((answer) => <span key={answer} className="code inline-code answer-chip">{answer}</span>) : <span className="muted">None set</span>}
                    </div>
                  ) : (
                    <span className="small muted">Shown immediately after scan</span>
                  )}
                </td>
                <td className="small">
                  {station.body ? <div className="admin-preview">{station.body}</div> : <span className="muted">No text clue</span>}
                  {station.imageUrl ? <><br /><a href={station.imageUrl} target="_blank" rel="noreferrer">Open clue image</a></> : null}
                </td>
                <td className="small">
                  {station.hintText || station.hintImageUrl ? (
                    <>
                      <span className="muted">Penalty:</span> -{station.hintPenalty}<br />
                      {station.hintText ? <div className="admin-preview">{station.hintText}</div> : null}
                      {station.hintImageUrl ? <a href={station.hintImageUrl} target="_blank" rel="noreferrer">Open hint image</a> : null}
                    </>
                  ) : (
                    <span className="muted">None</span>
                  )}
                </td>
                <td>{station.isActive ? <span className="notice success small compact-notice">Active</span> : <span className="notice warning small compact-notice">Inactive</span>}</td>
                <td>
                  <button className="button secondary compact-button" type="button" onClick={() => onEdit(station)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StationForm({
  adminFetch,
  nextOrder,
  station,
  onCancel,
  onSubmit,
}: {
  adminFetch: AdminFetch;
  nextOrder: number;
  station: Station | null;
  onCancel: () => void;
  onSubmit: (payload: StationPayload) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => stationToForm(station, nextOrder));

  useEffect(() => {
    setForm(stationToForm(station, nextOrder));
  }, [station, nextOrder]);

  function update(field: keyof typeof form, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const clueAnswerKeys = form.clueAnswerKeysText
        .split(/\n|,/)
        .map((answer) => answer.trim())
        .filter(Boolean);

      await onSubmit({
        id: station?.id,
        sortOrder: Number(form.sortOrder),
        points: Number(form.points),
        title: form.title,
        body: form.body,
        imageUrl: form.imageUrl,
        clueRequiresSolution: form.clueRequiresSolution,
        cluePromptText: form.cluePromptText,
        cluePromptImageUrl: form.cluePromptImageUrl,
        clueAnswerKeys,
        hintText: form.hintText,
        hintImageUrl: form.hintImageUrl,
        hintPenalty: Number(form.hintPenalty),
        isActive: form.isActive,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>{station ? `Edit station #${station.order}` : 'Create station'}</h2>
          <p>Each QR scan awards the station points. The clue text/image should tell the team how to find the next QR. You can optionally hide that clue behind a small solve prompt, then add a separate paid hint.</p>
        </div>
        {station ? <button className="button secondary" type="button" onClick={onCancel}>Cancel edit</button> : null}
      </div>

      <form className="form" onSubmit={submit}>
        <div className="grid">
          <label>
            <div className="label">Station order</div>
            <input className="input" value={form.sortOrder} onChange={(e) => update('sortOrder', e.target.value)} inputMode="numeric" />
          </label>
          <label>
            <div className="label">Points</div>
            <input className="input" value={form.points} onChange={(e) => update('points', e.target.value)} inputMode="numeric" />
          </label>
        </div>

        <label>
          <div className="label">Title</div>
          <input className="input" value={form.title} onChange={(e) => update('title', e.target.value)} required />
        </label>

        <label>
          <div className="label">Clue for the next station</div>
          <textarea className="textarea" value={form.body} onChange={(e) => update('body', e.target.value)} placeholder="Shown after this station is scanned, unless you enable the solve prompt below." />
        </label>

        <ImageField
          adminFetch={adminFetch}
          label="Clue image"
          value={form.imageUrl}
          onChange={(value) => update('imageUrl', value)}
        />

        <section className="nested-card">
          <label className="checkbox-row">
            <input type="checkbox" checked={form.clueRequiresSolution} onChange={(e) => update('clueRequiresSolution', e.target.checked)} />
            <span>Hide the clue until a prompt is solved</span>
          </label>

          {form.clueRequiresSolution ? (
            <div className="form" style={{ marginTop: 12 }}>
              <label>
                <div className="label">Prompt text</div>
                <textarea className="textarea" value={form.cluePromptText} onChange={(e) => update('cluePromptText', e.target.value)} placeholder="Example: What word is hidden in this image?" />
              </label>
              <ImageField
                adminFetch={adminFetch}
                label="Prompt image"
                value={form.cluePromptImageUrl}
                onChange={(value) => update('cluePromptImageUrl', value)}
              />
              <label>
                <div className="label">Accepted answers</div>
                <textarea className="textarea" value={form.clueAnswerKeysText} onChange={(e) => update('clueAnswerKeysText', e.target.value)} placeholder="One per line, or comma-separated. Case and extra spacing are ignored." required={form.clueRequiresSolution} />
              </label>
            </div>
          ) : null}
        </section>

        <section className="nested-card">
          <div className="kicker">Optional paid hint</div>
          <p className="small muted">This hint has no solve prompt. The team confirms spending points, then the hint is revealed. Leave both hint fields blank to disable it.</p>
          <div className="grid">
            <label>
              <div className="label">Hint text, optional</div>
              <textarea className="textarea" value={form.hintText} onChange={(e) => update('hintText', e.target.value)} />
            </label>
            <div className="form">
              <ImageField
                adminFetch={adminFetch}
                label="Hint image"
                value={form.hintImageUrl}
                onChange={(value) => update('hintImageUrl', value)}
              />
              <label>
                <div className="label">Hint penalty</div>
                <input className="input" value={form.hintPenalty} onChange={(e) => update('hintPenalty', e.target.value)} inputMode="numeric" />
              </label>
            </div>
          </div>
        </section>

        <label className="checkbox-row">
          <input type="checkbox" checked={form.isActive} onChange={(e) => update('isActive', e.target.checked)} />
          <span>Station is active</span>
        </label>

        <button className="button" disabled={saving} type="submit">{saving ? 'Saving…' : station ? 'Save station changes' : 'Create station'}</button>
      </form>
    </section>
  );
}

function ImageField({ adminFetch, label, value, onChange }: { adminFetch: AdminFetch; label: string; value: string; onChange: (value: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setError('');
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setError('Use a PNG, JPG, WEBP, or GIF image.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Image must be 5 MB or smaller.');
      return;
    }

    setUploading(true);
    try {
      const base64 = await fileToDataUrl(file);
      const response = await adminFetch('/api/admin/images', {
        method: 'POST',
        body: JSON.stringify({
          action: 'upload',
          fileName: file.name,
          contentType: file.type,
          base64,
        }),
      });
      const payload = await response.json();
      if (!payload.ok) {
        setError(payload.error || 'Could not upload image.');
        return;
      }
      onChange(payload.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload image.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="image-field">
      <label>
        <div className="label">{label} URL, optional</div>
        <input className="input" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Paste an image URL or upload a new image below" />
      </label>
      <div className="row image-actions">
        <label className="button secondary compact-button upload-button">
          {uploading ? 'Uploading…' : 'Upload image'}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={upload} disabled={uploading} />
        </label>
        {value ? <button className="button secondary compact-button" type="button" onClick={() => onChange('')}>Remove image</button> : null}
        {value ? <a className="button secondary compact-button" href={value} target="_blank" rel="noreferrer">Open image</a> : null}
      </div>
      <p className="small muted">Uploads are limited to 5 MB. Supabase-hosted images removed from an existing station are deleted after you save.</p>
      {error ? <p className="notice error small compact-notice">{error}</p> : null}
    </div>
  );
}

function stationToForm(station: Station | null, nextOrder: number) {
  return {
    sortOrder: String(station?.order || nextOrder),
    points: String(station?.points ?? 10),
    title: station?.title || '',
    body: station?.body || '',
    imageUrl: station?.imageUrl || '',
    clueRequiresSolution: Boolean(station?.clueRequiresSolution),
    cluePromptText: station?.cluePromptText || '',
    cluePromptImageUrl: station?.cluePromptImageUrl || '',
    clueAnswerKeysText: station?.clueAnswerKeys?.join('\n') || '',
    hintText: station?.hintText || '',
    hintImageUrl: station?.hintImageUrl || '',
    hintPenalty: String(station?.hintPenalty ?? 3),
    isActive: station?.isActive ?? true,
  };
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

function RestoreTeams({ teams }: { teams: Team[] }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter((team) => team.name.toLowerCase().includes(q) || team.recoveryCode.toLowerCase().includes(q));
  }, [teams, query]);

  return (
    <section>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h2>Restore team</h2>
          <p>Give a team its recovery code. They can type this into the normal register page instead of a team name.</p>
        </div>
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search team or recovery code" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Team</th>
              <th>Recovery code</th>
              <th>Score</th>
              <th>Completed</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((team) => (
              <tr key={team.id}>
                <td>{team.name}</td>
                <td><span className="code inline-code">{team.recoveryCode}</span></td>
                <td>{team.score}</td>
                <td>{team.completedOrder}</td>
                <td>{new Date(team.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
