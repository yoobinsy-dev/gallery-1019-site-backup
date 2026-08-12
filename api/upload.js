const { put } = require('@vercel/blob');
const { sendJson, methodNotAllowed, readJsonBody } = require('./_lib/http');

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) return null;

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64')
  };
}

function sanitizeFilename(name) {
  const safe = (name || 'upload.bin').toString().trim().replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!safe) return 'upload.bin';
  return safe;
}

async function verifyPublicImageUrl(url) {
  const target = (url || '').toString().trim();
  if (!target) {
    return { ok: false, status: 0, contentType: '', isImage: false };
  }

  try {
    const response = await fetch(target, { method: 'GET' });
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    return {
      ok: response.ok && contentType.startsWith('image/'),
      status: response.status,
      contentType,
      isImage: contentType.startsWith('image/')
    };
  } catch (error) {
    return { ok: false, status: 0, contentType: '', isImage: false };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST']);
    return;
  }

  const exhibitionBlobToken = process.env.EXHIBITION_IMAGE_READ_WRITE_TOKEN
    || process.env.EXHIBITION_IMAGE_BLOB_READ_WRITE_TOKEN
    || '';
  if (!exhibitionBlobToken) {
    sendJson(res, 500, { ok: false, error: 'Missing EXHIBITION_IMAGE_READ_WRITE_TOKEN environment variable.' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const parsed = parseDataUrl(body.dataUrl);
    if (!parsed) {
      sendJson(res, 400, { ok: false, error: 'Invalid dataUrl payload.' });
      return;
    }

    const filename = sanitizeFilename(body.filename);
    const blobPath = `uploads/${Date.now()}-${filename}`;

    const uploaded = await put(blobPath, parsed.buffer, {
      token: exhibitionBlobToken,
      access: 'public',
      contentType: parsed.mimeType
    });

    const verification = await verifyPublicImageUrl(uploaded.url);
    if (!verification.ok) {
      sendJson(res, 502, {
        ok: false,
        error: 'Uploaded image failed public URL verification.',
        details: verification
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      file: {
        url: uploaded.url,
        pathname: uploaded.pathname,
        contentType: parsed.mimeType,
        size: parsed.buffer.length
      },
      verification
    });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || 'Upload failed.' });
  }
};
