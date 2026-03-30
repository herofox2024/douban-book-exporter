const state = {
  userId: '',
  dataset: { interests: [], reviews: [], annotations: [], updatedAt: 0 },
  activeTab: 'interests',
  search: '',
};

function qs(id) {
  return document.getElementById(id);
}

function getQueryUserId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('userId') || '';
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function contains(item, keyword) {
  if (!keyword) return true;
  const haystack = JSON.stringify(item).toLowerCase();
  return haystack.includes(keyword.toLowerCase());
}

function currentItems() {
  const list = state.dataset[state.activeTab] || [];
  return list.filter((item) => contains(item, state.search));
}

function renderSummary() {
  qs('pageTitle').textContent = state.userId ? `${state.userId} 的本地阅读数据` : '本地阅读数据';
  qs('pageMeta').textContent = state.dataset.updatedAt
    ? `最后更新：${new Date(state.dataset.updatedAt).toLocaleString('zh-CN')}`
    : '当前还没有本地数据';
  qs('countInterests').textContent = state.dataset.interests.length;
  qs('countReviews').textContent = state.dataset.reviews.length;
  qs('countAnnotations').textContent = state.dataset.annotations.length;
}

function renderItem(item) {
  if (state.activeTab === 'reviews') {
    return `
      <article class="card">
        <h3><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.title || '未命名书评')}</a></h3>
        <div class="meta">${escapeHtml(item.subjectTitle || '')} · ${escapeHtml(item.createTime || '未知时间')}</div>
        <div class="meta">
          <span class="pill">评分 ${escapeHtml(item.rating || '未评分')}</span>
          <span class="pill">类型 ${escapeHtml(item.typeName || '书评')}</span>
        </div>
        <div class="body">${escapeHtml(stripHtml(item.fulltext || item.abstract || '无正文'))}</div>
      </article>`;
  }

  if (state.activeTab === 'annotations') {
    return `
      <article class="card">
        <h3><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.subjectTitle || '未命名笔记')}</a></h3>
        <div class="meta">
          <span class="pill">章节 ${escapeHtml(item.chapter || '未标注')}</span>
          <span class="pill">页码 ${escapeHtml(item.page || '未标注')}</span>
          <span class="pill">创建 ${escapeHtml(item.createTime || '未知时间')}</span>
        </div>
        <div class="body">${escapeHtml(stripHtml(item.fulltext || item.abstract || '无正文'))}</div>
      </article>`;
  }

  return `
    <article class="card">
      <h3><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.title || '未知书名')}</a></h3>
      <div class="meta">
        <span class="pill">作者 ${escapeHtml(item.author || '未知作者')}</span>
        <span class="pill">出版社 ${escapeHtml(item.publisher || '未知出版社')}</span>
        <span class="pill">出版 ${escapeHtml(item.publishDate || '未知日期')}</span>
        <span class="pill">评分 ${escapeHtml(item.rating || '未评分')}</span>
        <span class="pill">标记 ${escapeHtml(item.date || '未知时间')}</span>
      </div>
      <div class="body">${escapeHtml(item.comment || '无短评')}</div>
    </article>`;
}

function renderList() {
  const items = currentItems();
  qs('resultMeta').textContent = `${items.length} 条`;
  const container = qs('list');
  if (!items.length) {
    container.innerHTML = '<div class="empty">没有匹配的数据</div>';
    return;
  }
  container.innerHTML = items.map(renderItem).join('');
}

function renderTabs() {
  document.querySelectorAll('.tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === state.activeTab);
  });
}

function render() {
  renderSummary();
  renderTabs();
  renderList();
}

function loadData() {
  const userId = getQueryUserId();
  chrome.runtime.sendMessage({ action: 'getDataset', userId }, (response) => {
    if (!response?.success) {
      qs('list').innerHTML = `<div class="empty">${escapeHtml(response?.error || '加载失败')}</div>`;
      return;
    }
    state.userId = response.userId || '';
    state.dataset = response.dataset || state.dataset;
    render();
  });
}

function bindEvents() {
  document.querySelectorAll('.tab').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeTab = button.dataset.tab;
      render();
    });
  });

  qs('searchInput').addEventListener('input', (event) => {
    state.search = event.target.value.trim();
    renderList();
  });

  qs('refreshBtn').addEventListener('click', loadData);
}

function init() {
  bindEvents();
  loadData();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
