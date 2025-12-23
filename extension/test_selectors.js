// 测试豆瓣读书页面选择器的脚本
// 用于检查为什么无法获取到书籍数据

(function() {
  console.log('=== 豆瓣读书页面选择器测试 ===');
  
  // 检查当前页面URL
  console.log('当前页面URL:', window.location.href);
  
  // 检查页面模式（网格/列表）
  const isGridMode = document.querySelector('.grid-view') !== null;
  console.log('页面模式:', isGridMode ? '网格模式' : '列表模式');
  
  // 测试各种选择器
  const selectors = [
    '.grid-view li',
    '.interest-list li',
    '.subject-item',
    '.book-list li',
    '.article .subject-item',
    '.interest-item'
  ];
  
  selectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    console.log(`选择器 "${selector}" 匹配到 ${elements.length} 个元素`);
    
    // 如果匹配到元素，输出前3个元素的HTML结构
    if (elements.length > 0) {
      console.log(`\n--- 第一个匹配元素的HTML结构 ---`);
      console.log(elements[0].outerHTML.substring(0, 1000) + '...');
      
      if (elements.length > 1) {
        console.log(`\n--- 第二个匹配元素的HTML结构 ---`);
        console.log(elements[1].outerHTML.substring(0, 1000) + '...');
      }
    }
  });
  
  // 检查页面中是否有任何与书籍相关的元素
  console.log('\n=== 检查页面中的书籍相关元素 ===');
  const bookRelatedSelectors = [
    '.info h2 a', // 标题
    '.rating_nums', // 评分
    '.comment', // 评论
    '.date', // 日期
    '.pub' // 出版信息
  ];
  
  bookRelatedSelectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    console.log(`选择器 "${selector}" 匹配到 ${elements.length} 个元素`);
  });
  
  // 检查页面的主要内容区域
  console.log('\n=== 检查页面主要内容区域 ===');
  const mainContentSelectors = [
    '#content',
    '.article',
    '.main',
    '.body'
  ];
  
  mainContentSelectors.forEach(selector => {
    const element = document.querySelector(selector);
    if (element) {
      console.log(`找到主要内容区域 "${selector}"`);
      console.log(`内容区域包含 ${element.children.length} 个子元素`);
      console.log(`内容区域HTML结构（前1000字符）：`, element.outerHTML.substring(0, 1000) + '...');
    } else {
      console.log(`未找到主要内容区域 "${selector}"`);
    }
  });
  
  console.log('\n=== 测试完成 ===');
})();
