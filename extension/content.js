// 内容脚本 - 运行在豆瓣页面上下文中

// 提取当前页面的用户ID
function extractUserId() {
  const match = window.location.pathname.match(/\/people\/(\w+)/);
  return match ? match[1] : '';
}

// 书籍列表容器选择器（按优先级排序）
// 用于定位页面上的书籍条目容器
const BOOK_ITEM_SELECTORS = [
  '.subject-item',           // 豆瓣标准书籍条目（最常用）
  '.grid-view li',           // 网格视图下的列表项
  '.interest-list li',       // 兴趣列表容器
  '.interest-item',          // 兴趣条目
  '.book-list li',           // 书籍列表
  '.book-item',              // 书籍条目
  'li[data-item-id]',        // 带有数据ID的列表项
];

// 提取当前页面的书籍列表
function extractBooks() {
  let bookItems = [];
  for (const selector of BOOK_ITEM_SELECTORS) {
    bookItems = document.querySelectorAll(selector);
    if (bookItems.length > 0) break;
  }

  const books = [];

  // 日期正则表达式（提取到循环外部避免重复创建）
  const dateRegex = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/;

  bookItems.forEach((item) => {
    // 标题提取（按优先级尝试多种选择器）
    let titleElem = item.querySelector('.info h2 a') ||
                    item.querySelector('.info a') ||
                    item.querySelector('h2 a') ||
                    item.querySelector('.title a') ||
                    item.querySelector('a[href^="https://book.douban.com/subject/"]') ||
                    item.querySelector('a[href^="/subject/"]');

    // 如果上述选择器都没找到，尝试遍历所有链接
    if (!titleElem) {
      const allLinks = item.querySelectorAll('a');
      for (const link of allLinks) {
        const href = link.getAttribute('href');
        if (href && (href.startsWith('https://book.douban.com/subject/') || href.startsWith('/subject/'))) {
          titleElem = link;
          break;
        }
      }
    }

    if (!titleElem) return;

    const title = titleElem.getAttribute('title') || titleElem.textContent.trim();
    const url = titleElem.getAttribute('href');

    // 出版信息提取
    let pubText = '';
    const pubElem = item.querySelector('.pub') ||
                    item.querySelector('.intro') ||
                    item.querySelector('.book-info');
    
    if (pubElem) {
      pubText = pubElem.textContent.trim();
    }

    const pubParts = pubText.split(' / ');
    let author = '未知作者';
    let publisher = '未知出版社';
    let publishDate = '未知日期';

    if (pubParts.length > 0) {
      let authorParts = [];
      let inAuthorSection = true;
      let dateFound = false;
      let publisherFound = false;

      for (let i = 0; i < pubParts.length; i++) {
        const part = pubParts[i].trim();
        const dateMatch = part.match(dateRegex);
        const isPublisher = ['出版社', '出版公司', '书局', '书店', '杂志社', '杂志', '期刊社', '文化', '社'].some(kw => part.includes(kw));

        if (dateMatch && !dateFound) {
          inAuthorSection = false;
          const year = dateMatch[1];
          const month = dateMatch[2] || '01';
          const day = dateMatch[3] || '01';
          publishDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          dateFound = true;
        } else if (isPublisher && !publisherFound) {
          inAuthorSection = false;
          publisher = part;
          publisherFound = true;
        } else if (inAuthorSection) {
          if (part.includes('译') || part.includes('译者') || part.includes('翻译')) {
            inAuthorSection = false;
          } else {
            authorParts.push(part);
          }
        } else if (!publisherFound) {
          if (!part.includes('元') && !part.includes('CNY') && !part.includes('译') && !part.includes('译者')) {
            publisher = part;
            publisherFound = true;
          }
        }
      }

      author = authorParts.join(' / ') || '未知作者';
    }

    // 评分提取（按优先级尝试多种方法）
    let ratingText = null;
    
    const ratingNums = item.querySelector('.rating_nums');
    if (ratingNums) {
      ratingText = ratingNums.textContent.trim();
    } else {
      const starRating = item.querySelector('.star-rating');
      if (starRating) {
        const ratingMatch = starRating.className.match(/star-rating-(\d+)/);
        if (ratingMatch) {
          ratingText = (parseInt(ratingMatch[1]) / 10).toString();
        }
      }
    }

    if (!ratingText) {
      const interestRating = item.querySelector('.interest-rating');
      if (interestRating) {
        const textMatch = interestRating.textContent.trim().match(/(\d+(?:\.\d+)?)分/);
        if (textMatch) ratingText = textMatch[1];
      }
    }

    const rating = ratingText ? ratingText + '分' : '未评分';

    // 书评提取
    const reviewElem = item.querySelector('.comment') ||
                       item.querySelector('.short-note') ||
                       item.querySelector('.review');
    const review = reviewElem ? reviewElem.textContent.trim() : '';

    // 日期提取
    const dateElem = item.querySelector('.date') ||
                     item.querySelector('.collect-date') ||
                     item.querySelector('.time');
    let date = dateElem ? dateElem.textContent.trim() : '未知日期';

    if (date === '未知日期') {
      const dateMatch = /(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?)/.exec(item.textContent);
      if (dateMatch) date = dateMatch[1];
    }

    books.push({ title, author, publishDate, publisher, url, rating, review, date });
  });

  console.log(`Content Script: 共提取到 ${books.length} 本书籍`);
  return books;
}

// 提取当前登录用户的用户名
function extractUsername() {
  const usernameElem = document.querySelector('.nav-user-account .nav-login-info a');
  return usernameElem ? usernameElem.textContent.trim() : '';
}

// 监听来自后台脚本的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'extractUserId':
      sendResponse({ userId: extractUserId() });
      break;

    case 'extractBooks':
      sendResponse({ books: extractBooks() });
      break;

    case 'extractUsername':
      sendResponse({ username: extractUsername() });
      break;

    default:
      sendResponse({ error: '未知操作' });
  }
});

// 当页面加载完成时，自动向后台发送用户ID
// 使用 DOMContentLoaded 或检查 readyState 确保尽早执行
function sendUserIdOnReady() {
  const userId = extractUserId();
  if (userId) {
    chrome.runtime.sendMessage({ action: 'setUserId', userId: userId });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', sendUserIdOnReady);
} else {
  sendUserIdOnReady();
}
