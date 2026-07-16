import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CachedTeam, setCachedTeam } from './teamStore';

type Station = {
  id: string;
  order: number;
  code: string;
  title: string;
  body: string;
  imageUrl?: string | null;
  points: number;
  hasHint: boolean;
  hintPenalty: number;
  clueRequiresSolution: boolean;
  clueUnlocked: boolean;
  cluePromptText?: string | null;
  cluePromptImageUrl?: string | null;
};

type LeaderboardRow = {
  rank: number;
  name: string;
  score: number;
  completedOrder: number;
};

type ScanState = {
  loading: boolean;
  error: string;
  blocked?: boolean;
  alreadyCompleted?: boolean;
  score?: number;
  completedOrder?: number;
  awardedPoints?: number;
  message?: string;
  messageKind?: 'awarded' | 'current' | 'past' | 'future' | 'finished';
  requestedOrder?: number;
  shownOrder?: number;
  isFinalStation?: boolean;
  leaderboard?: LeaderboardRow[];
  hintAlreadyUsed?: boolean;
  station?: Station;
};

type HintState = {
  text?: string;
  imageUrl?: string;
  penalty: number;
};

type Props = {
  code: string;
  token: string;
  team: CachedTeam;
  onTeamUpdate: (team: CachedTeam) => void;
};

type ScanPayload = Record<string, any>;

const scanCache = new Map<string, Promise<ScanPayload>>();

function runCachedScan(params: { teamId: string; deviceKey: string; code: string; token: string }) {
  const key = `${params.teamId}:${params.deviceKey}:${params.code}:${params.token}`;
  const cached = scanCache.get(key);
  if (cached) return cached;

  const request = fetch('/api/stations/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
    .then((response) => response.json())
    .finally(() => {
      window.setTimeout(() => scanCache.delete(key), 2500);
    });

  scanCache.set(key, request);
  return request;
}

export function StationRunner({ code, token, team, onTeamUpdate }: Props) {
  const [state, setState] = useState<ScanState>({ loading: true, error: '' });
  const [hintLoading, setHintLoading] = useState(false);
  const [hint, setHint] = useState<HintState | null>(null);
  const [hintError, setHintError] = useState('');
  const [unlockAnswer, setUnlockAnswer] = useState('');
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [unlockError, setUnlockError] = useState('');

  useEffect(() => {
    let alive = true;
    async function scan() {
      setState({ loading: true, error: '' });
      setHint(null);
      setHintError('');
      setUnlockAnswer('');
      setUnlockError('');

      try {
        const payload = await runCachedScan({
          teamId: team.id,
          deviceKey: team.deviceKey,
          code,
          token,
        });
        if (!alive) return;

        if (!payload.ok) {
          setState({ loading: false, error: payload.error || 'Could not open station.', blocked: payload.blocked });
          return;
        }

        const nextTeam = {
          ...team,
          score: payload.score ?? team.score,
          completedOrder: payload.completedOrder ?? team.completedOrder,
        };
        setCachedTeam(nextTeam);
        onTeamUpdate(nextTeam);
        setState({
          loading: false,
          error: '',
          alreadyCompleted: payload.alreadyCompleted,
          score: payload.score,
          completedOrder: payload.completedOrder,
          awardedPoints: payload.awardedPoints,
          message: payload.message,
          messageKind: payload.messageKind,
          requestedOrder: payload.requestedOrder,
          shownOrder: payload.shownOrder,
          isFinalStation: payload.isFinalStation,
          leaderboard: payload.leaderboard || [],
          hintAlreadyUsed: payload.hintAlreadyUsed,
          station: payload.station,
        });
      } catch {
        if (alive) setState({ loading: false, error: 'Network error. Try scanning again.' });
      }
    }
    scan();
    return () => {
      alive = false;
    };
  }, [code, token, team.id, team.deviceKey]);

  const pointsText = useMemo(() => {
    if (!state.station) return '';
    return `${state.station.points} point${state.station.points === 1 ? '' : 's'}`;
  }, [state.station]);

  async function unlockClue(event: FormEvent) {
    event.preventDefault();
    if (!state.station) return;

    setUnlockLoading(true);
    setUnlockError('');
    try {
      const response = await fetch('/api/stations/unlock-clue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: team.id,
          deviceKey: team.deviceKey,
          stationCode: state.station.code,
          answer: unlockAnswer,
        }),
      });
      const payload = await response.json();
      if (!payload.ok) {
        setUnlockError(payload.error || 'That does not unlock the clue yet.');
        return;
      }

      setState((current) => ({
        ...current,
        station: payload.station,
        message: payload.message || current.message,
        messageKind: payload.messageKind || current.messageKind,
      }));
      setUnlockAnswer('');
    } catch {
      setUnlockError('Network error. Try again.');
    } finally {
      setUnlockLoading(false);
    }
  }

  async function getHint(event?: FormEvent) {
    event?.preventDefault();
    if (!state.station) return;
    const penalty = state.station.hintPenalty || 0;
    const ok = window.confirm(
      penalty > 0 && !state.hintAlreadyUsed
        ? `Are you sure? Revealing this hint costs ${penalty} point${penalty === 1 ? '' : 's'}.`
        : 'Reveal this extra hint?'
    );
    if (!ok) return;

    setHintLoading(true);
    setHintError('');
    try {
      const response = await fetch('/api/stations/hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: team.id,
          deviceKey: team.deviceKey,
          stationCode: state.station.code,
        }),
      });
      const payload = await response.json();
      if (!payload.ok) {
        setHintError(payload.error || 'Could not reveal hint.');
        return;
      }

      setHint(payload.hint);
      const nextTeam = { ...team, score: payload.score };
      setCachedTeam(nextTeam);
      onTeamUpdate(nextTeam);
      setState((current) => ({ ...current, score: payload.score, hintAlreadyUsed: true }));
    } catch {
      setHintError('Network error. Try again.');
    } finally {
      setHintLoading(false);
    }
  }

  if (state.loading) {
    return (
      <div className="card">
        <div className="kicker">Station</div>
        <h2>Checking QR code…</h2>
        <p>Confirming your team, station order, and QR token.</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="card">
        <div className="kicker">Station locked</div>
        <h2>Not yet</h2>
        <div className={`notice ${state.blocked ? 'warning' : 'error'}`}>{state.error}</div>
        <div className="footer-actions">
          <span className="pill">Team: {team.name}</span>
          <span className="pill">Score: <span className="score">{team.score}</span></span>
        </div>
      </div>
    );
  }

  const station = state.station;
  if (!station) return null;

  if (state.isFinalStation) {
    return (
      <div className="card hero-card">
        <div className="kicker">Finish</div>
        <h1>Congratulations, {team.name}!</h1>
        <p>You scanned the final QR code and completed the scavenger hunt.</p>
        {state.message ? <div className={messageClass(state.messageKind)}>{state.message}</div> : null}
        <div className="row" style={{ marginBottom: 16 }}>
          <span className="pill">Final score: <span className="score">{state.score ?? team.score}</span></span>
          <span className="pill">Final station: #{station.order}</span>
          {state.awardedPoints ? <span className="pill">+{state.awardedPoints} points</span> : null}
        </div>
        {station.imageUrl ? <img className="station-image" src={station.imageUrl} alt="Final station visual" /> : null}
        {station.body ? <p style={{ whiteSpace: 'pre-wrap' }}>{station.body}</p> : null}
        <Leaderboard rows={state.leaderboard || []} currentTeamName={team.name} />
      </div>
    );
  }

  const clueLocked = station.clueRequiresSolution && !station.clueUnlocked;

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <span className="pill">Station #{station.order}</span>
        <span className="pill">Scan value: {pointsText}</span>
        <span className="pill">Score: <span className="score">{state.score ?? team.score}</span></span>
      </div>

      <div className="kicker">{team.name}</div>
      <h2>{station.title}</h2>

      {state.message ? <div className={messageClass(state.messageKind)}>{state.message}</div> : null}

      {clueLocked ? (
        <section className="hint-card">
          <div className="kicker">Clue locked</div>
          <p className="small muted">Solve this prompt to reveal the clue for the next QR.</p>
          {station.cluePromptText ? <p style={{ whiteSpace: 'pre-wrap' }}>{station.cluePromptText}</p> : null}
          {station.cluePromptImageUrl ? <img className="hint-image" src={station.cluePromptImageUrl} alt="Clue unlock visual" /> : null}
          <form className="form compact-form" onSubmit={unlockClue}>
            <label>
              <div className="label">Answer</div>
              <input
                className="input"
                value={unlockAnswer}
                onChange={(event) => setUnlockAnswer(event.target.value)}
                placeholder="Type the solution"
              />
            </label>
            <button className="button" disabled={unlockLoading} type="submit">
              {unlockLoading ? 'Checking…' : 'Reveal clue'}
            </button>
          </form>
          {unlockError ? <p className="notice error small">{unlockError}</p> : null}
        </section>
      ) : (
        <>
          {station.imageUrl ? <img className="station-image" src={station.imageUrl} alt="Station visual clue" /> : null}
          {station.body ? <p style={{ whiteSpace: 'pre-wrap' }}>{station.body}</p> : null}
        </>
      )}

      {station.hasHint ? (
        <section className="hint-card">
          <div className="kicker">Optional extra hint</div>
          {state.hintAlreadyUsed ? (
            <p className="small muted">This hint was already unlocked for your team. You can show it again without losing more points.</p>
          ) : (
            <p className="small muted">Reveal an extra hint{station.hintPenalty ? ` for ${station.hintPenalty} point${station.hintPenalty === 1 ? '' : 's'}` : ''}. No answer is required.</p>
          )}
          <form className="form compact-form" onSubmit={getHint}>
            <button className="button secondary" disabled={hintLoading || Boolean(hint)} type="submit">
              {hintLoading ? 'Revealing…' : state.hintAlreadyUsed ? 'Show hint again' : 'Spend points for hint'}
            </button>
          </form>
        </section>
      ) : null}

      {hint ? (
        <div className="notice warning" style={{ marginTop: 14 }}>
          {hint.text ? <div style={{ whiteSpace: 'pre-wrap' }}>{hint.text}</div> : null}
          {hint.imageUrl ? <img className="hint-image" src={hint.imageUrl} alt="Extra hint visual" /> : null}
        </div>
      ) : null}

      {hintError ? <p className="notice error small">{hintError}</p> : null}
    </div>
  );
}

function messageClass(kind?: ScanState['messageKind']) {
  if (kind === 'awarded') return 'notice success';
  if (kind === 'past' || kind === 'future') return 'notice warning';
  return 'notice success';
}

function Leaderboard({ rows, currentTeamName }: { rows: LeaderboardRow[]; currentTeamName: string }) {
  if (!rows.length) {
    return <div className="notice warning">Leaderboard is not available right now. Ask an admin for the final standings.</div>;
  }

  return (
    <section style={{ marginTop: 24 }}>
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
            {rows.map((row) => (
              <tr key={`${row.rank}-${row.name}`} className={row.name === currentTeamName ? 'highlight-row' : ''}>
                <td>{row.rank}</td>
                <td>{row.name}</td>
                <td>{row.score}</td>
                <td>{row.completedOrder}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
