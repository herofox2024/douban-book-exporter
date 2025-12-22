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

    // 生成HTML内容
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
            <a href="${book.url}" target="_blank">${this.escapeHtml(book.title)}</a>
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
class DoubanCrawler {
  constructor() {
    this.bookManager = bookManager; // 使用全局的bookManager实例
    this.baseUrl = 'https://book.douban.com';
    console.log('DoubanCrawler初始化，使用全局bookManager:', this.bookManager);
    
    // 记录最近爬取的用户ID和时间，避免重复爬取
    this.lastCrawl = {
      userId: null,
      timestamp: 0
    };
    
    // 爬取间隔（毫秒），避免频繁爬取
    this.crawlInterval = 30 * 60 * 1000; // 30分钟
  }

  // 获取豆瓣Cookie
  async getDoubanCookies() {
    return new Promise((resolve, reject) => {
      // 同时从两个豆瓣域名获取Cookie
      const domains = ['https://www.douban.com', 'https://book.douban.com'];
      let allCookies = [];
      let domainsProcessed = 0;

      const processCookies = (domain, cookies) => {
        console.log(`从${domain}获取到${cookies.length}个Cookie`);
        cookies.forEach(cookie => {
          console.log(`  Cookie: ${cookie.name}=${cookie.value.substring(0, 20)}${cookie.value.length > 20 ? '...' : ''}`);
        });
        
        allCookies = [...allCookies, ...cookies];
        domainsProcessed++;
        
        if (domainsProcessed === domains.length) {
          // 去重处理，相同名称的Cookie只保留一个
          const uniqueCookies = {};
          allCookies.forEach(cookie => {
            uniqueCookies[cookie.name] = cookie;
          });

          // 转换为Cookie字符串
          const cookieString = Object.values(uniqueCookies)
            .map(cookie => `${cookie.name}=${cookie.value}`)
            .join('; ');
          
          console.log(`最终Cookie字符串长度: ${cookieString.length}`);
          console.log(`Cookie字符串样本: ${cookieString.substring(0, 100)}${cookieString.length > 100 ? '...' : ''}`);
          
          resolve(cookieString);
        }
      };

      domains.forEach(domain => {
        chrome.cookies.getAll({ url: domain }, (cookies) => {
          if (chrome.runtime.lastError) {
            console.error(`从${domain}获取Cookie失败: ${chrome.runtime.lastError.message}`);
            // 如果一个域名失败，继续处理其他域名
            domainsProcessed++;
            if (domainsProcessed === domains.length) {
              processCookies(domain, []);
            }
            return;
          }
          processCookies(domain, cookies);
        });
      });
    });
  }

  // 爬取用户ID
  async getUserIdFromPage() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) {
          reject(new Error('没有找到活动标签页'));
          return;
        }

        const tab = tabs[0];
        const currentUrl = tab.url;
        console.log('当前活动标签页URL:', currentUrl);
        
        // 放宽页面检查，允许从任何豆瓣域名页面获取用户ID
        if (!currentUrl.includes('douban.com')) {
          reject(new Error('请在豆瓣页面使用此功能'));
          return;
        }
        
        // 优先从URL提取用户ID，这是最可靠的方式
        const urlMatch = currentUrl.match(/\/people\/(\w+)/);
        if (urlMatch) {
          const userId = urlMatch[1];
          console.log('从URL直接提取到用户ID:', userId);
          resolve(userId);
          return;
        }
        
        // 如果URL提取失败，再尝试从页面的URL pathname提取
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            console.log('Content Script: 开始从页面提取用户ID');
            
            // 只从URL pathname提取用户ID，这是唯一可靠的方式
            const urlMatch = window.location.pathname.match(/\/people\/(\w+)/);
            if (urlMatch) {
              const userId = urlMatch[1];
              console.log('Content Script: 从URL提取到用户ID:', userId);
              return userId;
            }
            
            // 从个人主页链接提取用户ID
            const profileLink = document.querySelector('a[href^="/people/"]');
            if (profileLink) {
              const href = profileLink.getAttribute('href');
              const hrefMatch = href.match(/\/people\/(\w+)/);
              if (hrefMatch) {
                const userId = hrefMatch[1];
                console.log('Content Script: 从个人链接提取到用户ID:', userId);
                return userId;
              }
            }
            
            console.log('Content Script: 无法从页面提取用户ID');
            return '';
          }
        }, (results) => {
          if (chrome.runtime.lastError) {
            console.error('获取用户ID时脚本执行失败:', chrome.runtime.lastError.message);
            reject(new Error('获取用户ID时脚本执行失败'));
            return;
          }

          if (results && results[0]) {
            const userId = results[0].result;
            console.log('获取到的用户ID:', userId);
            
            if (userId && userId.trim() !== '') {
              resolve(userId.trim());
            } else {
              reject(new Error('无法获取用户ID，请确保当前页面是豆瓣读书的个人页面，URL应包含/people/用户名'));
            }
          } else {
            reject(new Error('无法获取用户ID'));
          }
        });
      });
    });
  }

  // 爬取单页书籍数据
  async crawlPage(userId, page, cookieString, progressCallback) {
    // 明确使用已读书评页面URL
    const url = `${this.baseUrl}/people/${userId}/collect?start=${page * 15}`;
    console.log(`正在爬取页面: ${url}`);
    
    try {
      // 使用隐藏的背景标签页来加载和解析豆瓣页面，避免影响用户当前页面
      const books = await this.crawlPageInBackgroundTab(url);
      console.log(`解析到${books.length}本书籍`);
      return books;
    } catch (error) {
      console.error(`爬取页面${url}时出错: ${error.message}`);
      console.error(`错误堆栈: ${error.stack}`);
      // 不要中断整个爬取过程，返回已解析的书籍
      return [];
    }
  }
  
  // 在隐藏的背景标签页中爬取页面数据
  async crawlPageInBackgroundTab(url) {
    return new Promise((resolve) => {
      // 创建隐藏的背景标签页
      chrome.tabs.create({
        url: url,
        active: false,
        pinned: false
        // 移除openerTabId属性，因为chrome.tabs.TAB_ID_NONE不是有效的数值
      }, (backgroundTab) => {
        if (chrome.runtime.lastError) {
          console.error('创建背景标签页失败:', chrome.runtime.lastError.message);
          resolve([]);
          return;
        }
        
        console.log(`创建背景标签页成功，ID: ${backgroundTab.id}`);
        
        // 监听页面加载完成事件
        const listener = (tabId, changeInfo, tab) => {
          if (tabId === backgroundTab.id && changeInfo.status === 'complete') {
            // 移除监听器，避免重复触发
            chrome.tabs.onUpdated.removeListener(listener);
            
            // 页面加载完成后执行爬取脚本
            executeCrawlScript(backgroundTab.id);
          }
        };
        
        chrome.tabs.onUpdated.addListener(listener);
        
        // 执行爬取脚本的函数
        function executeCrawlScript(tabId) {
          try {
            // 直接定义爬取函数，避免使用new Function()违反CSP
            const crawlFunction = () => {
              console.log('Content Script: 开始爬取当前页面');
              
              const books = [];
              const interestItems = document.querySelectorAll('.interest-list li');
              console.log('找到' + interestItems.length + '个interest items');
              
              interestItems.forEach((item, index) => {
                try {
                  const titleElem = item.querySelector('.info h2 a');
                  if (!titleElem) {
                    console.log('跳过项目，没有标题');
                    return;
                  }
                  
                  const title = titleElem.getAttribute('title') || titleElem.textContent.trim();
                  const url = titleElem.getAttribute('href');
                  const pubElem = item.querySelector('.pub');
                  const pubText = pubElem ? pubElem.textContent.trim() : '';
                  const pubParts = pubText.split(' / ');
                  
                  // 提取出版信息
                  const author = pubParts[0] || '未知作者';
                  const publisher = pubParts.length > 1 ? pubParts[1] : '未知出版社';
                  
                  // 提取并格式化出版日期
                  let publishDate = '未知日期';
                  if (pubParts.length > 2) {
                    const rawDate = pubParts[2] || '';
                    // 尝试将出版日期格式化为yyyy-MM-dd
                    if (rawDate) {
                      try {
                        // 豆瓣出版日期格式可能是"2023-01"或"2023"
                        const dateParts = rawDate.split('-');
                        if (dateParts.length >= 2) {
                          // 格式化为yyyy-MM-dd
                          publishDate = `${dateParts[0]}-${dateParts[1].padStart(2, '0')}-01`;
                        } else if (dateParts.length === 1) {
                          // 只有年份，格式化为yyyy-01-01
                          publishDate = `${dateParts[0]}-01-01`;
                        } else {
                          publishDate = rawDate;
                        }
                      } catch (e) {
                        publishDate = rawDate;
                      }
                    }
                  }
                  
                  // 调试：查看当前item的HTML结构，了解评分元素的实际情况
                  console.log('Item HTML:', item.outerHTML);
                  
                  let ratingText = null;
                  
                  // 方法1: 直接查找rating_nums元素（优先级最高）
                  const ratingNums = item.querySelector('.rating_nums');
                  if (ratingNums) {
                    ratingText = ratingNums.textContent.trim();
                    console.log('从.rating_nums获取评分:', ratingText);
                  }
                  
                  // 方法2: 查找star-rating元素
                  if (!ratingText) {
                    const starRating = item.querySelector('.star-rating');
                    if (starRating) {
                      console.log('找到star-rating元素，class:', starRating.className);
                      // 豆瓣使用star-rating-*类来表示评分，如star-rating-50表示5分
                      const classList = starRating.className;
                      const ratingMatch = classList.match(/star-rating-(\d+)/);
                      if (ratingMatch) {
                        const ratingValue = parseInt(ratingMatch[1]) / 10;
                        ratingText = ratingValue.toString();
                        console.log('从star-rating-*获取评分:', ratingText);
                      }
                    }
                  }
                  
                  // 方法3: 查找ratingX-t元素，如rating5-t表示5分
                  if (!ratingText) {
                    const ratingElements = item.querySelectorAll('[class^="rating"][class$="-t"]');
                    if (ratingElements.length > 0) {
                      console.log('找到ratingX-t元素:', ratingElements);
                      for (const elem of ratingElements) {
                        const classList = elem.className;
                        console.log('ratingX-t元素class:', classList);
                        const ratingMatch = classList.match(/rating(\d+)-t/);
                        if (ratingMatch) {
                          const ratingValue = parseInt(ratingMatch[1]);
                          ratingText = ratingValue.toString();
                          console.log('从ratingX-t获取评分:', ratingText);
                          break;
                        }
                      }
                    }
                  }
                  
                  // 方法4: 查找interest-rating元素下的所有子元素，检查是否有评分相关信息
                  if (!ratingText) {
                    const interestRating = item.querySelector('.interest-rating');
                    if (interestRating) {
                      console.log('interest-rating元素HTML:', interestRating.outerHTML);
                      // 查找interest-rating下的所有文本内容
                      const textContent = interestRating.textContent.trim();
                      console.log('interest-rating文本内容:', textContent);
                      // 尝试从文本中提取评分
                      const textMatch = textContent.match(/(\d+(?:\.\d+)?)分/);
                      if (textMatch) {
                        ratingText = textMatch[1];
                        console.log('从文本中提取评分:', ratingText);
                      }
                    }
                  }
                  
                  // 方法5: 查找item下的所有评分相关元素
                  if (!ratingText) {
                    const allRatingElements = item.querySelectorAll('[class*="rating"]');
                    console.log('找到所有评分相关元素:', allRatingElements);
                    for (const elem of allRatingElements) {
                      console.log('评分相关元素HTML:', elem.outerHTML);
                      // 检查是否有评分文本
                      const elemText = elem.textContent.trim();
                      if (elemText) {
                        // 简化正则表达式，直接匹配数字
                        const textMatch = elemText.match(/\d+(\.\d+)?/);
                        if (textMatch && !isNaN(textMatch[0])) {
                          ratingText = textMatch[0];
                          console.log('从评分相关元素提取评分:', ratingText);
                          break;
                        }
                      }
                    }
                  }
                  
                  // 方法6: 查找item下的所有元素，检查是否有评分
                  if (!ratingText) {
                    const allElements = item.querySelectorAll('*');
                    for (const elem of allElements) {
                      const elemText = elem.textContent.trim();
                      if (elemText && !isNaN(elemText) && parseFloat(elemText) > 0 && parseFloat(elemText) <= 5) {
                        ratingText = elemText;
                        console.log('从所有元素提取评分:', ratingText);
                        break;
                      }
                    }
                  }
                  
                  const rating = ratingText ? ratingText + '分' : '未评分';
                  
                  books.push({
                    title: title,
                    author: author,
                    publishDate: publishDate,
                    publisher: publisher,
                    url: url,
                    rating: rating,
                    review: item.querySelector('.comment')?.textContent.trim() || '',
                    date: item.querySelector('.date')?.textContent.trim() || '未知日期'
                  });
                } catch (e) {
                  console.error('处理第' + index + '个项目时出错:', e);
                }
              });
              
              console.log('解析完成，共' + books.length + '本书');
              return books;
            };
            
            chrome.scripting.executeScript({
              target: { tabId: tabId },
              func: crawlFunction
            }, (results) => {
              // 无论成功与否，都关闭背景标签页
              chrome.tabs.remove(tabId, () => {
                console.log(`背景标签页已关闭，ID: ${tabId}`);
              });
              
              if (chrome.runtime.lastError) {
                console.error('Content Script执行失败:', chrome.runtime.lastError.message);
                resolve([]);
                return;
              }
              
              if (results && results[0] && results[0].result) {
                const books = results[0].result;
                console.log(`从Content Script获取到${books.length}本书籍`);
                resolve(books);
              } else {
                console.log('Content Script未返回结果');
                resolve([]);
              }
            });
          } catch (error) {
            console.error('注入Content Script时出错:', error.message);
            // 出错时也关闭背景标签页
            chrome.tabs.remove(tabId, () => {
              console.log(`背景标签页已关闭，ID: ${tabId}`);
            });
            resolve([]);
          }
        }
      });
    });
  }

  // 爬取所有书籍数据
  async crawlAllBooks(progressCallback) {
    try {
      // 获取Cookie和用户ID
      let cookieString = await this.getDoubanCookies();
      
      // 改进Cookie检查和获取逻辑
      if (!cookieString || cookieString.trim() === '') {
        // 添加调试信息
        console.log('从chrome.cookies API获取到的Cookie字符串为空');
        // 尝试从当前页面直接获取Cookie（通过content script）
        const directCookie = await this.getCookieFromCurrentPage();
        if (directCookie && directCookie.trim() !== '') {
          console.log('通过content script获取到Cookie');
          cookieString = directCookie; // 使用从页面获取的Cookie
        } else {
          // 尝试直接获取特定的关键Cookie
          const criticalCookies = await this.getCriticalDoubanCookies();
          if (criticalCookies && criticalCookies.trim() !== '') {
            console.log('通过直接获取关键Cookie获取到Cookie');
            cookieString = criticalCookies;
          } else {
            throw new Error('未找到豆瓣Cookie，请确保已登录豆瓣并刷新页面后重试');
          }
        }
      }

      // 检查是否包含关键Cookie
      this.checkCriticalCookies(cookieString);

      const userId = await this.getUserIdFromPage();
      if (!userId) {
        throw new Error('无法获取用户ID，请确保当前页面是豆瓣读书的个人页面（URL包含/people/用户名）');
      }

      // 设置当前用户
      await this.bookManager.setCurrentUserId(userId);

      let allBooks = [];
      let page = 0;
      let hasMore = true;

      progressCallback(0);

      while (hasMore) {
        // 爬取当前页，确保使用正确的Cookie
        const books = await this.crawlPage(userId, page, cookieString, progressCallback);
        
        if (books.length === 0) {
          hasMore = false;
        } else {
          allBooks = allBooks.concat(books);
          page++;
          
          // 更新进度（更合理的进度计算）
          const progress = Math.min(95, Math.floor((page * 100) / 20)); // 假设最多20页
          progressCallback(progress);
          
          // 延迟，避免请求过于频繁
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }

      // 保存数据
      await this.bookManager.saveBooks(allBooks);
      progressCallback(100);

      return allBooks;
    } catch (error) {
      console.error('爬取失败:', error);
      throw error;
    }
  }

  // 获取豆瓣关键Cookie（bid和dbcl2）
  async getCriticalDoubanCookies() {
    return new Promise((resolve, reject) => {
      const criticalCookieNames = ['bid', 'dbcl2'];
      const domains = ['https://www.douban.com', 'https://book.douban.com'];
      let allCriticalCookies = {};
      let cookiesProcessed = 0;
      let totalCookiesToGet = criticalCookieNames.length * domains.length;
      
      console.log('开始获取关键Cookie:', criticalCookieNames);
      
      const checkCompletion = () => {
        cookiesProcessed++;
        if (cookiesProcessed === totalCookiesToGet) {
          // 转换为Cookie字符串
          const cookieString = Object.entries(allCriticalCookies)
            .map(([name, value]) => `${name}=${value}`)
            .join('; ');
          
          console.log('获取到的关键Cookie字符串:', cookieString);
          resolve(cookieString);
        }
      };
      
      domains.forEach(domain => {
        criticalCookieNames.forEach(cookieName => {
          chrome.cookies.get({ url: domain, name: cookieName }, (cookie) => {
            if (cookie) {
              console.log(`从${domain}获取到关键Cookie: ${cookieName}=${cookie.value.substring(0, 20)}...`);
              allCriticalCookies[cookieName] = cookie.value;
            } else {
              console.log(`从${domain}未获取到关键Cookie: ${cookieName}`);
              if (chrome.runtime.lastError) {
                console.error(`获取关键Cookie失败: ${chrome.runtime.lastError.message}`);
              }
            }
            checkCompletion();
          });
        });
      });
    });
  }

  // 检查是否包含关键Cookie
  checkCriticalCookies(cookieString) {
    const criticalCookieNames = ['bid', 'dbcl2'];
    const foundCriticalCookies = [];
    
    criticalCookieNames.forEach(name => {
      if (cookieString.includes(`${name}=`)) {
        foundCriticalCookies.push(name);
      }
    });
    
    console.log(`关键Cookie检查结果: 找到 ${foundCriticalCookies.length}/${criticalCookieNames.length} 个关键Cookie`);
    if (foundCriticalCookies.length === 0) {
      console.warn('警告: 未找到任何关键Cookie，可能会导致爬取失败');
    }
  }

  // 从当前页面直接获取Cookie（通过content script）
  async getCookieFromCurrentPage() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) {
          console.log('未找到活动标签页');
          resolve('');
          return;
        }

        const tab = tabs[0];
        console.log('当前活动标签页URL:', tab.url);
        
        // 放宽页面检查，允许从任何豆瓣域名获取Cookie
        if (!tab.url.includes('douban.com')) {
          console.log('当前页面不是豆瓣域名，无法直接获取Cookie');
          resolve('');
          return;
        }

        try {
          console.log('尝试通过Content Script获取Cookie...');
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              console.log('Content Script: 执行获取Cookie操作');
              const cookie = document.cookie;
              console.log('Content Script: 获取到的Cookie长度:', cookie.length);
              // 返回前200个字符用于调试，避免日志过长
              return {
                cookie: cookie,
                length: cookie.length,
                sample: cookie.substring(0, 200) + (cookie.length > 200 ? '...' : '')
              };
            }
          }, (results) => {
            if (chrome.runtime.lastError) {
              console.error('Content Script执行失败:', chrome.runtime.lastError.message);
              resolve('');
              return;
            }
            
            if (!results || !results[0]) {
              console.log('Content Script未返回结果');
              resolve('');
              return;
            }
            
            const result = results[0].result;
            console.log('Content Script返回结果:', result);
            resolve(result.cookie || '');
          });
        } catch (error) {
          console.error('从页面获取Cookie时发生异常:', error);
          resolve('');
        }
      });
    });
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
          });
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
          await bookManager.clearBooks();
          sendResponse({ success: true });
        } catch (error) {
          console.error('清空数据失败:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true; // 表示异步响应

    default:
      sendResponse({ success: false, error: '未知操作' });
      return false; // 同步响应
  }
});

// 监听标签页更新，自动检测用户登录状态并爬取已读书单
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
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
            console.log('开始自动爬取数据，上次爬取时间:', lastCrawl.timestamp, '当前时间:', now);
            
            // 更新最近爬取记录
            crawler.lastCrawl = {
              userId: userId,
              timestamp: now
            };
            
            // 开始自动爬取
            crawler.crawlAllBooks((progress) => {
              // 后台自动爬取，不更新UI
              console.log('自动爬取进度:', progress + '%');
            })
            .then(books => {
              console.log('自动爬取完成，获取到', books.length, '本书籍');
            })
            .catch(error => {
              console.error('自动爬取失败:', error.message);
            });
          } else {
            console.log('距离上次爬取时间较短，跳过自动爬取');
          }
        } else {
          console.log('用户未登录，跳过自动爬取');
        }
      });
    } else {
      // 不是已读书单页面，只检测登录状态和提取用户ID
      chrome.cookies.get({ url: 'https://www.douban.com', name: 'bid' }, (cookie) => {
        if (cookie) {
          // 用户已登录，可以提取用户ID
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
              const match = window.location.pathname.match(/\/people\/(\w+)/);
              return match ? match[1] : '';
            }
          }, (results) => {
            if (results && results[0] && results[0].result) {
              bookManager.setCurrentUserId(results[0].result);
            }
          });
        }
      });
    }
  }
});