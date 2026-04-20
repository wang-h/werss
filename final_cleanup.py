import os

# 修正：还原为原始的微信公众号热度分析系统
targets = [
    ("WeRSS 知识感知系统", "微信公众号热度分析系统"),
    ("知识感知系统", "微信公众号热度分析系统"),
    ("WeRss知识感知系统", "微信公众号热度分析系统"),
    ("WeRSS微信公众号热度分析系统", "微信公众号热度分析系统")
]

def clean_file(filepath):
    try:
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
            print(f"Fixed: {filepath}")
    except Exception as e:
        print(f"Error processing {filepath}: {e}")

root_dir = "/Users/hao/Workspace/werss/static"
for root, dirs, files in os.walk(root_dir):
    for file in files:
        if file.endswith(('.js', '.html', '.css', '.json')):
            clean_file(os.path.join(root, file))

# Also clean the config.yaml if it exists
config_path = "/Users/hao/Workspace/werss/config.yaml"
if os.path.exists(config_path):
    clean_file(config_path)
