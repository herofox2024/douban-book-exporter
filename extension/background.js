// 数据存储管理
class BookDataManager {
  constructor() {
    this.books = [];
    this.currentUserId = '';
  }

  // 保存书籍数据
  saveBooks(books) {
    console.log(`保存书籍数据: ${books.length}本书`);
    this.books = books;
    
    // 按用户ID保存数据，支持多用户
    const userId = this.currentUserId || 'default';
    console.log(`保存到用户ID: ${userId}`);
    
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [`doubanBooks_${userId}`]: books }, () => {
        if (chrome.runtime.lastError) {
          console.error('保存数据失败:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          console.log('数据保存成功');
          resolve();
        }
      });
    });
  }

  // 获取书籍数据
  getBooks() {
    return new Promise((resolve) => {
      // 按用户ID获取数据
      const userId = this.currentUserId || 'default';
      console.log(`获取用户ID ${userId}的数据`);
      
      chrome.storage.local.get([`doubanBooks_${userId}`], (result) => {
        const books = result[`doubanBooks_${userId}`] || [];
        console.log(`获取到${books.length}本书籍数据`);
        this.books = books;
        resolve(books);
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
          console.error('清空数据失败:', chrome.runtime.lastError);
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
    console.log(`设置当前用户ID: ${userId}`);
    this.currentUserId = userId;
    
    // 确保返回Promise，处理Chrome 92+中chrome.storage.local.set不再返回Promise的问题
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ 'currentDoubanUserId': userId }, () => {
        if (chrome.runtime.lastError) {
          console.error('设置当前用户ID失败:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          console.log('当前用户ID设置成功');
          resolve();
        }
      });
    });
  }

  // 获取当前用户
  getCurrentUserId() {
    return new Promise((resolve) => {
      chrome.storage.local.get('currentDoubanUserId', (result) => {
        const userId = result.currentDoubanUserId || '';
        console.log(`获取到当前用户ID: ${userId}`);
        this.currentUserId = userId;
        resolve(userId);
      });
    });
  }
}

// 导出管理器
class Exporter {
  constructor(bookManager) {
    // 接收已初始化的bookManager实例，确保使用同一个实例
    this.bookManager = bookManager;
    console.log('Exporter初始化，使用bookManager:', this.bookManager);
  }

  // 导出为CSV格式
  async exportToCSV() {
    console.log('开始导出CSV...');
    const books = await this.bookManager.getBooks();
    console.log(`获取到${books.length}本书籍数据用于CSV导出`);
    
    if (books.length === 0) {
      throw new Error('没有数据可导出');
    }

    // CSV表头 - 按照用户要求，在出版日期后添加出版社列
    const headers = ['书名', '作者', '出版日期', '出版社', '豆瓣链接', '评分', '书评内容', '评分日期'];
    const csvContent = [headers.join(',')];

    // 转换数据为CSV行
    books.forEach((book, index) => {
      console.log(`处理第${index+1}本书: ${book.title}`);
      
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
    console.log(`准备下载CSV文件: ${filename}`);

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
            console.error('CSV下载失败:', chrome.runtime.lastError);
            resolve(true); // 即使下载失败，也返回成功，因为文件已生成
          } else {
            console.log(`CSV下载成功，ID: ${downloadId}`);
            resolve(true);
          }
        });
      };
      
      reader.onerror = (error) => {
        console.error('FileReader读取失败:', error);
        reject(new Error('文件生成失败'));
      };
      
      reader.readAsDataURL(csvBlob);
    });
  }

  // 导出为HTML格式
  async exportToHTML() {
    console.log('开始导出HTML...');
    const books = await this.bookManager.getBooks();
    console.log(`获取到${books.length}本书籍数据用于HTML导出`);
    
    if (books.length === 0) {
      throw new Error('没有数据可导出');
    }

    const userId = await this.bookManager.getCurrentUserId();
    const exportDate = new Date().toLocaleString('zh-CN');
    const totalBooks = books.length;
    const booksWithReviews = books.filter(book => book.review.trim() !== '').length;
    console.log(`生成HTML报告，总书籍数: ${totalBooks}，有书评: ${booksWithReviews}`);

    const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${userId || '未知用户'}的豆瓣书评</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      margin: 0;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background-color: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h1 {
      color: #2E7D32;
      text-align: center;
      margin-bottom: 20px;
    }
    .stats {
      display: flex;
      justify-content: center;
      gap: 30px;
      margin: 20px 0;
      flex-wrap: wrap;
    }
    .stat-item {
      text-align: center;
      padding: 15px 25px;
      background-color: #f8f9fa;
      border-radius: 8px;
      border-left: 4px solid #4CAF50;
    }
    .stat-number {
      font-size: 2em;
      font-weight: bold;
      color: #2E7D32;
      display: block;
    }
    .stat-label {
      color: #666;
      font-size: 0.9em;
    }
    .book-list {
      margin-top: 30px;
    }
    .book-item {
      margin-bottom: 25px;
      padding: 20px;
      background-color: #fafafa;
      border-radius: 8px;
      border-left: 4px solid #4CAF50;
      transition: transform 0.3s;
    }
    .book-item:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    }
    .book-title {
      font-size: 1.3em;
      font-weight: bold;
      color: #2E7D32;
      margin-bottom: 8px;
    }
    .book-title a {
      color: #2E7D32;
      text-decoration: none;
    }
    .book-title a:hover {
      text-decoration: underline;
    }
    .book-meta {
      color: #666;
      font-size: 0.9em;
      margin-bottom: 10px;
    }
    .book-rating {
      display: inline-block;
      padding: 4px 12px;
      background-color: #fff3cd;
      border: 1px solid #ffeaa7;
      border-radius: 15px;
      color: #856404;
      font-size: 0.85em;
      font-weight: bold;
      margin-right: 10px;
    }
    .book-review {
      margin-top: 15px;
      padding: 15px;
      background-color: white;
      border-radius: 6px;
      border-left: 3px solid #4CAF50;
      font-style: italic;
    }
    .no-review {
      color: #999;
      font-style: italic;
    }
    .footer {
      text-align: center;
      margin-top: 50px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      color: #666;
      font-size: 0.9em;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📚 ${userId || '未知用户'} 的豆瓣书评收藏</h1>
    <div class="stats">
      <div class="stat-item">
        <span class="stat-number">${totalBooks}</span>
        <span class="stat-label">总书籍数</span>
      </div>
      <div class="stat-item">
        <span class="stat-number">${booksWithReviews}</span>
        <span class="stat-label">有书评</span>
      </div>
      <div class="stat-item">
        <span class="stat-number">${exportDate}</span>
        <span class="stat-label">导出时间</span>
      </div>
    </div>
    
    <div class="book-list">
      ${books.map(book => `
        <div class="book-item">
          <div class="book-title">
            <a href="${this.escapeHtml(book.url)}" target="_blank">${this.escapeHtml(book.title)}</a>
          </div>
          <div class="book-meta">
            👤 ${this.escapeHtml(book.author)} | 📅 ${this.escapeHtml(book.publishDate)} | 🏢 ${this.escapeHtml(book.publisher)} | 🕒 ${this.escapeHtml(book.date)}
            <span class="book-rating">⭐ ${this.escapeHtml(book.rating)}</span>
          </div>
          <div class="book-review">
            ${book.review.trim() !== '' ? this.escapeHtml(book.review) : '<span class="no-review">📝 暂无书评</span>'}
          </div>
        </div>
      `).join('')}
    </div>
    
    <div class="footer">
      <p>📊 数据来源：豆瓣读书 | 生成时间：${exportDate} | 工具：豆瓣书评导出工具</p>
    </div>
  </div>
</body>
</html>`;

    const htmlBlob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const filename = `${userId || 'douban'}_书评_${new Date().toISOString().split('T')[0]}.html`;
    console.log(`准备下载HTML文件: ${filename}`);

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
            console.error('HTML下载失败:', chrome.runtime.lastError);
            resolve(true); // 即使下载失败，也返回成功，因为文件已生成
          } else {
            console.log(`HTML下载成功，ID: ${downloadId}`);
            resolve(true);
          }
        });
      };
      
      reader.onerror = (error) => {
        console.error('FileReader读取失败:', error);
        reject(new Error('文件生成失败'));
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
class DoubanCrawler {
  constructor() {
    this.bookManager = bookManager;
    this.apiBase = 'https://m.douban.com/rexxar/api/v2';
    this.batchSize = 50;
    this.isManualCrawling = false;
    this.lastCrawl = { userId: null, timestamp: 0 };
    this.crawlInterval = 30 * 60 * 1000; // 30分钟内不重复自动爬取
  }

  // 从当前活动标签页提取用户ID
  async getUserIdFromPage() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) {
          reject(new Error('没有找到活动标签页'));
          return;
        }
        const tab = tabs[0];
        if (!tab.url.includes('douban.com')) {
          reject(new Error('请在豆瓣页面使用此功能'));
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
            reject(new Error('获取用户ID时脚本执行失败'));
            return;
          }
          const userId = results?.[0]?.result?.trim();
          userId ? resolve(userId)
                 : reject(new Error('无法获取用户ID，请手动输入豆瓣ID，或进入豆瓣个人页面后重试'));
        });
      });
    });
  }

  // 获取可用的豆瓣标签页
  // 优先复用已有标签页（避免不必要的新标签），若没有则在后台临时创建一个
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
            reject(new Error('创建标签页失败: ' + chrome.runtime.lastError.message));
            return;
          }
          const listener = (tabId, changeInfo) => {
            if (tabId === tab.id && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve({ tabId: tab.id, needsClose: true });
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });
      });
    });
  }

  // 在豆瓣标签页上下文中执行单次分页 API 请求
  // 在页面上下文执行，浏览器自动携带 Cookie，Origin 为 m.douban.com，
  // 不会被豆瓣服务端当成扩展请求拒绝
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
          reject(new Error(`脚本注入失败: ${chrome.runtime.lastError.message}`));
          return;
        }
        const result = results?.[0]?.result;
        if (!result) {
          reject(new Error('未获取到数据，请重试'));
          return;
        }
        if (result.error) {
          const code = result.error;
          if (code === 404)          reject(new Error('未找到该用户，请检查豆瓣ID是否正确'));
          else if (code === 403)     reject(new Error('书单为私密设置，请先在浏览器中登录豆瓣'));
          else if (code === 'FETCH_ERROR') reject(new Error(`网络请求失败: ${result.message}`));
          else                       reject(new Error(`API请求失败: ${code}`));
          return;
        }
        resolve(result.data);
      });
    });
  }

  // 将各种日期格式统一为 yyyy-mm-dd
  // 支持：2020 / 2020-5 / 2020-5-1 / 2020年5月 / 2020年5月1日 等
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

  // 解析 card_subtitle 字段，格式通常为 "作者 / [作者...] / 出版社 / 出版年份"
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

  // 将 API 返回的 interest 条目映射为插件的书籍数据结构
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

  // 爬取所有书籍数据
  async crawlAllBooks(progressCallback, manualUserId = null) {
    let tabInfo = null;
    try {
      this.isManualCrawling = true;

      // 1. 获取用户ID
      const userId = manualUserId || await this.getUserIdFromPage();
      if (!userId) throw new Error('无法获取用户ID，请手动输入豆瓣ID');
      await this.bookManager.setCurrentUserId(userId);
      console.log(`开始获取用户 ${userId} 的已读书单`);

      // 2. 获取执行 API 请求所用的豆瓣标签页
      tabInfo = await this.getDoubanTab();
      console.log(`使用标签页 ${tabInfo.tabId}（${tabInfo.needsClose ? '临时创建' : '复用已有'}）`);

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
          console.log(`用户 ${userId} 共有 ${total} 本已读书籍`);
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

        await new Promise(r => setTimeout(r, 500));
      }

      console.log(`共获取到 ${allBooks.length} 本书籍`);
      await this.bookManager.saveBooks(allBooks);
      progressCallback(100);

      return allBooks;
    } catch (error) {
      console.error('爬取失败:', error);
      throw error;
    } finally {
      this.isManualCrawling = false;
      // 关闭临时创建的标签页，复用的标签页不关闭
      if (tabInfo?.needsClose) {
        chrome.tabs.remove(tabInfo.tabId, () => console.log('临时豆瓣标签页已关闭'));
      }
    }
  }
}

// 初始化管理器
const bookManager = new BookDataManager();
const crawler = new DoubanCrawler();
const exporter = new Exporter(bookManager);
console.log('所有管理器初始化完成');

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
          console.error('爬取失败:', error);
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
            console.log(`导出时使用的用户ID: ${bookManager.currentUserId}`);
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
          console.error('导出失败:', error);
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
          console.error('清空数据失败:', error);
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
      console.log('检测到已读书单页面，用户ID:', userId);
      
      // 检测用户是否登录
      chrome.cookies.get({ url: 'https://www.douban.com', name: 'bid' }, (cookie) => {
        if (cookie) {
          // 用户已登录，设置当前用户ID
          bookManager.setCurrentUserId(userId);
          
          // 检查是否需要自动爬取（避免频繁爬取）
          const now = Date.now();
          const lastCrawl = crawler.lastCrawl;
          
          if (lastCrawl.userId !== userId || now - lastCrawl.timestamp > crawler.crawlInterval) {
            console.log('需要自动爬取用户', userId, '的已读书单');
            
            // 设置爬取状态和时间
            crawler.lastCrawl = {
              userId: userId,
              timestamp: now
            };
            
            // 自动爬取用户的已读书单
            crawler.crawlAllBooks((progress) => {
              // 不发送进度更新给popup，因为这是自动爬取
            }).then(() => {
              console.log('自动爬取完成');
            }).catch((error) => {
              console.error('自动爬取失败:', error.message);
            });
          } else {
            console.log('距离上次爬取时间过短，跳过自动爬取');
          }
        }
      });
    }
  }
});
