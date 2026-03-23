// ==================== 类型定义 ====================
/**
 * @typedef {Object} Book
 * @property {string} title - 书名
 * @property {string} author - 作者
 * @property {string} publishDate - 出版日期 (yyyy-mm-dd)
 * @property {string} publisher - 出版社
 * @property {string} url - 豆瓣链接
 * @property {string} rating - 评分 (如 "4分" 或 "未评分")
 * @property {string} review - 书评内容
 * @property {string} date - 评分日期 (yyyy-mm-dd)
 */

/**
 * @typedef {Object} CrawlProgress
 * @property {string} userId - 用户ID
 * @property {number} timestamp - 上次爬取时间戳
 */

/**
 * @typedef {Object} TabInfo
 * @property {number} tabId - 标签页ID
 * @property {boolean} needsClose - 是否需要关闭
 */

/**
 * @typedef {Object} ApiResponse
 * @property {number} [total] - 总书籍数
 * @property {Array} [interests] - 兴趣条目数组
 */

// 数据存储管理
class BookDataManager {
  /** @type {Book[]} */
  books = [];
  /** @type {string} */
  currentUserId = '';

  constructor() {
    this.books = [];
    this.currentUserId = '';
  }

  // 保存书籍数据
  saveBooks(books) {
    log(`保存书籍数据: ${books.length}本书`);
    this.books = books;
    
    // 按用户ID保存数据，支持多用户
    const userId = this.currentUserId || 'default';
    log(`保存到用户ID: ${userId}`);
    
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [`doubanBooks_${userId}`]: books }, () => {
        if (chrome.runtime.lastError) {
          logError('保存数据失败:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          log('数据保存成功');
          resolve();
        }
      });
    });
  }

  // 获取书籍数据
  getBooks() {
    return new Promise((resolve, reject) => {
      // 按用户ID获取数据
      const userId = this.currentUserId || 'default';
      log(`获取用户ID ${userId}的数据`);
      
      chrome.storage.local.get([`doubanBooks_${userId}`], (result) => {
        if (chrome.runtime.lastError) {
          logError('获取数据失败:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          const books = result[`doubanBooks_${userId}`] || [];
          log(`获取到${books.length}本书籍数据`);
          this.books = books;
          resolve(books);
        }
      });
    });
  }

  // 清空数据
  clearBooks() {
    return new Promise((resolve, reject) => {
      // 按用户ID清空数据
      const userId = this.currentUserId || 'default';
      chrome.storage.local.remove([`doubanBooks_${userId}`], () => {
        if (chrome.runtime.lastError) {
          logError('清空数据失败:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          this.books = [];
          resolve();
        }
      });
    });
  }

  // 设置当前用户
  setCurrentUserId(userId) {
    log(`设置当前用户ID: ${userId}`);
    this.currentUserId = userId;
    
    // 确保返回Promise，处理Chrome 92+中chrome.storage.local.set不再返回Promise的问题
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ 'currentDoubanUserId': userId }, () => {
        if (chrome.runtime.lastError) {
          logError('设置当前用户ID失败:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          log('当前用户ID设置成功');
          resolve();
        }
      });
    });
  }

  // 获取当前用户
  getCurrentUserId() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get('currentDoubanUserId', (result) => {
        if (chrome.runtime.lastError) {
          logError('获取当前用户ID失败:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          const userId = result.currentDoubanUserId || '';
          log(`获取到当前用户ID: ${userId}`);
          this.currentUserId = userId;
          resolve(userId);
        }
      });
    });
  }
}
// ==================== 配置常量 ====================
const CONFIG = {
  // 豆瓣 API 基础 URL
  API_BASE: 'https://m.douban.com/rexxar/api/v2',
  // 每批次获取的书籍数量
  BATCH_SIZE: 50,
  // 自动爬取间隔时间（毫秒），30分钟内不重复自动爬取
  CRAWL_INTERVAL: 30 * 60 * 1000,
  // 标签页加载超时时间（毫秒）
  TAB_LOAD_TIMEOUT: 30000,
  // 请求间隔时间（毫秒）
  REQUEST_DELAY: 500,
  // 调试模式开关（生产环境设为 false）
  DEBUG: false,
};

// ==================== 调试日志 ====================
const log = CONFIG.DEBUG ? console.log.bind(console, '[豆瓣书评]') : () => {};
const logError = console.error.bind(console, '[豆瓣书评错误]');

// ==================== HTML 导出样式 ====================
const HTML_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&display=swap');

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: 'Noto Serif SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', serif;
    line-height: 1.8;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    min-height: 100vh;
    color: #e8e8e8;
  }

  /* 头部英雄区域 */
  .hero {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 60px 20px;
    text-align: center;
    position: relative;
    overflow: hidden;
  }

  .hero::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
    opacity: 0.3;
  }

  .hero-content {
    position: relative;
    z-index: 1;
  }

  .hero-icon {
    font-size: 64px;
    margin-bottom: 20px;
    animation: float 3s ease-in-out infinite;
  }

  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
  }

  .hero h1 {
    font-size: 2.5em;
    font-weight: 700;
    color: #fff;
    text-shadow: 2px 2px 20px rgba(0,0,0,0.3);
    margin-bottom: 10px;
  }

  .hero-subtitle {
    font-size: 1.1em;
    color: rgba(255,255,255,0.85);
    letter-spacing: 2px;
  }

  /* 统计卡片 */
  .stats-container {
    display: flex;
    justify-content: center;
    gap: 20px;
    margin-top: -40px;
    padding: 0 20px;
    flex-wrap: wrap;
    position: relative;
    z-index: 2;
  }

  .stat-card {
    background: rgba(255,255,255,0.95);
    backdrop-filter: blur(10px);
    border-radius: 16px;
    padding: 25px 35px;
    text-align: center;
    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    transition: transform 0.3s ease, box-shadow 0.3s ease;
    min-width: 150px;
  }

  .stat-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 15px 50px rgba(0,0,0,0.3);
  }

  .stat-icon {
    font-size: 32px;
    margin-bottom: 10px;
  }

  .stat-number {
    font-size: 2.5em;
    font-weight: 700;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .stat-label {
    color: #666;
    font-size: 0.9em;
    margin-top: 5px;
  }

  /* 主内容区 */
  .main-content {
    max-width: 900px;
    margin: 60px auto;
    padding: 0 20px;
  }

  .section-title {
    font-size: 1.5em;
    font-weight: 600;
    color: #fff;
    margin-bottom: 30px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .section-title::before {
    content: '';
    width: 4px;
    height: 30px;
    background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
    border-radius: 2px;
  }

  /* 书籍卡片 */
  .book-list {
    display: flex;
    flex-direction: column;
    gap: 25px;
  }

  .book-card {
    background: rgba(255,255,255,0.95);
    border-radius: 20px;
    overflow: hidden;
    box-shadow: 0 10px 40px rgba(0,0,0,0.15);
    transition: all 0.4s ease;
    position: relative;
  }

  .book-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 5px;
    height: 100%;
    background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
  }

  .book-card:hover {
    transform: translateY(-5px) scale(1.01);
    box-shadow: 0 20px 60px rgba(102, 126, 234, 0.25);
  }

  .book-content {
    padding: 25px 30px 25px 35px;
  }

  .book-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 15px;
    margin-bottom: 15px;
  }

  .book-title {
    font-size: 1.4em;
    font-weight: 600;
    flex: 1;
  }

  .book-title a {
    color: #1a1a2e;
    text-decoration: none;
    transition: color 0.3s;
  }

  .book-title a:hover {
    color: #667eea;
  }

  .book-rating {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 8px 16px;
    background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%);
    border-radius: 25px;
    font-weight: 600;
    color: #c44536;
    white-space: nowrap;
    font-size: 0.95em;
  }

  .book-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 15px;
    color: #666;
    font-size: 0.9em;
    margin-bottom: 15px;
  }

  .meta-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .meta-item span:first-child {
    opacity: 0.7;
  }

  .book-review {
    background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
    border-radius: 12px;
    padding: 18px 20px;
    margin-top: 15px;
    border-left: 3px solid #667eea;
    position: relative;
  }

  .book-review::before {
    content: '"';
    position: absolute;
    top: 5px;
    left: 10px;
    font-size: 3em;
    color: #667eea;
    opacity: 0.15;
    font-family: Georgia, serif;
    line-height: 1;
  }

  .review-text {
    font-style: italic;
    color: #444;
    position: relative;
    z-index: 1;
    line-height: 1.8;
  }

  .no-review {
    color: #999;
    font-style: italic;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* 页脚 */
  .footer {
    text-align: center;
    padding: 40px 20px;
    color: rgba(255,255,255,0.5);
    font-size: 0.9em;
  }

  .footer a {
    color: #667eea;
    text-decoration: none;
  }

  .footer a:hover {
    text-decoration: underline;
  }

  /* 响应式 */
  @media (max-width: 768px) {
    .hero h1 {
      font-size: 1.8em;
    }

    .stats-container {
      margin-top: -30px;
    }

    .stat-card {
      padding: 20px 25px;
      min-width: 120px;
    }

    .book-header {
      flex-direction: column;
      gap: 10px;
    }

    .book-rating {
      align-self: flex-start;
    }
  }

  /* 滚动条美化 */
  ::-webkit-scrollbar {
    width: 10px;
  }

  ::-webkit-scrollbar-track {
    background: #1a1a2e;
  }

  ::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
    border-radius: 5px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(180deg, #764ba2 0%, #667eea 100%);
  }
`;

// ==================== 导出管理器 ====================
/**
 * 导出管理器，负责将书籍数据导出为 CSV 或 HTML 格式
 */
class Exporter {
  /** @param {BookDataManager} bookManager */
  constructor(bookManager) {
    // 接收已初始化的bookManager实例，确保使用同一个实例
    this.bookManager = bookManager;
    log('Exporter初始化，使用bookManager:', this.bookManager);
  }

  /**
   * 导出为 CSV 格式
   * @returns {Promise<boolean>}
   * @throws {Error} 没有数据可导出或下载失败
   */
  async exportToCSV() {
    log('开始导出CSV...');
    const books = await this.bookManager.getBooks();
    log(`获取到${books.length}本书籍数据用于CSV导出`);
    
    if (books.length === 0) {
      throw new Error('没有数据可导出');
    }

    // CSV表头 - 按照用户要求，在出版日期后添加出版社列
    const headers = ['书名', '作者', '出版日期', '出版社', '豆瓣链接', '评分', '书评内容', '评分日期'];
    const csvContent = [headers.join(',')];

    // 转换数据为CSV行
    books.forEach((book, index) => {
      log(`处理第${index+1}本书: ${book.title}`);
      
      // 确保各字段值为字符串类型
      const title = String(book.title || '');
      const author = String(book.author || '未知作者');
      const publishDate = String(book.publishDate || '未知日期');
      const publisher = String(book.publisher || '未知出版社');
      const url = String(book.url || '');
      const rating = String(book.rating || '未评分');
      const review = String(book.review || '');
      const date = String(book.date || '未知日期');
      
      // 正确处理CSV字段，确保引号被转义
      const escapeField = (field) => {
        return `"${field.replace(/"/g, '""')}"`;
      };
      
      const row = [
        escapeField(title),
        escapeField(author),
        escapeField(publishDate),
        escapeField(publisher),
        escapeField(url),
        escapeField(rating),
        escapeField(review),
        escapeField(date)
      ];
      csvContent.push(row.join(','));
    });

    // 添加UTF-8 BOM (Byte Order Mark)，确保中文正确显示，尤其是在Windows系统中
    const csvData = new Uint8Array([0xEF, 0xBB, 0xBF]); // UTF-8 BOM
    const textEncoder = new TextEncoder();
    const csvText = csvContent.join('\n');
    const csvBytes = textEncoder.encode(csvText);
    
    // 合并BOM和CSV内容
    const combinedData = new Uint8Array(csvData.length + csvBytes.length);
    combinedData.set(csvData);
    combinedData.set(csvBytes, csvData.length);
    
    const csvBlob = new Blob([combinedData], { type: 'text/csv;charset=utf-8;' });
    const userId = await this.bookManager.getCurrentUserId();
    const filename = `${userId || 'douban'}_书评_${new Date().toISOString().split('T')[0]}.csv`;
    log(`准备下载CSV文件: ${filename}`);

    // 正确返回Promise，等待下载完成
    return new Promise((resolve, reject) => {
      // 在Service Worker中使用FileReader将Blob转换为Data URL
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        chrome.downloads.download({
          url: dataUrl,
          filename: filename,
          saveAs: true
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            logError('CSV下载失败:', chrome.runtime.lastError);
            reject(new Error('文件下载失败，请检查浏览器下载设置'));
          } else {
            log(`CSV下载成功，ID: ${downloadId}`);
            resolve(true);
          }
        });
      };
      
      reader.onerror = (error) => {
        logError('FileReader读取失败:', error);
        reject(new Error('文件生成失败，请重试'));
      };

      reader.readAsDataURL(csvBlob);
    });
  }

  /**
   * 导出为 HTML 格式
   * @returns {Promise<boolean>}
   * @throws {Error} 没有数据可导出或下载失败
   */
  async exportToHTML() {
    log('开始导出HTML...');
    const books = await this.bookManager.getBooks();
    log(`获取到${books.length}本书籍数据用于HTML导出`);
    
    if (books.length === 0) {
      throw new Error('没有数据可导出');
    }

    const userId = await this.bookManager.getCurrentUserId();
    const exportDate = new Date().toLocaleString('zh-CN');
    const totalBooks = books.length;
    const booksWithReviews = books.filter(book => book.review.trim() !== '').length;
    log(`生成HTML报告，总书籍数: ${totalBooks}，有书评: ${booksWithReviews}`);

    const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${userId || '未知用户'}的豆瓣书评收藏</title>
  <style>${HTML_STYLES}</style>
</head>
<body>
  <!-- 头部英雄区域 -->
  <header class="hero">
    <div class="hero-content">
      <div class="hero-icon">📚</div>
      <h1>${userId || '未知用户'}的书评收藏</h1>
      <p class="hero-subtitle">DOUBAN BOOK COLLECTION</p>
    </div>
  </header>

  <!-- 统计卡片 -->
  <div class="stats-container">
    <div class="stat-card">
      <div class="stat-icon">📖</div>
      <div class="stat-number">${totalBooks}</div>
      <div class="stat-label">总书籍数</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">✍️</div>
      <div class="stat-number">${booksWithReviews}</div>
      <div class="stat-label">有书评</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">📅</div>
      <div class="stat-number">${new Date().toLocaleDateString('zh-CN')}</div>
      <div class="stat-label">导出时间</div>
    </div>
  </div>

  <!-- 主内容区 -->
  <main class="main-content">
    <h2 class="section-title">书单列表</h2>
    <div class="book-list">
      ${books.map(book => `
        <article class="book-card">
          <div class="book-content">
            <div class="book-header">
              <h3 class="book-title">
                <a href="${this.escapeHtml(book.url)}" target="_blank" rel="noopener">${this.escapeHtml(book.title)}</a>
              </h3>
              <div class="book-rating">⭐ ${this.escapeHtml(book.rating)}</div>
            </div>
            <div class="book-meta">
              <span class="meta-item"><span>👤</span><span>${this.escapeHtml(book.author)}</span></span>
              <span class="meta-item"><span>🏢</span><span>${this.escapeHtml(book.publisher)}</span></span>
              <span class="meta-item"><span>📅</span><span>${this.escapeHtml(book.publishDate)}</span></span>
              <span class="meta-item"><span>🕒</span><span>${this.escapeHtml(book.date)}</span></span>
            </div>
            <div class="book-review">
              ${book.review.trim() !== ''
                ? `<p class="review-text">${this.escapeHtml(book.review)}</p>`
                : '<span class="no-review">📝 暂无书评</span>'
              }
            </div>
          </div>
        </article>
      `).join('')}
    </div>
  </main>

  <!-- 页脚 -->
  <footer class="footer">
    <p>📊 数据来源：豆瓣读书 | 生成时间：${exportDate}</p>
    <p>由 <a href="https://github.com/herofox2024/douban-book-exporter" target="_blank">豆瓣书评导出工具</a> 生成</p>
  </footer>
</body>
</html>`;

    const htmlBlob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const filename = `${userId || 'douban'}_书评_${new Date().toISOString().split('T')[0]}.html`;
    log(`准备下载HTML文件: ${filename}`);

    // 正确返回Promise，等待下载完成
    return new Promise((resolve, reject) => {
      // 在Service Worker中使用FileReader将Blob转换为Data URL
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        chrome.downloads.download({
          url: dataUrl,
          filename: filename,
          saveAs: true
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            logError('HTML下载失败:', chrome.runtime.lastError);
            reject(new Error('文件下载失败，请检查浏览器下载设置'));
          } else {
            log(`HTML下载成功，ID: ${downloadId}`);
            resolve(true);
          }
        });
      };
      
      reader.onerror = (error) => {
        logError('FileReader读取失败:', error);
        reject(new Error('文件生成失败，请重试'));
      };

      reader.readAsDataURL(htmlBlob);
    });
  }

  // HTML转义 - 使用纯字符串处理，不依赖DOM API
  escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// 豆瓣爬虫
// 核心原理：Service Worker 的 fetch 会被浏览器附加 Origin: chrome-extension://... 头，
// 豆瓣服务端识别后拒绝请求（400）。解决方案是通过 chrome.scripting.executeScript
// 在豆瓣标签页上下文中执行 fetch，此时请求的 Origin 是 https://m.douban.com，
// 浏览器也会自动携带正确的 Cookie，完全规避问题。
/**
 * 豆瓣爬虫，负责通过 Rexxar API 获取用户书单
 */
class DoubanCrawler {
  /** @type {BookDataManager} */
  bookManager;
  /** @type {string} */
  apiBase;
  /** @type {number} */
  batchSize;
  /** @type {boolean} */
  isManualCrawling = false;
  /** @type {CrawlProgress} */
  lastCrawl = { userId: null, timestamp: 0 };
  /** @type {number} */
  crawlInterval;

  constructor() {
    this.bookManager = bookManager;
    this.apiBase = CONFIG.API_BASE;
    this.batchSize = CONFIG.BATCH_SIZE;
    this.isManualCrawling = false;
    this.lastCrawl = { userId: null, timestamp: 0 };
    this.crawlInterval = CONFIG.CRAWL_INTERVAL;
  }

  /**
   * 从当前活动标签页提取用户ID
   * @returns {Promise<string>}
   * @throws {Error} 无法获取用户ID
   */
  async getUserIdFromPage() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          reject(new Error('无法访问当前页面，请检查权限'));
          return;
        }
        if (tabs.length === 0) {
          reject(new Error('未找到当前页面，请重试'));
          return;
        }
        const tab = tabs[0];
        if (!tab.url.includes('douban.com')) {
          reject(new Error('请先打开豆瓣页面，或手动输入豆瓣ID'));
          return;
        }
        const urlMatch = tab.url.match(/\/people\/(\w+)/);
        if (urlMatch) {
          resolve(urlMatch[1]);
          return;
        }
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const m = window.location.pathname.match(/\/people\/(\w+)/);
            if (m) return m[1];
            const link = document.querySelector('a[href^="/people/"]');
            if (link) {
              const lm = link.getAttribute('href').match(/\/people\/(\w+)/);
              if (lm) return lm[1];
            }
            return '';
          }
        }, (results) => {
          if (chrome.runtime.lastError) {
            reject(new Error('无法获取用户信息，请手动输入豆瓣ID'));
            return;
          }
          const userId = results?.[0]?.result?.trim();
          userId ? resolve(userId)
                 : reject(new Error('无法识别用户，请手动输入豆瓣ID，或进入豆瓣个人主页后重试'));
        });
      });
    });
  }

  /**
   * 获取可用的豆瓣标签页
   * 优先复用已有标签页，若无则在后台临时创建
   * @returns {Promise<TabInfo>}
   * @throws {Error} 无法创建或加载标签页
   */
  async getDoubanTab() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ url: 'https://*.douban.com/*' }, (tabs) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (tabs && tabs.length > 0) {
          resolve({ tabId: tabs[0].id, needsClose: false });
          return;
        }
        // 没有豆瓣标签页，在后台创建一个（m.douban.com 与 API 同源，请求最可靠）
        chrome.tabs.create({ url: 'https://m.douban.com/mine/', active: false }, (tab) => {
          if (chrome.runtime.lastError) {
            reject(new Error('无法打开豆瓣页面，请检查网络连接'));
            return;
          }
          
          // 设置超时定时器，防止监听器永不触发
          const timeout = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            reject(new Error('页面加载超时，请检查网络后重试'));
          }, CONFIG.TAB_LOAD_TIMEOUT);
          
          const listener = (tabId, changeInfo) => {
            if (tabId === tab.id && changeInfo.status === 'complete') {
              clearTimeout(timeout);
              chrome.tabs.onUpdated.removeListener(listener);
              resolve({ tabId: tab.id, needsClose: true });
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });
      });
    });
  }

  /**
   * 在豆瓣标签页上下文中执行单次分页 API 请求
   * @param {number} tabId - 标签页ID
   * @param {string} userId - 用户ID
   * @param {number} start - 起始偏移量
   * @returns {Promise<ApiResponse>}
   * @throws {Error} 脚本执行失败或API请求失败
   */
  async fetchPageViaTab(tabId, userId, start) {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript({
        target: { tabId },
        func: async (userId, start, count, apiBase) => {
          const url = `${apiBase}/user/${userId}/interests?type=book&status=done&count=${count}&start=${start}&for_mobile=1`;
          try {
            const response = await fetch(url, {
              headers: { 'Referer': 'https://m.douban.com/mine/' },
              credentials: 'include'
            });
            if (!response.ok) return { error: response.status };
            const data = await response.json();
            return { ok: true, data };
          } catch (e) {
            return { error: 'FETCH_ERROR', message: e.message };
          }
        },
        args: [userId, start, this.batchSize, this.apiBase]
      }, (results) => {
        if (chrome.runtime.lastError) {
          reject(new Error(`脚本执行失败，请刷新页面后重试`));
          return;
        }
        const result = results?.[0]?.result;
        if (!result) {
          reject(new Error('未获取到数据，请稍后重试'));
          return;
        }
        if (result.error) {
          const code = result.error;
          if (code === 404)          reject(new Error('未找到该用户，请检查豆瓣ID是否正确'));
          else if (code === 403)     reject(new Error('书单为私密，请先在浏览器中登录豆瓣账号'));
          else if (code === 'FETCH_ERROR') reject(new Error(`网络连接失败，请检查网络后重试`));
          else                       reject(new Error(`请求失败（错误码：${code}），请稍后重试`));
          return;
        }
        resolve(result.data);
      });
    });
  }

  /**
   * 将各种日期格式统一为 yyyy-mm-dd
   * @param {string|number} raw - 原始日期值
   * @returns {string} 标准化的日期字符串
   */
  normalizeDate(raw) {
    if (!raw) return '未知日期';
    const s = String(raw).trim();
    // 尝试提取年、月、日数字
    const m = s.match(/(\d{4})[^\d]*(\d{1,2})?[^\d]*(\d{1,2})?/);
    if (!m) return '未知日期';
    const year = m[1];
    const month = m[2] ? m[2].padStart(2, '0') : '01';
    const day   = m[3] ? m[3].padStart(2, '0') : '01';
    return `${year}-${month}-${day}`;
  }

  /**
   * 解析 card_subtitle 字段
   * @param {string} subtitle - 格式通常为 "作者 / [作者...] / 出版社 / 出版年份"
   * @returns {{publisher: string}}
   */
  parseCardSubtitle(subtitle) {
    if (!subtitle) return { publisher: '' };
    const parts = subtitle.split(' / ').map(s => s.trim()).filter(Boolean);
    let endIdx = parts.length - 1;
    // 最后一段若以4位数字开头，视为出版年份，跳过
    if (endIdx >= 0 && /^\d{4}/.test(parts[endIdx])) endIdx--;
    // 倒数第二段视为出版社
    const publisher = endIdx >= 0 ? parts[endIdx] : '';
    return { publisher };
  }

  /**
   * 将 API 返回的 interest 条目映射为插件的书籍数据结构
   * @param {Object} item - API 返回的兴趣条目
   * @returns {Book}
   */
  mapInterestToBook(item) {
    const subject = item.subject || {};

    const title = subject.title || '未知书名';

    let author = '未知作者';
    if (Array.isArray(subject.author) && subject.author.length > 0) {
      author = subject.author.join(' / ');
    } else if (typeof subject.author === 'string' && subject.author) {
      author = subject.author;
    }

    let publishDate = '未知日期';
    if (Array.isArray(subject.pubdate) && subject.pubdate.length > 0) {
      publishDate = this.normalizeDate(subject.pubdate[0]);
    } else if (subject.year) {
      publishDate = this.normalizeDate(subject.year);
    }

    const subtitleParsed = this.parseCardSubtitle(subject.card_subtitle || '');
    const publisher = subject.publisher || subtitleParsed.publisher || '未知出版社';
    const url = subject.url || (subject.id ? `https://book.douban.com/subject/${subject.id}/` : '');
    const ratingValue = item.rating?.value;
    const rating = ratingValue != null ? `${ratingValue}分` : '未评分';
    const review = item.comment || '';
    const date = item.create_time ? item.create_time.slice(0, 10) : '未知日期';

    return { title, author, publishDate, publisher, url, rating, review, date };
  }

  /**
   * 爬取所有书籍数据
   * @param {function(number): void} progressCallback - 进度回调函数
   * @param {string|null} [manualUserId=null] - 手动指定的用户ID
   * @returns {Promise<Book[]>}
   * @throws {Error} 爬取失败
   */
  async crawlAllBooks(progressCallback, manualUserId = null) {
    let tabInfo = null;
    try {
      this.isManualCrawling = true;

      // 1. 获取用户ID
      const userId = manualUserId || await this.getUserIdFromPage();
      if (!userId) throw new Error('无法获取用户ID，请手动输入豆瓣ID');
      await this.bookManager.setCurrentUserId(userId);
      log(`开始获取用户 ${userId} 的已读书单`);

      // 2. 获取执行 API 请求所用的豆瓣标签页
      tabInfo = await this.getDoubanTab();
      log(`使用标签页 ${tabInfo.tabId}（${tabInfo.needsClose ? '临时创建' : '复用已有'}）`);

      // 3. 分页获取
      const allBooks = [];
      let start = 0;
      let total = null;
      progressCallback(0);

      while (true) {
        if (total !== null && start >= total) break;

        const data = await this.fetchPageViaTab(tabInfo.tabId, userId, start);

        if (typeof data.total === 'number' && total === null) {
          total = data.total;
          log(`用户 ${userId} 共有 ${total} 本已读书籍`);
        }

        const interests = Array.isArray(data.interests) ? data.interests : [];
        if (interests.length === 0) break;

        allBooks.push(...interests.map(item => this.mapInterestToBook(item)));

        const progress = total
          ? Math.min(90, Math.floor((allBooks.length / total) * 90))
          : Math.min(90, Math.floor((start / (start + this.batchSize + 1)) * 90));
        progressCallback(progress);

        start += this.batchSize;
        if (interests.length < this.batchSize) break;

        await new Promise(r => setTimeout(r, CONFIG.REQUEST_DELAY));
      }

      log(`共获取到 ${allBooks.length} 本书籍`);

      // 大数据量警告
      if (allBooks.length > 3000) {
        log(`警告：书籍数量较多（${allBooks.length}本），导出可能需要较长时间`);
      }

      await this.bookManager.saveBooks(allBooks);
      progressCallback(100);

      return allBooks;
    } catch (error) {
      logError('爬取失败:', error);
      throw error;
    } finally {
      this.isManualCrawling = false;
      // 关闭临时创建的标签页，复用的标签页不关闭
      if (tabInfo?.needsClose) {
        chrome.tabs.remove(tabInfo.tabId, () => {
          if (chrome.runtime.lastError) {
            logError('关闭临时标签页失败:', chrome.runtime.lastError);
          } else {
            log('临时豆瓣标签页已关闭');
          }
        });
      }
    }
  }
}

// 初始化管理器
const bookManager = new BookDataManager();
const crawler = new DoubanCrawler();
const exporter = new Exporter(bookManager);
log('所有管理器初始化完成');

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'startCrawl':
      // 开始爬取 - 使用立即执行的异步函数包装
      (async () => {
        try {
          const books = await crawler.crawlAllBooks((progress) => {
            // 向popup发送进度更新
            chrome.runtime.sendMessage({ action: 'updateProgress', progress });
          }, message.userId);
          sendResponse({ success: true, count: books.length });
        } catch (error) {
          logError('爬取失败:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true; // 表示异步响应

    case 'exportData':
      // 导出数据 - 使用立即执行的异步函数包装
      (async () => {
        try {
          // 如果消息中包含userId，先设置当前用户ID
          if (message.userId) {
            await bookManager.setCurrentUserId(message.userId);
          } else {
            // 没有传递userId，尝试获取保存的当前用户ID
            await bookManager.getCurrentUserId();
            log(`导出时使用的用户ID: ${bookManager.currentUserId}`);
          }
          
          if (message.format === 'csv') {
            await exporter.exportToCSV();
            sendResponse({ success: true });
          } else if (message.format === 'html') {
            await exporter.exportToHTML();
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: '不支持的导出格式' });
          }
        } catch (error) {
          logError('导出失败:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true; // 表示异步响应

    case 'clearData':
      // 清空数据 - 使用立即执行的异步函数包装
      (async () => {
        try {
          // 如果消息中包含userId，先设置当前用户ID
          if (message.userId) {
            await bookManager.setCurrentUserId(message.userId);
          }
          await bookManager.clearBooks();
          sendResponse({ success: true });
        } catch (error) {
          logError('清空数据失败:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true; // 表示异步响应

    case 'setUserId':
      // 设置当前用户ID（由content script在页面加载时触发）
      (async () => {
        try {
          if (message.userId) {
            await bookManager.setCurrentUserId(message.userId);
          }
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    default:
      sendResponse({ success: false, error: '未知操作' });
      return false; // 同步响应
  }
});

// 监听标签页更新，自动检测用户登录状态并爬取已读书单
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 正在手动爬取时跳过自动爬取，避免并发冲突
  if (crawler.isManualCrawling) {
    return;
  }
  
  if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('https://book.douban.com')) {
    // 页面加载完成，检测是否是已读书单页面
    const collectMatch = tab.url.match(/\/people\/(\w+)\/collect/);
    
    if (collectMatch) {
      // 是已读书单页面，提取用户ID
      const userId = collectMatch[1];
      log('检测到已读书单页面，用户ID:', userId);
      
      // 检查是否启用自动爬取
      chrome.storage.local.get('autoCrawlEnabled', (result) => {
        if (chrome.runtime.lastError) {
          logError('读取自动爬取设置失败:', chrome.runtime.lastError);
          return;
        }
        
        // 默认启用自动爬取
        if (result.autoCrawlEnabled === false) {
          log('自动爬取已禁用，跳过');
          return;
        }
        
        // 检测用户是否登录
        chrome.cookies.get({ url: 'https://www.douban.com', name: 'bid' }, (cookie) => {
          if (chrome.runtime.lastError) {
            logError('获取cookie失败:', chrome.runtime.lastError);
            return;
          }
          if (cookie) {
            // 用户已登录，设置当前用户ID
            bookManager.setCurrentUserId(userId);
            
            // 检查是否需要自动爬取（避免频繁爬取）
            const now = Date.now();
            const lastCrawl = crawler.lastCrawl;
            
            if (lastCrawl.userId !== userId || now - lastCrawl.timestamp > crawler.crawlInterval) {
              log('自动爬取用户', userId, '的已读书单');
              
              // 设置爬取状态和时间
              crawler.lastCrawl = {
                userId: userId,
                timestamp: now
              };
              
              // 自动爬取用户的已读书单
              crawler.crawlAllBooks((progress) => {
                // 不发送进度更新给popup，因为这是自动爬取
              }).then(() => {
                log('自动爬取完成');
              }).catch((error) => {
                logError('自动爬取失败:', error.message);
              });
            } else {
              log('距离上次爬取时间过短，跳过自动爬取');
            }
          }
        });
      });
    }
  }
});
