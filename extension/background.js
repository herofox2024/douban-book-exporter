try {
  importScripts('vendor/xlsx.full.min.js');
} catch (error) {
  console.warn('[douban-book-exporter] failed to load xlsx', error);
}

const CONFIG = {
  API_BASE: 'https://m.douban.com/rexxar/api/v2',
  BATCH_SIZE: 50,
  REQUEST_DELAY: 400,
  TAB_LOAD_TIMEOUT: 30000,
  AUTO_CRAWL_INTERVAL: 30 * 60 * 1000,
};

const DEFAULT_TARGETS = ['interests'];
const DATASET_PREFIX = 'doubanDataset_';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendRuntimeMessage(message) {
  chrome.runtime.sendMessage(message, () => void chrome.runtime.lastError);
}

function getStorage(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(result);
    });
  });
}

function setStorage(payload) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(payload, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve();
    });
  });
}

function removeStorage(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve();
    });
  });
}

function queryTabs(queryInfo) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(tabs);
    });
  });
}

function createTab(createProperties) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create(createProperties, (tab) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(tab);
    });
  });
}

function removeTab(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.remove(tabId, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve();
    });
  });
}

function getCookie(details) {
  return new Promise((resolve, reject) => {
    chrome.cookies.get(details, (cookie) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(cookie || null);
    });
  });
}

function executeScript(details) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(details, (results) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(results);
    });
  });
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

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function sanitizeFileNamePart(value) {
  return String(value || 'douban')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

function datePart() {
  return new Date().toISOString().slice(0, 10);
}

class DatasetStore {
  constructor() {
    this.currentUserId = '';
  }

  createEmpty() {
    return { interests: [], reviews: [], annotations: [], updatedAt: 0 };
  }

  key(userId) {
    return `${DATASET_PREFIX}${userId || 'default'}`;
  }

  async setCurrentUserId(userId) {
    this.currentUserId = userId || '';
    await setStorage({ currentDoubanUserId: this.currentUserId });
  }

  async getCurrentUserId() {
    if (this.currentUserId) {
      return this.currentUserId;
    }
    const result = await getStorage('currentDoubanUserId');
    this.currentUserId = result.currentDoubanUserId || '';
    return this.currentUserId;
  }

  async getDataset(userId = null) {
    const resolvedUserId = userId || await this.getCurrentUserId() || 'default';
    const result = await getStorage(this.key(resolvedUserId));
    return result[this.key(resolvedUserId)] || this.createEmpty();
  }

  async saveDataset(userId, dataset) {
    const resolvedUserId = userId || await this.getCurrentUserId() || 'default';
    const payload = {
      interests: Array.isArray(dataset.interests) ? dataset.interests : [],
      reviews: Array.isArray(dataset.reviews) ? dataset.reviews : [],
      annotations: Array.isArray(dataset.annotations) ? dataset.annotations : [],
      updatedAt: Date.now(),
    };
    await setStorage({ [this.key(resolvedUserId)]: payload });
    return payload;
  }

  async clearDataset(userId = null) {
    const resolvedUserId = userId || await this.getCurrentUserId() || 'default';
    await removeStorage([this.key(resolvedUserId)]);
  }
}

class DoubanCollector {
  constructor(store) {
    this.store = store;
    this.isManualCrawling = false;
    this.lastAutoCrawl = { userId: '', timestamp: 0 };
  }

  normalizeDate(raw) {
    if (!raw) return '未知日期';
    const match = String(raw).trim().match(/(\d{4})[^\d]*(\d{1,2})?[^\d]*(\d{1,2})?/);
    if (!match) return String(raw);
    return `${match[1]}-${(match[2] || '1').padStart(2, '0')}-${(match[3] || '1').padStart(2, '0')}`;
  }

  parseCardSubtitle(subtitle) {
    if (!subtitle) return { publisher: '' };
    const parts = subtitle.split(' / ').map((item) => item.trim()).filter(Boolean);
    let index = parts.length - 1;
    if (index >= 0 && /^\d{4}/.test(parts[index])) index -= 1;
    return { publisher: index >= 0 ? parts[index] : '' };
  }

  async getUserIdFromPage() {
    const tabs = await queryTabs({ active: true, currentWindow: true });
    if (!tabs.length || !tabs[0].url || !tabs[0].url.includes('douban.com')) {
      throw new Error('请先打开豆瓣页面，或手动输入豆瓣用户 ID');
    }
    const tab = tabs[0];
    const directMatch = tab.url.match(/\/people\/(\w+)/);
    if (directMatch) return directMatch[1];
    const results = await executeScript({
      target: { tabId: tab.id },
      func: () => {
        const pathMatch = window.location.pathname.match(/\/people\/(\w+)/);
        if (pathMatch) return pathMatch[1];
        const link = document.querySelector('a[href^="/people/"]');
        const hrefMatch = (link?.getAttribute('href') || '').match(/\/people\/(\w+)/);
        return hrefMatch ? hrefMatch[1] : '';
      },
    });
    const userId = results?.[0]?.result?.trim();
    if (!userId) throw new Error('无法识别当前页面的豆瓣用户 ID，请手动输入');
    return userId;
  }

  async getDoubanTab() {
    const existingTabs = await queryTabs({ url: 'https://*.douban.com/*' });
    if (existingTabs.length) return { tabId: existingTabs[0].id, needsClose: false };
    const tab = await createTab({ url: 'https://m.douban.com/mine/', active: false });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('豆瓣页面加载超时，请检查网络后重试'));
      }, CONFIG.TAB_LOAD_TIMEOUT);
      const listener = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
    return { tabId: tab.id, needsClose: true };
  }

  async getCk() {
    const cookie = await getCookie({ url: 'https://www.douban.com', name: 'ck' });
    return cookie?.value || '';
  }

  async runInTab(tabId, func, args = []) {
    const results = await executeScript({
      target: { tabId },
      func,
      args,
    });
    return results?.[0]?.result;
  }

  async fetchJsonViaTab(tabId, url, referer) {
    const result = await this.runInTab(tabId, async (requestUrl, requestReferer) => {
      try {
        const response = await fetch(requestUrl, {
          credentials: 'include',
          headers: { Referer: requestReferer },
        });
        if (!response.ok) return { ok: false, status: response.status };
        return { ok: true, data: await response.json() };
      } catch (error) {
        return { ok: false, status: 'FETCH_ERROR', message: error.message };
      }
    }, [url, referer]);
    if (!result?.ok) {
      if (result?.status === 403) throw new Error('当前数据可能为私密内容，请先登录豆瓣');
      if (result?.status === 404) throw new Error('未找到该豆瓣用户，请检查用户 ID');
      throw new Error(result?.status === 'FETCH_ERROR' ? '网络请求失败，请稍后重试' : `豆瓣接口请求失败：${result?.status || 'unknown'}`);
    }
    return result.data;
  }

  async fetchHtmlFieldViaTab(tabId, url, selectors) {
    const result = await this.runInTab(tabId, async (requestUrl, fieldSelectors) => {
      try {
        const response = await fetch(requestUrl, { credentials: 'include' });
        if (!response.ok) return { ok: false, status: response.status };
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        for (const selector of fieldSelectors) {
          const element = doc.querySelector(selector);
          if (element) {
            return { ok: true, html: element.innerHTML || '', text: (element.textContent || '').trim() };
          }
        }
        return { ok: true, html: '', text: '' };
      } catch (error) {
        return { ok: false, status: 'FETCH_ERROR', message: error.message };
      }
    }, [url, selectors]);
    return result?.ok ? result : { html: '', text: '' };
  }

  mapInterest(item) {
    const subject = item.subject || {};
    const parsed = this.parseCardSubtitle(subject.card_subtitle || '');
    return {
      id: String(item.id || subject.id || subject.title || Math.random()),
      subjectId: String(subject.id || ''),
      title: subject.title || '未知书名',
      author: Array.isArray(subject.author) ? subject.author.join(' / ') : (subject.author || '未知作者'),
      publishDate: Array.isArray(subject.pubdate) && subject.pubdate[0] ? this.normalizeDate(subject.pubdate[0]) : this.normalizeDate(subject.year),
      publisher: subject.publisher || parsed.publisher || '未知出版社',
      url: subject.url || (subject.id ? `https://book.douban.com/subject/${subject.id}/` : ''),
      rating: item.rating?.value != null ? String(item.rating.value) : '',
      comment: item.comment || '',
      date: item.create_time ? item.create_time.slice(0, 10) : '',
    };
  }

  mapReview(item, fulltext) {
    const subject = item.subject || {};
    return {
      id: String(item.id || item.url || Math.random()),
      subjectId: String(subject.id || ''),
      subjectTitle: subject.title || '',
      subjectUrl: subject.url || '',
      title: item.title || '未命名书评',
      url: item.url || '',
      rating: item.rating?.value != null ? String(item.rating.value) : '',
      abstract: item.abstract || '',
      fulltext: fulltext?.html || fulltext?.text || '',
      createTime: item.create_time || '',
      typeName: item.type_name || '',
    };
  }

  mapAnnotation(item, subject, fulltext) {
    return {
      id: String(item.id || item.url || Math.random()),
      subjectId: String(subject?.id || ''),
      subjectTitle: subject?.title || '',
      subjectUrl: subject?.url || '',
      chapter: item.chapter || '',
      page: item.page != null ? String(item.page) : '',
      url: item.url || '',
      abstract: item.abstract || '',
      fulltext: fulltext?.html || fulltext?.text || '',
      createTime: item.create_time || '',
    };
  }

  finalizeIncrementalRecords(latestRecords, existingRecords) {
    const merged = [...latestRecords];
    const seenIds = new Set(latestRecords.map((item) => item.id));
    for (const item of existingRecords) {
      if (!seenIds.has(item.id)) {
        merged.push(item);
      }
    }
    return merged;
  }

  async collectInterests(tabId, userId, onProgress, existingRecords = []) {
    const records = [];
    const existingMap = new Map(existingRecords.map((item) => [item.id, item]));
    let start = 0;
    let total = null;
    const ck = await this.getCk();
    while (true) {
      const data = await this.fetchJsonViaTab(tabId, `${CONFIG.API_BASE}/user/${userId}/interests?type=book&status=done&count=${CONFIG.BATCH_SIZE}&start=${start}&for_mobile=1${ck ? `&ck=${encodeURIComponent(ck)}` : ''}`, 'https://m.douban.com/mine/book');
      if (typeof data.total === 'number' && total === null) total = data.total;
      const list = Array.isArray(data.interests) ? data.interests : [];
      if (!list.length) break;
      for (const item of list) {
        const mapped = this.mapInterest(item);
        records.push(existingMap.get(mapped.id) ? { ...existingMap.get(mapped.id), ...mapped } : mapped);
      }
      onProgress(Math.min(0.98, total ? records.length / total : 0.3));
      start += CONFIG.BATCH_SIZE;
      if (total !== null ? start >= total : list.length < CONFIG.BATCH_SIZE) break;
      await sleep(CONFIG.REQUEST_DELAY);
    }
    onProgress(1);
    return this.finalizeIncrementalRecords(records, existingRecords);
  }

  async collectReviews(tabId, userId, onProgress, existingRecords = []) {
    const records = [];
    const existingMap = new Map(existingRecords.map((item) => [item.id, item]));
    let start = 0;
    let total = null;
    const ck = await this.getCk();
    while (true) {
      const data = await this.fetchJsonViaTab(tabId, `${CONFIG.API_BASE}/user/${userId}/reviews?type=book&start=${start}&count=${CONFIG.BATCH_SIZE}&for_mobile=1${ck ? `&ck=${encodeURIComponent(ck)}` : ''}`, 'https://m.douban.com/mine/book');
      if (typeof data.total === 'number' && total === null) total = data.total;
      const list = Array.isArray(data.reviews) ? data.reviews : [];
      sendRuntimeMessage({
        action: 'updateStatus',
        status: total
          ? `正在抓取长书评：第 ${Math.floor(start / CONFIG.BATCH_SIZE) + 1} 页，接口返回 ${list.length} 条，累计目标 ${total}`
          : `正在抓取长书评：第 ${Math.floor(start / CONFIG.BATCH_SIZE) + 1} 页，接口返回 ${list.length} 条`,
      });
      if (!list.length) {
        if (total !== null && start < total) {
          console.warn('[douban-book-exporter] reviews page returned empty before reaching total', { userId, start, total });
        }
        break;
      }
      for (const item of list) {
        const existing = existingMap.get(String(item.id || item.url || ''));
        let fulltext = { html: existing?.fulltext || '', text: stripHtml(existing?.fulltext || '') };
        if (!existing || !existing.fulltext) {
          fulltext = await this.fetchHtmlFieldViaTab(tabId, item.url, ['.review-content', '#link-report']);
        }
        records.push(existing ? { ...existing, ...this.mapReview(item, fulltext), fulltext: fulltext?.html || existing.fulltext || '' } : this.mapReview(item, fulltext));
        onProgress(Math.min(0.98, total ? records.length / total : 0.3));
        await sleep(120);
      }
      start += list.length;
      if (total !== null ? start >= total : list.length < CONFIG.BATCH_SIZE) break;
      await sleep(CONFIG.REQUEST_DELAY);
    }
    onProgress(1);
    return this.finalizeIncrementalRecords(records, existingRecords);
  }

  async collectAnnotations(tabId, userId, onProgress, existingRecords = []) {
    const records = [];
    const existingMap = new Map(existingRecords.map((item) => [item.id, item]));
    let start = 0;
    let totalCollections = null;
    let seenCollections = 0;
    const ck = await this.getCk();
    while (true) {
      const data = await this.fetchJsonViaTab(tabId, `${CONFIG.API_BASE}/user/${userId}/annotations?start=${start}&count=${CONFIG.BATCH_SIZE}&for_mobile=1${ck ? `&ck=${encodeURIComponent(ck)}` : ''}`, 'https://m.douban.com/');
      if (typeof data.total === 'number' && totalCollections === null) totalCollections = data.total;
      const collections = Array.isArray(data.collections) ? data.collections : [];
      if (!collections.length) break;
      for (const collection of collections) {
        const subject = collection.subject || {};
        const items = Array.isArray(collection.annotations) ? collection.annotations : [];
        for (const item of items) {
          const existing = existingMap.get(String(item.id || item.url || ''));
          let fulltext = { html: existing?.fulltext || '', text: stripHtml(existing?.fulltext || '') };
          if (!existing) {
            fulltext = await this.fetchHtmlFieldViaTab(tabId, item.url, ['#link-report', '.note-content', '.annotation-full']);
          } else if (!existing.fulltext) {
            fulltext = await this.fetchHtmlFieldViaTab(tabId, item.url, ['#link-report', '.note-content', '.annotation-full']);
          }
          records.push(existing ? { ...existing, ...this.mapAnnotation(item, subject, fulltext), fulltext: fulltext?.html || existing.fulltext || '' } : this.mapAnnotation(item, subject, fulltext));
          await sleep(120);
        }
        seenCollections += 1;
        onProgress(Math.min(0.98, totalCollections ? seenCollections / totalCollections : 0.3));
      }
      start += CONFIG.BATCH_SIZE;
      if (totalCollections !== null ? start >= totalCollections : collections.length < CONFIG.BATCH_SIZE) break;
      await sleep(CONFIG.REQUEST_DELAY);
    }
    onProgress(1);
    return this.finalizeIncrementalRecords(records, existingRecords);
  }

  statusText(target) {
    if (target === 'reviews') return '正在抓取长书评...';
    if (target === 'annotations') return '正在抓取读书笔记...';
    return '正在抓取已读书籍...';
  }

  async crawl(targets, manualUserId, progressCallback) {
    const selectedTargets = Array.isArray(targets) && targets.length ? [...new Set(targets)] : DEFAULT_TARGETS;
    let tabInfo = null;
    try {
      this.isManualCrawling = true;
      const userId = manualUserId || await this.getUserIdFromPage();
      await this.store.setCurrentUserId(userId);
      const current = await this.store.getDataset(userId);
      const dataset = {
        interests: current.interests || [],
        reviews: current.reviews || [],
        annotations: current.annotations || [],
      };
      tabInfo = await this.getDoubanTab();
      for (let i = 0; i < selectedTargets.length; i += 1) {
        const target = selectedTargets[i];
        sendRuntimeMessage({ action: 'updateStatus', status: this.statusText(target) });
        const wrapProgress = (innerProgress) => {
          progressCallback(Math.floor(((i + innerProgress) / selectedTargets.length) * 100));
        };
        if (target === 'interests') dataset.interests = await this.collectInterests(tabInfo.tabId, userId, wrapProgress, dataset.interests);
        if (target === 'reviews') dataset.reviews = await this.collectReviews(tabInfo.tabId, userId, wrapProgress, dataset.reviews);
        if (target === 'annotations') dataset.annotations = await this.collectAnnotations(tabInfo.tabId, userId, wrapProgress, dataset.annotations);
      }
      await this.store.saveDataset(userId, dataset);
      progressCallback(100);
      return {
        userId,
        dataset,
        counts: {
          interests: dataset.interests.length,
          reviews: dataset.reviews.length,
          annotations: dataset.annotations.length,
        },
      };
    } finally {
      this.isManualCrawling = false;
      if (tabInfo?.needsClose) {
        try {
          await removeTab(tabInfo.tabId);
        } catch (error) {
          console.error(error);
        }
      }
    }
  }
}

class Exporter {
  constructor(store) {
    this.store = store;
  }

  ensureData(dataset) {
    const total = dataset.interests.length + dataset.reviews.length + dataset.annotations.length;
    if (!total) throw new Error('没有可导出的数据，请先抓取');
  }

  async downloadBlob(blob, filename) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('文件生成失败'));
      reader.readAsDataURL(blob);
    });
    return new Promise((resolve, reject) => {
      chrome.downloads.download({ url: dataUrl, filename, saveAs: true }, (downloadId) => {
        if (chrome.runtime.lastError || !downloadId) {
          reject(new Error('文件下载失败，请检查浏览器下载设置'));
          return;
        }
        resolve(downloadId);
      });
    });
  }

  combinedRows(dataset) {
    const rows = [];
    for (const item of dataset.interests) rows.push({ type: 'book', title: item.title, subjectTitle: item.title, author: item.author, publisher: item.publisher, publishDate: item.publishDate, rating: item.rating, createdAt: item.date, url: item.url, content: item.comment });
    for (const item of dataset.reviews) rows.push({ type: 'review', title: item.title, subjectTitle: item.subjectTitle, author: '', publisher: '', publishDate: '', rating: item.rating, createdAt: item.createTime, url: item.url, content: stripHtml(item.fulltext || item.abstract) });
    for (const item of dataset.annotations) rows.push({ type: 'annotation', title: item.chapter ? `${item.subjectTitle} - ${item.chapter}` : item.subjectTitle, subjectTitle: item.subjectTitle, author: '', publisher: '', publishDate: '', rating: '', createdAt: item.createTime, url: item.url, content: stripHtml(item.fulltext || item.abstract) });
    return rows;
  }

  async exportCsv(userId, dataset) {
    this.ensureData(dataset);
    const lines = [[
      '类型', '标题', '关联书名', '作者', '出版社', '出版日期', '评分', '创建时间', '链接', '内容',
    ].map(csvEscape).join(',')];
    for (const row of this.combinedRows(dataset)) {
      lines.push([row.type, row.title, row.subjectTitle, row.author, row.publisher, row.publishDate, row.rating, row.createdAt, row.url, row.content].map(csvEscape).join(','));
    }
    const encoder = new TextEncoder();
    const body = encoder.encode(lines.join('\n'));
    const bytes = new Uint8Array(body.length + 3);
    bytes.set([0xEF, 0xBB, 0xBF], 0);
    bytes.set(body, 3);
    await this.downloadBlob(new Blob([bytes], { type: 'text/csv;charset=utf-8;' }), `${sanitizeFileNamePart(userId)}_douban_backup_${datePart()}.csv`);
  }

  async exportHtml(userId, dataset) {
    this.ensureData(dataset);
    const renderCards = (items, renderItem, emptyText) => items.length ? items.map(renderItem).join('') : `<p>${emptyText}</p>`;
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(userId)} 的豆瓣阅读备份</title><style>body{margin:0;padding:24px;background:#f4ede4;color:#2e261f;font:16px/1.7 Georgia,"Noto Serif SC",serif}main{max-width:1040px;margin:0 auto}.hero,.section{background:rgba(255,251,246,.94);border:1px solid rgba(81,62,47,.12);border-radius:24px;box-shadow:0 20px 50px rgba(67,42,28,.08)}.hero{padding:28px 30px;margin-bottom:18px}.section{padding:22px 24px;margin-top:18px}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:16px}.stat{background:#fff;padding:14px 16px;border-radius:16px}.stat strong{display:block;font-size:28px;color:#8a4124}.grid{display:grid;gap:14px}.card{background:#fff;border:1px solid rgba(81,62,47,.12);border-radius:18px;padding:18px}.meta{color:#705f52;font-size:14px;margin:6px 0 12px}.body{white-space:pre-wrap}.pill{display:inline-block;margin:0 8px 8px 0;padding:4px 10px;border-radius:999px;background:#f8ece6;color:#705f52;font-size:12px}a{color:#8a4124;text-decoration:none}a:hover{text-decoration:underline}</style></head><body><main><section class="hero"><div>Douban Reading Archive</div><h1>${escapeHtml(userId)} 的豆瓣阅读备份</h1><p>导出时间：${escapeHtml(new Date().toLocaleString('zh-CN'))}</p><div class="stats"><div class="stat"><strong>${dataset.interests.length}</strong><span>已读书籍</span></div><div class="stat"><strong>${dataset.reviews.length}</strong><span>长书评</span></div><div class="stat"><strong>${dataset.annotations.length}</strong><span>读书笔记</span></div></div></section><section class="section"><h2>已读书籍</h2><div class="grid">${renderCards(dataset.interests, (item) => `<article class="card"><h3><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a></h3><div class="meta"><span class="pill">作者 ${escapeHtml(item.author)}</span><span class="pill">出版社 ${escapeHtml(item.publisher)}</span><span class="pill">出版 ${escapeHtml(item.publishDate)}</span><span class="pill">评分 ${escapeHtml(item.rating || '未评分')}</span><span class="pill">标记 ${escapeHtml(item.date || '未知时间')}</span></div><div class="body">${escapeHtml(item.comment || '无短评')}</div></article>`, '没有已读书籍数据')}</div></section><section class="section"><h2>长书评</h2><div class="grid">${renderCards(dataset.reviews, (item) => `<article class="card"><h3><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a></h3><div class="meta">${escapeHtml(item.subjectTitle)} · ${escapeHtml(item.createTime || '未知时间')}</div><div class="body">${item.fulltext || escapeHtml(item.abstract || '无正文')}</div></article>`, '没有长书评数据')}</div></section><section class="section"><h2>读书笔记</h2><div class="grid">${renderCards(dataset.annotations, (item) => `<article class="card"><h3><a href="${escapeHtml(item.url)}">${escapeHtml(item.subjectTitle || '未命名笔记')}</a></h3><div class="meta"><span class="pill">章节 ${escapeHtml(item.chapter || '未标注')}</span><span class="pill">页码 ${escapeHtml(item.page || '未标注')}</span><span class="pill">创建 ${escapeHtml(item.createTime || '未知时间')}</span></div><div class="body">${item.fulltext || escapeHtml(item.abstract || '无正文')}</div></article>`, '没有读书笔记数据')}</div></section></main></body></html>`;
    await this.downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8;' }), `${sanitizeFileNamePart(userId)}_douban_backup_${datePart()}.html`);
  }

  async exportXlsx(userId, dataset) {
    this.ensureData(dataset);
    if (typeof XLSX === 'undefined') throw new Error('XLSX 导出库未加载，无法导出');
    const workbook = XLSX.utils.book_new();
    if (dataset.interests.length) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(dataset.interests.map((item) => ({ 书名: item.title, 作者: item.author, 出版社: item.publisher, 出版日期: item.publishDate, 豆瓣链接: item.url, 我的评分: item.rating, 短评: item.comment, 标记时间: item.date }))), 'Books');
    if (dataset.reviews.length) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(dataset.reviews.map((item) => ({ 标题: item.title, 关联书名: item.subjectTitle, 豆瓣链接: item.url, 我的评分: item.rating, 发布时间: item.createTime, 类型: item.typeName, 摘要: item.abstract, 正文: stripHtml(item.fulltext) }))), 'Reviews');
    if (dataset.annotations.length) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(dataset.annotations.map((item) => ({ 书名: item.subjectTitle, 章节: item.chapter, 页码: item.page, 豆瓣链接: item.url, 创建时间: item.createTime, 摘要: item.abstract, 正文: stripHtml(item.fulltext) }))), 'Annotations');
    const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    await this.downloadBlob(new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${sanitizeFileNamePart(userId)}_douban_backup_${datePart()}.xlsx`);
  }

  async exportData(userId, format) {
    const resolvedUserId = userId || await this.store.getCurrentUserId() || 'douban';
    const dataset = await this.store.getDataset(resolvedUserId);
    if (format === 'html') return this.exportHtml(resolvedUserId, dataset);
    if (format === 'xlsx') return this.exportXlsx(resolvedUserId, dataset);
    return this.exportCsv(resolvedUserId, dataset);
  }
}

const store = new DatasetStore();
const collector = new DoubanCollector(store);
const exporter = new Exporter(store);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startCrawl') {
    (async () => {
      try {
        const result = await collector.crawl(message.targets, message.userId, (progress) => sendRuntimeMessage({ action: 'updateProgress', progress }));
        sendRuntimeMessage({ action: 'updateStatus', status: '抓取完成' });
        sendResponse({ success: true, ...result });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'exportData') {
    (async () => {
      try {
        if (message.userId) await store.setCurrentUserId(message.userId);
        await exporter.exportData(message.userId, message.format);
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'clearData') {
    (async () => {
      try {
        if (message.userId) await store.setCurrentUserId(message.userId);
        await store.clearDataset(message.userId);
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'setUserId') {
    (async () => {
      try {
        if (message.userId) await store.setCurrentUserId(message.userId);
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'getDataset') {
    (async () => {
      try {
        const userId = message.userId || await store.getCurrentUserId();
        const dataset = await store.getDataset(userId);
        sendResponse({ success: true, userId, dataset });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'getDatasetSummary') {
    (async () => {
      try {
        const userId = message.userId || await store.getCurrentUserId();
        const dataset = await store.getDataset(userId);
        sendResponse({
          success: true,
          userId,
          counts: {
            interests: dataset.interests.length,
            reviews: dataset.reviews.length,
            annotations: dataset.annotations.length,
          },
          updatedAt: dataset.updatedAt || 0,
        });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  sendResponse({ success: false, error: '未知操作' });
  return false;
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (collector.isManualCrawling) return;
  if (changeInfo.status !== 'complete' || !tab.url || !tab.url.startsWith('https://book.douban.com')) return;
  const match = tab.url.match(/\/people\/(\w+)\/collect/);
  if (!match) return;
  const userId = match[1];
  const { autoCrawlEnabled, crawlTargets } = await getStorage(['autoCrawlEnabled', 'crawlTargets']);
  if (autoCrawlEnabled === false) return;
  const now = Date.now();
  if (collector.lastAutoCrawl.userId === userId && now - collector.lastAutoCrawl.timestamp < CONFIG.AUTO_CRAWL_INTERVAL) return;
  collector.lastAutoCrawl = { userId, timestamp: now };
  try {
    await collector.crawl(Array.isArray(crawlTargets) && crawlTargets.length ? crawlTargets : DEFAULT_TARGETS, userId, () => {});
  } catch (error) {
    console.error('[douban-book-exporter] auto crawl failed', error);
  }
});
