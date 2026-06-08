import sys
import os
from playwright.sync_api import sync_playwright

def main():
    token = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImNtcHdyNWEzOTAwMDIzdm9wNTJ4a2d6ejAiLCJlbWFpbCI6IjIyMzc2MDg2MDJAcXEuY29tIiwicm9sZSI6IlNVUEVSX0FETUlOIiwic2Vzc2lvbklkIjoidGVzdC1zZXNzaW9uLWlkIiwidXNlciI6eyJpZCI6ImNtcHdyNWEzOTAwMDIzdm9wNTJ4a2d6ejAiLCJlbWFpbCI6IjIyMzc2MDg2MDJAcXEuY29tIiwicm9sZSI6IlNVUEVSX0FETUlOIn0sImV4cGlyZXMiOiIyMDI2LTA2LTE1VDA4OjAyOjEwLjgyNVoiLCJpYXQiOjE3ODA5MDU3MzAsImV4cCI6MTc4MTUxMDUzMH0.CIw9W3r50gemcvqroNWrxLX5MUOR5O9Rglap1Fd2lyo"
    
    with sync_playwright() as p:
        # 模拟 iPhone 12 Pro 的视口与参数
        iphone = p.devices['iPhone 12 Pro']
        browser = p.chromium.launch(headless=True)
        
        # 创建一个 context 并加入 cookie
        context = browser.new_context(**iphone)
        context.add_cookies([{
            'name': 'session',
            'value': token,
            'domain': 'localhost',
            'path': '/',
            'httpOnly': True,
            'sameSite': 'Lax'
        }])
        
        page = context.new_page()
        
        # 监听控制台事件
        console_messages = []
        def on_console(msg):
            log_str = f"[{msg.type}] {msg.text}"
            console_messages.append(log_str)
            print(f"Browser Console: {log_str}")
            
        page.on("console", on_console)
        page.on("pageerror", lambda err: print(f"Browser PageError: {err}"))
        
        try:
            print("Navigating to http://localhost:3000/orders ...")
            page.goto('http://localhost:3000/orders', timeout=30000)
            
            # 等待网络空闲
            page.wait_for_load_state('networkidle')
            page.wait_for_timeout(2000)
            
            print("Clicking '全部订单' button...")
            all_orders_tab = page.locator('button:has-text("全部订单")')
            all_orders_tab.click()
            
            print("Waiting for orders to load...")
            page.wait_for_load_state('networkidle')
            page.wait_for_timeout(3000)
            
            # 截图保存以供查看
            screenshot_path = os.path.join(os.path.dirname(__file__), 'mobile_viewport.png')
            page.screenshot(path=screenshot_path)
            print(f"Screenshot saved to {screenshot_path}")
            
        except Exception as e:
            print(f"Error occurred: {e}")
        finally:
            browser.close()

if __name__ == '__main__':
    main()
