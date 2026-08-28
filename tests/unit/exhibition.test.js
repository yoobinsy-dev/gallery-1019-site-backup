const test = require('node:test');
const assert = require('node:assert/strict');

const { exposeClassicScriptFunctions } = require('../helpers/load-source');

function loadExhibition() {
  return exposeClassicScriptFunctions('exhibition-detail.js', [
    'getPhotoPreviewDataUrl',
    'getPhotoDataUrl',
    'getCertificateImageDataUrl',
    'hasGeneratedCertificate',
    'normalizeCertificateDateText',
    'safeCertificateFileName'
  ], {
    globals: {
      atob(value) { return Buffer.from(value, 'base64').toString('binary'); },
      CustomEvent: class CustomEvent {},
      FileReader: class FileReader {},
      Image: class Image {},
      DOMParser: class DOMParser {}
    }
  }).exposed;
}

test('exhibition images characterize pending, URL, and legacy preview precedence', () => {
  const exhibition = loadExhibition();
  const item = {
    pendingPhotoPreviewDataUrl: 'pending-preview',
    pendingPhotoDataUrl: 'pending-full',
    photoPreviewUrl: 'preview-url',
    photoUrl: 'full-url',
    photoPreviewDataUrl: 'legacy-preview',
    photoDataUrl: 'legacy-full'
  };
  assert.equal(exhibition.getPhotoPreviewDataUrl(item), 'pending-preview');
  assert.equal(exhibition.getPhotoDataUrl(item), 'pending-full');
  delete item.pendingPhotoPreviewDataUrl;
  assert.equal(exhibition.getPhotoPreviewDataUrl(item), 'pending-full');
  delete item.pendingPhotoDataUrl;
  assert.equal(exhibition.getPhotoPreviewDataUrl(item), 'preview-url');
  assert.equal(exhibition.getPhotoDataUrl(item), 'full-url');
  assert.equal(exhibition.getPhotoPreviewDataUrl({ photoDataUrl: 'legacy-full' }), 'legacy-full');
});

test('certificate inputs characterize artwork fallback, ready version, date, and safe filename', () => {
  const exhibition = loadExhibition();
  assert.equal(
    exhibition.getCertificateImageDataUrl(
      { photoPreviewUrl: 'sold-preview' },
      { photoUrl: 'work-full' }
    ),
    'work-full'
  );
  assert.equal(exhibition.hasGeneratedCertificate({ certificateReady: true, certificateVersion: 2 }), true);
  assert.equal(exhibition.hasGeneratedCertificate({ certificateReady: true, certificateVersion: 1 }), false);
  assert.equal(exhibition.normalizeCertificateDateText('2026-08-28 12:34:56'), '2026.08.28');
  assert.equal(exhibition.safeCertificateFileName('A/B:*?'), 'A_B___-보증서.xlsx');
});