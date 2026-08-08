import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';

type ScannerControls = { stop: () => void };

export function QrScanner() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const handledRef = useRef(false);

  function openScanner() {
    // A successful scan deliberately leaves handledRef=true until the scanner
    // closes, preventing duplicate decode callbacks for the same QR frame.
    // Reset it only when starting a brand-new scanner session.
    controlsRef.current?.stop();
    controlsRef.current = null;
    handledRef.current = false;
    setError('');
    setStarting(false);
    setOpen(true);
  }

  function closeScanner() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    handledRef.current = false;
    setOpen(false);
    setStarting(false);
    setError('');
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function start() {
      setStarting(true);
      setError('');
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera access is not available in this browser. Open the site over HTTPS and try a current mobile browser.');
        }

        const { BrowserQRCodeReader } = await import('@zxing/browser');
        if (cancelled || !videoRef.current) return;

        const reader = new BrowserQRCodeReader();
        const controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: 'environment' } } },
          videoRef.current,
          (result, _scanError, controls) => {
            if (!result || handledRef.current) return;
            handledRef.current = true;
            const value = result.getText();
            try {
              const scanned = new URL(value, window.location.origin);
              const code = scanned.searchParams.get('c');
              const token = scanned.searchParams.get('t');
              if (!code || !token) {
                handledRef.current = false;
                setError('That is not a station QR code for this hunt.');
                return;
              }

              controls.stop();
              controlsRef.current?.stop();
              controlsRef.current = null;
              setOpen(false);
              setStarting(false);
              void router.push({ pathname: '/', query: { c: code, t: token } });
            } catch {
              handledRef.current = false;
              setError('The scanned QR code does not contain a valid hunt link.');
            }
          }
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not start the camera.');
        }
      } finally {
        if (!cancelled) setStarting(false);
      }
    }

    void start();
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, router]);

  return (
    <>
      <button className="scanner-fab" type="button" onClick={openScanner} aria-label="Scan QR code">
        <QrIcon />
        <span>Scan QR</span>
      </button>

      {open ? (
        <div className="scanner-overlay" role="dialog" aria-modal="true" aria-label="QR code scanner">
          <div className="scanner-sheet">
            <div className="row scanner-heading">
              <div>
                <div className="kicker">QR scanner</div>
                <h2>Scan the next station</h2>
              </div>
              <button className="button secondary compact-button" type="button" onClick={closeScanner}>Close</button>
            </div>
            <div className="scanner-video-wrap">
              <video ref={videoRef} className="scanner-video" muted playsInline />
              <div className="scanner-frame" aria-hidden="true" />
            </div>
            {starting ? <p className="small muted">Starting camera…</p> : null}
            {error ? <p className="notice error small">{error}</p> : <p className="small muted">Point the camera at one of the hunt QR codes. The scan stays inside this page.</p>}
          </div>
        </div>
      ) : null}
    </>
  );
}

function QrIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Z" stroke="currentColor" strokeWidth="2" />
      <path d="M14 14h2v2h-2v-2Zm4 0h2v4h-2v-4Zm-4 4h4v2h-4v-2Z" fill="currentColor" />
    </svg>
  );
}
