from visivo.models.markdown import Markdown
from pydantic import ValidationError
import pytest


def test_Markdown_basic():
    """Test basic Markdown model creation."""
    md = Markdown(name="test-md", content="# Hello World")
    assert md.name == "test-md"
    assert md.content == "# Hello World"
    # Default values
    assert md.align == "left"
    assert md.justify == "start"


def test_Markdown_with_all_fields():
    """Test Markdown model with all fields specified."""
    md = Markdown(
        name="welcome",
        content="# Welcome\n\nThis is **formatted** text.",
        align="center",
        justify="between",
    )
    assert md.name == "welcome"
    assert md.content == "# Welcome\n\nThis is **formatted** text."
    assert md.align == "center"
    assert md.justify == "between"


def test_Markdown_align_options():
    """Test all valid align options."""
    for align in ["left", "center", "right"]:
        md = Markdown(name="test", content="text", align=align)
        assert md.align == align


def test_Markdown_justify_options():
    """Test all valid justify options."""
    for justify in ["start", "end", "center", "between", "around", "evenly"]:
        md = Markdown(name="test", content="text", justify=justify)
        assert md.justify == justify


def test_Markdown_invalid_align():
    """Test that invalid align value raises an error."""
    with pytest.raises(ValidationError):
        Markdown(name="test", content="text", align="invalid")


def test_Markdown_invalid_justify():
    """Test that invalid justify value raises an error."""
    with pytest.raises(ValidationError):
        Markdown(name="test", content="text", justify="invalid")


def test_Markdown_content_required():
    """Test that content is required."""
    with pytest.raises(ValidationError):
        Markdown(name="test")


def test_Markdown_multiline_content():
    """Test Markdown with multiline content."""
    content = """# Heading

This is a paragraph with **bold** and *italic* text.

- List item 1
- List item 2

```python
def hello():
    print("Hello World")
```
"""
    md = Markdown(name="code-example", content=content)
    assert md.content == content


def test_Markdown_html_content():
    """Test Markdown with embedded HTML."""
    content = '<div class="custom">Custom HTML</div>'
    md = Markdown(name="html-example", content=content)
    assert md.content == content


def test_Markdown_serialization():
    """Test Markdown model serialization."""
    md = Markdown(name="test-md", content="# Hello", align="right", justify="end")
    serialized = md.model_dump()
    assert serialized["name"] == "test-md"
    assert serialized["content"] == "# Hello"
    assert serialized["align"] == "right"
    assert serialized["justify"] == "end"


def test_Markdown_json_serialization():
    """Test Markdown model JSON serialization."""
    md = Markdown(name="test-md", content="# Hello")
    json_str = md.model_dump_json()
    assert '"name":"test-md"' in json_str
    assert '"content":"# Hello"' in json_str
