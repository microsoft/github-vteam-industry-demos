"""Render Mermaid locally; download only a pinned public renderer into memory.

No source or diagram is uploaded. Chromium network access is blocked during rendering.
"""

from hashlib import sha256
from pathlib import Path
from urllib.request import urlopen

from playwright.sync_api import sync_playwright

from generate import FOOTER

ROOT = Path(__file__).resolve().parent
URL = "https://cdn.jsdelivr.net/npm/mermaid@11.12.0/dist/mermaid.min.js"
SHA256 = "07e37dfa97b337ccc85365d57eddf99b9706f09db3b59b260d0333b23b343c4b"

with urlopen(URL, timeout=60) as response:
    library = response.read()
assert sha256(library).hexdigest() == SHA256, "Public renderer integrity check failed"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.route("**/*", lambda route: route.abort())
    page.set_content("<html><body></body></html>")
    page.add_script_tag(content=library.decode("utf-8"))
    result = page.evaluate(
        """async source => {
            mermaid.initialize({startOnLoad:false, securityLevel:'strict', htmlLabels:false,
                                flowchart:{htmlLabels:false}});
            await mermaid.parse(source);
            const result = await mermaid.render('architecture-check', source);
            document.body.innerHTML = result.svg;
            const svg = document.querySelector('svg');
            const xml = new DOMParser().parseFromString(
                new XMLSerializer().serializeToString(svg), 'image/svg+xml');
            const nodes=[...svg.querySelectorAll('.node')];
            const core=nodes.filter(n => n.classList.contains('core'));
            const agents=nodes.filter(n => n.classList.contains('agent'));
            const annotations=nodes.filter(n => n.classList.contains('annotation'));
            const clusters=[...svg.querySelectorAll('.cluster')];
            const footer=annotations[0];
            const labels=[...svg.querySelectorAll('.nodeLabel')];
            const clipping=labels.filter(label => {
                const box=label.getBoundingClientRect();
                const parent=label.closest('.node');
                if(!parent) return false;
                const shape=parent.querySelector('rect');
                if(!shape) return false;
                const b=shape.getBoundingClientRect();
                return box.left < b.left-1 || box.top < b.top-1 ||
                    box.right > b.right+1 || box.bottom > b.bottom+1;
            }).map(label=>label.textContent);
            return {
                viewBox:svg.getAttribute('viewBox'),
                nodes:nodes.length,
                core:core.length,
                agents:agents.length,
                clusters:clusters.length,
                annotations:annotations.length,
                footer:footer.textContent.trim(),
                footerLines:footer.querySelectorAll('text > tspan').length,
                footerBelowServices:[...core,...clusters].every(n =>
                    n.getBoundingClientRect().bottom <
                    footer.getBoundingClientRect().top),
                clipping,
                edges:svg.querySelectorAll('.flowchart-link').length,
                errors:xml.querySelectorAll('parsererror').length
            };
        }""",
        (ROOT / "ai-proposal-factory.mmd").read_text("utf-8"),
    )
    browser.close()
assert result["errors"] == 0 and result["nodes"] == 8 and result["edges"] == 6, result
assert (result["core"], result["clusters"], result["agents"], result["annotations"]) == (
    4, 1, 3, 1), result
assert result["footer"] == FOOTER and result["footerBelowServices"], result
assert result["footerLines"] == 1, result
assert not result["clipping"], result
assert result["viewBox"], result
print(f"PASS Mermaid 11.12.0: parsed and rendered locally; {result['nodes']} nodes, "
      f"{result['edges']} visible edges, valid SVG; five core elements, three agents "
      "and one unboxed, single-line footer. Browser network blocked; no source uploaded.")
