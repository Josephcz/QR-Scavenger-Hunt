import { FormEvent, useState } from 'react';
import { SupportRecoveryText } from './SupportFooter';
import { CachedTeam, setCachedTeam } from './teamStore';

type Props = {
  onTeamReady: (team: CachedTeam) => void;
  scanWaiting?: boolean;
};

export function RegisterPanel({ onTeamReady, scanWaiting }: Props) {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/team/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      const payload = await response.json();

      if (!payload.ok) {
        setError(payload.error || 'Could not register team.');
        return;
      }

      const team: CachedTeam = payload.team;
      setCachedTeam(team);
      onTeamReady(team);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="kicker">Register or restore</div>
      <h2>Join the hunt</h2>
      {scanWaiting ? (
        <div className="notice warning">You scanned a station QR code, but this browser does not have a team saved yet. Register or restore your team first; the scan will continue afterward.</div>
      ) : null}
      <form className="form" onSubmit={submit}>
        <label>
          <div className="label">Team name or recovery code</div>
          <input
            className="input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="e.g. The Fireflies or REC-ABCD1234"
            autoComplete="off"
          />
        </label>
        <button className="button" disabled={loading} type="submit">{loading ? 'Saving…' : 'Continue'}</button>
      </form>
      {error ? <p className="notice error small">{error}</p> : null}
      <div className="notice" style={{ marginTop: 14 }}>
        <strong>Lost your browser data?</strong>
        <p className="small" style={{ margin: '6px 0 0' }}>Enter your recovery code above instead of a team name. <SupportRecoveryText /></p>
      </div>
    </div>
  );
}
