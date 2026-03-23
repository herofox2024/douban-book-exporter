// 内容脚本 - 运行在豆瓣页面上下文中
// 注：项目已改用 Rexxar API 爬取数据，页面解析逻辑已弃用，仅保留用户ID提取功能

// 提取当前页面的用户ID
function extractUserId() {
  const match = window.location.pathname.match(/\/people\/(\w+)/);
  return match ? match[1] : '';
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

    case 'extractUsername':
      sendResponse({ username: extractUsername() });
      break;

    default:
      sendResponse({ error: '未知操作' });
  }
});

// 当页面加载完成时，自动向后台发送用户ID
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
