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
  const [showRecoveryCode, setShowRecoveryCode] = useState(false);
  const [recoveryCopied, setRecoveryCopied] = useState(false);

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

  function handleTeamReady(nextTeam: CachedTeam, mode: 'created' | 'recovered') {
    setTeam(nextTeam);
    setShowRecoveryCode(mode === 'created');
    setRecoveryCopied(false);
  }

  async function copyRecoveryCode() {
    if (!team?.recoveryCode) return;
    try {
      await navigator.clipboard.writeText(team.recoveryCode);
      setRecoveryCopied(true);
      window.setTimeout(() => setRecoveryCopied(false), 1800);
    } catch {
      window.prompt('Copy your recovery code:', team.recoveryCode);
    }
  }

  function signOut() {
    clearCachedTeam();
    setTeam(null);
    setStatusError('');
    setShowRecoveryCode(false);
    setRecoveryCopied(false);
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
            <RegisterPanel onTeamReady={handleTeamReady} scanWaiting={hasValidStationLink} />
          </div>
        ) : (
          <>
            {showRecoveryCode ? (
              <div className="notice warning recovery-banner">
                <div className="recovery-banner-main">
                  <div>
                    <strong>Save your recovery code now.</strong>
                    <div className="small" style={{ marginTop: 5 }}>Take a screenshot or keep it somewhere outside this browser. It will not stay on screen during the hunt.</div>
                  </div>
                  <div className="recovery-code-row">
                    <span className="code recovery-code-value">{team.recoveryCode}</span>
                    <button className="icon-button" type="button" onClick={copyRecoveryCode} aria-label="Copy recovery code" title="Copy recovery code">
                      <CopyIcon />
                    </button>
                  </div>
                </div>
                <div className="row recovery-banner-actions">
                  {recoveryCopied ? <span className="small success-text">Copied</span> : null}
                  <button className="button secondary compact-button" type="button" onClick={() => setShowRecoveryCode(false)}>I’ve saved it</button>
                </div>
              </div>
            ) : null}
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


function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
      <path fill="currentColor" d="M8 7a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2V7Zm2 0v9h7V7h-7ZM5 8h1v9a3 3 0 0 0 3 3h6v1H9a4 4 0 0 1-4-4V8Z"/>
    </svg>
  );
}
