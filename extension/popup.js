// 状态更新函数
function updateStatus(message) {
  document.getElementById('status').textContent = message;
}

// 进度更新函数
function updateProgress(percent) {
  document.getElementById('progressFill').style.width = percent + '%';
  document.getElementById('progressText').textContent = percent + '%';
}

// 更新用户信息（使用 DOM 操作避免 XSS）
function updateUserInfo(username) {
  const currentUserP = document.getElementById('currentUser');
  currentUserP.textContent = '';
  if (username) {
    currentUserP.textContent = '当前检测到的用户：';
    const strong = document.createElement('strong');
    strong.textContent = username;
    currentUserP.appendChild(strong);
  } else {
    currentUserP.textContent = '未检测到登录用户';
  }
}

// 获取当前登录用户
function getCurrentUser() {
  chrome.cookies.get({
    url: 'https://www.douban.com',
    name: 'bid'
  }, (cookie) => {
    if (chrome.runtime.lastError) {
      console.error('获取cookie失败:', chrome.runtime.lastError);
      updateUserInfo(null);
      return;
    }
    if (cookie) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          console.error('查询标签页失败:', chrome.runtime.lastError);
          updateUserInfo('已登录用户');
          return;
        }
        if (tabs[0] && tabs[0].url.includes('douban.com')) {
          const currentUrl = tabs[0].url;

          const urlMatch = currentUrl.match(/\/people\/(\w+)/);
          if (urlMatch) {
            updateUserInfo(urlMatch[1]);
            return;
          }

          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: () => {
              let username = document.querySelector('.nav-user-account .nav-login-info a')?.textContent?.trim() || '';
              if (username) return username;

              const titleMatch = document.title.match(/^(.*?)的我读过/);
              if (titleMatch) return titleMatch[1].trim();

              const titleMatch2 = document.title.match(/^(.*?)的/);
              if (titleMatch2 && titleMatch2[1].trim() !== '我读过') return titleMatch2[1].trim();

              const profileLink = document.querySelector('a[href^="/people/"]');
              if (profileLink) {
                const hrefMatch = profileLink.getAttribute('href').match(/\/people\/(\w+)/);
                if (hrefMatch) return hrefMatch[1];
              }

              return '未知用户';
            }
          }, (results) => {
            if (chrome.runtime.lastError) {
              console.error('执行脚本失败:', chrome.runtime.lastError);
              updateUserInfo('未知用户');
              return;
            }
            if (results && results[0] && results[0].result && results[0].result !== '我读过') {
              updateUserInfo(results[0].result);
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

// 获取用户ID：优先使用手动输入，其次从当前标签页URL提取
function resolveUserId(callback) {
  const manualId = document.getElementById('doubanId').value.trim();
  if (manualId) {
    callback(manualId);
    return;
  }
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) {
      console.error('查询标签页失败:', chrome.runtime.lastError);
      callback('');
      return;
    }
    let userId = '';
    if (tabs[0] && tabs[0].url.includes('douban.com')) {
      const urlMatch = tabs[0].url.match(/\/people\/(\w+)/);
      if (urlMatch) userId = urlMatch[1];
    }
    callback(userId);
  });
}

// 设置按钮状态
function setButtonState(buttonId, disabled, originalText = null) {
  const button = document.getElementById(buttonId);
  button.disabled = disabled;
  if (originalText !== null) {
    button.textContent = originalText;
  }
}

// 加载设置
function loadSettings() {
  chrome.storage.local.get('autoCrawlEnabled', (result) => {
    if (chrome.runtime.lastError) {
      console.error('加载设置失败:', chrome.runtime.lastError);
    } else {
      // 默认启用自动爬取
      document.getElementById('autoCrawlEnabled').checked = result.autoCrawlEnabled !== false;
    }
  });
}

// 保存设置
function saveSettings() {
  const autoCrawlEnabled = document.getElementById('autoCrawlEnabled').checked;
  chrome.storage.local.set({ autoCrawlEnabled }, () => {
    if (chrome.runtime.lastError) {
      console.error('保存设置失败:', chrome.runtime.lastError);
    }
  });
}

// 初始化
function init() {
  getCurrentUser();
  loadSettings();
  updateStatus('就绪');
  updateProgress(0);
  // 初始化按钮状态
  setButtonState('crawlBtn', false, '开始爬取书评');
  setButtonState('exportBtn', false, '导出数据');
  setButtonState('clearBtn', false, '清空数据');
}

// 爬取按钮点击事件
document.getElementById('crawlBtn').addEventListener('click', () => {
  // 防止重复点击
  if (document.getElementById('crawlBtn').disabled) {
    return;
  }
  
  setButtonState('crawlBtn', true);
  updateStatus('正在爬取数据...');
  updateProgress(0);

  const manualDoubanId = document.getElementById('doubanId').value.trim();

  chrome.runtime.sendMessage({
    action: 'startCrawl',
    userId: manualDoubanId
  }, (response) => {
    setButtonState('crawlBtn', false);
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
  // 防止重复点击
  if (document.getElementById('exportBtn').disabled) {
    return;
  }
  
  const exportFormat = document.querySelector('input[name="exportFormat"]:checked').value;
  setButtonState('exportBtn', true);
  updateStatus(`正在导出${exportFormat.toUpperCase()}...`);
  updateProgress(0);

  resolveUserId((userId) => {
    chrome.runtime.sendMessage({
      action: 'exportData',
      format: exportFormat,
      userId: userId
    }, (response) => {
      setButtonState('exportBtn', false);
      if (response && response.success) {
        updateStatus(`导出${exportFormat.toUpperCase()}成功！`);
        updateProgress(100);
      } else {
        updateStatus(`导出失败：${response?.error || '未知错误'}`);
        updateProgress(0);
      }
    });
  });
});

// 清空数据按钮点击事件
document.getElementById('clearBtn').addEventListener('click', () => {
  // 防止重复点击
  if (document.getElementById('clearBtn').disabled) {
    return;
  }
  
  if (confirm('确定要清空所有爬取的数据吗？')) {
    setButtonState('clearBtn', true);
    updateStatus('正在清空数据...');

    resolveUserId((userId) => {
      chrome.runtime.sendMessage({
        action: 'clearData',
        userId: userId
      }, (response) => {
        setButtonState('clearBtn', false);
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

// 自动爬取开关事件
document.getElementById('autoCrawlEnabled').addEventListener('change', saveSettings);

// 页面初始化 - 使用 DOMContentLoaded 或检查 readyState 确保初始化
function onReady(callback) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback);
  } else {
    callback();
  }
}

onReady(init);
