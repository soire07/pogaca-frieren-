/**
 * Frieren Portal transactional mail relay.
 *
 * Deploy as a Web App:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * Before deployment, set Script Property API_SECRET to the same random
 * secret stored in Render as SITE_GMAIL_SCRIPT_SECRET.
 * Run once as the Gmail account frieren.portal@gmail.com to authorize Gmail.
 */
function doPost(e) {
  try {
    var expected = PropertiesService.getScriptProperties().getProperty('API_SECRET');
    var input = JSON.parse(e && e.postData && e.postData.contents || '{}');
    if (!expected || !constantTimeEquals(String(input.secret || ''), expected)) {
      return jsonResponse({ ok: false });
    }

    var to = String(input.to || '').trim();
    var subject = String(input.subject || '').trim();
    var html = String(input.html || '');
    var plain = String(input.plain || '');
    var senderName = String(input.senderName || 'Frieren Portal').slice(0, 80);

    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(to) ||
        !subject || subject.length > 200 ||
        html.length > 20000 || plain.length > 10000) {
      return jsonResponse({ ok: false });
    }

    GmailApp.sendEmail(to, subject, plain || 'Frieren Portal', {
      htmlBody: html,
      name: senderName
    });
    return jsonResponse({ ok: true });
  } catch (error) {
    console.error('Frieren mail relay failed: ' +
      String(error && error.name || 'Error').slice(0, 60));
    return jsonResponse({ ok: false });
  }
}

function constantTimeEquals(a, b) {
  if (!a || a.length !== b.length) return false;
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
