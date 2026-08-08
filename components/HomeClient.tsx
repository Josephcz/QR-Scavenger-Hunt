import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { QrScanner } from './QrScanner';
import { RegisterPanel } from './RegisterPanel';
import { StationRunner } from './StationRunner';
import { SupportFooter } from './SupportFooter';
import { CachedTeam, clearCachedTeam, getCachedTeam, setCachedTeam } from './teamStore';

const eventName = process.env.NEXT_PUBLIC_EVENT_NAME || 'QR Scavenger Hunt';

export function HomeClient() {
  const router = useRouter();
  const rawCode = router.query.c;
  const rawToken = router.query.t;
  const code = typeof rawCode === 'string' ? rawCode : '';
  const token = typeof rawToken === 'string' ? rawToken : '';
  const hasStationQuery = Boolean(code || token);
  const hasValidStationLink = Boolean(code && token);
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

  function updateTeam(nextTeam: CachedTeam) {
    setTeam(nextTeam);
  }

  function signOut() {
    clearCachedTeam();
    setTeam(null);
    setStatusError('');
    void router.replace('/');
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
    <main className="page-shell participant-shell">
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

        {!team ? (
          <div className="grid onboarding-grid">
            <section className="card welcome-card">
              <div className="kicker">Welcome to the hunt</div>
              <h1>{eventName}</h1>
              <p>Register your team on this phone. You will receive a recovery code, then your first clue will appear and lead you to the first QR code.</p>
              <div className="notice warning recovery-emphasis">
                <strong>Save your recovery code.</strong> Take a screenshot or write it down. It is how you restore your team, score, and progress if this browser loses its saved data.
              </div>
              <div className="steps">
                <div><span className="step-number">1</span><span>Register your team.</span></div>
                <div><span className="step-number">2</span><span>Save the recovery code somewhere safe.</span></div>
                <div><span className="step-number">3</span><span>Follow the start clue and scan the first QR code using the scanner button below.</span></div>
              </div>
              {hasStationQuery && !hasValidStationLink ? (
                <div className="notice error">This QR link is missing a station code or scan token. Please scan the printed QR code again.</div>
              ) : null}
            </section>
            <RegisterPanel onTeamReady={updateTeam} scanWaiting={hasValidStationLink} />
          </div>
        ) : (
          <>
            <div className="notice warning recovery-banner">
              <strong>Keep your recovery code safe:</strong> <span className="code">{team.recoveryCode}</span>
              <span className="small"> Take a screenshot or save it somewhere outside this browser.</span>
            </div>
            {hasStationQuery && !hasValidStationLink ? (
              <div className="notice error" style={{ marginBottom: 16 }}>This QR link is incomplete. Use the in-page scanner to scan the printed code again.</div>
            ) : null}
            {hasValidStationLink ? (
              <StationRunner code={code} token={token} team={team} onTeamUpdate={updateTeam} />
            ) : (
              <StationRunner team={team} onTeamUpdate={updateTeam} />
            )}
          </>
        )}

        <SupportFooter />
      </div>
      <QrScanner />
    </main>
  );
}
