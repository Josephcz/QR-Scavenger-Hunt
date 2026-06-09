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
  hintPromptText?: string | null;
  hintPromptImageUrl?: string | null;
  hintAnswerKey?: string | null;
  hintText?: string | null;
  hintImageUrl?: string | null;
  hintPenalty: number;
  qrUrl: string;
};

type Tab = 'restore' | 'leaderboard' | 'stations' | 'create';

export function AdminClient() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<Tab>('restore');
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
              <div className="small muted">Teams, scan points, recovery codes, and QR links</div>
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
            <TabButton active={tab === 'restore'} onClick={() => setTab('restore')}>Restore team</TabButton>
            <TabButton active={tab === 'leaderboard'} onClick={() => setTab('leaderboard')}>Leaderboard</TabButton>
            <TabButton active={tab === 'stations'} onClick={() => setTab('stations')}>Stations & QR links</TabButton>
            <TabButton active={tab === 'create'} onClick={() => setTab('create')}>Create station</TabButton>
          </div>

          {tab === 'restore' ? <RestoreTeams teams={teams} /> : null}
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
                <td><span className="code">{team.recoveryCode}</span></td>
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

function Leaderboard({ teams }: { teams: Team[] }) {
  const sorted = [...teams].sort((a, b) => b.score - a.score || b.completedOrder - a.completedOrder);
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
            </tr>
          </thead>
          <tbody>
            {sorted.map((team, index) => (
              <tr key={team.id}>
                <td>{index + 1}</td>
                <td>{team.name}</td>
                <td>{team.score}</td>
                <td>{team.completedOrder}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Stations({ stations }: { stations: Station[] }) {
  return (
    <section>
      <h2>Stations & QR links</h2>
      <p>Make QR codes from these URLs. Scanning the correct next QR code immediately awards the station points and reveals the next clue.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Title</th>
              <th>QR URL</th>
              <th>Points</th>
              <th>Hint</th>
            </tr>
          </thead>
          <tbody>
            {stations.map((station) => (
              <tr key={station.id}>
                <td>{station.order}</td>
                <td>
                  <strong>{station.title}</strong><br />
                  <span className="small muted">Code: <span className="code">{station.code}</span></span>
                </td>
                <td>
                  <a className="code" href={station.qrUrl} target="_blank">{station.qrUrl}</a>
                </td>
                <td>{station.points}</td>
                <td>{station.hintText || station.hintImageUrl ? `${station.hintAnswerKey ? 'Puzzle, ' : ''}-${station.hintPenalty}` : 'None'}</td>
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
    title: '',
    body: '',
    imageUrl: '',
    points: '10',
    hintPromptText: '',
    hintPromptImageUrl: '',
    hintAnswerKey: '',
    hintText: '',
    hintImageUrl: '',
    hintPenalty: '3',
  });

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onCreate({
        ...form,
        sortOrder: Number(form.sortOrder),
        points: Number(form.points),
        hintPenalty: Number(form.hintPenalty),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <h2>Create station</h2>
      <p>Codes and scan tokens are generated automatically. The QR scan itself awards points. The revealed text/image fields are what the team sees after scanning and should guide them toward the next station.</p>
      <form className="form" onSubmit={submit}>
        <div className="grid">
          <label>
            <div className="label">Station order</div>
            <input className="input" value={form.sortOrder} onChange={(e) => update('sortOrder', e.target.value)} />
          </label>
          <label>
            <div className="label">Points</div>
            <input className="input" value={form.points} onChange={(e) => update('points', e.target.value)} />
          </label>
        </div>
        <label>
          <div className="label">Title</div>
          <input className="input" value={form.title} onChange={(e) => update('title', e.target.value)} required />
        </label>
        <label>
          <div className="label">Revealed text / clue for the next station</div>
          <textarea className="textarea" value={form.body} onChange={(e) => update('body', e.target.value)} />
        </label>
        <label>
          <div className="label">Image URL, optional</div>
          <input className="input" value={form.imageUrl} onChange={(e) => update('imageUrl', e.target.value)} placeholder="Supabase Storage public URL for revealed image" />
        </label>
        <div className="grid">
          <label>
            <div className="label">Hint unlock prompt, optional</div>
            <textarea
              className="textarea"
              value={form.hintPromptText}
              onChange={(e) => update('hintPromptText', e.target.value)}
              placeholder="Example: What word is hidden in this image?"
            />
          </label>
          <div className="form">
            <label>
              <div className="label">Hint unlock image URL, optional</div>
              <input
                className="input"
                value={form.hintPromptImageUrl}
                onChange={(e) => update('hintPromptImageUrl', e.target.value)}
                placeholder="Image players inspect before unlocking the hint"
              />
            </label>
            <label>
              <div className="label">Hint unlock answer, optional</div>
              <input
                className="input"
                value={form.hintAnswerKey}
                onChange={(e) => update('hintAnswerKey', e.target.value)}
                placeholder="Correct string required to unlock hint"
              />
            </label>
          </div>
        </div>
        <div className="grid">
          <label>
            <div className="label">Actual hint text, optional</div>
            <textarea className="textarea" value={form.hintText} onChange={(e) => update('hintText', e.target.value)} />
          </label>
          <div className="form">
            <label>
              <div className="label">Actual hint image URL, optional</div>
              <input className="input" value={form.hintImageUrl} onChange={(e) => update('hintImageUrl', e.target.value)} />
            </label>
            <label>
              <div className="label">Hint penalty</div>
              <input className="input" value={form.hintPenalty} onChange={(e) => update('hintPenalty', e.target.value)} />
            </label>
          </div>
        </div>
        <button className="button" disabled={saving} type="submit">{saving ? 'Creating…' : 'Create station'}</button>
      </form>
    </section>
  );
}
