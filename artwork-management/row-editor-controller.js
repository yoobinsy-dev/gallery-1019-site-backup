(function initializeArtworkRowEditorController(root, factory) {
  'use strict';

  const api = factory(root);
  root.ArtworkRowEditorController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createArtworkRowEditorController(root) {
  'use strict';

  function hasMinimumData(row) {
    return Boolean(String(row?.title || '').trim() && String(row?.artistName || '').trim());
  }

  function valuesFromRow(row, tab) {
    const values = {
      title: String(row.title || '').trim(),
      artistName: String(row.artistName || '').trim(),
      currentPrice: String(tab === 'past' ? row.latestPrice ?? '' : row.currentPrice ?? '').trim(),
      size: String(row.size || '').trim(),
      medium: String(row.medium || '').trim(),
      year: String(row.year || '').trim(),
      imageRef: { ...(row.imageRef || {}) }
    };
    if (tab === 'collection') {
      values.collection = {
        owned: true,
        collectionNumber: String(row.collection?.collectionNumber || '').trim(),
        dateAdded: row.collection?.dateAdded || new Date().toISOString().slice(0, 10)
      };
    }
    return values;
  }

  function readFileAsDataUrl(file, FileReaderImpl) {
    return new Promise((resolve, reject) => {
      const reader = new FileReaderImpl();
      reader.onerror = () => reject(reader.error || new Error('이미지 파일을 읽지 못했습니다.'));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(file);
    });
  }

  function create(options = {}) {
    let draftSequence = 0;
    const objectUrls = new Set();

    function createDraft() {
      draftSequence += 1;
      return {
        workId: `draft_${Date.now()}_${draftSequence}`,
        _draft: true,
        title: '',
        artistName: '',
        currentPrice: '',
        size: '',
        medium: '',
        year: '',
        imageRef: {},
        collection: { owned: true, collectionNumber: '', dateAdded: new Date().toISOString().slice(0, 10) },
        exhibitionHistory: []
      };
    }

    async function addDraft(table) {
      const row = await table.addRow(createDraft(), true);
      row.getCell('title')?.edit();
      return row;
    }

    async function uploadPendingPhoto(data) {
      if (!data._pendingPhotoFile) return { ok: true, imageRef: { ...(data.imageRef || {}) } };
      const dataUrl = await readFileAsDataUrl(data._pendingPhotoFile, options.FileReaderImpl || root.FileReader);
      const uploaded = await options.imageLifecycle.uploadImageDataUrl({
        dataUrl,
        fileName: options.imageLifecycle.buildPhotoUploadFileName(data._pendingPhotoFile.name, 'full', data._pendingPhotoFile.type),
        canUpload: true,
        fetchImpl: options.fetchImpl || root.fetch.bind(root)
      });
      if (!uploaded) return { ok: false, imageRef: { ...(data.imageRef || {}) } };
      return {
        ok: true,
        imageRef: {
          photoUrl: uploaded.url,
          photoPreviewUrl: uploaded.url,
          photoPath: uploaded.pathname || '',
          photoPreviewPath: uploaded.pathname || ''
        }
      };
    }

    async function commitRow(row, tab) {
      const data = row.getData();
      const wasDraft = data._draft === true;
      if (!hasMinimumData(data)) return { status: 'draft' };
      const previousImageRef = { ...(data.imageRef || {}) };
      const uploaded = await uploadPendingPhoto(data);
      if (!uploaded.ok) {
        options.onError?.('이미지 업로드에 실패했습니다. 기존 이미지는 유지됩니다.');
        return { status: 'upload-failed' };
      }
      const values = valuesFromRow({ ...data, imageRef: uploaded.imageRef }, tab);
      const saved = wasDraft
        ? await options.onCreate(values)
        : await options.onUpdate(data, values, tab);
      if (!saved) {
        await row.update({ imageRef: previousImageRef });
        options.onError?.('작품 저장에 실패했습니다. 기존 이미지는 유지됩니다.');
        return { status: 'save-failed' };
      }
      if (data._previewUrl) {
        root.URL?.revokeObjectURL(data._previewUrl);
        objectUrls.delete(data._previewUrl);
      }
      await row.update({ ...saved, _draft: false, _pendingPhotoFile: null, _previewUrl: '' });
      return { status: wasDraft ? 'created' : 'updated', artwork: saved };
    }

    async function selectPhoto(row, file, tab) {
      if (!file) return { status: 'cancelled' };
      const data = row.getData();
      if (data._previewUrl) {
        root.URL?.revokeObjectURL(data._previewUrl);
        objectUrls.delete(data._previewUrl);
      }
      const previewUrl = root.URL?.createObjectURL(file) || '';
      if (previewUrl) objectUrls.add(previewUrl);
      await row.update({ _pendingPhotoFile: file, _previewUrl: previewUrl });
      return hasMinimumData(row.getData()) ? commitRow(row, tab) : { status: 'draft' };
    }

    return Object.freeze({
      addDraft,
      commitRow,
      selectPhoto,
      destroy() {
        objectUrls.forEach((url) => root.URL?.revokeObjectURL(url));
        objectUrls.clear();
      }
    });
  }

  return Object.freeze({ create, hasMinimumData, readFileAsDataUrl, valuesFromRow });
});