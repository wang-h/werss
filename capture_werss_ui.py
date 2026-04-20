from playwright.sync_api import sync_playwright
import time
import os

def capture_werss_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        
        urls = [
            ("/dashboard", "werss_dashboard"),
            ("/articles", "werss_articles"),
            ("/subscriptions", "werss_subscriptions")
        ]
        
        for path, name in urls:
            print(f"Capturing {name}...")
            try:
                page.goto(f"http://localhost:5174{path}")
                time.sleep(3) # Wait for animation/data
                page.screenshot(path=f"{name}.png")
            except Exception as e:
                print(f"Failed to capture {name}: {e}")
        
        browser.close()

if __name__ == "__main__":
    capture_werss_ui()
