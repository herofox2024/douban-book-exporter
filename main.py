#!/usr/bin/env python3
"""
豆瓣书评爬虫工具 - 主程序入口
提供GUI界面和命令行两种使用方式
"""

import sys
import os
import argparse
from pathlib import Path
from src.utils.logger import logger

def main():
    """主程序入口"""
    parser = argparse.ArgumentParser(
        description="豆瓣书评爬虫工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用示例:
  %(prog)s                    # 启动GUI界面
  %(prog)s --cli              # 使用命令行模式
  %(prog)s --export user123   # 导出指定用户的HTML文件
  
注意事项:
  1. 首次使用需要配置豆瓣Cookie
  2. 数据存储在SQLite数据库中
  3. 支持增量更新和HTML导出
        """
    )
    
    parser.add_argument(
        '--cli', 
        action='store_true',
        help='使用命令行模式而不是GUI界面'
    )
    
    parser.add_argument(
        '--export',
        metavar='USER_ID',
        help='导出指定用户的HTML文件'
    )
    
    parser.add_argument(
        '--user',
        metavar='USER_ID',
        help='指定要爬取的用户ID（仅命令行模式）'
    )
    
    parser.add_argument(
        '--cookie',
        metavar='COOKIE',
        help='指定豆瓣Cookie（仅命令行模式）'
    )
    
    parser.add_argument(
        '--max-pages',
        type=int,
        metavar='N',
        help='最大爬取页数限制'
    )
    
    parser.add_argument(
        '--output',
        metavar='FILE',
        help='指定HTML输出文件名'
    )
    
    args = parser.parse_args()
    
    # 仅导出HTML
    if args.export:
        export_html_only(args.export, args.output)
        return
    
    # 命令行模式
    if args.cli:
        run_cli_mode(args)
        return
    
    # 默认启动GUI界面
    run_gui_mode()

def run_gui_mode():
    """启动GUI界面"""
    try:
        import tkinter as tk
        from src.gui.gui import DoubanBookGUI
        
        logger.info("启动GUI界面...")
        root = tk.Tk()
        app = DoubanBookGUI(root)
        root.mainloop()
        
    except ImportError as e:
        logger.error(f"启动GUI失败，缺少依赖: {e}")
        logger.info("请安装tkinter: pip install tk")
        sys.exit(1)
    except Exception as e:
        logger.error(f"GUI启动失败: {e}")
        sys.exit(1)

def run_cli_mode(args):
    """运行命令行模式"""
    from src.database.database import DoubanBookDB
    from src.crawler.crawler import DoubanCrawler
    from src.exporter.html_exporter import HTMLExporter
    
    # 获取用户输入
    user_id = args.user
    if not user_id:
        user_id = input("请输入豆瓣用户名: ").strip()
        if not user_id:
            logger.error("错误: 用户名不能为空")
            sys.exit(1)
    
    # 获取Cookie
    cookie = args.cookie
    if not cookie:
        cookie = os.getenv('DOUBAN_COOKIE', '')
        if not cookie:
            logger.info("请输入豆瓣Cookie（或设置DOUBAN_COOKIE环境变量）：")
            cookie = input().strip()
            if not cookie:
                logger.error("错误: Cookie不能为空")
                sys.exit(1)
    
    # 初始化数据库和爬虫
    db = DoubanBookDB()
    crawler = DoubanCrawler(db)
    
    try:
        logger.info(f"开始爬取用户 {user_id} 的数据...")
        crawler.crawl_user_books(user_id, cookie, args.max_pages)
        
        # 显示统计信息
        stats = db.get_user_stats(user_id)
        logger.info(f"\n爬取完成！")
        logger.info(f"总书籍数: {stats['total_books']}")
        logger.info(f"有书评数: {stats['books_with_reviews']}")
        
        if stats['rating_stats']:
            logger.info("评分统计:")
            for rating, count in sorted(stats['rating_stats'].items(), reverse=True):
                logger.info(f"  {rating}: {count}本")
        
        # 询问是否导出HTML
        export_html = input("\n是否导出HTML文件? (y/N): ").strip().lower()
        if export_html in ['y', 'yes']:
            output_file = args.output or f"{user_id}_豆瓣书评.html"
            exporter = HTMLExporter()
            if exporter.export_user_books(db, user_id, output_file):
                logger.info(f"HTML文件已导出: {output_file}")
            else:
                logger.error("HTML导出失败")
                
    except KeyboardInterrupt:
        logger.info("\n用户中断，爬取停止")
    except Exception as e:
        logger.error(f"爬取失败: {e}")
        sys.exit(1)

def export_html_only(user_id, output_file=None):
    """仅导出HTML文件"""
    from src.database.database import DoubanBookDB
    from src.exporter.html_exporter import HTMLExporter
    
    db = DoubanBookDB()
    stats = db.get_user_stats(user_id)
    
    if stats['total_books'] == 0:
        logger.error(f"错误: 用户 {user_id} 没有数据，请先爬取")
        sys.exit(1)
    
    output_file = output_file or f"{user_id}_豆瓣书评.html"
    
    exporter = HTMLExporter()
    if exporter.export_user_books(db, user_id, output_file):
        logger.info(f"HTML文件已导出: {output_file}")
        logger.info(f"总书籍数: {stats['total_books']}")
        logger.info(f"有书评数: {stats['books_with_reviews']}")
    else:
        logger.error("HTML导出失败")
        sys.exit(1)

def show_help():
    """显示帮助信息"""
    help_text = """
豆瓣书评爬虫工具 - 使用说明

功能特性:
- 爬取豆瓣用户的读书收藏和书评
- 数据存储在SQLite数据库中，支持增量更新
- 提供美观的HTML导出格式
- 支持GUI和命令行两种使用方式

获取Cookie方法:
1. 在浏览器中登录豆瓣
2. 访问你的收藏页面
3. 按F12打开开发者工具
4. 在Network标签页中找到页面请求
5. 复制请求头中的Cookie值

文件说明:
- database.py      - 数据库操作模块
- crawler_with_db.py - 爬虫核心模块
- html_exporter.py - HTML导出模块
- gui.py          - GUI界面模块
- main.py         - 主程序入口

数据文件:
- douban_books.db - SQLite数据库文件
- gui_config.txt  - GUI配置文件

联系方式:
如有问题或建议，请联系开发者。
    """
    logger.info(help_text)

if __name__ == "__main__":
    # 检查是否请求帮助
    if len(sys.argv) > 1 and sys.argv[1] in ['-h', '--help', 'help']:
        show_help()
        sys.exit(0)
    
    try:
        main()
    except KeyboardInterrupt:
        logger.info("\n程序被用户中断")
        sys.exit(0)
    except Exception as e:
        logger.error(f"程序运行出错: {e}")
        sys.exit(1)