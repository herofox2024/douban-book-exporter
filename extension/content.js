// 内容脚本 - 运行在豆瓣页面上下文中

// 提取当前页面的用户ID
function extractUserId() {
  const match = window.location.pathname.match(/\/people\/(\w+)/);
  return match ? match[1] : '';
}

// 提取当前页面的书籍列表
function extractBooks() {
  const selectors = [
    '.subject-item',
    '.grid-view li',
    '.interest-list li',
    '.article .subject-item',
    '.interest-item',
    '#content .subject-item',
    '.book-list li',
    '.col2-left-main .subject-item',
    '.book-item',
    '.subject-list li',
    'li[data-item-id]',
    'div[data-item-id]',
    'li.subject-item',
    'div.subject-item'
  ];

  let bookItems = [];
  for (const selector of selectors) {
    bookItems = document.querySelectorAll(selector);
    if (bookItems.length > 0) break;
  }

  const books = [];

  bookItems.forEach((item) => {
    // 标题提取
    let titleElem = null;
    const titleSelectors = [
      '.info h2 a',
      '.info a',
      'h2 a',
      '.title a',
      '.subject-title a',
      '.book-title a',
      'a[href^="https://book.douban.com/subject/"]',
      'a[href^="/subject/"]'
    ];

    for (const selector of titleSelectors) {
      titleElem = item.querySelector(selector);
      if (titleElem) break;
    }

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
    const pubSelectors = [
      '.pub',
      '.intro',
      '.info .intro',
      '.book-info',
      '.subject-info',
      '.publish-info'
    ];

    for (const selector of pubSelectors) {
      const pubElem = item.querySelector(selector);
      if (pubElem) {
        pubText = pubElem.textContent.trim();
        break;
      }
    }

    if (!pubText) {
      const allElements = item.querySelectorAll('*');
      for (const elem of allElements) {
        const text = elem.textContent.trim();
        if (text && (text.includes('出版社') || text.includes('出版') || text.includes('年'))) {
          pubText = text;
          break;
        }
      }
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
      const dateRegex = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/;

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

    // 评分提取（4种方法，由精确到模糊）
    let ratingText = null;

    // 方法1: .rating_nums
    const ratingNums = item.querySelector('.rating_nums');
    if (ratingNums) {
      ratingText = ratingNums.textContent.trim();
    }

    // 方法2: star-rating-* 类名
    if (!ratingText) {
      const starRating = item.querySelector('.star-rating');
      if (starRating) {
        const ratingMatch = starRating.className.match(/star-rating-(\d+)/);
        if (ratingMatch) {
          ratingText = (parseInt(ratingMatch[1]) / 10).toString();
        }
      }
    }

    // 方法3: ratingX-t 类名
    if (!ratingText) {
      const ratingElements = item.querySelectorAll('[class^="rating"][class$="-t"]');
      for (const elem of ratingElements) {
        const ratingMatch = elem.className.match(/rating(\d+)-t/);
        if (ratingMatch) {
          ratingText = parseInt(ratingMatch[1]).toString();
          break;
        }
      }
    }

    // 方法4: .interest-rating 文本
    if (!ratingText) {
      const interestRating = item.querySelector('.interest-rating');
      if (interestRating) {
        const textMatch = interestRating.textContent.trim().match(/(\d+(?:\.\d+)?)分/);
        if (textMatch) ratingText = textMatch[1];
      }
    }

    const rating = ratingText ? ratingText + '分' : '未评分';

    // 书评提取
    let review = '';
    const reviewSelectors = [
      '.comment',
      '.short-note',
      '.review',
      '.note-content',
      '.comment-content',
      '.review-content'
    ];

    for (const selector of reviewSelectors) {
      const reviewElem = item.querySelector(selector);
      if (reviewElem) {
        review = reviewElem.textContent.trim();
        break;
      }
    }

    // 日期提取
    let date = '未知日期';
    const dateSelectors = [
      '.date',
      '.collect-date',
      '.review-date',
      '.note-date',
      '.create-time',
      '.time'
    ];

    for (const selector of dateSelectors) {
      const dateElem = item.querySelector(selector);
      if (dateElem) {
        date = dateElem.textContent.trim();
        break;
      }
    }

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
window.addEventListener('load', () => {
  const userId = extractUserId();
  if (userId) {
    chrome.runtime.sendMessage({ action: 'setUserId', userId: userId });
  }
});
