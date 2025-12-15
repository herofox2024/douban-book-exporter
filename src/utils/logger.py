#!/usr/bin/env python3
"""
日志工具模块
使用loguru库实现统一的日志管理
"""

from loguru import logger
import os
from pathlib import Path

# 创建logs目录
LOG_DIR = Path("logs")
LOG_DIR.mkdir(exist_ok=True)

# 配置日志格式
LOG_FORMAT = "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>"

# 清除默认的日志配置
logger.remove()

# 添加控制台输出
logger.add(
    sink=lambda msg: print(msg, end=""),  # 使用print输出，确保在GUI中也能正常显示
    format=LOG_FORMAT,
    level="INFO",
    colorize=True,
    backtrace=True,
    diagnose=True
)

# 添加文件输出（按天滚动）
logger.add(
    sink=LOG_DIR / "douban_crawler_{time:YYYY-MM-DD}.log",
    format=LOG_FORMAT,
    level="DEBUG",
    rotation="00:00",
    retention="7 days",
    compression="zip",
    backtrace=True,
    diagnose=True,
    encoding="utf-8"
)

# 添加错误日志单独输出
logger.add(
    sink=LOG_DIR / "douban_crawler_error.log",
    format=LOG_FORMAT,
    level="ERROR",
    rotation="00:00",
    retention="30 days",
    compression="zip",
    backtrace=True,
    diagnose=True,
    encoding="utf-8"
)

# 导出logger实例
__all__ = ["logger"]