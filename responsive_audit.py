from playwright.sync_api import sync_playwright
import time

def audit_responsive():
    viewports = [
        {'width': 375, 'height': 667, 'name': 'mobile'},
        {'width': 768, 'height': 1024, 'name': 'tablet'},
        {'width': 1440, 'height': 900, 'name': 'desktop'}
    ]
    
    urls = [
        ("/dashboard", "dashboard"),
        ("/articles", "articles"),
        ("/subscriptions", "subscriptions")
    ]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        for vp in viewports:
            print(f"\n--- 正在检查 {vp['name']} 尺寸 ({vp['width']}px) ---")
            page.set_viewport_size(vp)
            
            for path, name in urls:
                try:
                    page.goto(f"http://localhost:5174{path}")
                    time.sleep(2)
                    # 检查是否有横向滚动条 (溢出的标志)
                    has_h_scroll = page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
                    if has_h_scroll:
                        print(f"❌ 警告: {name} 页面在 {vp['name']} 下出现横向溢出！")
                    
                    page.screenshot(path=f"responsive_{vp['name']}_{name}.png")
                except:
                    print(f"⚠️ 无法访问 {name}")

        browser.close()

if __name__ == "__main__":
    audit_responsive()
