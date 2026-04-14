#!/usr/bin/env python3
"""
测试不同关键词提取方法的效果对比
比较：TextRank、KeyBERT（Model2Vec）、KeyBERT（完整版）、AI（DeepSeek）
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.tag_extractor import TagExtractor
import asyncio
from typing import Dict, List

def print_section(title: str):
    """打印分隔线"""
    print("\n" + "=" * 60)
    print(f" {title}")
    print("=" * 60)

def test_extraction_methods():
    """测试所有提取方法"""
    
    # 测试用例
    test_cases = [
        {
            "title": "一行代码能干大事：英伟达发布新AI芯片",
            "description": "英伟达发布了一行代码就能运行的AI芯片，这是AI领域的重大突破",
            "content": """英伟达公司今天正式发布了全新的AI芯片H200，这款芯片的最大特点是只需要一行代码就能运行复杂的AI模型。英伟达CEO黄仁勋在发布会上表示，H200芯片采用了最新的Tensor Core架构，支持FP8精度计算，性能相比上一代A100提升了2倍。

这款芯片主要面向大语言模型训练和推理场景，支持GPT-4、Claude、Llama等主流模型。英伟达还同时发布了配套的CUDA 12.0开发工具包，开发者可以通过简单的API调用实现模型部署。

市场分析师认为，H200的发布将进一步巩固英伟达在AI芯片领域的领导地位，同时也将对AMD、Intel等竞争对手造成压力。预计H200将在2024年第一季度开始批量供货。"""
        },
        {
            "title": "AI技术的阳谋：大模型时代的竞争",
            "description": "AI技术的竞争是一场阳谋，各大公司都在布局大模型",
            "content": """AI技术的竞争已经进入白热化阶段，各大科技公司都在公开布局大模型领域。英伟达通过GPU硬件优势占据算力高地，OpenAI凭借GPT系列模型在应用层领先，Meta则开源了Llama系列模型试图建立生态。

这场竞争被称为"阳谋"，因为所有参与者都在明面上展示自己的技术实力和战略布局。谷歌推出了Gemini模型，微软投资OpenAI并推出Copilot，亚马逊则通过AWS云服务提供AI基础设施。

分析师认为，大模型时代的竞争不仅仅是技术竞争，更是生态和标准的竞争。谁能建立更完善的开发者生态，谁就能在下一轮竞争中占据优势。目前来看，OpenAI和英伟达的组合正在形成强大的护城河。"""
        },
        {
            "title": "DeepSeek发布新模型，性能超越GPT-4",
            "description": "DeepSeek公司发布了最新的AI模型，在多个基准测试中超越了GPT-4",
            "content": """中国AI公司DeepSeek今天发布了最新的AI模型DeepSeek-V3，该模型在多个权威基准测试中超越了GPT-4。根据官方发布的数据，DeepSeek-V3在MMLU（大规模多任务语言理解）测试中得分92.5分，超过了GPT-4的90.2分。

DeepSeek-V3采用了创新的MoE（专家混合）架构，参数量达到1.3万亿，但实际激活的参数量只有370亿，这使得模型在保持高性能的同时大幅降低了推理成本。模型支持中英文双语，在中文理解能力上表现尤为突出。

DeepSeek公司创始人表示，DeepSeek-V3的发布标志着中国AI公司在基础模型领域达到了世界领先水平。该模型已经在多个应用场景中部署，包括代码生成、文档总结、问答系统等。预计DeepSeek-V3将对全球AI市场格局产生重要影响。"""
        }
    ]
    
    extractor = TagExtractor()
    
    for i, case in enumerate(test_cases, 1):
        print_section(f"测试用例 {i}: {case['title']}")
        
        results = {}
        
        # 1. TextRank
        print("\n📊 方法1: TextRank（jieba）")
        try:
            keywords_textrank = extractor.extract(
                case['title'],
                case['description'],
                case['content'],
                method="textrank"
            )
            results['TextRank'] = keywords_textrank
            print(f"   关键词: {keywords_textrank}")
        except Exception as e:
            print(f"   ❌ 失败: {e}")
            results['TextRank'] = []
        
        # 2. KeyBERT (Model2Vec) - 标准方案
        print("\n📊 方法2: KeyBERT + Model2Vec（标准方案）")
        try:
            # 临时禁用混合方案，测试标准 KeyBERT
            from core.config import cfg
            original_hybrid = cfg.get("article_tag.keybert.hybrid", True)
            cfg.config.setdefault("article_tag", {}).setdefault("keybert", {})["hybrid"] = False
            
            keywords_keybert = extractor.extract(
                case['title'],
                case['description'],
                case['content'],
                method="keybert"
            )
            # 恢复配置
            cfg.config.setdefault("article_tag", {}).setdefault("keybert", {})["hybrid"] = original_hybrid
            
            results['KeyBERT-标准'] = keywords_keybert
            print(f"   关键词: {keywords_keybert}")
        except Exception as e:
            print(f"   ❌ 失败: {e}")
            print(f"   💡 提示: 需要安装 keybert-model2vec 依赖")
            print(f"      运行: uv pip install -e '.[keybert-model2vec]'")
            results['KeyBERT-标准'] = []
        
        # 2.5. KeyBERT (Model2Vec) - 混合方案
        print("\n📊 方法2.5: KeyBERT + Model2Vec（混合方案，推荐）")
        try:
            # 临时启用混合方案
            from core.config import cfg
            original_hybrid = cfg.get("article_tag.keybert.hybrid", True)
            cfg.config.setdefault("article_tag", {}).setdefault("keybert", {})["hybrid"] = True
            
            keywords_keybert_hybrid = extractor.extract(
                case['title'],
                case['description'],
                case['content'],
                method="keybert"
            )
            # 恢复配置
            cfg.config.setdefault("article_tag", {}).setdefault("keybert", {})["hybrid"] = original_hybrid
            
            results['KeyBERT-混合'] = keywords_keybert_hybrid
            print(f"   关键词: {keywords_keybert_hybrid}")
        except Exception as e:
            print(f"   ❌ 失败: {e}")
            results['KeyBERT-混合'] = []
        
        # 3. AI (DeepSeek)
        print("\n📊 方法3: AI（DeepSeek API）")
        try:
            if extractor.ai_client:
                keywords_ai = asyncio.run(extractor.extract_with_ai(
                    case['title'],
                    case['description'],
                    case['content'],
                    max_tags=5
                ))
                results['AI-DeepSeek'] = keywords_ai
                print(f"   关键词: {keywords_ai}")
            else:
                print("   ⚠️  AI 客户端未配置（需要 OPENAI_API_KEY）")
                results['AI-DeepSeek'] = []
        except Exception as e:
            print(f"   ❌ 失败: {e}")
            results['AI-DeepSeek'] = []
        
        # 对比分析
        print_section("对比分析")
        print("\n方法对比：")
        print(f"{'方法':<20} {'关键词数量':<12} {'关键词'}")
        print("-" * 70)
        for method, keywords in results.items():
            count = len(keywords)
            keywords_str = ", ".join(keywords) if keywords else "无"
            print(f"{method:<20} {count:<12} {keywords_str}")
        
        # 质量评估
        print("\n质量评估：")
        bad_patterns = ['行代码', '行代码能干', '代码能干', '能干', '伟达', '阳谋']
        
        for method, keywords in results.items():
            if not keywords:
                continue
            bad_count = sum(1 for kw in keywords if any(pattern in kw for pattern in bad_patterns))
            quality = "✅ 好" if bad_count == 0 else f"⚠️  有 {bad_count} 个不合适的词"
            print(f"  {method:<20} {quality}")
        
        print("\n" + "-" * 60)
    
    # 总结
    print_section("总结")
    print("\n各方法特点：")
    print("\n1. TextRank（jieba）:")
    print("   ✅ 优点: 轻量级（~50MB），速度快，无需额外依赖")
    print("   ⚠️  缺点: 可能出现不完整片段（如'行代码'、'代码能干'）")
    print("   💾 内存: ~50MB")
    print("   ⚡ 速度: 很快")
    
    print("\n2. KeyBERT + Model2Vec:")
    print("   ✅ 优点: CPU友好，中文支持好，质量较高，不需要PyTorch")
    print("   ⚠️  缺点: 需要安装额外依赖，首次加载需要下载模型")
    print("   💾 内存: ~200-300MB")
    print("   ⚡ 速度: 快（CPU上很快）")
    
    print("\n3. AI（DeepSeek）:")
    print("   ✅ 优点: 质量最好，语义理解强，能提取具体实体")
    print("   ⚠️  缺点: 需要API调用，有成本，速度较慢")
    print("   💾 内存: 无（API调用）")
    print("   ⚡ 速度: 较慢（网络延迟）")
    print("   💰 成本: 按API调用计费")

if __name__ == "__main__":
    test_extraction_methods()

