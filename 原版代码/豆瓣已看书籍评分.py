import requests
import pandas as pd
from bs4 import BeautifulSoup
import re
import time
import json
import os
from typing import Optional, Tuple, List
from tqdm import tqdm

def get_book_details(book_url, headers):
    """获取书籍详细信息：作者和出版年月"""
    try:
        time.sleep(1)  # 添加延时避免请求过于频繁
        response = requests.get(book_url, headers=headers, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # 获取作者信息（增强版，兼容多种格式）
        author = "未知作者"
        info_elem = soup.select_one('#info')
        if info_elem:
            info_html = str(info_elem)
            info_text = info_elem.get_text(separator=' ', strip=True)
            # 1. 先尝试 a 标签
            author_element = info_elem.select_one('a[href*="/author/"]')
            if author_element:
                author = author_element.text.strip()
            else:
                # 2. 尝试正则提取"作者:"后内容（不依赖a标签）
                author_match = re.search(r'作者[:：]?\s*([^/\n]+)', info_text)
                if author_match:
                    author = author_match.group(1).strip()
        
        # 获取出版年月
        publish_date = "未知"
        if info_elem:
            info_text = info_elem.text
            # 查找出版年月（格式如：2023-1、2023年1月等）
            date_match = re.search(r'出版年:?\s*(\d{4}[-年]\d{1,2}[月]?)', info_text)
            if date_match:
                publish_date = date_match.group(1)
        
        return author, publish_date
    except Exception as e:
        print(f"获取书籍详情失败 {book_url}: {e}")
        return "获取失败", "获取失败"

def extract_rating_from_class(item):
    """从豆瓣页面的CSS class中提取评分（返回格式：'数字星'，如'4星'）"""
    rating_span = item.select_one('span[class*="rating"]')
    if rating_span:
        class_names = rating_span.get('class', [])
        for class_name in class_names:
            # 查找类似 rating4-t 的格式
            match = re.search(r'rating(\d+)', class_name)
            if match:
                rating_num = int(match.group(1))
                return f"{rating_num}星"
    return None

def extract_review_content(item):
    """提取书评内容"""
    # 优先尝试 list 模式的书评提取
    comment_elem = item.select_one('p.comment.comment-item')
    if comment_elem:
        return comment_elem.get_text().strip()
    
    # 备用：标准模式的书评提取
    comment_elem = item.select_one('p.comment')
    if comment_elem:
        return comment_elem.get_text().strip()
    
    return None

def load_config():
    """从环境变量或配置文件加载Cookie配置"""
    COOKIE = os.getenv('DOUBAN_COOKIE', '')
    
    if not COOKIE:
        # 尝试从文件读取
        try:
            with open('config.json', 'r', encoding='utf-8') as f:
                config = json.load(f)
                COOKIE = config.get('cookie', '')
        except FileNotFoundError:
            print("⚠️  警告：未找到Cookie配置")
            print("📝 豆瓣个人收藏页面需要登录才能访问，仅提供用户名无法正常使用")
            print("🔧 请按以下步骤获取Cookie：")
            print("   1. 在浏览器中登录豆瓣")
            print("   2. 访问你的收藏页面")
            print("   3. 按F12打开开发者工具")
            print("   4. 在Network标签页中找到页面请求")
            print("   5. 复制请求头中的Cookie值")
            print("   6. 设置环境变量DOUBAN_COOKIE或创建config.json文件")
    
    return COOKIE

def get_user_input():
    """获取用户输入的豆瓣用户名"""
    print("\n🔸 请输入豆瓣用户名（URL中people/后面的部分）")
    print("   例如：https://book.douban.com/people/your_username/collect 中的 your_username")
    user_id = input("豆瓣用户名: ").strip()
    
    if not user_id:
        print("❌ 用户名不能为空！")
        return None
    
    return user_id

def export_douban_books_with_reviews(user_id: str, max_pages: int = None):
    COOKIE = load_config()
    
    if not COOKIE:
        print("❌ 错误：未配置Cookie，无法继续")
        print("💡 豆瓣需要登录状态才能访问个人收藏页面")
        print("📖 请参考上述说明获取并配置Cookie")
        return
    
    headers = {
        'Cookie': COOKIE, 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
    }
    
    books_with_reviews = []
    all_books = []
    page = 0
    failed_pages = []
    max_retries = 3
    base_delay = 2
    max_delay = 10
    
    print(f"开始爬取用户 {user_id} 的豆瓣书籍数据...")
    if max_pages:
        print(f"设置最大页数限制: {max_pages}")
    else:
        print("将爬取所有页面直到没有数据")
    
    # 总的导出文件进度条 - 位于最顶部
    total_steps = 6  # 总共6个主要步骤：数据爬取、完整清单导出、统计导出、书评导出、按评分分组导出、完成
    overall_progress = tqdm(total=total_steps, desc="总导出进度", unit="步骤", position=0, 
                           bar_format='{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}]')
    
    # 创建页面进度条
    page_progress = tqdm(desc="页面进度", unit="页", position=1)
    
    while True:
        # 如果设置了最大页数限制，则检查
        if max_pages and page >= max_pages:
            page_progress.close()
            overall_progress.set_description("数据爬取完成，达到页数限制")
            overall_progress.update(1)  # 完成数据爬取步骤
            print(f"已达到设置的最大页数限制 ({max_pages})，停止爬取")
            break
        # 豆瓣书籍收藏页面每页显示15本书
        url = f'https://book.douban.com/people/{user_id}/collect?start={page*15}'
        success = False
        
        for attempt in range(max_retries):
            try:
                page_progress.set_description(f"正在请求第{page+1}页 (尝试 {attempt+1}/{max_retries})")
                # 指数退避延时策略
                delay = min(base_delay * (2 ** attempt), max_delay)
                time.sleep(delay)
                # 移除Accept-Encoding来让服务器返回未压缩的内容
                temp_headers = headers.copy()
                temp_headers.pop('Accept-Encoding', None)
                res = requests.get(url, headers=temp_headers, timeout=30)
                
                # 检查是否被重定向到验证页面
                if 'sec.douban.com' in res.url or '禁止访问' in res.text or res.status_code == 403:
                    page_progress.close()
                    overall_progress.close()
                    print("\n遇到反爬虫验证，Cookie可能已过期或需要人工验证")
                    print(f"当前URL: {res.url}")
                    print("请在浏览器中访问豆瓣并完成验证，然后更新Cookie")
                    return
                
                res.raise_for_status()
                success = True
                break
                
            except requests.exceptions.RequestException as e:
                page_progress.set_description(f"第{page+1}页请求失败 (尝试 {attempt+1}): {e}")
                if attempt < max_retries - 1:
                    error_delay = min(base_delay * (3 ** attempt), max_delay)
                    time.sleep(error_delay)
                else:
                    failed_pages.append(page)
                    page_progress.write(f"第{page+1}页重试{max_retries}次后仍然失败，跳过此页")
        
        if not success:
            page += 1
            if page > (max_pages * 2 if max_pages else 100):  # 防止无限循环
                page_progress.close()
                overall_progress.close()
                print("\n达到最大重试页数，停止爬取")
                break
            continue
        
        soup = BeautifulSoup(res.text, 'html.parser')
        
        # 查找书籍条目
        items = soup.select('li.subject-item')
        page_progress.set_description(f"第{page+1}页找到 {len(items)} 本书籍")
        
        if not items:
            page_progress.close()
            overall_progress.set_description("数据爬取完成，已到达最后一页")
            overall_progress.update(1)  # 完成数据爬取步骤
            print(f"\n第{page+1}页没有找到书籍条目，已到达最后一页")
            break
        
        page_books_count = 0
        
        # 创建书籍处理进度条
        books_progress = tqdm(items, desc=f"第{page+1}页书籍", unit="本", position=2, leave=False)
        
        for i, item in enumerate(books_progress, 1):
            try:
                # 获取书籍标题和链接
                title_element = item.select_one('h2 a')
                if not title_element:
                    books_progress.write(f"  书籍{i}: 无法获取标题元素")
                    continue
                    
                title = title_element.get('title', '').strip()
                if not title:
                    title = title_element.get_text().strip()
                    
                link = title_element.get('href', '').strip()
                
                if not title or title == '未知书名':
                    books_progress.write(f"  警告: 书籍{i}标题为空或未知: {link}")
                
                books_progress.set_description(f"第{page+1}页书籍: 《{title[:20]}...》")
                
                # 从当前页面提取作者和出版信息
                author, publish_date = extract_book_info_from_page(item)
                
                
                # 从CSS class中提取评分
                rating = extract_rating_from_class(item)
                
                # 如果没有找到评分，尝试其他方法（备用）
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
                review = extract_review_content(item)
                
                # 获取评分日期
                date_elem = item.select_one('.date')
                date = date_elem.get_text().strip() if date_elem else '未知日期'
                
                # 添加到所有书籍列表
                all_books.append([title, author, publish_date, link, rating, review or '无书评', date])
                page_books_count += 1
                
                # 如果有评分且有书评，添加到书评列表
                if rating and rating != "未评分" and review:
                    books_with_reviews.append([title, author, publish_date, link, rating, review, date])
                    
            except Exception as e:
                books_progress.write(f"    处理第{i}本书时出错: {e}")
                continue
        
        # 关闭书籍进度条
        books_progress.close()
        
        page_progress.update(1)
        page_progress.write(f"第{page+1}页处理完成，本页找到{page_books_count}本书籍，累计{len(all_books)}本")
        page_progress.write(f"目前找到{len(books_with_reviews)}本有书评的书籍")
        
        page += 1

    # 关闭页面进度条
    page_progress.close()
    
    # 更新总进度：数据爬取完成
    if not overall_progress.n:  # 如果还没有更新过数据爬取步骤
        overall_progress.set_description("数据爬取完成")
        overall_progress.update(1)
    
    print(f"\n爬取完成！")
    print(f"总共处理了{page}页")
    print(f"失败的页面: {failed_pages}")
    print(f"找到{len(all_books)}本书籍")
    print(f"其中{len(books_with_reviews)}本有书评")

    # 导出所有书籍（包含书评信息）
    if all_books:
        # 更新总进度：开始导出完整清单
        overall_progress.set_description("正在导出完整书籍清单")
        overall_progress.update(1)
        
        df_all = pd.DataFrame(all_books, columns=['书名', '作者', '出版年月', '链接', '评分', '书评内容', '评分日期'])
        df_all.to_excel('豆瓣书籍完整清单.xlsx', index=False)
        print(f"成功导出{len(all_books)}本书籍完整数据到 '豆瓣书籍完整清单.xlsx'")
        
        # 更新总进度：开始导出统计信息
        overall_progress.set_description("正在导出统计信息")
        overall_progress.update(1)
        
        # 保存详细统计信息
        stats = {
            '总书籍数': len(all_books),
            '有书评数': len(books_with_reviews),
            '处理页数': page,
            '失败页数': len(failed_pages),
            '失败页面列表': failed_pages
        }
        with open('爬取统计.json', 'w', encoding='utf-8') as f:
            json.dump(stats, f, ensure_ascii=False, indent=2)
        print(f"统计信息已保存到 '爬取统计.json'")
        
        # 更新总进度：开始导出书评
        overall_progress.set_description("正在导出书评数据")
        overall_progress.update(1)
        
        # 导出有书评的书籍
        export_reviews_only(books_with_reviews, overall_progress)
    else:
        overall_progress.close()
        print("未找到任何书籍数据")
        return


def export_reviews_only(books_with_reviews, overall_progress=None):
    """封装的书评导出功能"""
    if books_with_reviews:
        df_reviews = pd.DataFrame(books_with_reviews, columns=['书名', '作者', '出版年月', '链接', '评分', '书评内容', '评分日期'])
        df_reviews.to_excel('豆瓣书评清单.xlsx', index=False)
        print(f"成功导出{len(books_with_reviews)}本有书评的书籍数据到 '豆瓣书评清单.xlsx'")
        
        # 更新总进度：开始按评分分组导出
        if overall_progress:
            overall_progress.set_description("正在按评分分组导出")
            overall_progress.update(1)
        
        # 按评分分组导出
        for rating in sorted(df_reviews['评分'].unique()):
            rating_books = df_reviews[df_reviews['评分'] == rating]
            filename = f'豆瓣{rating}书评.xlsx'
            rating_books.to_excel(filename, index=False)
            print(f"导出{rating}书评 {len(rating_books)}本到 '{filename}'")
        
        # 完成所有导出，关闭总进度条
        if overall_progress:
            overall_progress.set_description("所有文件导出完成！")
            overall_progress.update(1)
            overall_progress.close()
    else:
        print("未找到有书评的书籍")
        if overall_progress:
            overall_progress.close()

def extract_book_info_from_page(item) -> Tuple[str, str]:
    """从页面元素中提取书籍信息"""
    author = "未知作者"
    publish_date = "未知"
    
    pub_elem = item.select_one('.pub')
    if pub_elem:
        pub_text = pub_elem.get_text().strip()
        # 解析类似 "马伯庸 / 湖南文艺出版社 / 2025-6 / 48.00元" 的格式
        parts = pub_text.split(' / ')
        
        # 提取作者（第一部分）
        if len(parts) >= 1:
            author = parts[0].strip()
        
        # 智能提取出版年月（寻找包含年份的部分）
        for part in parts:
            part = part.strip()
            # 匹配年月格式：YYYY-MM, YYYY/MM, YYYY年MM月等
            if any(pattern in part for pattern in ['20', '19']) and any(char in part for char in ['-', '/', '年']):
                # 进一步验证是否为日期格式
                if re.search(r'\b(19|20)\d{2}[-年/]\d{1,2}[月]?', part) or re.search(r'\b(19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}', part):
                    publish_date = part
                    break
                elif re.search(r'\b(19|20)\d{2}', part) and len(part) <= 10:  # 简单年份判断
                    publish_date = part
                    break
    
    return author, publish_date

if __name__ == '__main__':
    # 获取用户输入的豆瓣用户名
    user_id = get_user_input()
    if not user_id:
        print("程序退出")
        exit(1)
    
    # 可以通过参数控制爬取页数，None表示爬取所有页面
    pages_env = os.getenv('MAX_PAGES', '')
    if pages_env and pages_env.isdigit():
        pages = int(pages_env)
    else:
        pages = None  # 爬取所有页面
    
    print(f"准备开始爬取用户 {user_id} 的数据，页数设置: {'所有页面' if pages is None else f'{pages}页'}")
    export_douban_books_with_reviews(user_id, max_pages=pages)