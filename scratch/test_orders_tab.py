import sys
import time
from playwright.sync_api import sync_playwright

def main():
    token = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImNtcHdyNWEzOTAwMDIzdm9wNTJ4a2d6ejAiLCJlbWFpbCI6IjIyMzc2MDg2MDJAcXEuY29tIiwicm9sZSI6IlNVUEVSX0FETUlOIiwic2Vzc2lvbklkIjoidGVzdC1zZXNzaW9uLWlkIiwidXNlciI6eyJpZCI6ImNtcHdyNWEzOTAwMDIzdm9wNTJ4a2d6ejAiLCJlbWFpbCI6IjIyMzc2MDg2MDJAcXEuY29tIiwicm9sZSI6IlNVUEVSX0FETUlOIn0sImV4cGlyZXMiOiIyMDI2LTA2LTE1VDA5OjA5OjA3LjYxOFoiLCJpYXQiOjE3ODA5MDk3NDcsImV4cCI6MTc4MTUxNDU0N30.BwFV7Cwb0u5vGWk5-OTv-CMjPGklc2kRFVqoASKXgXc"
    
    with sync_playwright() as p:
        # 1. 模拟移动端 Safari 视图
        device = p.devices['iPhone 12']
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            **device,
            locale="zh-CN",
            timezone_id="Asia/Shanghai"
        )
        
        # 2. 注入登录 Cookie
        context.add_cookies([{
            "name": "session",
            "value": token,
            "domain": "localhost",
            "path": "/",
            "httpOnly": True,
            "sameSite": "Lax"
        }])
        
        page = context.new_page()
        
        # 3. 监听控制台和页面崩溃报错
        console_errors = []
        page_errors = []
        
        def handle_console(msg):
            print(f"[Console {msg.type}] {msg.text}")
            if msg.type == "error":
                console_errors.append(msg.text)
                
        def handle_pageerror(err):
            print(f"[Page Error Exception] {err}")
            page_errors.append(err)
            
        page.on("console", handle_console)
        page.on("pageerror", handle_pageerror)
        
        # 4. 访问订单页面并等待网络空闲
        print("Navigating to orders page...")
        page.goto("http://localhost:3000/orders")
        page.wait_for_load_state("networkidle")
        time.sleep(2)  # 给组件渲染和初始请求多预留一点时间
        
        # 截图初始的“今日推单”页面
        page.screenshot(path="e:/GitHouse/goods/scratch/today_orders.png")
        print("Today orders page screenshot saved.")
        
        # 5. 点击“全部订单”Tab
        print("Clicking '全部订单' tab...")
        # 我们可以根据文本找到“全部订单”按钮
        all_orders_tab = page.get_by_role("button", name="全部订单")
        if all_orders_tab.is_visible():
            all_orders_tab.click()
            print("Clicked '全部订单' tab.")
        else:
            print("ERROR: '全部订单' tab not found!")
            
        # 6. 等待页面请求或者可能发生的渲染崩溃
        print("Waiting for page updates...")
        page.wait_for_load_state("networkidle")
        time.sleep(3)
        
        # 截图切换到“全部订单”后的画面
        page.screenshot(path="e:/GitHouse/goods/scratch/all_orders.png")
        print("All orders page screenshot saved.")
        
        # 7. 关闭浏览器并打印测试结论
        browser.close()
        
        print("\n--- TEST CONCLUSION ---")
        if page_errors:
            print(f"FAILED: Found {len(page_errors)} page errors during rendering!")
            for err in page_errors:
                print(f" - {err}")
            sys.exit(1)
        elif console_errors:
            print(f"WARNING: Found {len(console_errors)} console errors, check details above.")
            sys.exit(0)
        else:
            print("SUCCESS: Tab switched without any rendering errors or console errors!")
            sys.exit(0)

if __name__ == "__main__":
    main()
