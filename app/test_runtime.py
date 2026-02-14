"""Systematic bug hunt: collect ALL errors from every layer."""
from playwright.sync_api import sync_playwright
import sys, json

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 900})

        console_errors = []
        page_errors = []
        warnings = []
        page.on("console", lambda msg: (
            console_errors.append(msg.text) if msg.type == "error"
            else warnings.append(msg.text) if msg.type == "warning"
            else None
        ))
        page.on("pageerror", lambda err: page_errors.append(str(err)))

        print("=" * 60)
        print("CONTAM-Next Systematic Bug Hunt")
        print("=" * 60)

        # ── Layer 1: App loads ──
        print("\n[Layer 1] Loading app...")
        page.goto("http://localhost:5173")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)
        print(f"  Console errors so far: {len(console_errors)}")
        print(f"  Page errors so far: {len(page_errors)}")
        for e in page_errors:
            print(f"    PAGE_ERROR: {e[:200]}")
        for e in console_errors:
            print(f"    CONSOLE_ERROR: {e[:200]}")

        # ── Layer 2: WelcomePage ──
        print("\n[Layer 2] WelcomePage...")
        title = page.locator("text=CONTAM-Next").count()
        btns = ["新建项目", "空白画布", "示例模型", "打开文件"]
        missing_btns = [b for b in btns if page.locator(f"text={b}").count() == 0]
        print(f"  Title found: {title > 0}")
        print(f"  Missing buttons: {missing_btns or 'none'}")

        # ── Layer 3: Enter Canvas ──
        print("\n[Layer 3] Entering canvas...")
        page.locator("text=空白画布").click()
        page.wait_for_timeout(2500)
        errs_after_canvas = len(console_errors)
        print(f"  New console errors: {console_errors[errs_after_canvas - len(console_errors):]}" if len(console_errors) > 0 else "  No errors")

        canvas = page.locator("canvas")
        print(f"  Canvas elements: {canvas.count()}")
        toolbar_btns = page.locator("aside button, [aria-label]").count()
        print(f"  Toolbar buttons: {toolbar_btns}")
        footer = page.locator("footer").count()
        print(f"  StatusBar: {footer > 0}")
        tabs_25d = page.locator("text=2.5D 画布").count()
        tabs_ctrl = page.locator("text=控制网络").count()
        print(f"  Tab '2.5D 画布': {tabs_25d > 0}")
        print(f"  Tab '控制网络': {tabs_ctrl > 0}")

        # ── Layer 4: Tool interactions ──
        print("\n[Layer 4] Tool interactions...")
        # Wall tool
        page.keyboard.press("2")
        page.wait_for_timeout(500)
        wall_ind = page.locator("text=画墙模式").count()
        print(f"  Wall tool indicator: {wall_ind > 0}")
        errs_wall = len(console_errors)

        # Try drawing a wall segment
        print("  Drawing wall segment...")
        page.mouse.click(500, 400)
        page.wait_for_timeout(300)
        page.mouse.click(700, 400)
        page.wait_for_timeout(300)
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)
        print(f"  Errors after wall draw: {console_errors[errs_wall:]}" if len(console_errors) > errs_wall else "  No errors during wall draw")

        # Select tool
        page.keyboard.press("1")
        page.wait_for_timeout(300)

        # Door tool
        page.keyboard.press("3")
        page.wait_for_timeout(500)
        door_ind = page.locator("text=放置门").count()
        print(f"  Door tool indicator: {door_ind > 0}")
        page.keyboard.press("1")
        page.wait_for_timeout(200)

        # ── Layer 5: Property Panel ──
        print("\n[Layer 5] Property panel...")
        panel_tabs = ["模型", "污染物", "排程", "控制", "人员"]
        for tab in panel_tabs:
            loc = page.locator(f"button:has-text('{tab}'), [role='tab']:has-text('{tab}')")
            if loc.count() > 0:
                try:
                    loc.first.click(timeout=3000, force=True)
                    page.wait_for_timeout(300)
                    print(f"  Tab '{tab}': ✅ clickable")
                except Exception as ex:
                    print(f"  Tab '{tab}': ❌ click failed ({str(ex)[:80]})")
            else:
                print(f"  Tab '{tab}': ❌ NOT FOUND")

        # ── Layer 6: Control network tab ──
        print("\n[Layer 6] Control network tab...")
        errs_before_ctrl = len(console_errors)
        ctrl = page.locator("text=控制网络")
        if ctrl.count() > 0:
            ctrl.first.click()
            page.wait_for_timeout(1500)
            print(f"  Errors after switch: {console_errors[errs_before_ctrl:]}" if len(console_errors) > errs_before_ctrl else "  No errors")
            # Check React Flow renders
            rf = page.locator(".react-flow").count()
            print(f"  ReactFlow container: {rf > 0}")
        # Switch back
        page.locator("text=2.5D 画布").first.click()
        page.wait_for_timeout(500)

        # ── Layer 7: Floor switcher ──
        print("\n[Layer 7] Floor switcher...")
        # Look for the add floor button
        add_btns = page.locator("button")
        floor_add = None
        for i in range(add_btns.count()):
            btn = add_btns.nth(i)
            try:
                inner = btn.inner_html(timeout=500)
                if "plus" in inner.lower() or "+" == btn.inner_text(timeout=500).strip():
                    floor_add = btn
                    break
            except:
                pass
        if floor_add:
            print("  Add floor button found")
        else:
            print("  Add floor button: searching by svg...")
            # Try lucide Plus icon
            plus_svg = page.locator("button svg.lucide-plus, button svg.lucide-circle-plus")
            print(f"  Plus icon buttons: {plus_svg.count()}")

        # ── Layer 8: Dark mode toggle ──
        print("\n[Layer 8] Dark mode...")
        errs_before_dark = len(console_errors)
        # Click moon/sun icon in header
        header_btns = page.locator("header button")
        for i in range(header_btns.count()):
            btn = header_btns.nth(i)
            try:
                html = btn.inner_html(timeout=300)
                if "moon" in html.lower() or "sun" in html.lower():
                    btn.click()
                    page.wait_for_timeout(600)
                    is_dark = page.locator("html.dark").count() > 0
                    print(f"  Dark mode toggled: {is_dark}")
                    break
            except:
                pass
        print(f"  Errors after dark toggle: {console_errors[errs_before_dark:]}" if len(console_errors) > errs_before_dark else "  No errors")

        # ── Layer 9: Run simulation (empty model) ──
        print("\n[Layer 9] Run simulation on empty model...")
        errs_before_run = len(console_errors)
        run_btn = page.locator("button:has-text('稳态求解'), button:has-text('瞬态仿真')")
        if run_btn.count() > 0:
            run_btn.first.click()
            page.wait_for_timeout(2000)
            print(f"  Errors after run: {console_errors[errs_before_run:]}" if len(console_errors) > errs_before_run else "  No errors during run")
            # Check for toast/error notification
            toast = page.locator("[role='status'], [data-state='open']").count()
            print(f"  Toast/notification shown: {toast > 0}")
        else:
            print("  Run button not found!")

        # ══════════════════════════════════════════════
        # SUMMARY
        # ══════════════════════════════════════════════
        print("\n" + "=" * 60)
        print("SUMMARY")
        print("=" * 60)
        print(f"Total console errors: {len(console_errors)}")
        print(f"Total page errors: {len(page_errors)}")
        print(f"Total warnings: {len(warnings)}")

        if console_errors:
            print("\n── Console Errors ──")
            for i, e in enumerate(console_errors):
                print(f"  [{i+1}] {e[:250]}")

        if page_errors:
            print("\n── Page Errors (uncaught exceptions) ──")
            for i, e in enumerate(page_errors):
                print(f"  [{i+1}] {e[:250]}")

        if warnings:
            print(f"\n── Warnings ({len(warnings)}) ──")
            for w in warnings[:10]:
                print(f"  - {w[:200]}")

        browser.close()

        critical = [e for e in page_errors] + [e for e in console_errors if "TypeError" in e or "Uncaught" in e or "Cannot" in e]
        if critical:
            print(f"\n❌ {len(critical)} CRITICAL issues found")
            return 1
        print(f"\n✅ No critical runtime issues")
        return 0

if __name__ == "__main__":
    sys.exit(main())
