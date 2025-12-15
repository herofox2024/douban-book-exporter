import csv
import os
from typing import List, Dict
from src.database.database import DoubanBookDB
from src.utils.logger import logger
from datetime import datetime

class CSVExporter:
    def __init__(self):
        """初始化CSV导出器"""
        self.headers = [
            '书名', '作者', '出版日期', '豆瓣链接', '评分', 
            '书评内容', '评分日期', '爬取时间', '更新时间'
        ]
    
    def export_user_books(self, db: DoubanBookDB, user_id: str, output_file: str, 
                         start_date: str = None, end_date: str = None) -> bool:
        """导出用户书籍数据为CSV文件"""
        try:
            # 获取用户数据
            if start_date and end_date:
                books = db.get_books_by_date_range(user_id, start_date, end_date)
            else:
                books = db.get_books_by_user(user_id)
            
            if not books:
                logger.error(f"用户 {user_id} 在指定时间范围内没有书籍数据")
                return False
            
            # 写入CSV文件
            with open(output_file, 'w', newline='', encoding='utf-8-sig') as f:
                writer = csv.writer(f)
                # 写入表头
                writer.writerow(self.headers)
                
                # 写入数据行
                for book in books:
                    row = [
                        book[0] or '',  # 书名
                        book[1] or '',  # 作者
                        book[2] or '',  # 出版日期
                        book[3] or '',  # 豆瓣链接
                        book[4] or '',  # 评分
                        book[5] or '',  # 书评内容
                        book[6] or '',  # 评分日期
                        book[7] or '',  # 爬取时间
                        book[8] or ''   # 更新时间
                    ]
                    writer.writerow(row)
            
            logger.info(f"CSV文件已导出到: {output_file}")
            return True
            
        except Exception as e:
            logger.error(f"CSV导出失败: {e}")
            return False
    
    def export_books_by_rating(self, db: DoubanBookDB, user_id: str, rating: str, output_file: str) -> bool:
        """按评分导出书籍为CSV文件"""
        try:
            books = db.get_books_by_rating(user_id, rating)
            
            if not books:
                logger.error(f"用户 {user_id} 没有 {rating} 的书籍")
                return False
            
            # 写入CSV文件
            with open(output_file, 'w', newline='', encoding='utf-8-sig') as f:
                writer = csv.writer(f)
                # 写入表头
                writer.writerow(self.headers)
                
                # 写入数据行
                for book in books:
                    row = [
                        book[0] or '',  # 书名
                        book[1] or '',  # 作者
                        book[2] or '',  # 出版日期
                        book[3] or '',  # 豆瓣链接
                        book[4] or '',  # 评分
                        book[5] or '',  # 书评内容
                        book[6] or '',  # 评分日期
                        book[7] or '',  # 爬取时间
                        book[8] or ''   # 更新时间
                    ]
                    writer.writerow(row)
            
            logger.info(f"按评分 {rating} 导出的CSV文件已保存到: {output_file}")
            return True
            
        except Exception as e:
            logger.error(f"按评分导出CSV失败: {e}")
            return False