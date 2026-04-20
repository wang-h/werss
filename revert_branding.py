import os

# 定义还原映射
targets = [
    ("微信公众号热度分析系统", "微信公众号热度分析系统"),
    ("微信公众号热度分析系统", "微信公众号热度分析系统"),
    ("热度分析中心", "热度分析中心"),
    ("微信助手实验室", "微信助手实验室"),
    ("Heat Analysis", "Heat Analysis"),
    ("Heat Analysis System", "Heat Analysis System"),
    ("Heat Analysis", "Heat Analysis"),
    ("Article Library", "Article Library")
]

def revert_file(filepath):
    try:
        # 跳过二进制文件和特定的目录
        if any(d in filepath for d in ['.git', 'node_modules', 'dist', '.venv', '__pycache__']):
            return
            
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        new_content = content
        changed = False
        for old, new in targets:
            if old in new_content:
                new_content = new_content.replace(old, new)
                changed = True
        
        if changed:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Reverted: {filepath}")
    except Exception as e:
        print(f"Error processing {filepath}: {e}")

# 遍历整个项目
root_dir = "/Users/hao/Workspace/werss"
for root, dirs, files in os.walk(root_dir):
    for file in files:
        # 处理常见文本后缀
        if file.endswith(('.tsx', '.ts', '.py', '.md', '.yaml', '.yml', '.env', '.development', '.production', '.html', '.json', '.toml')):
            revert_file(os.path.join(root, file))

print("Source code reversion complete.")
