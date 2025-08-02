import urllib.parse
import webbrowser


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
    """
    Returns an HTML page that will redirect to base_url + '/profile' after `timeout` seconds.
    If closePopUp is True, it will attempt to close the tab instead.
    """
    redirect_url = f"{base_url}/profile"

    # Handle redirect or close the popup
    js_behavior = f"""
    <script>
      setTimeout(function() {{
        {"window.close();" if closePopUp else f"window.location.href = '{redirect_url}';"}
      }}, {timeout * 1000});
    </script>
    """

    return f"""
    <html>
      <head>
        <title>Authorization Successful</title>
        {js_behavior}
        <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #F5F5F5;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            overflow: hidden;
        }}
        .container {{
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 3rem 2.5rem;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            max-width: 600px;
            width: 90%;
            text-align: center;
            position: relative;
            z-index: 2;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }}
        .success-icon {{
            width: 80px;
            height: 80px;
            margin: 0 auto 1.5rem;
            background: linear-gradient(135deg, #10b981, #059669);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
        }}
        .checkmark {{
            width: 20px;
            height: 20px;
            color: white;
            font-weight: bold;
            font-size: 24px;
        }}
        h4 {{
            color: #713B57;
            font-size: 2.2rem;
            font-weight: 700;
            margin-bottom: 1rem;
            line-height: 1.3;
        }}
        .subtitle {{
            color: #713B57;
            font-size: 1.1rem;
            font-weight: 600;
            margin-bottom: 1.5rem;
            opacity: 0.8;
        }}
        .file-path {{
            background: #f8fafc;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            padding: 1rem;
            font-family: 'Courier New', monospace;
            font-size: 1rem;
            color: #374151;
            margin: 1.5rem 0;
            word-break: break-all;
        }}
        .description {{
            color: #64748b;
            font-size: 1rem;
            line-height: 1.6;
            margin-bottom: 2rem;
        }}
        .redirect-info {{
            background: #713B57;
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 10px;
            font-size: 0.9rem;
            margin-top: 2rem;
        }}
        .loading-bar {{
            width: 100%;
            height: 4px;
            background: rgba(113, 59, 87, 0.2);
            border-radius: 2px;
            margin-top: 1rem;
            overflow: hidden;
        }}
        .loading-progress {{
            width: 0%;
            height: 100%;
            background: linear-gradient(90deg, #713B57, #875454);
            border-radius: 2px;
            animation: loadProgress {timeout}s linear forwards;
        }}
        @keyframes loadProgress {{
            to {{ width: 100%; }}
        }}
        @media (max-width: 768px) {{
            .container {{
                padding: 2rem 1.5rem;
                margin: 1rem;
            }}
            h1 {{
                font-size: 1.8rem;
            }}
            .file-path {{
                font-size: 0.9rem;
            }}
        }}
        </style>
      </head>
      <body>
        <div class="container">
            <div class="success-icon">
                <div class="checkmark">✓</div>
            </div>
            <h4>Authorization Successful!</h4>
            <p class="subtitle">Your development environment is now configured</p>
            <div class="file-path">~/.visivo/profile.yml</div>
            <p class="description">
                A secure token has been written to your development machine. This will enable seamless integration with your Visivo projects and development workflow.
            </p>
            <div class="redirect-info">
                <strong>{'Redirecting to local server please wait...' if closePopUp else 'Redirecting to your profile page...'}</strong>
                <br>
                You'll receive detailed instructions on creating new stages and projects.
                <div class="loading-bar">
                    <div class="loading-progress"></div>
                </div>
            </div>
        </div>
      </body>
    </html>
    """
