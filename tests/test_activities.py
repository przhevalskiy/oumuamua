"""
Tests for activities/browser.py, activities/search.py, activities/extract.py.
Activities are called directly (outside Temporal) in test context.
Mock flags are set via monkeypatch — never hardcoded True in activity code (I6).
"""
import pytest


# ── extract_page_content ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_extract_strips_nav_and_script():
    from activities.extract import extract_page_content

    html = """
    <html><body>
      <nav>Menu items go here</nav>
      <script>alert('xss')</script>
      <h1>Main Title</h1>
      <p>Real content lives here.</p>
      <footer>Footer content</footer>
    </body></html>
    """
    result = await extract_page_content(html)

    assert "Main Title" in result
    assert "Real content lives here" in result
    assert "Menu items" not in result
    assert "alert" not in result
    assert "Footer content" not in result


@pytest.mark.asyncio
async def test_extract_truncates_at_8000_chars():
    from activities.extract import extract_page_content

    long_html = f"<html><body><p>{'A' * 10000}</p></body></html>"
    result = await extract_page_content(long_html)

    assert len(result) <= 8100  # 8000 + "[content truncated]" margin
    assert "[content truncated]" in result


@pytest.mark.asyncio
async def test_summarize_results_truncates():
    from activities.extract import summarize_results

    texts = ["A" * 5000, "B" * 5000, "C" * 5000]
    result = await summarize_results(texts)

    assert len(result) <= 12100
    assert "[context truncated]" in result


# ── search_web (mock) ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_search_web_mock(monkeypatch):
    monkeypatch.setenv("USE_MOCK_SEARCH", "true")
    # Reload module to pick up env change
    import importlib
    import project.config as cfg
    importlib.reload(cfg)
    import activities.search as search_mod
    importlib.reload(search_mod)

    from activities.search import search_web

    results = await search_web("Scale AI Agentex")

    assert isinstance(results, list)
    assert len(results) >= 1
    assert "title" in results[0]
    assert "url" in results[0]
    assert "snippet" in results[0]


# ── navigate (mock) ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_navigate_mock(monkeypatch):
    monkeypatch.setenv("USE_MOCK_BROWSER", "true")
    import importlib
    import project.config as cfg
    importlib.reload(cfg)
    import activities.browser as browser_mod
    importlib.reload(browser_mod)

    from activities.browser import navigate

    html = await navigate("https://example.com")

    assert "<html" in html.lower()
    assert len(html) > 0


@pytest.mark.asyncio
async def test_navigate_blocks_localhost(monkeypatch):
    monkeypatch.setenv("USE_MOCK_BROWSER", "false")
    import importlib
    import project.config as cfg
    importlib.reload(cfg)
    import activities.browser as browser_mod
    importlib.reload(browser_mod)

    from activities.browser import navigate

    result = await navigate("http://localhost:8080/admin")

    assert "blocked" in result.lower()


@pytest.mark.asyncio
async def test_navigate_blocks_private_ip(monkeypatch):
    monkeypatch.setenv("USE_MOCK_BROWSER", "false")
    import importlib
    import project.config as cfg
    importlib.reload(cfg)
    import activities.browser as browser_mod
    importlib.reload(browser_mod)

    from activities.browser import navigate

    result = await navigate("http://192.168.1.1/")

    assert "blocked" in result.lower()
