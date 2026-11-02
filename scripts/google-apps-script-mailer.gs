/**
 * Frieren Portal transactional mail relay.
 *
 * Deploy as a Web App:
 *   Execute as: Me (frieren.portal@gmail.com)
 *   Who has access: Anyone
 *
 * Script Property:
 *   API_SECRET = same value as Render SITE_GMAIL_SCRIPT_SECRET
 *
 * Run testGmailPermission() once from the editor to authorize Gmail.
 */

/**
 * Public health check. Browser navigation sends GET; mail delivery uses POST.
 * This endpoint never exposes configuration or accepts mail instructions.
 */
function doGet(e) {
  return jsonResponse({
    ok: true,
    service: 'Frieren Portal mail relay',
    method: 'GET',
    message: 'Endpoint is reachable. Authenticated POST is required to send mail.'
  });
}

function doPost(e) {
  var stage = 'START';

  try {
    stage = 'READ_REQUEST';
    var rawBody = e && e.postData && e.postData.contents;
    if (!rawBody) {
      return jsonResponse({ ok: false, stage: stage, error: 'EMPTY_REQUEST' });
    }

    var input = JSON.parse(rawBody);

    stage = 'AUTH';
    var expected = String(PropertiesService.getScriptProperties().getProperty('API_SECRET') || '').trim();
    var supplied = String(input.secret || '').trim();
    if (!expected || !constantTimeEquals(supplied, expected)) {
      console.warn('[Frieren Mail] Request rejected: authentication failed');
      return jsonResponse({ ok: false, stage: stage, error: 'AUTH_FAILED' });
    }

    stage = 'VALIDATION';
    var to = String(input.to || '').trim();
    var subject = String(input.subject || '').trim();
    var html = String(input.html || '');
    var plain = String(input.plain || '');
    var senderName = String(input.senderName || 'Frieren Portal').slice(0, 80);

    // IMPORTANT: use single backslashes in JavaScript regex literals.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to) ||
        !subject || subject.length > 200 ||
        html.length > 20000 || plain.length > 10000) {
      console.warn('[Frieren Mail] Request rejected: invalid email payload');
      return jsonResponse({ ok: false, stage: stage, error: 'INVALID_EMAIL_PAYLOAD' });
    }

    stage = 'GMAIL_SEND';
    console.log('[Frieren Mail] Sending message; recipient=' +
      to.replace(/^(.).+(@.+)$/, '$1***$2'));

    GmailApp.sendEmail(to, subject, plain || 'Frieren Portal', {
      htmlBody: html || undefined,
      name: senderName
    });

    console.log('[Frieren Mail] GmailApp.sendEmail completed');
    return jsonResponse({ ok: true, stage: 'SENT' });

  } catch (error) {
    var message = String(error && error.message || error || 'Unknown error');
    console.error('[Frieren Mail] Failed at ' + stage + ': ' + message);
    return jsonResponse({
      ok: false,
      stage: stage,
      error: 'MAIL_DELIVERY_FAILED'
    });
  }
}

function testGmailPermission() {
  console.log('[Frieren Mail Test] Started');
  GmailApp.sendEmail(
    'frieren.portal@gmail.com',
    'Frieren Portal - Gmail Test',
    'Gmail gönderim izni başarıyla doğrulandı.'
  );
  console.log('[Frieren Mail Test] GmailApp.sendEmail completed');
}

function constantTimeEquals(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  var mismatch = 0;
  for (var i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function jsonResponse(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
