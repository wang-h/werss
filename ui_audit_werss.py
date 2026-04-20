from playwright.sync_api import sync_playwright
import time
import sys

def audit_ui():
    with sync_playwright() as p:
        # 尝试启动浏览器
        try:
            browser = p.chromium.launch(headless=True)
        except Exception as e:
            print(f"Error launching browser: {e}")
            print("Please ensure playwright browsers are installed: playwright install chromium")
            return

        page = browser.new_page(viewport={'width': 1440, 'height': 900})
        
        # 1. 检查登录页
        print("\n--- 正在审计 [登录页] ---")
        page.goto("http://localhost:5174/login")
        time.sleep(2)
        
        # 检查标题
        title = page.title()
        print(f"页面 Title: {title}")
        if "热度分析" in title:
            print("❌ 错误: 发现旧名称残余！")
        else:
            print("✅ 品牌校验通过: 微信公众号热度分析系统")

        # 检查配色 (取登录按钮颜色)
        try:
            btn_color = page.evaluate("window.getComputedStyle(document.querySelector('button')).backgroundColor")
            print(f"主按钮背景色 (RGB): {btn_color}")
            # Emerald-600 大约为 rgb(5, 150, 105) 或 rgb(16, 185, 129)
            if "5, 150" in btn_color or "16, 185" in btn_color or "10, 185" in btn_color:
                 print("✅ 配色校验通过: 医疗绿主题")
            else:
                 print(f"⚠️ 警告: 发现非标准配色 {btn_color}")
        except:
            print("⚠️ 无法定位按钮进行配色检查")

        page.screenshot(path="audit_login_final.png")
        print("📸 登录页审计截图已保存")

        # 2. 检查侧边栏 (即使未登录，Layout 结构通常也会加载)
        print("\n--- 正在审计 [主布局/侧边栏] ---")
        try:
            sidebar_title = page.locator("span:has-text('WeRSS')").first.text_content()
            print(f"侧边栏品牌文字: {sidebar_title}")
            if "热度分析" in sidebar_title:
                print("❌ 错误: 侧边栏发现旧名称！")
            else:
                print("✅ 侧边栏品牌校验通过")
        except:
             print("⚠️ 未能定位侧边栏文字")

        # 3. 全局文本扫描
        body_text = page.inner_text("body")
        if "微信公众号热度分析系统" in body_text:
             print("❌ 错误: 页面内容中仍包含旧名称！")
        else:
             print("✅ 全局文本扫描清洁")

        browser.close()

if __name__ == "__main__":
    audit_ui()
