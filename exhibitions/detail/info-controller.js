(function initializeExhibitionDetailInfoController(root, factory) {
  'use strict';

  const api = factory();
  root.ExhibitionDetailInfoController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createInfoControllerModule() {
  'use strict';

  function create(options) {
    const state = options.state;
    const document = options.document;
    const loadUsers = options.loadUsers;

    function ensureExhibitionInfoData() {
      const exhibition = options.getCurrentExhibition();
      if (typeof exhibition.artistNote !== 'string') exhibition.artistNote = '';
      if (typeof exhibition.invitationText !== 'string') exhibition.invitationText = '';
      if (typeof exhibition.artistNoteSaved !== 'boolean') exhibition.artistNoteSaved = false;
      if (typeof exhibition.invitationTextSaved !== 'boolean') exhibition.invitationTextSaved = false;
      if (!exhibition.artistInstagramMap || typeof exhibition.artistInstagramMap !== 'object' || Array.isArray(exhibition.artistInstagramMap)) {
        exhibition.artistInstagramMap = {};
      }
      if (typeof exhibition.artistInstagramSaved !== 'boolean') exhibition.artistInstagramSaved = false;
      return exhibition;
    }

    function getExhibitionArtistNamesForInstagram(exhibition) {
      const names = new Set();

      const participantNames = Array.isArray(exhibition.participants) ? exhibition.participants : [];
      participantNames.forEach((name) => {
        const trimmed = (name || '').toString().trim();
        if (trimmed) names.add(trimmed);
      });

      const assignedArtistIds = Array.isArray(exhibition.staff?.artists) ? exhibition.staff.artists : [];
      if (assignedArtistIds.length > 0) {
        try {
          const users = loadUsers();
          const byId = new Map(users.map((user) => [Number(user.id), (user.name || '').toString().trim()]));
          assignedArtistIds.forEach((id) => {
            const name = byId.get(Number(id));
            if (name) names.add(name);
          });
        } catch (error) {
          // Ignore user parsing failures.
        }
      }

      const map = exhibition.artistInstagramMap || {};
      Object.keys(map).forEach((name) => {
        const trimmed = (name || '').toString().trim();
        if (trimmed) names.add(trimmed);
      });

      return Array.from(names);
    }

    function renderExhibitionInfo(container) {
      const exhibition = ensureExhibitionInfoData();
      const participants = Array.isArray(exhibition.participants) ? exhibition.participants : [];
      const participantText = participants.length > 0 ? participants.join(', ') : '-';
      const artistNames = getExhibitionArtistNamesForInstagram(exhibition);
      const instagramMap = exhibition.artistInstagramMap || {};

      const artistLocked = !!exhibition.artistNoteSaved;
      const inviteLocked = !!exhibition.invitationTextSaved;
      const instagramLocked = !!exhibition.artistInstagramSaved;

      const artistButton = artistLocked
        ? `<button type="button" class="action-btn edit-btn" onclick="editExhibitionInfoField('artistNote')">수정</button>`
        : `<button type="button" class="action-btn approve-btn" onclick="saveExhibitionInfoField('artistNote')">저장</button>`;
      const inviteButton = inviteLocked
        ? `<button type="button" class="action-btn edit-btn" onclick="editExhibitionInfoField('invitationText')">수정</button>`
        : `<button type="button" class="action-btn approve-btn" onclick="saveExhibitionInfoField('invitationText')">저장</button>`;
      const instagramButton = instagramLocked
        ? `<button type="button" class="action-btn edit-btn" onclick="editExhibitionInfoField('artistInstagramMap')">수정</button>`
        : `<button type="button" class="action-btn approve-btn" onclick="saveExhibitionInfoField('artistInstagramMap')">저장</button>`;
      const instagramRowsHtml = artistNames.length > 0
        ? artistNames.map((artistName) => {
          const value = (instagramMap[artistName] || '').toString();
          return `
        <label class="artist-instagram-row">
          <span class="artist-instagram-name">${options.escapeHtml(artistName)}</span>
          <input
            type="text"
            class="artist-instagram-input"
            data-artist-name="${options.escapeHtml(artistName)}"
            value="${options.escapeHtml(value)}"
            placeholder="@instagram_id"
            ${instagramLocked ? 'readonly' : ''}
          >
        </label>
      `;
        }).join('')
        : '<p class="empty-state">참여 작가 정보가 없습니다.</p>';

      container.innerHTML = `
    <div class="exhibition-info-wrapper">
      <div class="works-sales-title">전시 정보</div>
      <div class="exhibition-info-grid">
        <div class="exhibition-info-card">
          <span class="exhibition-info-label">전시 제목</span>
          <strong class="exhibition-info-value">${options.escapeHtml(exhibition.title || '-')}</strong>
        </div>
        <div class="exhibition-info-card">
          <span class="exhibition-info-label">전시 기간</span>
          <strong class="exhibition-info-value">${options.escapeHtml(`${exhibition.startDate || ''} ~ ${exhibition.endDate || ''}`.trim() || '-')}</strong>
        </div>
        <div class="exhibition-info-card">
          <span class="exhibition-info-label">전시 유형</span>
          <strong class="exhibition-info-value">${options.escapeHtml(exhibition.type || '-')}</strong>
        </div>
        <div class="exhibition-info-card">
          <span class="exhibition-info-label">참여 작가</span>
          <strong class="exhibition-info-value">${options.escapeHtml(participantText)}</strong>
        </div>
      </div>

      <section class="exhibition-note-section">
        <div class="exhibition-note-header">
          <h3>참여 작가 인스타그램</h3>
          ${instagramButton}
        </div>
        <div class="artist-instagram-list">
          ${instagramRowsHtml}
        </div>
      </section>

      <section class="exhibition-note-section">
        <div class="exhibition-note-header">
          <h3>작가 노트</h3>
          ${artistButton}
        </div>
        <textarea
          id="artist-note-input"
          class="exhibition-note-textarea"
          placeholder="작가 노트를 입력하세요."
          ${artistLocked ? 'readonly' : ''}
        >${options.escapeHtml(exhibition.artistNote || '')}</textarea>
      </section>

      <section class="exhibition-note-section">
        <div class="exhibition-note-header">
          <h3>초대의 글</h3>
          ${inviteButton}
        </div>
        <textarea
          id="invitation-text-input"
          class="exhibition-note-textarea"
          placeholder="초대의 글을 입력하세요."
          ${inviteLocked ? 'readonly' : ''}
        >${options.escapeHtml(exhibition.invitationText || '')}</textarea>
      </section>
    </div>
  `;
    }

    function saveExhibitionInfoField(fieldName) {
      const exhibition = ensureExhibitionInfoData();
      if (fieldName === 'artistInstagramMap') {
        const inputs = Array.from(document.querySelectorAll('.artist-instagram-input'));
        const nextMap = {};
        inputs.forEach((input) => {
          const artistName = (input.dataset.artistName || '').trim();
          if (!artistName) return;
          nextMap[artistName] = (input.value || '').trim();
        });

        exhibition.artistInstagramMap = nextMap;
        exhibition.artistInstagramSaved = true;

        if (state.exhibition) {
          state.exhibition.artistInstagramMap = exhibition.artistInstagramMap;
          state.exhibition.artistInstagramSaved = exhibition.artistInstagramSaved;
        }

        options.saveExhibition();
        options.switchTab('exhibition-info');
        return;
      }

      const isArtistField = fieldName === 'artistNote';
      const inputId = isArtistField ? 'artist-note-input' : 'invitation-text-input';
      const input = document.getElementById(inputId);
      if (!input) return;

      const nextValue = (input.value || '').trim();
      if (isArtistField) {
        exhibition.artistNote = nextValue;
        exhibition.artistNoteSaved = true;
      } else {
        exhibition.invitationText = nextValue;
        exhibition.invitationTextSaved = true;
      }

      if (state.exhibition) {
        state.exhibition.artistNote = exhibition.artistNote;
        state.exhibition.artistNoteSaved = exhibition.artistNoteSaved;
        state.exhibition.invitationText = exhibition.invitationText;
        state.exhibition.invitationTextSaved = exhibition.invitationTextSaved;
      }

      options.saveExhibition();
      options.switchTab('exhibition-info');
    }

    function editExhibitionInfoField(fieldName) {
      const exhibition = ensureExhibitionInfoData();

      if (fieldName === 'artistInstagramMap') {
        exhibition.artistInstagramSaved = false;
      } else if (fieldName === 'artistNote') {
        exhibition.artistNoteSaved = false;
      } else {
        exhibition.invitationTextSaved = false;
      }

      if (state.exhibition) {
        state.exhibition.artistInstagramSaved = exhibition.artistInstagramSaved;
        state.exhibition.artistNoteSaved = exhibition.artistNoteSaved;
        state.exhibition.invitationTextSaved = exhibition.invitationTextSaved;
      }

      options.saveExhibition();
      options.switchTab('exhibition-info');
    }

    return Object.freeze({
      ensureExhibitionInfoData,
      getExhibitionArtistNamesForInstagram,
      renderExhibitionInfo,
      saveExhibitionInfoField,
      editExhibitionInfoField
    });
  }

  return Object.freeze({ create });
});