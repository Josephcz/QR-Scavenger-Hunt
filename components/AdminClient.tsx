import { FormEvent, useEffect, useMemo, useState } from 'react';
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

type Tab = 'leaderboard' | 'stations' | 'create' | 'restore';

export function AdminClient() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<Tab>('leaderboard');
  const [teams, setTeams] = useState<Team[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
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
            <TabButton active={tab === 'create'} onClick={() => setTab('create')}>Create station</TabButton>
            <TabButton active={tab === 'restore'} onClick={() => setTab('restore')}>Restore team</TabButton>
          </div>

          {tab === 'leaderboard' ? <Leaderboard teams={teams} /> : null}
          {tab === 'stations' ? <Stations stations={stations} /> : null}
          {tab === 'create' ? (
            <CreateStation
              onCreate={async (payload) => {
                setError('');
                setCreatedMessage('');
                const response = await adminFetch('/api/admin/stations', {
                  method: 'POST',
                  body: JSON.stringify(payload),
                });
                const result = await response.json();
                if (!result.ok) {
                  setError(result.error || 'Could not create station.');
                  return;
                }
                setCreatedMessage(`Created station #${result.station.order}: ${result.station.title}`);
                await loadAll();
                setTab('stations');
              }}
              nextOrder={(stations.at(-1)?.order || 0) + 1}
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

function Stations({ stations }: { stations: Station[] }) {
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CreateStation({ nextOrder, onCreate }: { nextOrder: number; onCreate: (payload: Record<string, unknown>) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    sortOrder: String(nextOrder),
    points: '10',
    title: '',
    body: '',
    imageUrl: '',
    clueRequiresSolution: false,
    cluePromptText: '',
    cluePromptImageUrl: '',
    clueAnswerKeysText: '',
    hintText: '',
    hintImageUrl: '',
    hintPenalty: '3',
  });

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

      await onCreate({
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
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <h2>Create station</h2>
      <p>Each QR scan awards the station points. The clue text/image should tell the team how to find the next QR. You can optionally hide that clue behind a small solve prompt, then add a separate paid hint.</p>
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

        <label>
          <div className="label">Clue image URL, optional</div>
          <input className="input" value={form.imageUrl} onChange={(e) => update('imageUrl', e.target.value)} placeholder="Supabase Storage public URL for the revealed clue image" />
        </label>

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
              <label>
                <div className="label">Prompt image URL, optional</div>
                <input className="input" value={form.cluePromptImageUrl} onChange={(e) => update('cluePromptImageUrl', e.target.value)} placeholder="Image players inspect before revealing the clue" />
              </label>
              <label>
                <div className="label">Accepted answers</div>
                <textarea className="textarea" value={form.clueAnswerKeysText} onChange={(e) => update('clueAnswerKeysText', e.target.value)} placeholder="One per line, or comma-separated. Case is ignored." required={form.clueRequiresSolution} />
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
              <label>
                <div className="label">Hint image URL, optional</div>
                <input className="input" value={form.hintImageUrl} onChange={(e) => update('hintImageUrl', e.target.value)} />
              </label>
              <label>
                <div className="label">Hint penalty</div>
                <input className="input" value={form.hintPenalty} onChange={(e) => update('hintPenalty', e.target.value)} inputMode="numeric" />
              </label>
            </div>
          </div>
        </section>

        <button className="button" disabled={saving} type="submit">{saving ? 'Creating…' : 'Create station'}</button>
      </form>
    </section>
  );
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
