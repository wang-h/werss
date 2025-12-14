#!/usr/bin/env python3
"""
从中文 BGE 模型蒸馏 Model2Vec 模型
使用方法：
    pip install keybert --no-deps scikit-learn "model2vec[distill]"
    python scripts/distill_chinese_model2vec.py
"""
from model2vec.distill import distill
import os

def distill_chinese_model():
    """从中文 BGE 模型蒸馏 Model2Vec"""
    
    # 可选的中文 BGE 模型
    chinese_models = {
        "bge-base-zh": "BAAI/bge-base-zh-v1.5",  # 中文基础模型
        "bge-large-zh": "BAAI/bge-large-zh-v1.5",  # 中文大型模型
        "bge-m3": "BAAI/bge-m3",  # 多语言模型（包含中文）
    }
    
    print("=" * 60)
    print("从中文 BGE 模型蒸馏 Model2Vec")
    print("=" * 60)
    
    print("\n可选的中文 BGE 模型：")
    for key, model in chinese_models.items():
        print(f"  {key}: {model}")
    
    # 默认使用 bge-base-zh-v1.5
    model_name = chinese_models.get("bge-base-zh", "BAAI/bge-base-zh-v1.5")
    output_dir = "models/m2v_chinese"
    
    print(f"\n📦 开始蒸馏模型: {model_name}")
    print(f"📁 输出目录: {output_dir}")
    print("\n⏳ 这可能需要几分钟时间（首次运行需要下载模型）...")
    
    try:
        # 蒸馏模型（约30秒到几分钟，取决于模型大小）
        m2v_model = distill(model_name=model_name)
        
        # 创建输出目录
        os.makedirs(output_dir, exist_ok=True)
        
        # 保存模型
        m2v_model.save_pretrained(output_dir)
        
        print(f"\n✅ 模型蒸馏成功！")
        print(f"📁 模型已保存到: {output_dir}")
        print(f"\n💡 使用方法：")
        print(f"   在 config.yaml 中设置:")
        print(f"   article_tag:")
        print(f"     keybert:")
        print(f"       model: {os.path.abspath(output_dir)}")
        
    except Exception as e:
        print(f"\n❌ 蒸馏失败: {e}")
        import traceback
        traceback.print_exc()
        print(f"\n💡 提示：")
        print(f"   1. 确保已安装: pip install 'model2vec[distill]'")
        print(f"   2. 确保有网络连接（首次运行需要下载模型）")
        print(f"   3. 如果内存不足，可以尝试使用更小的模型")

if __name__ == "__main__":
    distill_chinese_model()

