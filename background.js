// background.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchGoodreads') {
    console.log('Background: Fetching URL:', request.url); // 调试日志

    fetch(request.url)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.text();
      })
      .then(data => {
        console.log('Background: Fetched data successfully');
        sendResponse({ data });
      })
      .catch(error => {
        console.error('Background: Error fetching data:', error);
        sendResponse({ data: null, error: error.message });
      });
    return true; // 表示异步回复
  }
});



// 创建右键菜单项
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "queryGoodreadsLevel",
    title: "查询Goodreads等级",
    contexts: ["all"]
  });
});


// 监听菜单点击事件
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "queryGoodreadsLevel") {
    chrome.tabs.sendMessage(tab.id, { action: "addGoodreadsRatings" }); // 调用查询等级
  }
});


// 监听网络请求
chrome.webRequest.onCompleted.addListener(
  function(details) {
    if (details.url.includes('https://atlas-fab.lexile.com/free/search')) {
      chrome.tabs.sendMessage(details.tabId, { action: "addGoodreadsRatings" }); // 调用查询等级
    }
  },
  {urls: ["<all_urls>"]}
);

