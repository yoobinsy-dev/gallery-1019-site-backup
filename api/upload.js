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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST']);
    return;
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    sendJson(res, 500, { ok: false, error: 'Missing BLOB_READ_WRITE_TOKEN environment variable.' });
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
      access: 'public',
      contentType: parsed.mimeType
    });

    sendJson(res, 200, {
      ok: true,
      file: {
        url: uploaded.url,
        pathname: uploaded.pathname,
        contentType: parsed.mimeType,
        size: parsed.buffer.length
      }
    });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || 'Upload failed.' });
  }
};
