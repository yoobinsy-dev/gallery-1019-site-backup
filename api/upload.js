const { put } = require('@vercel/blob');
const { handleUpload } = require('@vercel/blob/client');
const { sendJson, methodNotAllowed, readJsonBody } = require('./_lib/http');

const MAX_EXHIBITION_FILE_SIZE = 100 * 1024 * 1024;

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
  return verifyPublicUploadUrl(url, '', true);
}

async function verifyPublicUploadUrl(url, expectedMimeType, requireImage) {
  const target = (url || '').toString().trim();
  if (!target) {
    return { ok: false, status: 0, contentType: '', isImage: false };
  }

  try {
    const response = await fetch(target, { method: 'GET' });
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const normalizedExpected = String(expectedMimeType || '').toLowerCase().split(';')[0].trim();
    const normalizedActual = contentType.split(';')[0].trim();
    const isImage = normalizedActual.startsWith('image/');
    const contentTypeMatches = !normalizedExpected || normalizedActual === normalizedExpected;
    return {
      ok: response.ok && contentTypeMatches && (!requireImage || isImage),
      status: response.status,
      contentType,
      isImage
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
    if (body.type === 'blob.generate-client-token' || body.type === 'blob.upload-completed') {
      const result = await handleUpload({
        token: exhibitionBlobToken,
        request: req,
        body,
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          let payload;
          try {
            payload = JSON.parse(clientPayload || '{}');
          } catch (error) {
            throw new Error('Invalid exhibition file upload metadata.');
          }

          const exhibitionId = sanitizeFilename(payload.exhibitionId || 'unknown');
          const expectedPrefix = `exhibition-files/${exhibitionId}/`;
          const relativePath = String(pathname || '').slice(expectedPrefix.length);
          if (payload.purpose !== 'exhibition-file'
            || !String(pathname || '').startsWith(expectedPrefix)
            || !relativePath
            || relativePath.includes('/')) {
            throw new Error('Invalid exhibition file upload path.');
          }

          const contentType = String(payload.contentType || 'application/octet-stream');
          return {
            allowedContentTypes: [contentType],
            maximumSizeInBytes: MAX_EXHIBITION_FILE_SIZE,
            addRandomSuffix: true,
            tokenPayload: JSON.stringify({ purpose: 'exhibition-file', exhibitionId })
          };
        },
        onUploadCompleted: async () => {}
      });
      sendJson(res, 200, result);
      return;
    }

    const parsed = parseDataUrl(body.dataUrl);
    if (!parsed) {
      sendJson(res, 400, { ok: false, error: 'Invalid dataUrl payload.' });
      return;
    }

    const filename = sanitizeFilename(body.filename);
    const isExhibitionFile = body.purpose === 'exhibition-file';
    const exhibitionId = sanitizeFilename(body.exhibitionId || 'unknown');
    const blobPath = isExhibitionFile
      ? `exhibition-files/${exhibitionId}/${Date.now()}-${filename}`
      : `uploads/${Date.now()}-${filename}`;

    const uploaded = await put(blobPath, parsed.buffer, {
      token: exhibitionBlobToken,
      access: 'public',
      contentType: parsed.mimeType
    });

    const verification = isExhibitionFile
      ? await verifyPublicUploadUrl(uploaded.url, parsed.mimeType, false)
      : await verifyPublicImageUrl(uploaded.url);
    if (!verification.ok) {
      sendJson(res, 502, {
        ok: false,
        error: isExhibitionFile
          ? 'Uploaded file failed public URL verification.'
          : 'Uploaded image failed public URL verification.',
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
