// content.js

// 解析Goodreads页面中的评分信息以及书名和作者
function parseBookData(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // 使用更具体的选择器来定位包含所有信息的元素
  const infoElement = doc.querySelector("#bodycontainer .mainContentContainer .mainContent .mainContentFloat .leftContainer table tbody tr td:nth-child(2)");

  if (infoElement) {
    const textContent = infoElement.textContent;

    // 提取平均评分和评分数量
    const ratingMatch = textContent.match(/(\d+\.\d+) avg rating — ([\d,]+) ratings/);

    // 提取出版年份 - 使用更灵活的正则表达式
    const publishedMatch = textContent.match(/published\s+(\d{4})/);

    // 提取版本数量
    const editionsMatch = textContent.match(/(\d+) editions/);

    // 提取书名
    const bookNameElement = infoElement.querySelector('.bookTitle span[itemprop="name"]');
    const bookName = bookNameElement ? bookNameElement.textContent.trim() : null;

    // 提取作者信息
    const authorContainers = infoElement.querySelectorAll('.authorName__container');
    const authors = Array.from(authorContainers).map(container => {
      const nameElement = container.querySelector('.authorName span[itemprop="name"]');
      const name = nameElement ? nameElement.textContent.trim() : '';

      const roleElement = container.querySelector('.authorName__container .role');
      const role = roleElement ? roleElement.textContent.trim() : '';

      return role ? `${name} ${role}` : name;
    }).join(', ');

    return {
      book_name: bookName,
      Author: authors,
      avg_rating: ratingMatch ? parseFloat(ratingMatch[1]) : null,
      ratings: ratingMatch ? parseInt(ratingMatch[2].replace(/,/g, '')) : null,
      published: publishedMatch ? parseInt(publishedMatch[1]) : null,
      editions: editionsMatch ? parseInt(editionsMatch[1]) : null
    };
  }

  // 如果没有找到信息，返回null
  return null;
}

// 在目标页面上添加评分信息的容器
function addRatingContainer(bookElement) {
  const ratingDiv = document.createElement('div');
  ratingDiv.className = 'goodreads-rating';
  ratingDiv.style.border = "1px solid #ccc";
  ratingDiv.style.padding = "10px";
  ratingDiv.style.marginTop = "10px";
  ratingDiv.style.backgroundColor = "#f9f9f9";
  ratingDiv.textContent = 'Goodreads 评分查询中...';
  bookElement.appendChild(ratingDiv);
  return ratingDiv;
}

// 获取书名并查询Goodreads
async function fetchGoodreadsRating(bookTitle) {
  // 检查缓存
  const cacheKey = "fetchGoodreadsRating:cache:" + bookTitle;
  const cachedData = await chrome.storage.local.get(cacheKey);
  if (cachedData[cacheKey]) {
    console.log(`Content: 使用缓存数据 for "${bookTitle}"`);
    return cachedData[cacheKey];
  }

  const query = encodeURIComponent(bookTitle);
  const goodreadsSearchURL = `https://www.goodreads.com/search?utf8=%E2%9C%93&q=${query}&search_type=books`;

  try {
    console.log('Content: Sending message to fetch URL:', goodreadsSearchURL); // 调试日志

    // 发送消息到后台脚本
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'fetchGoodreads', url: goodreadsSearchURL },
        (response) => {
          console.log('Content: Received response from background:', response); // 调试日志
          resolve(response);
        }
      );
    });

    if (response && response.data) {
      const bookData = parseBookData(response.data);

      // 存储到缓存
      if (bookData) {
        let storageObj = {};
        storageObj[cacheKey] = bookData;
        chrome.storage.local.set(storageObj);
      }

      return bookData;
    } else {
      console.warn(`Content: No data received for "${bookTitle}". Error: ${response?.error || 'Unknown'}`);
    }

    return null;
  } catch (error) {
    console.error('Content: Error fetching Goodreads data:', error);
    return null;
  }
}

// 解析书名和作者，针对不同网站使用不同的选择器
function parseNamesWithBookElement(bookElement, site) {
  if (site === 'arbookfind') {
    // 原有 arbookfind.com 的解析逻辑
    const titleElement = bookElement.querySelector("#book-title");
    const title = titleElement ? titleElement.textContent.trim() : "";

    const pElement = bookElement.querySelector(".book-detail p");
    let author = "";

    if (pElement) {
      if (pElement.firstChild && pElement.firstChild.nodeType === Node.TEXT_NODE) {
        author = pElement.firstChild.textContent.trim();
      } else {
        for (let node of pElement.childNodes) {
          if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== "") {
            author = node.textContent.trim();
            break;
          }
        }
      }
    }

    return { 'title': title, 'author': author };
  } else if (site === 'lexile') {
    // 新增 hub.lexile.com 的解析逻辑
    const titleElement = bookElement.querySelector('[data-testid="book-title"]');
    const title = titleElement ? titleElement.textContent.trim() : "";

    const authorElement = bookElement.querySelector('[data-testid="book-authors"]');
    const author = authorElement ? authorElement.textContent.replace(/^por\s+/i, '').trim() : "";

    return { 'title': title, 'author': author };
  }

  return { 'title': '', 'author': '' };
}

// 主函数：遍历书籍列表并添加评分信息
async function addGoodreadsRatings() {
  const hostname = window.location.hostname;

  if (hostname === 'www.arbookfind.com') {
    // 处理 arbookfind.com
    const bookElements = document.querySelectorAll(".book-result .book-detail");

    for (const bookElement of bookElements) {
      const names = parseNamesWithBookElement(bookElement, 'arbookfind');
      const bookTitle = names['title'];
      const bookAuthor = names['author'];

      if (bookTitle) {
        const ratingContainer = addRatingContainer(bookElement);
        const ratingData = await fetchGoodreadsRating(bookTitle + " " + bookAuthor);
        const goodreadsSearchURL = `https://www.goodreads.com/search?utf8=%E2%9C%93&q=${encodeURIComponent(bookTitle + " " + bookAuthor)}&search_type=books`;

        if (ratingData) {
          ratingContainer.innerHTML = `
            <p><strong>Goodreads 评分匹配书籍:</strong> <a target="_blank" href="${goodreadsSearchURL}">《${ratingData.book_name || 'N/A'}》 作者：${ratingData.Author || 'N/A'}</a></p>
            <p><strong>评分:</strong> ${ratingData.avg_rating || 'N/A'} / 5</p>
            <p><strong>评分数量:</strong> ${ratingData.ratings ? ratingData.ratings.toLocaleString() : 'N/A'}</p>
            <p><strong>出版年份:</strong> ${ratingData.published || 'N/A'}</p>
            <p><strong>版本数量:</strong> ${ratingData.editions || 'N/A'}</p>
          `;
        } else {
          ratingContainer.textContent = '未找到评分信息';
        }
      }
    }
  } else if (hostname === 'hub.lexile.com') {

    // 修改list属性
    const listelement = document.querySelector("#content > div > form > div > div.sc-camqpD.wsFoV > div.results-body > div.search-results > div > div.sc-fuTSoq.lijBAN");
    if (listelement) {
        listelement.style.gridAutoRows = 'auto';
    } 


    // 处理 hub.lexile.com
    const bookElements = document.querySelectorAll("#content > div > form > div > div.sc-camqpD.wsFoV > div.results-body > div.search-results > div > div.sc-fuTSoq.lijBAN > div.sc-ZbTNT");

    for (const bookElement of bookElements) {
      const names = parseNamesWithBookElement(bookElement, 'lexile');
      const bookTitle = names['title'];
      const bookAuthor = names['author'];

      if (bookTitle) {
        bookElement.style.height = "600px";
        // 定位的位置，单个item 底部
        const summaryElement = bookElement.querySelector(".sc-eoVZPG.elboQH");

        // 如果存在，则不添加
        if(summaryElement.querySelector('.goodreads-rating') != null){
           continue;
        }

        if (summaryElement) {
          const ratingContainer = addRatingContainer(summaryElement);
          const ratingData = await fetchGoodreadsRating(bookTitle + " " + bookAuthor);
          const goodreadsSearchURL = `https://www.goodreads.com/search?utf8=%E2%9C%93&q=${encodeURIComponent(bookTitle + " " + bookAuthor)}&search_type=books`;

          if (ratingData) {
            ratingContainer.innerHTML = `
              <p><strong>Goodreads 评分匹配书籍:</strong> <a target="_blank" href="${goodreadsSearchURL}">《${ratingData.book_name || 'N/A'}》 作者：${ratingData.Author || 'N/A'}</a></p>
              <p><strong>评分:</strong> ${ratingData.avg_rating || 'N/A'} / 5</p>
              <p><strong>评分数量:</strong> ${ratingData.ratings ? ratingData.ratings.toLocaleString() : 'N/A'}</p>
              <p><strong>出版年份:</strong> ${ratingData.published || 'N/A'}</p>
              <p><strong>版本数量:</strong> ${ratingData.editions || 'N/A'}</p>
            `;
          } else {
            ratingContainer.textContent = '未找到评分信息';
          }
        }
      }
    }
  } else {
    console.log('Content: 当前网站不支持自动添加 Goodreads 评分信息。');
  }
}

// 等待页面加载完成后执行
window.addEventListener('load', () => {
  console.log('Content: Page loaded, adding Goodreads ratings...');
  addGoodreadsRatings();
});

// 监听来自后台脚本的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "addGoodreadsRatings") {
    addGoodreadsRatings();
    sendResponse({ status: "Function executed" });
  }
});
