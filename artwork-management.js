(function initializeArtworkManagementPage(root) {
  'use strict';

  const modules = {
    artworkRepository: root.GalleryArtworksRepository,
    exhibitionsRepository: root.ExhibitionsRepository,
    identity: root.ArtworkIdentity,
    exhibitionIndex: root.ArtworkExhibitionIndex,
    syncService: root.ArtworkSyncService,
    collectionTable: root.ArtworkCollectionTable,
    pastExhibitionTable: root.ArtworkPastExhibitionTable,
    selectionController: root.ArtworkSelectionController,
    filtersController: root.ArtworkFiltersController,
    toolbarController: root.ArtworkToolbarController,
    editorController: root.ArtworkEditorController
  };
  const state = { tab: 'collection', artworks: [], exhibitions: [], tables: {}, selected: [] };
  let selection;
  let filters;
  let toolbar;
  let editor;
  let unresolved = [];

  function getAuthorizedUser() {
    const user = JSON.parse(root.localStorage.getItem('currentUser') || 'null');
    const access = String(user?.siteAccess || 'gallery').toLowerCase();
    if (user && (access === 'gallery' || access === 'both' || access === 'all')) return user;
    root.location.href = user ? 'index.html' : 'login.html';
    return null;
  }

  function persist(next) {
    if (!modules.artworkRepository.repository.saveArtworksSafely(next.artworks)) return false;
    if (next.exhibitions && !modules.exhibitionsRepository.repository.saveExhibitionsSafely(next.exhibitions)) return false;
    state.artworks = next.artworks;
    if (next.exhibitions) state.exhibitions = next.exhibitions;
    refresh();
    return true;
  }

  function validateCollectionNumber(workId, collection) {
    const number = String(collection?.collectionNumber || '').trim();
    if (!collection?.owned || !number) return true;
    return !state.artworks.some((artwork) => artwork.workId !== workId && artwork.collection?.owned && artwork.collection.collectionNumber === number);
  }

  function createArtwork(values) {
    if (!validateCollectionNumber(null, values.collection)) return showEditorError('소장 번호는 중복될 수 없습니다.');
    const now = new Date().toISOString();
    return persist({ artworks: [...state.artworks, { workId: modules.identity.createWorkId(), ...values, artistId: null, createdAt: now, updatedAt: now }] });
  }

  function updateArtwork(row, values, tab) {
    if (tab === 'collection') {
      if (!validateCollectionNumber(row.workId, values.collection)) return showEditorError('소장 번호는 중복될 수 없습니다.');
      return persist(modules.syncService.synchronizeCanonicalEdit({ artworks: state.artworks, exhibitions: state.exhibitions, workId: row.workId, changes: values }));
    }
    return persist(modules.syncService.updateLatestOccurrence({
      artworks: state.artworks,
      exhibitions: state.exhibitions,
      workId: row.workId,
      changes: { title: values.title, author: values.artistName, price: values.currentPrice, size: values.size, materials: values.medium, year: values.year, photoUrl: values.imageRef.photoUrl, photoPreviewUrl: values.imageRef.photoPreviewUrl }
    }));
  }

  function showEditorError(message) {
    document.getElementById('artwork-editor-error').textContent = message;
    return false;
  }

  function removeFromCollection() {
    const selectedIds = new Set(state.selected.map((row) => row.workId));
    if (!selectedIds.size || !confirm(`${selectedIds.size}개 작품을 소장품에서 해제하시겠습니까?`)) return;
    const artworks = state.artworks.map((artwork) => selectedIds.has(artwork.workId)
      ? { ...artwork, collection: { ...artwork.collection, owned: false }, updatedAt: new Date().toISOString() }
      : artwork);
    persist({ artworks });
  }

  function refresh() {
    const collectionRows = modules.exhibitionIndex.buildCollectionRows(state.artworks, state.exhibitions);
    const past = modules.exhibitionIndex.buildExhibitionIndex(state.exhibitions, state.artworks);
    unresolved = past.unresolved;
    state.tables.collection.replaceData(collectionRows);
    state.tables.past.replaceData(past.rows);
    const note = document.getElementById('artwork-resolution-note');
    note.hidden = past.unresolved.length === 0;
    document.getElementById('artwork-resolution-text').textContent = past.unresolved.length ? `연결이 필요한 기존 전시 작품 ${past.unresolved.length}개가 있습니다. 모호한 항목은 자동 연결하지 않았습니다.` : '';
  }

  function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.artwork-tab').forEach((button) => {
      const active = button.dataset.tab === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    document.getElementById('collection-table').hidden = tab !== 'collection';
    document.getElementById('past-exhibition-table').hidden = tab !== 'past';
    selection.bind(state.tables[tab]);
    filters.bind(state.tables[tab]);
    toolbar.update({ tab, selectedCount: 0 });
  }

  async function start() {
    const user = getAuthorizedUser();
    if (!user) return;
    document.getElementById('user-display').textContent = user.name || user.username || '';
    await root.cloudSyncReady;
    state.artworks = modules.artworkRepository.repository.loadArtworks();
    state.exhibitions = modules.exhibitionsRepository.repository.loadExhibitions();
    const collectionRows = modules.exhibitionIndex.buildCollectionRows(state.artworks, state.exhibitions);
    const past = modules.exhibitionIndex.buildExhibitionIndex(state.exhibitions, state.artworks);
    unresolved = past.unresolved;
    state.tables.collection = modules.collectionTable.create('#collection-table', { data: collectionRows });
    state.tables.past = modules.pastExhibitionTable.create('#past-exhibition-table', { data: past.rows });
    toolbar = modules.toolbarController.create({ document, onAdd: () => editor.openCreate(), onEdit: () => editor.openEdit(state.selected[0], state.tab), onRemove: removeFromCollection });
    selection = modules.selectionController.create({ onChange: (rows) => { state.selected = rows; document.getElementById('artwork-selection-count').textContent = `${rows.length}개 선택`; toolbar.update({ tab: state.tab, selectedCount: rows.length }); } });
    filters = modules.filtersController.create({ input: document.getElementById('artwork-search') });
    editor = modules.editorController.create({
      document,
      onCreate: createArtwork,
      onUpdate: updateArtwork,
      onResolve: (item, workId) => persist(modules.syncService.resolveOccurrence({ artworks: state.artworks, exhibitions: state.exhibitions, exhibitionId: item.exhibition.id, occurrenceId: item.work.id, workId }))
    });
    document.getElementById('artwork-resolve-btn').addEventListener('click', () => editor.openResolution(unresolved, state.artworks));
    document.querySelectorAll('.artwork-tab').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.tab)));
    const note = document.getElementById('artwork-resolution-note');
    note.hidden = unresolved.length === 0;
    document.getElementById('artwork-resolution-text').textContent = unresolved.length ? `연결이 필요한 기존 전시 작품 ${unresolved.length}개가 있습니다. 모호한 항목은 자동 연결하지 않았습니다.` : '';
    switchTab('collection');
    root.addEventListener('cloud-sync:state-applied', (event) => {
      if (!event.detail?.keys?.some((key) => ['exhibitions', 'gallery-artworks-v1'].includes(key))) return;
      state.artworks = modules.artworkRepository.repository.loadArtworks();
      state.exhibitions = modules.exhibitionsRepository.repository.loadExhibitions();
      refresh();
    });
  }

  root.addEventListener('DOMContentLoaded', () => {
    root.artworkManagementReady = start();
    root.artworkManagementReady.catch((error) => console.error('Artwork management startup failed.', error));
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);