// 内容脚本 - 运行在豆瓣页面上下文中

// 提取当前页面的用户ID
function extractUserId() {
  const match = window.location.pathname.match(/\/people\/(\w+)/);
  return match ? match[1] : '';
}

// 提取当前页面的书籍列表
function extractBooks() {
  const bookItems = document.querySelectorAll('.subject-item');
  const books = [];

  bookItems.forEach(item => {
    // 提取书名和链接
    const titleElem = item.querySelector('.info h2 a');
    const title = titleElem ? titleElem.getAttribute('title') || titleElem.textContent.trim() : '未知书名';
    const url = titleElem ? titleElem.getAttribute('href') : '#';

    // 提取作者和出版信息
    const pubElem = item.querySelector('.pub');
    const pubText = pubElem ? pubElem.textContent.trim() : '';
    const pubParts = pubText.split(' / ');
    const author = pubParts.length > 0 ? pubParts[0].trim() : '未知作者';
    const publisher = pubParts.length > 1 ? pubParts[1].trim() : '未知出版社';
    
    // 提取并格式化出版日期
    let publishDate = '未知日期';
    if (pubParts.length > 2) {
      const rawDate = pubParts[2].trim() || '';
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

    // 提取评分 - 使用多种方法确保能正确提取
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
        // 豆瓣使用star-rating-*类来表示评分，如star-rating-50表示5分
        const classList = starRating.className;
        const ratingMatch = classList.match(/star-rating-(\d+)/);
        if (ratingMatch) {
          const ratingValue = parseInt(ratingMatch[1]) / 10;
          ratingText = ratingValue.toString();
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
        const textMatch = textContent.match(/(\d+(?:\.\d+)?)分/);
        if (textMatch) {
          ratingText = textMatch[1];
        }
      }
    }
    
    // 方法5: 查找item下的所有评分相关元素
    if (!ratingText) {
      const allRatingElements = item.querySelectorAll('[class*="rating"]');
      for (const elem of allRatingElements) {
        const elemText = elem.textContent.trim();
        if (elemText) {
          // 简化正则表达式，直接匹配数字
          const textMatch = elemText.match(/\d+(\.\d+)?/);
          if (textMatch && !isNaN(textMatch[0])) {
            ratingText = textMatch[0];
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
          break;
        }
      }
    }
    
    const rating = ratingText ? ratingText + '分' : '未评分';

    // 提取书评
    const reviewElem = item.querySelector('.comment');
    const review = reviewElem ? reviewElem.textContent.trim() : '';

    // 提取评分日期
    const dateElem = item.querySelector('.date');
    const date = dateElem ? dateElem.textContent.trim() : '未知日期';

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
  });

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