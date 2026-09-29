// Sends transactional email via Resend (resend.com). If RESEND_API_KEY isn't set
// yet, this logs instead of throwing, so the rest of the site keeps working while
// that account is still being set up.
const FROM = process.env.EMAIL_FROM || 'What Sheridan Said <notify@whatsheridansaid.com>';

async function sendEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn('[email] RESEND_API_KEY not set — email not sent. Would have sent:', { to, subject });
    return { sent: false, reason: 'no-api-key' };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${text}`);
  }
  return { sent: true };
}

const wrap = (title, bodyHtml) => `
<div style="font-family:Georgia,serif;background:#0a0a0a;color:#f5f5f2;padding:40px 24px;">
  <div style="max-width:480px;margin:0 auto;">
    <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#8f8f89;margin-bottom:24px;">What Sheridan Said</div>
    <h1 style="font-size:22px;margin:0 0 16px;">${title}</h1>
    ${bodyHtml}
  </div>
</div>`;

async function sendMagicLink(email, url) {
  return sendEmail({
    to: email, subject: 'Your login link',
    html: wrap('Here\u2019s your login link', `<p style="line-height:1.6;">Click below to log in. This link works once and expires in 30 minutes.</p><p><a href="${url}" style="color:#f5f5f2;">Log in to What Sheridan Said &rarr;</a></p>`),
  });
}
async function sendPasswordReset(email, url) {
  return sendEmail({
    to: email, subject: 'Reset your password',
    html: wrap('Reset your password', `<p style="line-height:1.6;">Someone (hopefully you) asked to reset the password on this account. This link works once and expires in 30 minutes.</p><p><a href="${url}" style="color:#f5f5f2;">Reset your password &rarr;</a></p><p style="color:#8f8f89;font-size:13px;">If this wasn't you, you can ignore this email.</p>`),
  });
}
async function sendGiftInvite(email, checkoutUrl) {
  return sendEmail({
    to: email, subject: "You've been gifted 30 days of What Sheridan Said",
    html: wrap('A 30-day gift, on the house', `<p style="line-height:1.6;">Sheridan's given you 30 days of full access to What Sheridan Said &mdash; every episode, every poem, nothing held back. Confirm below to start your free month.</p><p><a href="${checkoutUrl}" style="color:#f5f5f2;">Start my free 30 days &rarr;</a></p><p style="color:#8f8f89;font-size:13px;">A card is required to confirm, but you won't be charged until the 30 days are up, and you can cancel anytime before then.</p>`),
  });
}
async function sendAccessGranted(email, loginUrl, expires) {
  const until = expires ? `through ${new Date(expires).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}` : 'with no end date set';
  return sendEmail({
    to: email, subject: "You're all set — full access to What Sheridan Said",
    html: wrap('You have full access', `<p style="line-height:1.6;">You now have full subscriber access to What Sheridan Said, ${until}. No card needed.</p><p><a href="${loginUrl}" style="color:#f5f5f2;">Log in to read everything &rarr;</a></p><p style="color:#8f8f89;font-size:13px;">That link logs you in directly. You can set a password later from your account if you'd like.</p>`),
  });
}

module.exports = { sendEmail, sendMagicLink, sendPasswordReset, sendGiftInvite, sendAccessGranted };
