import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { RegisterPanel } from './RegisterPanel';
import { StationRunner } from './StationRunner';
import { CachedTeam, clearCachedTeam, getCachedTeam, setCachedTeam } from './teamStore';

const eventName = process.env.NEXT_PUBLIC_EVENT_NAME || 'QR Scavenger Hunt';

export function HomeClient() {
  const router = useRouter();
  const rawCode = router.query.c;
  const rawToken = router.query.t;
  const code = typeof rawCode === 'string' ? rawCode : '';
  const token = typeof rawToken === 'string' ? rawToken : '';
  const hasStationLink = Boolean(code || token);
  const [team, setTeam] = useState<CachedTeam | null>(null);
  const [checked, setChecked] = useState(false);
  const [statusError, setStatusError] = useState('');

  useEffect(() => {
    const cached = getCachedTeam();
    setTeam(cached);
    setChecked(true);

    if (!cached) return;
    fetch('/api/team/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: cached.id, deviceKey: cached.deviceKey }),
    })
      .then((response) => response.json())
      .then((payload) => {
        if (!payload.ok) {
          setStatusError(payload.error || 'Team cache is no longer valid.');
          clearCachedTeam();
          setTeam(null);
          return;
        }
        const nextTeam = { ...cached, ...payload.team };
        setCachedTeam(nextTeam);
        setTeam(nextTeam);
      })
      .catch(() => undefined);
  }, []);

  const subtitle = useMemo(() => {
    if (hasStationLink) return 'Scan confirmed. Register or continue with your saved team.';
    return 'Register your team, scan the first QR code, and follow each revealed clue in order.';
  }, [hasStationLink]);

  function updateTeam(nextTeam: CachedTeam) {
    setTeam(nextTeam);
  }

  function signOut() {
    clearCachedTeam();
    setTeam(null);
    setStatusError('');
  }

  if (!checked || !router.isReady) {
    return (
      <main className="page-shell">
        <div className="container">
          <div className="card">
            <div className="kicker">Loading</div>
            <h1>{eventName}</h1>
            <p>Checking this browser for a saved team.</p>
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
              <div className="kicker">{eventName}</div>
              <div className="small muted">QR scans award points</div>
            </div>
          </div>
          {team ? (
            <div className="row">
              <span className="pill">Team: <span className="score">{team.name}</span></span>
              <span className="pill">Score: <span className="score">{team.score}</span></span>
              <button className="button secondary" onClick={signOut} type="button">Switch team</button>
            </div>
          ) : null}
        </header>

        {statusError ? <p className="notice error small">{statusError}</p> : null}

        {hasStationLink && team && code && token ? (
          <StationRunner code={code} token={token} team={team} onTeamUpdate={updateTeam} />
        ) : (
          <div className="grid">
            <section className="card">
              <div className="kicker">Start</div>
              <h1>{eventName}</h1>
              <p>{subtitle}</p>
              {team ? (
                <div className="notice success">
                  This browser is registered for <strong>{team.name}</strong>. Your recovery code is{' '}
                  <span className="code">{team.recoveryCode}</span>. Keep it somewhere safe.
                </div>
              ) : null}
              {hasStationLink && (!code || !token) ? (
                <div className="notice error">This QR link is missing a station code or scan token. Please rescan the printed QR code.</div>
              ) : null}
              <div className="hr" />
              <div className="row">
                <span className="pill">QR only</span>
                <span className="pill">No GPS</span>
                <span className="pill">Scans award points</span>
                <span className="pill">Extra hints can cost points</span>
              </div>
            </section>
            {team && !hasStationLink ? (
              <section className="card">
                <div className="kicker">Ready</div>
                <h2>Scan the first QR code</h2>
                <p>Your team is saved on this device. Scan the next correct QR code to earn points and reveal the next clue.</p>
                <div className="notice">
                  Current score: <span className="score">{team.score}</span><br />
                  Completed stations: <span className="score">{team.completedOrder}</span>
                </div>
              </section>
            ) : (
              <RegisterPanel onTeamReady={updateTeam} scanWaiting={hasStationLink} />
            )}
          </div>
        )}
      </div>
    </main>
  );
}
