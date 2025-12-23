// 状态更新函数
function updateStatus(message) {
  document.getElementById('status').textContent = message;
}

// 进度更新函数
function updateProgress(percent) {
  document.getElementById('progressFill').style.width = percent + '%';
  document.getElementById('progressText').textContent = percent + '%';
}

// 更新用户信息
function updateUserInfo(username) {
  const userInfoDiv = document.getElementById('userInfo');
  if (username) {
    userInfoDiv.innerHTML = `<p>当前用户：<strong>${username}</strong></p>`;
    userInfoDiv.style.backgroundColor = '#e8f5e8';
  } else {
    userInfoDiv.innerHTML = '<p>请先登录豆瓣！</p>';
    userInfoDiv.style.backgroundColor = '#ffebee';
  }
}

// 获取当前登录用户
function getCurrentUser() {
  chrome.cookies.get({
    url: 'https://www.douban.com',
    name: 'bid'
  }, (cookie) => {
    if (cookie) {
      // 尝试从当前页面获取用户名
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url.includes('douban.com')) {
          const currentUrl = tabs[0].url;
          console.log('当前页面URL:', currentUrl);
          
          // 优先从URL提取用户名，这是最可靠的方式
          const urlMatch = currentUrl.match(/\/people\/(\w+)/);
          if (urlMatch) {
            const username = urlMatch[1];
            console.log('从URL直接提取到用户名:', username);
            updateUserInfo(username);
            return;
          }
          
          // 如果URL提取失败，再尝试从页面提取
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: () => {
              console.log('Popup Script: 开始从页面提取用户名');
              
              // 方法1: 从导航栏获取用户名
              let username = document.querySelector('.nav-user-account .nav-login-info a')?.textContent || '';
              username = username.trim();
              if (username) {
                console.log('Popup Script: 从导航栏获取到用户名:', username);
                return username;
              }
              
              // 方法2: 从页面标题获取（改进的正则表达式）
              const titleMatch = document.title.match(/^(.*?)的我读过/);
              if (titleMatch) {
                username = titleMatch[1].trim();
                console.log('Popup Script: 从页面标题获取到用户名:', username);
                return username;
              }
              
              // 方法2.1: 更通用的页面标题匹配
              const titleMatch2 = document.title.match(/^(.*?)的/);
              if (titleMatch2) {
                username = titleMatch2[1].trim();
                // 过滤掉常见的错误匹配
                if (username !== '我读过') {
                  console.log('Popup Script: 从页面标题获取到用户名:', username);
                  return username;
                }
              }
              
              // 方法3: 从个人链接获取
              const profileLink = document.querySelector('a[href^="/people/"]');
              if (profileLink) {
                const href = profileLink.getAttribute('href');
                const hrefMatch = href.match(/\/people\/(\w+)/);
                if (hrefMatch) {
                  username = hrefMatch[1];
                  console.log('Popup Script: 从个人链接获取到用户名:', username);
                  return username;
                }
              }
              
              console.log('Popup Script: 无法从页面提取用户名');
              return '未知用户';
            }
          }, (results) => {
            if (results && results[0] && results[0].result) {
              const username = results[0].result;
              // 过滤掉常见的错误匹配
              if (username === '我读过') {
                console.log('过滤掉错误的用户名匹配: 我读过');
                updateUserInfo('未知用户');
              } else {
                updateUserInfo(username);
              }
            } else {
              updateUserInfo('未知用户');
            }
          });
        } else {
          updateUserInfo('已登录用户');
        }
      });
    } else {
      updateUserInfo(null);
    }
  });
}

// 初始化
function init() {
  getCurrentUser();
  updateStatus('就绪');
  updateProgress(0);
}

// 爬取按钮点击事件
document.getElementById('crawlBtn').addEventListener('click', () => {
  updateStatus('正在爬取数据...');
  updateProgress(0);
  
  // 向后台发送爬取请求
  chrome.runtime.sendMessage({
    action: 'startCrawl'
  }, (response) => {
    if (response && response.success) {
      updateStatus('爬取完成！');
      updateProgress(100);
    } else {
      updateStatus(`爬取失败：${response?.error || '未知错误'}`);
      updateProgress(0);
    }
  });
});

// 导出按钮点击事件
document.getElementById('exportBtn').addEventListener('click', () => {
  const exportFormat = document.querySelector('input[name="exportFormat"]:checked').value;
  updateStatus(`正在导出${exportFormat.toUpperCase()}...`);
  updateProgress(0);
  
  // 先验证当前页面是否是豆瓣已读书单页面
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url.includes('douban.com')) {
      const currentUrl = tabs[0].url;
      // 检查URL是否包含用户ID
      const urlMatch = currentUrl.match(/\/people\/(\w+)/);
      if (urlMatch) {
        const userId = urlMatch[1];
        console.log('从URL提取到用户ID:', userId);
        
        // 向后台发送导出请求，带上用户ID
        chrome.runtime.sendMessage({
          action: 'exportData',
          format: exportFormat,
          userId: userId
        }, (response) => {
          if (response && response.success) {
            updateStatus(`导出${exportFormat.toUpperCase()}成功！`);
            updateProgress(100);
          } else {
            updateStatus(`导出失败：${response?.error || '未知错误'}`);
            updateProgress(0);
          }
        });
      } else {
        // 页面不是已读书单页面，直接导出
        chrome.runtime.sendMessage({
          action: 'exportData',
          format: exportFormat
        }, (response) => {
          if (response && response.success) {
            updateStatus(`导出${exportFormat.toUpperCase()}成功！`);
            updateProgress(100);
          } else {
            updateStatus(`导出失败：${response?.error || '未知错误'}`);
            updateProgress(0);
          }
        });
      }
    } else {
      // 页面不是豆瓣页面，直接导出
      chrome.runtime.sendMessage({
        action: 'exportData',
        format: exportFormat
      }, (response) => {
        if (response && response.success) {
          updateStatus(`导出${exportFormat.toUpperCase()}成功！`);
          updateProgress(100);
        } else {
          updateStatus(`导出失败：${response?.error || '未知错误'}`);
          updateProgress(0);
        }
      });
    }
  });
});

// 清空数据按钮点击事件
document.getElementById('clearBtn').addEventListener('click', () => {
  if (confirm('确定要清空所有爬取的数据吗？')) {
    updateStatus('正在清空数据...');
    
    // 先获取当前页面的用户ID，与导出数据时保持一致
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      let userId = null;
      if (tabs[0] && tabs[0].url.includes('douban.com')) {
        const currentUrl = tabs[0].url;
        const urlMatch = currentUrl.match(/\/people\/(\w+)/);
        if (urlMatch) {
          userId = urlMatch[1];
          console.log('从URL提取到用户ID:', userId);
        }
      }
      
      // 向后台发送清空请求，带上用户ID
      chrome.runtime.sendMessage({
        action: 'clearData',
        userId: userId
      }, (response) => {
        if (response && response.success) {
          updateStatus('数据已清空！');
          updateProgress(0);
        } else {
          updateStatus(`清空失败：${response?.error || '未知错误'}`);
        }
      });
    });
  }
});

// 监听来自后台的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateProgress') {
    updateProgress(message.progress);
  } else if (message.action === 'updateStatus') {
    updateStatus(message.status);
  }
});

// 页面加载完成后初始化
window.addEventListener('load', init);