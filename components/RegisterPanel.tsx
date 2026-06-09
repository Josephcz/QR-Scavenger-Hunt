import { FormEvent, useState } from 'react';
import { CachedTeam, setCachedTeam } from './teamStore';

type Props = {
  onTeamReady: (team: CachedTeam) => void;
  scanWaiting?: boolean;
};

export function RegisterPanel({ onTeamReady, scanWaiting }: Props) {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

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
      setSuccess(payload.mode === 'recovered' ? 'Team restored.' : 'Team created.');
      onTeamReady(team);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="kicker">Register</div>
      <h2>Join the hunt</h2>
      {scanWaiting ? (
        <div className="notice warning">
          You scanned a station QR code, but this browser does not have a team saved yet. Register or restore your team first.
        </div>
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
        <button className="button" disabled={loading} type="submit">
          {loading ? 'Saving…' : 'Continue'}
        </button>
      </form>
      {error ? <p className="notice error small">{error}</p> : null}
      {success ? <p className="notice success small">{success}</p> : null}
      <p className="small muted" style={{ marginTop: 14 }}>
        Save your recovery code after registering. If this phone loses browser storage, an admin can look up the recovery code and you can enter it here.
      </p>
    </div>
  );
}
