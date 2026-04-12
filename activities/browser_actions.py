"""
Browser action Temporal Activities — form filling, structure extraction, waiting.
No screenshots. No vision. Pure DOM interaction via Playwright.
Zero LLM calls. Zero Agentex SDK imports. (I1)

Reuses the persistent browser session created by navigate() — same workflow_id key.
"""
from __future__ import annotations

import structlog
from temporalio import activity

from project.config import BROWSER_TIMEOUT_MS, USE_MOCK_BROWSER

logger = structlog.get_logger(__name__)


def _get_session_sync(workflow_id: str):
    """Import _get_session from browser.py — sessions are shared per workflow_id."""
    from activities.browser import _get_session
    return _get_session(workflow_id)


@activity.defn(name="fill_input")
async def fill_input(selector: str, value: str) -> str:
    """
    Fill a form input field identified by CSS selector, name, or placeholder text.
    Returns confirmation or error string.
    Requires navigate() to have been called first in this workflow.
    """
    log = logger.bind(selector=selector, value_len=len(value))

    if USE_MOCK_BROWSER:
        log.info("fill_input_mock")
        return f"Filled '{selector}' (mock)."

    workflow_id = activity.info().workflow_id
    from activities.browser import _get_session
    _, _, context = await _get_session(workflow_id)

    pages = context.pages
    if not pages:
        return "Error: no page loaded. Call navigate() first."

    page = pages[-1]
    try:
        # Try CSS selector first, then fallback to label/placeholder
        await page.fill(selector, value, timeout=BROWSER_TIMEOUT_MS)
        log.info("fill_input_ok")
        return f"Filled '{selector}'."
    except Exception as e:
        log.warning("fill_input_failed", error=str(e))
        return f"Error filling '{selector}': {e}"


@activity.defn(name="submit_form")
async def submit_form(selector: str) -> str:
    """
    Click a submit button or trigger form submission.
    selector: CSS selector for the button, or 'form' to submit the first form directly.
    Returns the resulting page URL + confirmation, or error.
    """
    log = logger.bind(selector=selector)

    if USE_MOCK_BROWSER:
        log.info("submit_form_mock")
        return "Form submitted (mock)."

    workflow_id = activity.info().workflow_id
    from activities.browser import _get_session
    _, _, context = await _get_session(workflow_id)

    pages = context.pages
    if not pages:
        return "Error: no page loaded. Call navigate() first."

    page = pages[-1]
    try:
        if selector.lower() == "form":
            await page.evaluate("document.querySelector('form').submit()")
        else:
            await page.click(selector, timeout=BROWSER_TIMEOUT_MS)

        # Wait briefly for navigation to settle
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=10000)
        except Exception:
            pass

        result_url = page.url
        log.info("submit_form_ok", url=result_url)
        return f"Submitted. Current URL: {result_url}"
    except Exception as e:
        log.warning("submit_form_failed", error=str(e))
        return f"Error submitting '{selector}': {e}"


@activity.defn(name="get_page_structure")
async def get_page_structure() -> str:
    """
    Returns a concise text representation of interactive elements on the current page:
    forms, inputs, buttons, and key links. No screenshots. No HTML blobs.
    Used by TaskPlanner to understand what selectors to use.
    """
    if USE_MOCK_BROWSER:
        return "PAGE STRUCTURE\nURL: https://mock.example.com\nFORMS: (mock)\n  input[name='q'] placeholder='Search'\n  button[type='submit'] → 'Go'"

    workflow_id = activity.info().workflow_id
    from activities.browser import _get_session
    _, _, context = await _get_session(workflow_id)

    pages = context.pages
    if not pages:
        return "Error: no page loaded. Call navigate() first."

    page = pages[-1]

    try:
        data = await page.evaluate("""
        () => {
            const truncate = (s, n) => s ? s.toString().slice(0, n) : '';
            const result = {
                url: location.href,
                title: document.title,
                forms: [],
                standalone_inputs: [],
                buttons: [],
                links: []
            };

            // Forms
            document.querySelectorAll('form').forEach((form, fi) => {
                const f = {
                    index: fi,
                    id: form.id || null,
                    action: truncate(form.action, 80),
                    method: form.method || 'get',
                    fields: []
                };
                form.querySelectorAll('input, select, textarea, button').forEach(el => {
                    if (el.type === 'hidden') return;
                    f.fields.push({
                        tag: el.tagName.toLowerCase(),
                        type: el.type || null,
                        name: el.name || null,
                        id: el.id || null,
                        placeholder: truncate(el.placeholder, 50),
                        text: truncate(el.innerText || el.value, 50),
                        required: el.required || false
                    });
                });
                result.forms.push(f);
            });

            // Standalone inputs (not inside forms)
            document.querySelectorAll('input:not(form input), textarea:not(form textarea)').forEach(el => {
                if (el.type === 'hidden') return;
                result.standalone_inputs.push({
                    type: el.type || 'text',
                    name: el.name || null,
                    id: el.id || null,
                    placeholder: truncate(el.placeholder, 50)
                });
            });

            // Buttons outside forms
            document.querySelectorAll('button:not(form button), [role="button"]:not(form [role="button"])').forEach(el => {
                const text = truncate(el.innerText, 60);
                if (text) result.buttons.push({ id: el.id || null, text, type: el.type || null });
            });

            // Key links (limit to 10)
            const links = [];
            document.querySelectorAll('a[href]').forEach(el => {
                const text = truncate(el.innerText, 50);
                if (text && links.length < 10) {
                    links.push({ href: truncate(el.href, 80), text });
                }
            });
            result.links = links;

            return result;
        }
        """)
    except Exception as e:
        logger.warning("get_page_structure_failed", error=str(e))
        return f"Error extracting page structure: {e}"

    # Format as readable text for the TaskPlanner
    lines = [
        f"PAGE STRUCTURE",
        f"URL: {data['url']}",
        f"Title: {data['title']}",
        "",
    ]

    if data["forms"]:
        lines.append(f"FORMS ({len(data['forms'])}):")
        for form in data["forms"]:
            fid = f"#{form['id']}" if form["id"] else f"[{form['index']}]"
            lines.append(f"  form{fid} action='{form['action']}' method='{form['method']}':")
            for field in form["fields"]:
                parts = [field["tag"]]
                if field["type"]: parts.append(f"type='{field['type']}'")
                if field["name"]: parts.append(f"name='{field['name']}'")
                if field["id"]: parts.append(f"id='{field['id']}'")
                if field["placeholder"]: parts.append(f"placeholder='{field['placeholder']}'")
                if field["text"] and field["tag"] == "button": parts.append(f"→ '{field['text']}'")
                if field["required"]: parts.append("[required]")
                lines.append(f"    {' '.join(parts)}")
        lines.append("")

    if data["standalone_inputs"]:
        lines.append(f"STANDALONE INPUTS ({len(data['standalone_inputs'])}):")
        for inp in data["standalone_inputs"]:
            parts = [f"input type='{inp['type']}'"]
            if inp["name"]: parts.append(f"name='{inp['name']}'")
            if inp["id"]: parts.append(f"id='{inp['id']}'")
            if inp["placeholder"]: parts.append(f"placeholder='{inp['placeholder']}'")
            lines.append(f"  {' '.join(parts)}")
        lines.append("")

    if data["buttons"]:
        lines.append(f"BUTTONS ({len(data['buttons'])}):")
        for btn in data["buttons"]:
            bid = f" id='{btn['id']}'" if btn["id"] else ""
            lines.append(f"  button{bid} → '{btn['text']}'")
        lines.append("")

    if data["links"]:
        lines.append(f"LINKS (top {len(data['links'])}):")
        for link in data["links"]:
            lines.append(f"  '{link['text']}' → {link['href']}")

    return "\n".join(lines)


@activity.defn(name="wait_for_element")
async def wait_for_element(selector: str, timeout_ms: int = 5000) -> bool:
    """
    Wait for an element to appear on the current page.
    Returns True if element appeared within timeout, False otherwise.
    """
    if USE_MOCK_BROWSER:
        return True

    workflow_id = activity.info().workflow_id
    from activities.browser import _get_session
    _, _, context = await _get_session(workflow_id)

    pages = context.pages
    if not pages:
        return False

    page = pages[-1]
    try:
        await page.wait_for_selector(selector, timeout=timeout_ms)
        logger.info("wait_for_element_ok", selector=selector)
        return True
    except Exception:
        logger.warning("wait_for_element_timeout", selector=selector)
        return False
