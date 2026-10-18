const test = require('node:test');
const assert = require('node:assert/strict');

const { createRequest, createResponse } = require('../helpers/http');
const { loadCommonJsWithMocks } = require('../helpers/load-source');

test('upload API keeps image verification and supports durable exhibition files', async () => {
  const uploads = [];
  const handler = loadCommonJsWithMocks('api/upload.js', {
    '@vercel/blob': {
      async put(pathname, buffer, options) {
        uploads.push({ pathname, content: buffer.toString('utf8'), options });
        return { url: `https://blob.example/${pathname}`, pathname };
      }
    }
  });
  const originalFetch = global.fetch;
  const originalToken = process.env.EXHIBITION_IMAGE_READ_WRITE_TOKEN;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get() { return 'text/plain; charset=utf-8'; } }
  });
  process.env.EXHIBITION_IMAGE_READ_WRITE_TOKEN = 'test-token';

  try {
    const imageResponse = createResponse();
    await handler(createRequest('POST', {
      body: {
        dataUrl: 'data:text/plain;base64,dGVzdA==',
        filename: 'ordinary.txt'
      }
    }), imageResponse);
    assert.equal(imageResponse.statusCode, 502);
    assert.equal(imageResponse.json().error, 'Uploaded image failed public URL verification.');

    const fileResponse = createResponse();
    await handler(createRequest('POST', {
      body: {
        dataUrl: 'data:text/plain;base64,dGVzdA==',
        filename: 'document name.txt',
        purpose: 'exhibition-file',
        exhibitionId: 7
      }
    }), fileResponse);

    assert.equal(fileResponse.statusCode, 200);
    assert.equal(fileResponse.json().ok, true);
    assert.match(fileResponse.json().file.url, /^https:\/\/blob\.example\/exhibition-files\/7\//);
    assert.equal(fileResponse.json().file.contentType, 'text/plain');
    assert.equal(fileResponse.json().verification.isImage, false);
    assert.equal(uploads[1].pathname.startsWith('exhibition-files/7/'), true);
    assert.equal(uploads[1].pathname.endsWith('-document_name.txt'), true);
    assert.equal(uploads[1].content, 'test');
    assert.equal(uploads[1].options.contentType, 'text/plain');
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.EXHIBITION_IMAGE_READ_WRITE_TOKEN;
    else process.env.EXHIBITION_IMAGE_READ_WRITE_TOKEN = originalToken;
  }
});