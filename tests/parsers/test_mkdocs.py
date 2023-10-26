from visivo.parsers.mkdocs import Mkdocs

mkdocs = Mkdocs()

def test_nav_configuration():
    nav_config = mkdocs.get_nav_configuration()
    assert len(nav_config) > 5

def test_docs_content_from_pydantic_model():
    trace_md = mkdocs.get_md_content('Trace')
    assert len(trace_md) > 50 

    chart_md = mkdocs.get_md_content('Chart')
    assert len(chart_md) > 50

    dashboard_md = mkdocs.get_md_content('Dashboard')
    assert len(dashboard_md) > 50

    target_md = mkdocs.get_md_content('Target')
    assert len(target_md) > 50

def test_docs_content_from_traceprops_model():
    bar_md = mkdocs.get_md_content('Bar')
    assert len(bar_md) > 50 

    scatter_md = mkdocs.get_md_content('Scatter')
    assert len(scatter_md) > 50