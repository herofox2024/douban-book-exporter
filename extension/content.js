// 内容脚本 - 运行在豆瓣页面上下文中

// 提取当前页面的用户ID
function extractUserId() {
  const match = window.location.pathname.match(/\/people\/(\w+)/);
  return match ? match[1] : '';
}

// 提取当前页面的书籍列表
function extractBooks() {
  // 定义多种可能的选择器，按优先级顺序尝试
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
  // 尝试所有选择器，直到找到匹配的元素
  for (const selector of selectors) {
    bookItems = document.querySelectorAll(selector);
    console.log(`Content Script: 尝试选择器 "${selector}"，找到 ${bookItems.length} 个书籍项目`);
    if (bookItems.length > 0) {
      break;
    }
  }
  
  const books = [];

  bookItems.forEach((item, index) => {
    console.log(`Content Script: 处理第 ${index + 1} 个书籍项目`);
    console.log(`Content Script: 项目HTML结构（前500字符）:`, item.outerHTML.substring(0, 500) + '...');
    
    // 改进的标题提取逻辑
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
      if (titleElem) {
        console.log(`Content Script: 使用选择器 "${selector}" 找到标题元素`);
        break;
      }
    }
    
    if (!titleElem) {
      // 尝试获取item的所有a标签，寻找指向书籍详情页的链接
      const allLinks = item.querySelectorAll('a');
      for (const link of allLinks) {
        const href = link.getAttribute('href');
        if (href && (href.startsWith('https://book.douban.com/subject/') || href.startsWith('/subject/'))) {
          titleElem = link;
          console.log('Content Script: 从链接中找到标题元素');
          break;
        }
      }
    }
    
    if (!titleElem) {
      console.log('Content Script: 跳过项目，没有标题');
      return;
    }
    
    const title = titleElem.getAttribute('title') || titleElem.textContent.trim();
    const url = titleElem.getAttribute('href');
    
    console.log(`Content Script: 提取到书名: ${title}`);
    console.log(`Content Script: 提取到链接: ${url}`);
    
    // 改进的出版信息提取逻辑
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
        console.log(`Content Script: 使用选择器 "${selector}" 找到出版信息`);
        break;
      }
    }
    
    // 如果没有找到出版信息，尝试查找包含出版相关关键词的元素
    if (!pubText) {
      const allElements = item.querySelectorAll('*');
      for (const elem of allElements) {
        const text = elem.textContent.trim();
        if (text && (text.includes('出版社') || text.includes('出版') || text.includes('年'))) {
          pubText = text;
          console.log('Content Script: 从包含出版关键词的元素中找到出版信息');
          break;
        }
      }
    }
    
    console.log(`Content Script: 提取到出版信息: ${pubText}`);
    
    const pubParts = pubText.split(' / ');
    let author = '未知作者';
    let publisher = '未知出版社';
    let publishDate = '未知日期';
    
    // 提取作者、出版社和出版日期的逻辑保持不变，但增加调试信息
    if (pubParts.length > 0) {
      // 处理作者信息 - 可能包含翻译者
      let authorParts = [];
      let inAuthorSection = true;
      
      // 智能识别出版日期和出版社
      let dateFound = false;
      let publisherFound = false;
      
      // 首先查找日期（通过正则表达式匹配）
      const dateRegex = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/;
      
      // 遍历出版信息，优先识别日期和出版社
      for (let i = 0; i < pubParts.length; i++) {
        const part = pubParts[i].trim();
        const dateMatch = part.match(dateRegex);
        
        // 检查是否为出版社（通过关键词匹配）
        const isPublisher = ['出版社', '出版公司', '书局', '书店', '杂志社', '杂志', '期刊社', '文化', '社'].some(keyword => part.includes(keyword));
        
        if (dateMatch && !dateFound) {
          // 找到日期，结束作者识别
          inAuthorSection = false;
          const year = dateMatch[1];
          const month = dateMatch[2] || '01';
          const day = dateMatch[3] || '01';
          publishDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          dateFound = true;
        } else if (isPublisher && !publisherFound) {
          // 找到出版社，结束作者识别
          inAuthorSection = false;
          publisher = part;
          publisherFound = true;
        } else if (inAuthorSection) {
          // 处理作者部分，包括翻译者等
          // 检查是否为翻译者标识
          if (part.includes('译') || part.includes('译者') || part.includes('翻译')) {
            // 这是翻译者信息，跳过，不包含在作者字段
            inAuthorSection = false;
          } else {
            // 这是作者信息，添加到作者列表
            authorParts.push(part);
          }
        } else if (!publisherFound) {
          // 尝试识别出版社
          // 排除定价（包含"元"的字符串）
          if (!part.includes('元') && !part.includes('CNY') && !part.includes('译') && !part.includes('译者')) {
            publisher = part;
            publisherFound = true;
          }
        }
      }
      
      // 合并作者信息
      author = authorParts.join(' / ') || '未知作者';
    }
    
    console.log(`Content Script: 提取到作者: ${author}`);
    console.log(`Content Script: 提取到出版社: ${publisher}`);
    console.log(`Content Script: 提取到出版日期: ${publishDate}`);
    
    // 提取评分 - 使用多种方法确保能正确提取
    let ratingText = null;
    
    // 方法1: 直接查找rating_nums元素（优先级最高）
    const ratingNums = item.querySelector('.rating_nums');
    if (ratingNums) {
      ratingText = ratingNums.textContent.trim();
      console.log('Content Script: 从.rating_nums获取评分:', ratingText);
    }
    
    // 方法2: 查找star-rating元素
    if (!ratingText) {
      const starRating = item.querySelector('.star-rating');
      if (starRating) {
        // 豆瓣使用star-rating-*类来表示评分，如star-rating-50表示5分
        const classList = starRating.className;
        const ratingMatch = classList.match(/star-rating-(\d+)/);
        if (ratingMatch) {
          const ratingValue = parseInt(ratingMatch[1]) / 10;
          ratingText = ratingValue.toString();
          console.log('Content Script: 从star-rating-*获取评分:', ratingText);
        }
      }
    }
    
    // 方法3: 从ratingX-t元素中提取评分，如rating5-t表示5分
    if (!ratingText) {
      const ratingElements = item.querySelectorAll('[class^="rating"][class$="-t"]');
      if (ratingElements.length > 0) {
        for (const elem of ratingElements) {
          const classList = elem.className;
          const ratingMatch = classList.match(/rating(\d+)-t/);
          if (ratingMatch) {
            const ratingValue = parseInt(ratingMatch[1]);
            ratingText = ratingValue.toString();
            console.log('Content Script: 从ratingX-t获取评分:', ratingText);
            break;
          }
        }
      }
    }
    
    // 方法4: 查找interest-rating元素下的所有子元素
    if (!ratingText) {
      const interestRating = item.querySelector('.interest-rating');
      if (interestRating) {
        // 从文本中提取评分
        const textContent = interestRating.textContent.trim();
        console.log('Content Script: interest-rating文本内容:', textContent);
        const textMatch = textContent.match(/(\d+(?:\.\d+)?)分/);
        if (textMatch) {
          ratingText = textMatch[1];
          console.log('Content Script: 从文本中提取评分:', ratingText);
        }
      }
    }
    
    // 方法5: 查找item下的所有评分相关元素
    if (!ratingText) {
      const allRatingElements = item.querySelectorAll('[class*="rating"]');
      console.log('Content Script: 找到所有评分相关元素:', allRatingElements.length);
      for (const elem of allRatingElements) {
        console.log('Content Script: 评分相关元素HTML:', elem.outerHTML);
        const elemText = elem.textContent.trim();
        if (elemText) {
          // 简化正则表达式，直接匹配数字
          const textMatch = elemText.match(/\d+(\.\d+)?/);
          if (textMatch && !isNaN(textMatch[0])) {
            ratingText = textMatch[0];
            console.log('Content Script: 从评分相关元素提取评分:', ratingText);
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
          console.log('Content Script: 从所有元素提取评分:', ratingText);
          break;
        }
      }
    }
    
    const rating = ratingText ? ratingText + '分' : '未评分';
    console.log(`Content Script: 提取到评分: ${rating}`);
    
    // 改进的书评提取逻辑
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
        console.log(`Content Script: 使用选择器 "${selector}" 找到书评`);
        break;
      }
    }
    console.log(`Content Script: 提取到书评: ${review}`);
    
    // 改进的日期提取逻辑
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
        console.log(`Content Script: 使用选择器 "${selector}" 找到日期`);
        break;
      }
    }
    
    // 如果没有找到日期，尝试从文本中提取
    if (date === '未知日期') {
      const allText = item.textContent;
      // 匹配日期格式，如"2023-01-01"、"2023/01/01"、"2023年1月1日"等
      const dateRegex = /(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?)/;
      const dateMatch = allText.match(dateRegex);
      if (dateMatch) {
        date = dateMatch[1];
        console.log(`Content Script: 从文本中提取到日期: ${date}`);
      }
    }
    console.log(`Content Script: 提取到日期: ${date}`);
    
    books.push({
      title,
      author,
      publishDate,
      publisher,
      url,
      rating,
      review,
      date
    });
    console.log(`Content Script: 成功添加书籍到列表`);
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