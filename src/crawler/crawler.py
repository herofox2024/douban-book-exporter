import requests
import time
import re
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
from bs4 import BeautifulSoup
from datetime import datetime
from typing import Optional, Tuple, Dict, List
from src.database.database import DoubanBookDB
from src.utils.logger import logger
from fake_useragent import UserAgent

class DoubanCrawler:
    def __init__(self, db: DoubanBookDB, gui_callback=None):
        self.db = db
        self.gui_callback = gui_callback
        self.is_running = True
        self.ua = UserAgent()
        # 初始化请求头池（确保获取PC版页面）
        self.headers_pool = [
            {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Cache-Control': 'max-age=0',
                'DNT': '1',
                'Referer': 'https://book.douban.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Host': 'book.douban.com',
            },
            {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'max-age=0',
                'DNT': '1',
                'Referer': 'https://www.douban.com/',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Host': 'book.douban.com',
            }
        ]
        
    def log(self, message):
        """日志输出"""
        logger.info(message)
        if self.gui_callback:
            self.gui_callback.log(message)
    
    def update_status(self, status):
        """更新状态"""
        if self.gui_callback:
            self.gui_callback.update_status(status)
    
    def update_progress(self, value):
        """更新进度"""
        if self.gui_callback:
            self.gui_callback.update_progress(value)
    
    def check_stop_signal(self):
        """检查是否需要停止"""
        if self.gui_callback:
            return not self.gui_callback.is_crawling
        return not self.is_running
    
    def get_book_details(self, book_url, headers):
        """获取书籍详细信息：作者和出版年月"""
        try:
            time.sleep(1)
            
            # 确保请求头中的值都是ASCII字符
            safe_headers = {}
            for key, value in headers.items():
                # 确保值是字符串类型
                if not isinstance(value, str):
                    value = str(value)
                # 过滤掉非ASCII字符
                safe_headers[key] = ''.join([c if ord(c) < 128 else '?' for c in value])
            
            response = requests.get(book_url, headers=safe_headers, timeout=10)
            response.encoding = 'utf-8'  # 明确设置响应编码为UTF-8
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # 获取作者信息
            author = "未知作者"
            info_elem = soup.select_one('#info')
            if info_elem:
                info_text = info_elem.get_text(separator=' ', strip=True)
                author_element = info_elem.select_one('a[href*="/author/"]')
                if author_element:
                    author = author_element.text.strip()
                else:
                    author_match = re.search(r'作者[:：]?\s*([^/\n]+)', info_text)
                    if author_match:
                        author = author_match.group(1).strip()
            
            # 获取出版年月
            publish_date = "未知"
            if info_elem:
                info_text = info_elem.text
                date_match = re.search(r'出版年:?\s*(\d{4}[-年]\d{1,2}[月]?)', info_text)
                if date_match:
                    publish_date = date_match.group(1)
            
            return author, publish_date
        except Exception as e:
            self.log(f"获取书籍详情失败 {book_url}: {e}")
            return "获取失败", "获取失败"
    
    def extract_rating_from_class(self, item):
        """从豆瓣页面的CSS class中提取评分"""
        rating_span = item.select_one('span[class*="rating"]')
        if rating_span:
            class_names = rating_span.get('class', [])
            for class_name in class_names:
                match = re.search(r'rating(\d+)', class_name)
                if match:
                    rating_num = int(match.group(1))
                    return f"{rating_num}星"
        return None
    
    def extract_review_content(self, item):
        """提取书评内容"""
        comment_elem = item.select_one('p.comment.comment-item')
        if comment_elem:
            return comment_elem.get_text().strip()
        
        comment_elem = item.select_one('p.comment')
        if comment_elem:
            return comment_elem.get_text().strip()
        
        return None
    
    def _process_single_book(self, item, user_id, existing_urls, cookie) -> Optional[Dict]:
        """处理单本书籍信息，用于并行爬取"""
        try:
            # 获取书籍信息
            title_element = item.select_one('h2 a')
            if not title_element:
                return None
            
            title = title_element.get('title', '').strip()
            if not title:
                title = title_element.get_text().strip()
            
            link = title_element.get('href', '').strip()
            
            # 从当前页面提取作者和出版信息
            author, publish_date = self.extract_book_info_from_page(item)
            
            # 提取评分
            rating = self.extract_rating_from_class(item)
            if rating is None:
                rating_tag = item.select_one('.rating_nums')
                if rating_tag:
                    try:
                        rating = f"{rating_tag.text.strip()}分"
                    except ValueError:
                        rating = "未评分"
                else:
                    rating = "未评分"
            
            # 提取书评内容
            review = self.extract_review_content(item)
            
            # 获取评分日期
            date_elem = item.select_one('.date')
            date = date_elem.get_text().strip() if date_elem else '未知日期'
            
            # 生成请求头，用于可能的进一步请求
            selected_headers = random.choice(self.headers_pool).copy()
            selected_headers.update({
                'User-Agent': self.ua.random,
                'Cookie': cookie,
            })
            
            return {
                'title': title,
                'author': author,
                'publish_date': publish_date,
                'douban_url': link,
                'rating': rating,
                'review_content': review or '',
                'review_date': date,
                'user_id': user_id,
                'is_new': link not in existing_urls,
                'headers': selected_headers
            }
        except Exception as e:
            self.log(f"并行处理书籍时出错: {e}")
            return None
    
    def extract_book_info_from_page(self, item) -> Tuple[str, str]:
        """从页面元素中提取书籍信息"""
        author = "未知作者"
        publish_date = "未知"
        
        pub_elem = item.select_one('.pub')
        if pub_elem:
            pub_text = pub_elem.get_text().strip()
            parts = pub_text.split(' / ')
            
            if len(parts) >= 1:
                author = parts[0].strip()
            
            for part in parts:
                part = part.strip()
                if any(pattern in part for pattern in ['20', '19']) and any(char in part for char in ['-', '/', '年']):
                    if re.search(r'\b(19|20)\d{2}[-年/]\d{1,2}[月]?', part) or re.search(r'\b(19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}', part):
                        publish_date = part
                        break
                    elif re.search(r'\b(19|20)\d{2}', part) and len(part) <= 10:
                        publish_date = part
                        break
        
        return author, publish_date
    
    def crawl_user_books(self, user_id: str, cookie: str, max_pages: int = None, 
                        start_date: str = None, end_date: str = None):
        """爬取用户书籍数据并存储到数据库，支持日期范围过滤"""
        start_time = datetime.now()
        page = 0
        total_books = 0
        total_reviews = 0
        failed_pages = []
        max_retries = 5  # 增加重试次数
        base_delay = 2  # 基础延迟
        max_delay = 15  # 最大延迟
        min_delay = 1  # 最小延迟
        max_retries_per_url = 3  # 每个URL的最大重试次数
        
        # 日期范围过滤标志
        use_date_filter = start_date and end_date
        self.log(f"日期范围过滤: {'是' if use_date_filter else '否'}")
        if use_date_filter:
            self.log(f"过滤范围: {start_date} 至 {end_date}")
        
        # 转换日期格式，用于比较
        if use_date_filter:
            try:
                # 添加调试日志
                self.log(f"  初始化日期范围: {start_date} 至 {end_date}")
                
                # 尝试解析开始日期，支持多种格式
                start_date_obj = None
                end_date_obj = None
                
                # 支持的日期格式列表
                date_formats = [
                    "%Y-%m-%d",  # 2023-12-15
                    "%Y-%m",      # 2023-12
                    "%Y"          # 2023
                ]
                
                # 解析开始日期
                for fmt in date_formats:
                    try:
                        start_date_obj = datetime.strptime(start_date, fmt)
                        self.log(f"  成功解析开始日期: {start_date} (格式: {fmt})")
                        break
                    except ValueError:
                        continue
                
                if not start_date_obj:
                    raise ValueError(f"无法解析开始日期: {start_date}")
                
                # 解析结束日期
                for fmt in date_formats:
                    try:
                        end_date_obj = datetime.strptime(end_date, fmt)
                        self.log(f"  成功解析结束日期: {end_date} (格式: {fmt})")
                        break
                    except ValueError:
                        continue
                
                if not end_date_obj:
                    raise ValueError(f"无法解析结束日期: {end_date}")
                
                # 处理不同格式的日期范围
                # 例如，如果开始日期是2024，结束日期是2024，那么范围应该是2024-01-01至2024-12-31
                # 确保结束日期包含完整的年份
                if len(end_date) == 4:  # 仅年份
                    end_date_obj = datetime(end_date_obj.year, 12, 31)
                    self.log(f"  调整结束日期为年末: {end_date_obj.strftime('%Y-%m-%d')}")
                elif len(end_date) == 7:  # 年月
                    end_date_obj = datetime(end_date_obj.year, end_date_obj.month, 1)
                    # 计算该月的最后一天
                    from datetime import timedelta
                    next_month = end_date_obj.replace(day=28) + timedelta(days=4)
                    end_date_obj = next_month - timedelta(days=next_month.day)
                    self.log(f"  调整结束日期为月末: {end_date_obj.strftime('%Y-%m-%d')}")
                    
            except ValueError as e:
                self.log(f"日期格式错误: {e}，将忽略日期范围过滤")
                use_date_filter = False
        
        # 生成初始请求头，包含Cookie
        base_headers = {
            'Cookie': cookie,
            'User-Agent': self.ua.random,
        }
        
        self.log(f"开始爬取用户 {user_id} 的豆瓣书籍数据...")
        self.update_status("正在爬取数据...")
        
        # 获取已有书籍的URL列表，用于增量更新
        existing_books = self.db.get_books_by_user(user_id)
        existing_urls = {book[3] for book in existing_books}  # book[3] 是 douban_url
        self.log(f"已获取{len(existing_urls)}本已有书籍")
        
        new_books_count = 0
        updated_books_count = 0
        
        while not self.check_stop_signal():
            if max_pages and page >= max_pages:
                self.log(f"已达到设置的最大页数限制 ({max_pages})，停止爬取")
                break
            
            url = f'https://book.douban.com/people/{user_id}/collect?start={page*15}'
            success = False
            
            for attempt in range(max_retries):
                if self.check_stop_signal():
                    break
                
                try:
                    self.log(f"正在请求第{page+1}页 (尝试 {attempt+1}/{max_retries})")
                    self.update_status(f"正在爬取第{page+1}页...")
                    
                    # 动态生成请求头：随机选择一个请求头模板，强制使用PC版User-Agent和Cookie
                    selected_headers = random.choice(self.headers_pool).copy()
                    # 强制使用PC版User-Agent，避免重定向到移动版
                    selected_headers.update({
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Cookie': cookie,
                        'Host': 'book.douban.com',
                        'DNT': '1',
                        'Referer': 'https://book.douban.com/',
                    })
                    
                    # 随机延迟，使用更自然的延迟分布，避免固定延迟模式
                    # 基础延迟 + 随机延迟 + 重试次数延迟
                    delay = random.uniform(min_delay, base_delay) + (attempt * 0.5)
                    delay = min(delay, max_delay)
                    self.log(f"请求前延迟 {delay:.2f} 秒")
                    time.sleep(delay)
                    
                    # 确保请求头中的值都是ASCII字符
                    safe_headers = {}
                    for key, value in selected_headers.items():
                        # 确保值是字符串类型
                        if not isinstance(value, str):
                            value = str(value)
                        # 过滤掉非ASCII字符
                        safe_headers[key] = ''.join([c if ord(c) < 128 else '?' for c in value])
                    
                    # 发送请求，使用动态生成的请求头
                    res = requests.get(
                        url, 
                        headers=safe_headers, 
                        timeout=30,
                        allow_redirects=True,
                        verify=True
                    )
                    
                    # 明确设置响应编码为UTF-8，解决中文编码问题
                    res.encoding = 'utf-8'
                    
                    if 'sec.douban.com' in res.url or '禁止访问' in res.text or res.status_code == 403:
                        self.log("遇到反爬虫验证，Cookie可能已过期")
                        self.update_status("遇到反爬虫验证")
                        return
                    
                    res.raise_for_status()
                    success = True
                    break
                    
                except requests.exceptions.RequestException as e:
                    self.log(f"第{page+1}页请求失败 (尝试 {attempt+1}): {e}")
                    if attempt < max_retries - 1:
                        error_delay = min(base_delay * (3 ** attempt), max_delay)
                        time.sleep(error_delay)
                    else:
                        failed_pages.append(page)
                        self.log(f"第{page+1}页重试{max_retries}次后仍然失败，跳过此页")
            
            if not success:
                page += 1
                if page > (max_pages * 2 if max_pages else 100):
                    self.log("达到最大重试页数，停止爬取")
                    break
                continue
            
            soup = BeautifulSoup(res.text, 'html.parser')
            
            # 保存页面内容到文件，用于调试
            debug_file = f"debug_page_{page+1}.html"
            with open(debug_file, 'w', encoding='utf-8') as f:
                f.write(res.text)
            self.log(f"  页面内容已保存到：{debug_file}")
            
            # 添加调试信息
            self.log(f"第{page+1}页解析结果：")
            self.log(f"  页面标题：{soup.title.string if soup.title else '无标题'}")
            
            # 尝试多种可能的选择器
            selectors = [
                'li.subject-item',
                'div.subject-item',
                'div.item',
                'div.book-item',
                'ul.subject-list li',
                'ol.subject-list li'
            ]
            
            items = []
            for selector in selectors:
                found_items = soup.select(selector)
                self.log(f"  选择器 '{selector}' 找到 {len(found_items)} 个元素")
                if found_items:
                    items = found_items
                    break
            
            # 检查是否有登录提示或错误信息
            if soup.select_one('.login') or '请登录' in res.text:
                self.log("  页面包含登录提示，Cookie可能已过期或无效")
            
            if not items:
                # 尝试查找所有可能的列表项
                all_list_items = soup.select('li')
                self.log(f"  找到 {len(all_list_items)} 个列表项")
                
                # 保存部分列表项到日志，用于分析
                for i, li in enumerate(all_list_items[:5]):
                    self.log(f"  列表项{i+1}标签: {li.name}, 类: {li.get('class', [])}")
                
                self.log(f"第{page+1}页没有找到书籍条目，已到达最后一页")
                break
            
            self.log(f"第{page+1}页找到 {len(items)} 本书籍")
            page_books_count = 0
            
            # 使用线程池并行处理书籍信息
            with ThreadPoolExecutor(max_workers=min(5, len(items))) as executor:  # 限制最大线程数，避免请求过于频繁
                # 提交所有任务到线程池
                futures = []
                for item in items:
                    if self.check_stop_signal():
                        break
                    future = executor.submit(self._process_single_book, item, user_id, existing_urls, cookie)
                    futures.append(future)
                
                # 处理完成的任务
                all_books_processed = True  # 标记是否处理完所有书籍
                books_before_range = 0  # 记录早于范围的书籍数量
                
                for future in as_completed(futures):
                    if self.check_stop_signal():
                        all_books_processed = False
                        break
                    
                    book_data = future.result()
                    if book_data:
                        # 日期范围过滤
                        if use_date_filter:
                            review_date_str = book_data['review_date']
                            if review_date_str != '未知日期':
                                try:
                                    # 将书评日期转换为datetime对象
                                    original_date = review_date_str
                                    
                                    # 添加调试日志
                                    self.log(f"  处理日期: {original_date}")
                                    
                                    # 处理不同格式的日期，如 '2023-12-15', '2023/12/15', '2023年12月15日', '2023-12'
                                    processed_date = original_date
                                    
                                    # 处理中文格式日期
                                    if '年' in processed_date or '月' in processed_date:
                                        processed_date = processed_date.replace('年', '-').replace('月', '-').replace('日', '')
                                    
                                    # 处理斜杠格式日期
                                    processed_date = processed_date.replace('/', '-')
                                    
                                    # 清理空格
                                    processed_date = processed_date.strip()
                                    
                                    # 尝试多种日期格式解析
                                    review_date_obj = None
                                    date_formats = [
                                        "%Y-%m-%d",  # 2023-12-15
                                        "%Y-%m",      # 2023-12
                                        "%Y"          # 2023
                                    ]
                                    
                                    for fmt in date_formats:
                                        try:
                                            review_date_obj = datetime.strptime(processed_date, fmt)
                                            self.log(f"  成功解析日期: {original_date} -> {processed_date} (格式: {fmt})")
                                            break
                                        except ValueError:
                                            continue
                                    
                                    if not review_date_obj:
                                        # 如果仍然解析失败，尝试只提取年份
                                        year_match = re.search(r'\d{4}', processed_date)
                                        if year_match:
                                            year = int(year_match.group())
                                            review_date_obj = datetime(year, 1, 1)  # 设为该年1月1日
                                            self.log(f"  仅提取年份: {original_date} -> {year}")
                                        else:
                                            raise ValueError(f"无法解析日期: {original_date}")
                                    
                                    # 检查是否在日期范围内
                                    self.log(f"  日期比较: {review_date_obj} 是否在 {start_date_obj} 至 {end_date_obj} 之间")
                                    
                                    if start_date_obj <= review_date_obj <= end_date_obj:
                                        # 存储到数据库
                                        success = self.db.add_book(
                                            title=book_data['title'],
                                            author=book_data['author'],
                                            publish_date=book_data['publish_date'],
                                            douban_url=book_data['douban_url'],
                                            rating=book_data['rating'],
                                            review_content=book_data['review_content'],
                                            review_date=book_data['review_date'],
                                            user_id=book_data['user_id']
                                        )
                                        
                                        if success:
                                            page_books_count += 1
                                            total_books += 1
                                            
                                            if book_data['review_content'].strip():
                                                total_reviews += 1
                                            
                                            if book_data['is_new']:
                                                new_books_count += 1
                                                self.log(f"  新增: 《{book_data['title']}》- {book_data['rating']}")
                                            else:
                                                updated_books_count += 1
                                                self.log(f"  更新: 《{book_data['title']}》- {book_data['rating']}")
                                        else:
                                            self.log(f"  保存失败: 《{book_data['title']}》")
                                    else:
                                        self.log(f"  跳过: 《{book_data['title']}》 (日期 {original_date} -> {review_date_obj.strftime('%Y-%m-%d')} 不在范围内)")
                                        books_before_range += 1
                                        
                                        # 由于豆瓣收藏页面按时间倒序排列，当遇到第一本早于范围的书籍时，
                                        # 后面的所有书籍都会更早，所以可以提前停止处理
                                        if books_before_range >= 3:  # 连续3本书早于范围，就停止
                                            self.log(f"  连续{books_before_range}本书早于指定范围，停止处理本页")
                                            all_books_processed = False
                                            break
                                except ValueError as e:
                                    self.log(f"  日期解析失败: 《{book_data['title']}》 的日期 {original_date} 格式错误，将跳过")
                                    continue
                        else:
                            # 没有日期过滤，直接存储
                            success = self.db.add_book(
                                title=book_data['title'],
                                author=book_data['author'],
                                publish_date=book_data['publish_date'],
                                douban_url=book_data['douban_url'],
                                rating=book_data['rating'],
                                review_content=book_data['review_content'],
                                review_date=book_data['review_date'],
                                user_id=book_data['user_id']
                            )
                            
                            if success:
                                page_books_count += 1
                                total_books += 1
                                
                                if book_data['review_content'].strip():
                                    total_reviews += 1
                                
                                if book_data['is_new']:
                                    new_books_count += 1
                                    self.log(f"  新增: 《{book_data['title']}》- {book_data['rating']}")
                                else:
                                    updated_books_count += 1
                                    self.log(f"  更新: 《{book_data['title']}》- {book_data['rating']}")
                            else:
                                self.log(f"  保存失败: 《{book_data['title']}》")
                
                # 如果提前停止处理，就不再处理后续页面
                if not all_books_processed:
                    self.log(f"提前停止爬取，已超出指定日期范围")
                    break
            
            self.log(f"第{page+1}页处理完成，本页保存{page_books_count}本书籍")
            
            # 更新进度（这里是估算，如果有最大页数的话）
            if max_pages:
                progress = min(100, (page + 1) * 100 / max_pages)
                self.update_progress(progress)
            
            # 日期范围优化：如果所有书籍都早于指定范围，停止爬取
            if use_date_filter and page_books_count == 0:
                # 检查当前页面的所有书籍日期，判断是否都早于指定范围
                all_before_range = True
                for future in futures:
                    book_data = future.result()
                    if book_data:
                        review_date_str = book_data['review_date']
                        if review_date_str != '未知日期':
                            try:
                                # 将书评日期转换为datetime对象
                                review_date_str = review_date_str.replace('年', '-').replace('月', '-').replace('日', '')
                                review_date_str = review_date_str.replace('/', '-')
                                review_date_obj = datetime.strptime(review_date_str[:10], "%Y-%m-%d")
                                
                                # 如果有任何一本书在范围内，就继续爬取
                                if start_date_obj <= review_date_obj <= end_date_obj:
                                    all_before_range = False
                                    break
                            except ValueError:
                                # 日期解析失败，继续检查下一本书
                                continue
                
                if all_before_range:
                    self.log(f"检测到当前页面所有书籍都早于指定日期范围，停止爬取")
                    break
            
            page += 1
            
            # 页面间增加随机延迟，避免请求过于频繁
            inter_page_delay = random.uniform(2, 5)
            self.log(f"页面间延迟 {inter_page_delay:.2f} 秒")
            time.sleep(inter_page_delay)
        
        # 完成爬取
        end_time = datetime.now()
        
        # 更新用户信息
        self.db.update_user_info(user_id)
        
        # 记录爬取日志
        status = "success" if not self.check_stop_signal() else "stopped"
        self.db.log_crawl_session(
            user_id=user_id,
            start_time=start_time,
            end_time=end_time,
            pages_crawled=page,
            books_found=total_books,
            reviews_found=total_reviews,
            status=status
        )
        
        self.log(f"爬取完成！")
        self.log(f"总共处理了{page}页")
        self.log(f"找到{total_books}本书籍")
        self.log(f"其中{total_reviews}本有书评")
        self.log(f"新增书籍: {new_books_count}本")
        self.log(f"更新书籍: {updated_books_count}本")
        self.log(f"失败的页面: {failed_pages}")
        
        if self.check_stop_signal():
            self.update_status("爬取已停止")
        else:
            self.update_status("爬取完成")
            self.update_progress(100)

# 兼容原有代码的函数
def export_douban_books_with_reviews(user_id: str, max_pages: int = None, cookie: str = None):
    """为了兼容原有代码提供的函数"""
    if not cookie:
        import os
        cookie = os.getenv('DOUBAN_COOKIE', '')
        if not cookie:
            logger.error("❌ 错误：未配置Cookie")
            return
    
    from src.database.database import DoubanBookDB
    db = DoubanBookDB()
    crawler = DoubanCrawler(db)
    crawler.crawl_user_books(user_id, cookie, max_pages)