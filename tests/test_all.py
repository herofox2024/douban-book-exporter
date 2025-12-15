#!/usr/bin/env python3
"""
测试脚本 - 验证所有模块功能
"""

import os
import sys
from src.database.database import DoubanBookDB
from src.exporter.html_exporter import HTMLExporter

def test_database():
    """测试数据库功能"""
    print("1. 测试数据库功能...")
    
    try:
        db = DoubanBookDB()
        
        # 添加测试数据
        success = db.add_book(
            title="测试书籍",
            author="测试作者", 
            publish_date="2025-01",
            douban_url="https://book.douban.com/subject/12345/",
            rating="5星",
            review_content="这是一本很好的测试书籍",
            review_date="2025-01-16",
            user_id="test_user"
        )
        
        if success:
            print("   [OK] 数据库写入成功")
        else:
            print("   [FAIL] 数据库写入失败")
            return False
        
        # 读取数据
        books = db.get_books_by_user("test_user")
        if books and len(books) > 0:
            print(f"   [OK] 数据库读取成功，找到 {len(books)} 本书")
        else:
            print("   [FAIL] 数据库读取失败")
            return False
        
        # 获取统计信息
        stats = db.get_user_stats("test_user")
        print(f"   [OK] 统计信息: 总书籍 {stats['total_books']}，有书评 {stats['books_with_reviews']}")
        
        return True
        
    except Exception as e:
        print(f"   [FAIL] 数据库测试失败: {e}")
        return False

def test_html_export():
    """测试HTML导出功能"""
    print("2. 测试HTML导出功能...")
    
    try:
        db = DoubanBookDB()
        exporter = HTMLExporter()
        
        # 检查是否有测试数据
        stats = db.get_user_stats("test_user")
        if stats['total_books'] == 0:
            print("   ! 没有测试数据，跳过HTML导出测试")
            return True
        
        # 导出HTML
        output_file = "test_export.html"
        success = exporter.export_user_books(db, "test_user", output_file)
        
        if success and os.path.exists(output_file):
            print(f"   [OK] HTML导出成功: {output_file}")
            print(f"   [OK] 文件大小: {os.path.getsize(output_file)} 字节")
            
            # 清理测试文件
            os.remove(output_file)
            print("   [OK] 测试文件已清理")
            return True
        else:
            print("   [FAIL] HTML导出失败")
            return False
            
    except Exception as e:
        print(f"   [FAIL] HTML导出测试失败: {e}")
        return False

def test_gui_import():
    """测试GUI模块导入"""
    print("3. 测试GUI模块导入...")
    
    try:
        import tkinter as tk
        from src.gui.gui import DoubanBookGUI
        print("   [OK] GUI模块导入成功")
        print("   [OK] Tkinter可用")
        return True
    except ImportError as e:
        print(f"   [WARN] GUI模块导入失败: {e}")
        print("   [WARN] 这可能是因为缺少tkinter，但不影响命令行功能")
        return True
    except Exception as e:
        print(f"   [FAIL] GUI测试失败: {e}")
        return False

def test_crawler_import():
    """测试爬虫模块导入"""
    print("4. 测试爬虫模块导入...")
    
    try:
        from src.crawler.crawler import DoubanCrawler
        print("   [OK] 爬虫模块导入成功")
        
        # 测试创建爬虫实例
        db = DoubanBookDB()
        crawler = DoubanCrawler(db)
        print("   [OK] 爬虫实例创建成功")
        return True
    except Exception as e:
        print(f"   [FAIL] 爬虫模块测试失败: {e}")
        return False

def cleanup_test_data():
    """清理测试数据"""
    print("5. 清理测试数据...")
    
    try:
        db = DoubanBookDB()
        db.clear_user_books("test_user")
        print("   [OK] 测试数据已清理")
        return True
    except Exception as e:
        print(f"   [FAIL] 清理测试数据失败: {e}")
        return False

def main():
    """主测试函数"""
    print("豆瓣书评爬虫工具 - 功能测试")
    print("=" * 50)
    
    tests = [
        test_database,
        test_html_export, 
        test_gui_import,
        test_crawler_import,
        cleanup_test_data
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        try:
            if test():
                passed += 1
            print()
        except Exception as e:
            print(f"   [ERROR] 测试执行出错: {e}")
            print()
    
    print("=" * 50)
    print(f"测试完成: {passed}/{total} 项测试通过")
    
    if passed == total:
        print("[SUCCESS] 所有测试通过！工具可以正常使用。")
        print("\n快速开始:")
        print("  1. 运行 'python main.py' 启动GUI界面")
        print("  2. 运行 'python main.py --cli' 使用命令行模式")
        print("  3. 运行 'python main.py --help' 查看帮助信息")
    else:
        print("[WARNING] 部分测试失败，请检查依赖和配置。")
        return False
    
    return True

if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n测试被用户中断")
        sys.exit(0)
    except Exception as e:
        print(f"\n测试执行出错: {e}")
        sys.exit(1)