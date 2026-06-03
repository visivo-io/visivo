import base64
import urllib.parse
import webbrowser
from functools import lru_cache
from pathlib import Path

# The canonical Visivo "v" logo. Lives in the viewer's images dir — the design
# system says to copy this asset rather than recreate it as SVG / CSS art.
_LOGO_PATH = Path(__file__).resolve().parents[2] / "viewer" / "src" / "images" / "logo.png"


@lru_cache(maxsize=1)
def _logo_data_uri() -> str:
    try:
        return "data:image/png;base64," + base64.b64encode(_LOGO_PATH.read_bytes()).decode("ascii")
    except OSError:
        return ""


def open_url(url: str) -> bool:
    """
    Tries to open the given URL in the default web browser.
    Returns True if webbrowser.open() claims success.
    """
    parsed = urllib.parse.urlparse(url)
    query_dict = dict(urllib.parse.parse_qsl(parsed.query))
    encoded_query = urllib.parse.urlencode(query_dict)
    safe_url = urllib.parse.urlunparse(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            parsed.params,
            encoded_query,
            parsed.fragment,
        )
    )
    return webbrowser.open(safe_url)


def generate_success_html_response(
    base_url: str, timeout: int = 5, closePopUp: bool = False
) -> str:
    """Return the HTML for the post-authorize landing page.

    After ``timeout`` seconds the page either closes (``closePopUp=True``)
    or redirects to ``{base_url}/profile``. Styled to match the Visivo
    design system — solid white card on gray-50, mulberry accents, system
    sans-serif type. No glassmorphism or gradients.
    """
    redirect_url = f"{base_url}/profile"

    js_behavior = f"""
    <script>
      setTimeout(function() {{
        {"window.close();" if closePopUp else f"window.location.href = '{redirect_url}';"}
      }}, {timeout * 1000});
    </script>
    """

    redirect_label = (
        "Redirecting back to your terminal…" if closePopUp else "Redirecting to your profile page…"
    )

    return f"""
    <html>
      <head>
        <title>Authorization successful — Visivo</title>
        {js_behavior}
        <style>
          :root {{
            --color-primary-100: #e2d7dd;
            --color-primary-500: #713b57;
            --color-primary-600: #5a2f45;
            --color-gray-50: #f9fafb;
            --color-gray-100: #f3f4f6;
            --color-gray-200: #e5e7eb;
            --color-gray-500: #6b7280;
            --color-gray-700: #374151;
            --color-gray-900: #111827;
            --color-success: #16a34a;
          }}
          * {{ margin: 0; padding: 0; box-sizing: border-box; }}
          body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
              Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans',
              'Helvetica Neue', sans-serif;
            background: var(--color-gray-50);
            color: var(--color-gray-900);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }}
          .brand {{
            text-align: center;
            margin-bottom: 1.5rem;
          }}
          .brand-mark {{
            display: inline-block;
            width: 56px;
            height: 56px;
          }}
          .card {{
            background: #ffffff;
            border: 1px solid var(--color-gray-200);
            border-radius: 1rem;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1),
                        0 10px 10px -5px rgba(0, 0, 0, 0.04);
            max-width: 480px;
            width: 100%;
            padding: 2.5rem 2rem;
            text-align: center;
          }}
          .success-icon {{
            width: 56px;
            height: 56px;
            margin: 0 auto 1.25rem;
            background: var(--color-primary-100);
            border-radius: 9999px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--color-primary-500);
          }}
          .success-icon svg {{
            width: 28px;
            height: 28px;
          }}
          h1 {{
            color: var(--color-gray-900);
            font-size: 1.5rem;
            font-weight: 700;
            line-height: 1.2;
            letter-spacing: -0.01em;
            margin-bottom: 0.5rem;
          }}
          .subtitle {{
            color: var(--color-gray-500);
            font-size: 0.95rem;
            line-height: 1.5;
            margin-bottom: 1.5rem;
          }}
          .file-path {{
            display: inline-block;
            background: var(--color-gray-100);
            border: 1px solid var(--color-gray-200);
            border-radius: 0.5rem;
            padding: 0.5rem 0.75rem;
            font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New', monospace;
            font-size: 0.875rem;
            color: var(--color-gray-700);
            margin-bottom: 1.5rem;
          }}
          .redirect-info {{
            font-size: 0.8rem;
            color: var(--color-gray-500);
            margin-top: 0.5rem;
          }}
          .loading-bar {{
            width: 100%;
            height: 3px;
            background: var(--color-gray-100);
            border-radius: 9999px;
            margin-top: 0.75rem;
            overflow: hidden;
          }}
          .loading-progress {{
            width: 0%;
            height: 100%;
            background: var(--color-primary-500);
            border-radius: 9999px;
            animation: loadProgress {timeout}s linear forwards;
          }}
          @keyframes loadProgress {{
            to {{ width: 100%; }}
          }}
          a {{
            color: var(--color-primary-500);
            text-decoration: none;
            font-weight: 500;
          }}
          a:hover {{
            color: var(--color-primary-600);
            text-decoration: underline;
          }}
        </style>
      </head>
      <body>
        <div>
          <div class="brand">
            <img src="{_logo_data_uri()}" alt="Visivo" class="brand-mark" />
          </div>
          <div class="card">
            <div class="success-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <h1>Device authorized</h1>
            <p class="subtitle">
              A token has been written to your development machine. You can manage and revoke
              tokens any time from your <a href="{redirect_url}">profile page</a>.
            </p>
            <div class="file-path">~/.visivo/profile.yml</div>
            <p class="redirect-info">{redirect_label}</p>
            <div class="loading-bar" aria-hidden="true">
              <div class="loading-progress"></div>
            </div>
          </div>
        </div>
      </body>
    </html>
    """
