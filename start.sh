#!/bin/bash
cd /app/
source install.sh

# 检查环境变量是否正确设置
echo "=== 环境变量检查 ==="
echo "USERNAME: ${USERNAME:-未设置}"
if [ -n "${PASSWORD}" ]; then
    echo "PASSWORD: 已设置（长度: ${#PASSWORD} 字符）"
else
    echo "PASSWORD: 未设置"
fi
echo "DB: ${DB:+已设置}"
echo "=================="

# Docker 环境默认执行初始化（init_user 会检查用户是否存在，存在则更新密码）
# 这样可以确保环境变量中的密码总是生效
python3 main.py -job True -init True