function updateStatus(message) {
  document.getElementById('status').textContent = message;
}

function updateProgress(percent) {
  document.getElementById('progressFill').style.width = `${percent}%`;
  document.getElementById('progressText').textContent = `${percent}%`;
}

function updateUserInfo(username) {
  const container = document.getElementById('currentUser');
  container.innerHTML = '';

  const icon = document.createElement('span');
  const text = document.createElement('span');

  if (username) {
    container.classList.remove('empty');
    icon.textContent = '✓';
    text.textContent = `检测到用户：${username}`;
  } else {
    container.classList.add('empty');
    icon.textContent = '!';
    text.textContent = '未检测到用户，请手动输入';
  }

  container.appendChild(icon);
  container.appendChild(text);
}

function setButtonState(id, disabled) {
  document.getElementById(id).disabled = disabled;
}

function getSelectedTargets() {
  return Array.from(document.querySelectorAll('input[name="crawlTarget"]:checked'))
    .map((input) => input.value);
}

function saveSelectedTargets() {
  const targets = getSelectedTargets();
  chrome.storage.local.set({ crawlTargets: targets }, () => void chrome.runtime.lastError);
}

function loadSettings() {
  chrome.storage.local.get(['autoCrawlEnabled', 'crawlTargets'], (result) => {
    if (chrome.runtime.lastError) {
      return;
    }

    document.getElementById('autoCrawlEnabled').checked = result.autoCrawlEnabled !== false;

    const selectedTargets = Array.isArray(result.crawlTargets) && result.crawlTargets.length
      ? result.crawlTargets
      : ['interests'];

    document.querySelectorAll('input[name="crawlTarget"]').forEach((input) => {
      input.checked = selectedTargets.includes(input.value);
    });
  });
}

function saveAutoCrawlSetting() {
  chrome.storage.local.set({
    autoCrawlEnabled: document.getElementById('autoCrawlEnabled').checked,
  }, () => void chrome.runtime.lastError);
}

function getCurrentUser() {
  chrome.cookies.get({ url: 'https://www.douban.com', name: 'bid' }, (cookie) => {
    if (chrome.runtime.lastError || !cookie) {
      updateUserInfo(null);
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError || !tabs[0]) {
        updateUserInfo('已登录用户');
        return;
      }

      const tab = tabs[0];
      const urlMatch = (tab.url || '').match(/\/people\/(\w+)/);
      if (urlMatch) {
        updateUserInfo(urlMatch[1]);
        return;
      }

      if (!(tab.url || '').includes('douban.com')) {
        updateUserInfo('已登录用户');
        return;
      }

      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const pathMatch = window.location.pathname.match(/\/people\/(\w+)/);
          if (pathMatch) {
            return pathMatch[1];
          }

          const profileLink = document.querySelector('a[href^="/people/"]');
          const href = profileLink?.getAttribute('href') || '';
          const hrefMatch = href.match(/\/people\/(\w+)/);
          return hrefMatch ? hrefMatch[1] : '';
        },
      }, (results) => {
        if (chrome.runtime.lastError) {
          updateUserInfo('已登录用户');
          return;
        }
        updateUserInfo(results?.[0]?.result || '已登录用户');
      });
    });
  });
}

function resolveUserId(callback) {
  const manualId = document.getElementById('doubanId').value.trim();
  if (manualId) {
    callback(manualId);
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError || !tabs[0]) {
      callback('');
      return;
    }

    const match = (tabs[0].url || '').match(/\/people\/(\w+)/);
    callback(match ? match[1] : '');
  });
}

function initFormatButtons() {
  document.querySelectorAll('.format-btn').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.format-btn').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
    });
  });
}

function initTargetCheckboxes() {
  document.querySelectorAll('input[name="crawlTarget"]').forEach((input) => {
    input.addEventListener('change', () => {
      if (!getSelectedTargets().length) {
        input.checked = true;
      }
      saveSelectedTargets();
    });
  });
}

function initActions() {
  document.getElementById('crawlBtn').addEventListener('click', () => {
    const targets = getSelectedTargets();
    if (!targets.length) {
      updateStatus('请至少选择一个抓取项目');
      return;
    }

    setButtonState('crawlBtn', true);
    updateStatus('准备抓取...');
    updateProgress(0);

    chrome.runtime.sendMessage({
      action: 'startCrawl',
      userId: document.getElementById('doubanId').value.trim(),
      targets,
    }, (response) => {
      setButtonState('crawlBtn', false);
      if (!response?.success) {
        updateStatus(`抓取失败：${response?.error || '未知错误'}`);
        updateProgress(0);
        return;
      }

      const counts = response.counts || {};
      updateProgress(100);
      updateStatus(`抓取完成：书籍 ${counts.interests || 0} / 书评 ${counts.reviews || 0} / 笔记 ${counts.annotations || 0}`);
    });
  });

  document.getElementById('exportBtn').addEventListener('click', () => {
    const format = document.querySelector('.format-btn.active')?.dataset.format || 'csv';
    setButtonState('exportBtn', true);
    updateStatus(`正在导出 ${format.toUpperCase()}...`);

    resolveUserId((userId) => {
      chrome.runtime.sendMessage({
        action: 'exportData',
        format,
        userId,
      }, (response) => {
        setButtonState('exportBtn', false);
        if (!response?.success) {
          updateStatus(`导出失败：${response?.error || '未知错误'}`);
          return;
        }
        updateProgress(100);
        updateStatus(`导出 ${format.toUpperCase()} 成功`);
      });
    });
  });

  document.getElementById('browseBtn').addEventListener('click', () => {
    resolveUserId((userId) => {
      const target = userId ? `explorer.html?userId=${encodeURIComponent(userId)}` : 'explorer.html';
      chrome.tabs.create({ url: chrome.runtime.getURL(target) });
    });
  });

  document.getElementById('clearBtn').addEventListener('click', () => {
    if (!confirm('确定要清空当前用户的本地备份数据吗？')) {
      return;
    }

    setButtonState('clearBtn', true);
    updateStatus('正在清空数据...');

    resolveUserId((userId) => {
      chrome.runtime.sendMessage({
        action: 'clearData',
        userId,
      }, (response) => {
        setButtonState('clearBtn', false);
        if (!response?.success) {
          updateStatus(`清空失败：${response?.error || '未知错误'}`);
          return;
        }
        updateProgress(0);
        updateStatus('数据已清空');
      });
    });
  });
}

function initMessageListener() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'updateProgress') {
      updateProgress(message.progress);
    }
    if (message.action === 'updateStatus') {
      updateStatus(message.status);
    }
  });
}

function init() {
  getCurrentUser();
  loadSettings();
  initFormatButtons();
  initTargetCheckboxes();
  initActions();
  initMessageListener();

  document.getElementById('autoCrawlEnabled').addEventListener('change', saveAutoCrawlSetting);

  updateStatus('就绪');
  updateProgress(0);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
