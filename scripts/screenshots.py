"""Console screenshots for the README. Needs the console preview on :4173 (cd web && npm run build && npm run preview).

python scripts/screenshots.py [--chrome /usr/bin/google-chrome]
"""

from __future__ import annotations

import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).parents[1] / "docs" / "screenshots"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--chrome", default="/usr/bin/google-chrome")
    ap.add_argument("--url", default="http://localhost:4173")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=a.chrome)
        page = b.new_page(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")

        page.goto(f"{a.url}/#/northwind/conversations", wait_until="networkidle")
        page.wait_for_selector(".ledger-title")
        page.click("text=A tempting answer the content does not support")
        page.wait_for_timeout(400)
        page.screenshot(path=str(OUT / "conversation-claim-check.png"))
        page.click("text=CFO in Germany, consent banner not answered")
        page.wait_for_timeout(400)
        page.screenshot(path=str(OUT / "conversation-consent.png"))

        page.goto(f"{a.url}/#/northwind/routing", wait_until="networkidle")
        page.wait_for_selector(".jack")
        page.wait_for_timeout(900)
        page.screenshot(path=str(OUT / "routing.png"), full_page=True)
        page.select_option(".lead-form select >> nth=0", "Germany")
        page.fill(".lead-form input[type=number]", "80")
        page.select_option(".lead-form select >> nth=1", "Healthcare")
        page.wait_for_timeout(900)
        page.screenshot(path=str(OUT / "routing-review.png"), full_page=True)

        page.goto(f"{a.url}/#/northwind/security", wait_until="networkidle")
        page.wait_for_selector(".sq")
        page.wait_for_timeout(500)
        page.screenshot(path=str(OUT / "security.png"), full_page=True)

        page.goto(f"{a.url}/#/northwind/results", wait_until="networkidle")
        page.wait_for_selector(".figure")
        page.wait_for_timeout(900)
        page.screenshot(path=str(OUT / "results.png"), full_page=True)

        page.goto(f"{a.url}/#/kestrel/conversations", wait_until="networkidle")
        page.wait_for_selector(".ledger-title")
        page.wait_for_timeout(400)
        page.screenshot(path=str(OUT / "kestrel-conversation.png"))

        page.goto(f"{a.url}/#/northwind/voc", wait_until="networkidle")
        page.wait_for_selector(".voc-row")
        page.wait_for_timeout(700)
        page.screenshot(path=str(OUT / "product-feedback.png"))

        m = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, reduced_motion="reduce")
        m.goto(f"{a.url}/#/northwind/conversations", wait_until="networkidle")
        m.wait_for_selector(".ledger-title")
        m.screenshot(path=str(OUT / "conversation-mobile.png"), full_page=True)
        b.close()


if __name__ == "__main__":
    main()
