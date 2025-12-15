from datetime import datetime
from src.database.database import DoubanBookDB
from src.utils.logger import logger
from typing import Dict, List

class HTMLExporter:
    def __init__(self):
        self.template = self._get_html_template()
    
    def _get_html_template(self) -> str:
        """HTML模板"""
        return """
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{user_id} 的豆瓣书评收藏</title>
    <style>
        body {{
            font-family: 'Microsoft YaHei', Arial, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
            color: #333;
        }}
        
        .container {{
            max-width: 1200px;
            margin: 0 auto;
            background-color: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }}
        
        .header {{
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e0e0e0;
        }}
        
        .header h1 {{
            color: #2E7D32;
            margin-bottom: 10px;
            font-size: 2.5em;
        }}
        
        .stats {{
            display: flex;
            justify-content: center;
            gap: 30px;
            margin: 20px 0;
            flex-wrap: wrap;
        }}
        
        .stat-item {{
            text-align: center;
            padding: 15px 25px;
            background-color: #f8f9fa;
            border-radius: 8px;
            border-left: 4px solid #4CAF50;
        }}
        
        .stat-number {{
            font-size: 2em;
            font-weight: bold;
            color: #2E7D32;
            display: block;
        }}
        
        .stat-label {{
            color: #666;
            font-size: 0.9em;
        }}
        
        .rating-filter {{
            text-align: center;
            margin: 30px 0;
        }}
        
        .rating-btn {{
            display: inline-block;
            padding: 8px 16px;
            margin: 5px;
            background-color: #e8f5e8;
            border: 1px solid #4CAF50;
            border-radius: 20px;
            text-decoration: none;
            color: #2E7D32;
            transition: all 0.3s;
            cursor: pointer;
        }}
        
        .rating-btn:hover, .rating-btn.active {{
            background-color: #4CAF50;
            color: white;
        }}
        
        .search-box {{
            text-align: center;
            margin: 20px 0;
        }}
        
        .search-input {{
            padding: 10px 15px;
            border: 1px solid #ddd;
            border-radius: 25px;
            width: 300px;
            font-size: 14px;
        }}
        
        .book-list {{
            margin-top: 30px;
        }}
        
        .book-item {{
            display: flex;
            margin-bottom: 25px;
            padding: 20px;
            background-color: #fafafa;
            border-radius: 8px;
            border-left: 4px solid #4CAF50;
            transition: all 0.3s;
        }}
        
        .book-item:hover {{
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }}
        
        .book-info {{
            flex: 1;
        }}
        
        .book-title {{
            font-size: 1.3em;
            font-weight: bold;
            margin-bottom: 8px;
            color: #2E7D32;
        }}
        
        .book-title a {{
            color: #2E7D32;
            text-decoration: none;
        }}
        
        .book-title a:hover {{
            text-decoration: underline;
        }}
        
        .book-meta {{
            color: #666;
            font-size: 0.9em;
            margin-bottom: 10px;
        }}
        
        .book-rating {{
            display: inline-block;
            padding: 4px 12px;
            background-color: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 15px;
            color: #856404;
            font-size: 0.85em;
            font-weight: bold;
            margin-right: 10px;
        }}
        
        .rating-5星 {{ background-color: #d4edda; border-color: #c3e6cb; color: #155724; }}
        .rating-4星 {{ background-color: #cce7ff; border-color: #99d6ff; color: #004085; }}
        .rating-3星 {{ background-color: #fff3cd; border-color: #ffeaa7; color: #856404; }}
        .rating-2星 {{ background-color: #f8d7da; border-color: #f5c6cb; color: #721c24; }}
        .rating-1星 {{ background-color: #f8d7da; border-color: #f5c6cb; color: #721c24; }}
        
        .book-review {{
            margin-top: 15px;
            padding: 15px;
            background-color: white;
            border-radius: 6px;
            border-left: 3px solid #4CAF50;
            font-style: italic;
            line-height: 1.8;
        }}
        
        .review-label {{
            font-weight: bold;
            color: #2E7D32;
            margin-bottom: 8px;
            display: block;
        }}
        
        .no-review {{
            color: #999;
            font-size: 0.9em;
        }}
        
        .footer {{
            text-align: center;
            margin-top: 50px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
            color: #666;
            font-size: 0.9em;
        }}
        
        .hidden {{
            display: none;
        }}
        
        @media (max-width: 768px) {{
            .container {{
                padding: 15px;
            }}
            
            .stats {{
                flex-direction: column;
                gap: 15px;
            }}
            
            .book-item {{
                flex-direction: column;
            }}
            
            .search-input {{
                width: 100%;
                max-width: 300px;
            }}
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📚 {user_id} 的豆瓣书评收藏</h1>
            <div class="stats">
                <div class="stat-item">
                    <span class="stat-number">{total_books}</span>
                    <span class="stat-label">总书籍数</span>
                </div>
                <div class="stat-item">
                    <span class="stat-number">{books_with_reviews}</span>
                    <span class="stat-label">有书评</span>
                </div>
                <div class="stat-item">
                    <span class="stat-number">{export_date}</span>
                    <span class="stat-label">导出时间</span>
                </div>
            </div>
            
            {rating_stats_html}
            
            <!-- 年度统计 -->
            {yearly_stats_html}
            
            <!-- 阅读偏好统计 -->
            {reading_preferences_html}
            
            <div class="search-box">
                <input type="text" class="search-input" placeholder="搜索书名、作者或书评内容..." 
                       onkeyup="searchBooks(this.value)">
            </div>
            
            <div class="rating-filter">
                <span class="rating-btn active" onclick="filterByRating('all')">全部</span>
                <span class="rating-btn" onclick="filterByRating('has-review')">有书评</span>
                {rating_filter_buttons}
            </div>
        </div>
        
        <!-- TOP10榜单 -->
        {top10_books_html}
        
        <div class="book-list" id="bookList">
            {books_html}
        </div>
        
        <div class="footer">
            <p>📊 数据来源：豆瓣读书 | 生成时间：{export_date} | 工具：豆瓣书评爬虫</p>
        </div>
    </div>
    
    <script>
        function filterByRating(rating) {{
            const books = document.querySelectorAll('.book-item');
            const buttons = document.querySelectorAll('.rating-btn');
            
            // 更新按钮状态
            buttons.forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
            
            books.forEach(book => {{
                const bookRating = book.dataset.rating;
                const hasReview = book.dataset.hasReview === 'true';
                
                if (rating === 'all') {{
                    book.style.display = 'flex';
                }} else if (rating === 'has-review') {{
                    book.style.display = hasReview ? 'flex' : 'none';
                }} else {{
                    book.style.display = bookRating === rating ? 'flex' : 'none';
                }}
            }});
        }}
        
        function searchBooks(query) {{
            const books = document.querySelectorAll('.book-item');
            const searchTerm = query.toLowerCase();
            
            books.forEach(book => {{
                const title = book.querySelector('.book-title').textContent.toLowerCase();
                const author = book.querySelector('.book-meta').textContent.toLowerCase();
                const review = book.querySelector('.book-review') ? 
                    book.querySelector('.book-review').textContent.toLowerCase() : '';
                
                const matches = title.includes(searchTerm) || 
                               author.includes(searchTerm) || 
                               review.includes(searchTerm);
                
                book.style.display = matches ? 'flex' : 'none';
            }});
        }}
    </script>
</body>
</html>
        """
    
    def _generate_rating_stats_html(self, rating_stats: Dict[str, int]) -> str:
        """生成评分统计HTML"""
        if not rating_stats:
            return ""
        
        stats_html = '<div class="stats" style="margin-top: 20px;">'
        for rating, count in sorted(rating_stats.items(), reverse=True):
            stats_html += f'''
                <div class="stat-item">
                    <span class="stat-number">{count}</span>
                    <span class="stat-label">{rating}</span>
                </div>
            '''
        stats_html += '</div>'
        return stats_html
    
    def _generate_rating_filter_buttons(self, rating_stats: Dict[str, int]) -> str:
        """生成评分筛选按钮"""
        if not rating_stats:
            return ""
        
        buttons_html = ""
        for rating in sorted(rating_stats.keys(), reverse=True):
            count = rating_stats[rating]
            buttons_html += f'<span class="rating-btn" onclick="filterByRating(\'{rating}\')">{rating} ({count})</span>'
        
        return buttons_html
    
    def _generate_yearly_stats_html(self, books: List[Dict]) -> str:
        """生成年度统计HTML"""
        if not books:
            return ""
        
        # 统计每年的书籍数量
        yearly_stats = {}
        for book in books:
            review_date = book['review_date']
            if review_date and review_date != '未知日期':
                # 提取年份
                try:
                    if '-' in review_date:
                        year = review_date.split('-')[0]
                    elif '年' in review_date:
                        year = review_date.split('年')[0]
                    elif '/' in review_date:
                        year = review_date.split('/')[0]
                    else:
                        # 尝试提取数字年份
                        import re
                        year_match = re.search(r'\d{4}', review_date)
                        if year_match:
                            year = year_match.group()
                        else:
                            continue
                    
                    if year.isdigit():
                        year = int(year)
                        yearly_stats[year] = yearly_stats.get(year, 0) + 1
                except:
                    continue
        
        if not yearly_stats:
            return ""
        
        # 按年份降序排序
        sorted_years = sorted(yearly_stats.items(), reverse=True)
        
        stats_html = '''
        <div class="stats" style="margin-top: 20px;">
            <h3>📅 年度阅读统计</h3>
            <div class="stats" style="margin-top: 10px;">
        '''        
        for year, count in sorted_years:
            stats_html += f'''                
                <div class="stat-item">
                    <span class="stat-number">{count}</span>
                    <span class="stat-label">{year}年</span>
                </div>
            '''
        
        stats_html += '''
            </div>
        </div>
        '''
        return stats_html
    
    def _generate_reading_preferences_html(self, books: List[Dict]) -> str:
        """生成阅读偏好HTML，包括最喜欢的作者"""
        if not books:
            return ""
        
        # 统计作者
        author_stats = {}
        for book in books:
            author = book['author']
            if author and author != '未知作者':
                author_stats[author] = author_stats.get(author, 0) + 1
        
        # 找出最喜欢的作者（数量最多的前3个）
        favorite_authors = sorted(author_stats.items(), key=lambda x: x[1], reverse=True)[:3]
        
        # 统计书籍类型（简单实现，基于书名关键词）
        genre_stats = {
            '小说': 0,
            '文学': 0,
            '历史': 0,
            '哲学': 0,
            '科学': 0,
            '技术': 0,
            '艺术': 0,
            '其他': 0
        }
        
        for book in books:
            title = book['title']
            if title:
                title_lower = title.lower()
                
                if any(keyword in title_lower for keyword in ['小说', '故事', '文学', '长篇', '短篇']):
                    genre_stats['小说'] += 1
                elif any(keyword in title_lower for keyword in ['历史', '传记', '自传', '回忆录']):
                    genre_stats['历史'] += 1
                elif any(keyword in title_lower for keyword in ['哲学', '思想', '智慧', '人生']):
                    genre_stats['哲学'] += 1
                elif any(keyword in title_lower for keyword in ['科学', '科普', '自然', '宇宙']):
                    genre_stats['科学'] += 1
                elif any(keyword in title_lower for keyword in ['技术', '编程', '计算机', '软件']):
                    genre_stats['技术'] += 1
                elif any(keyword in title_lower for keyword in ['艺术', '设计', '音乐', '绘画']):
                    genre_stats['艺术'] += 1
                else:
                    genre_stats['其他'] += 1
        
        # 过滤掉数量为0的类型
        genre_stats = {k: v for k, v in genre_stats.items() if v > 0}
        
        # 找出最喜欢的类型
        favorite_genres = sorted(genre_stats.items(), key=lambda x: x[1], reverse=True)[:3]
        
        preferences_html = '''
        <div style="margin-top: 30px; padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
            <h3>📚 阅读偏好</h3>
            <div style="display: flex; flex-wrap: wrap; gap: 30px; margin-top: 20px;">
        '''        
        # 最喜欢的作者
        if favorite_authors:
            preferences_html += '''
            <div style="flex: 1; min-width: 250px;">
                <h4 style="color: #2E7D32; margin-bottom: 15px;">👤 最喜欢的作者</h4>
                <ul style="list-style-type: none; padding: 0;">
            '''            
            for author, count in favorite_authors:
                preferences_html += f'''                    
                    <li style="margin-bottom: 10px; padding: 8px; background-color: white; border-radius: 4px;">
                        <strong>{author}</strong> - {count}本书
                    </li>
                '''            
            preferences_html += '''
                </ul>
            </div>
            '''        
        # 最喜欢的类型
        if favorite_genres:
            preferences_html += '''
            <div style="flex: 1; min-width: 250px;">
                <h4 style="color: #2E7D32; margin-bottom: 15px;">📖 最喜欢的类型</h4>
                <ul style="list-style-type: none; padding: 0;">
            '''            
            for genre, count in favorite_genres:
                preferences_html += f'''                    
                    <li style="margin-bottom: 10px; padding: 8px; background-color: white; border-radius: 4px;">
                        <strong>{genre}</strong> - {count}本书
                    </li>
                '''            
            preferences_html += '''
                </ul>
            </div>
            '''        
        preferences_html += '''
            </div>
        </div>
        '''
        return preferences_html
    
    def _generate_top10_books_html(self, books: List[Dict]) -> str:
        """生成TOP10榜单HTML"""
        if not books:
            return ""
        
        # 筛选出有评分的书籍
        rated_books = [book for book in books if book['rating'] and book['rating'] != '未评分']
        
        if not rated_books:
            return ""
        
        # 将评分转换为可比较的数值
        def get_rating_value(rating):
            """将评分字符串转换为数值"""
            if '星' in rating:
                # 处理如"5星"格式
                return float(rating.replace('星', ''))
            elif '分' in rating:
                # 处理如"9.5分"格式
                return float(rating.replace('分', ''))
            else:
                try:
                    return float(rating)
                except:
                    return 0
        
        # 按评分降序排序，取前10本
        top_books = sorted(rated_books, key=lambda x: get_rating_value(x['rating']), reverse=True)[:10]
        
        if not top_books:
            return ""
        
        top10_html = '''
        <div style="margin: 30px 0; padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
            <h3 style="color: #2E7D32; text-align: center; margin-bottom: 20px;">🏆 TOP10 推荐书籍</h3>
            <ol style="list-style-position: inside; padding: 0; max-width: 800px; margin: 0 auto;">
        '''        
        for i, book in enumerate(top_books, 1):
            title = book['title']
            author = book['author']
            rating = book['rating']
            douban_url = book['douban_url']
            
            top10_html += f'''                
                <li style="margin-bottom: 15px; padding: 15px; background-color: white; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <span style="font-size: 1.5em; font-weight: bold; color: #2E7D32;">{i}</span>
                        <div style="flex: 1;">
                            <h4 style="margin: 0; color: #2E7D32;">
                                <a href="{douban_url}" target="_blank" style="color: #2E7D32; text-decoration: none;">{title}</a>
                            </h4>
                            <p style="margin: 5px 0; color: #666;">作者: {author}</p>
                        </div>
                        <span class="book-rating rating-{rating}" style="font-size: 1em;">{rating}</span>
                    </div>
                </li>
            '''        
        top10_html += '''
            </ol>
        </div>
        '''
        return top10_html
    
    def _generate_book_html(self, book: Dict) -> str:
        """生成单本书的HTML"""
        title = book['title'] or '未知书名'
        author = book['author'] or '未知作者'
        publish_date = book['publish_date'] or '未知'
        douban_url = book['douban_url'] or '#'
        rating = book['rating'] or '未评分'
        review_content = book['review_content'] or ''
        review_date = book['review_date'] or '未知日期'
        
        # 安全的HTML转义
        title = self._escape_html(title)
        author = self._escape_html(author)
        review_content = self._escape_html(review_content)
        
        has_review = bool(review_content.strip())
        rating_class = f"rating-{rating}" if rating != '未评分' else "rating-unrated"
        
        review_html = ""
        if has_review:
            review_html = f'''
                <div class="book-review">
                    <span class="review-label">📝 我的书评：</span>
                    {review_content}
                </div>
            '''
        else:
            review_html = '<div class="no-review">📝 暂无书评</div>'
        
        return f'''
            <div class="book-item" data-rating="{rating}" data-has-review="{str(has_review).lower()}">
                <div class="book-info">
                    <div class="book-title">
                        <a href="{douban_url}" target="_blank">{title}</a>
                    </div>
                    <div class="book-meta">
                        👤 作者：{author} | 📅 出版：{publish_date} | 🕒 评分时间：{review_date}
                    </div>
                    <div>
                        <span class="book-rating {rating_class}">⭐ {rating}</span>
                    </div>
                    {review_html}
                </div>
            </div>
        '''
    
    def _escape_html(self, text: str) -> str:
        """HTML转义"""
        if not text:
            return ""
        
        return (text.replace("&", "&amp;")
                   .replace("<", "&lt;")
                   .replace(">", "&gt;")
                   .replace('"', "&quot;")
                   .replace("'", "&#x27;"))
    
    def export_user_books(self, db: DoubanBookDB, user_id: str, output_file: str, 
                         start_date: str = None, end_date: str = None) -> bool:
        """导出用户书籍数据为HTML文件，支持日期范围过滤"""
        try:
            # 获取用户数据
            if start_date and end_date:
                data = db.export_to_dict(user_id, start_date, end_date)
            else:
                data = db.export_to_dict(user_id)
            
            if not data['books']:
                logger.error(f"用户 {user_id} 在指定日期范围内没有书籍数据")
                return False
            
            # 生成各部分HTML
            rating_stats_html = self._generate_rating_stats_html(data['stats']['rating_stats'])
            rating_filter_buttons = self._generate_rating_filter_buttons(data['stats']['rating_stats'])
            yearly_stats_html = self._generate_yearly_stats_html(data['books'])
            reading_preferences_html = self._generate_reading_preferences_html(data['books'])
            top10_books_html = self._generate_top10_books_html(data['books'])
            
            books_html = ""
            for book in data['books']:
                books_html += self._generate_book_html(book)
            
            # 填充模板
            html_content = self.template.format(
                user_id=user_id,
                total_books=data['stats']['total_books'],
                books_with_reviews=data['stats']['books_with_reviews'],
                export_date=datetime.now().strftime("%Y-%m-%d %H:%M"),
                rating_stats_html=rating_stats_html,
                rating_filter_buttons=rating_filter_buttons,
                yearly_stats_html=yearly_stats_html,
                reading_preferences_html=reading_preferences_html,
                top10_books_html=top10_books_html,
                books_html=books_html
            )
            
            # 写入文件
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(html_content)
            
            logger.info(f"HTML文件已导出到: {output_file}")
            return True
            
        except Exception as e:
            logger.error(f"HTML导出失败: {e}")
            return False
    
    def export_books_by_rating(self, db: DoubanBookDB, user_id: str, rating: str, output_file: str) -> bool:
        """按评分导出书籍"""
        try:
            books = db.get_books_by_rating(user_id, rating)
            
            if not books:
                logger.error(f"用户 {user_id} 没有 {rating} 的书籍")
                return False
            
            # 转换为字典格式
            book_dicts = []
            for book in books:
                book_dicts.append({
                    'title': book[0],
                    'author': book[1],
                    'publish_date': book[2],
                    'douban_url': book[3],
                    'rating': book[4],
                    'review_content': book[5],
                    'review_date': book[6],
                    'created_at': book[7]
                })
            
            # 生成HTML
            books_html = ""
            for book in book_dicts:
                books_html += self._generate_book_html(book)
            
            # 简化的模板用于单评分导出
            html_content = self.template.format(
                user_id=f"{user_id} - {rating}",
                total_books=len(book_dicts),
                books_with_reviews=len([b for b in book_dicts if b['review_content'].strip()]),
                export_date=datetime.now().strftime("%Y-%m-%d %H:%M"),
                rating_stats_html="",
                rating_filter_buttons="",
                books_html=books_html
            )
            
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(html_content)
            
            logger.info(f"{rating} 书籍HTML文件已导出到: {output_file}")
            return True
            
        except Exception as e:
            logger.error(f"按评分导出HTML失败: {e}")
            return False