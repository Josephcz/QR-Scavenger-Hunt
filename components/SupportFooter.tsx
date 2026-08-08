const supportPhone = process.env.NEXT_PUBLIC_SUPPORT_PHONE || '';

function whatsappUrl(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}` : '';
}

export function SupportFooter() {
  if (!supportPhone) {
    return (
      <footer className="support-footer">
        <div className="small muted">Having trouble with a QR code? Contact an event admin.</div>
      </footer>
    );
  }

  const waUrl = whatsappUrl(supportPhone);
  return (
    <footer className="support-footer">
      <div>
        <div className="kicker">Need help?</div>
        <div className="small muted">If a QR code is not working or you lose access to your team, contact event support.</div>
      </div>
      <div className="row support-actions">
        <a className="button secondary compact-button" href={`tel:${supportPhone.replace(/\s/g, '')}`}>Call {supportPhone}</a>
        {waUrl ? <a className="button secondary compact-button" href={waUrl} target="_blank" rel="noreferrer">WhatsApp</a> : null}
      </div>
    </footer>
  );
}

export function SupportRecoveryText() {
  if (!supportPhone) {
    return <>If you lose both this browser storage and your recovery code, contact an event admin so they can look up your team.</>;
  }

  const waUrl = whatsappUrl(supportPhone);
  return (
    <>
      If you lose both this browser storage and your recovery code, contact event support at <a href={`tel:${supportPhone.replace(/\s/g, '')}`}>{supportPhone}</a>
      {waUrl ? <> or <a href={waUrl} target="_blank" rel="noreferrer">WhatsApp them</a></> : null} so they can look up your team.
    </>
  );
}
