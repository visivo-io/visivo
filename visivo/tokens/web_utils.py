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


def generate_success_html_response(base_url: str, timeout: int = 5) -> str:
    """
    Returns an HTML page that will redirect to base_url + '/profile' after `timeout` seconds.
    """
    redirect_url = f"{base_url}/profile"
    return f"""
    <html>
      <head>
        <meta http-equiv="refresh" content="{timeout};url={redirect_url}" />
        <title>Authorization Successful</title>
        <style>
          body {{
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            font-family: Arial, sans-serif;
            background-color: #f0f0f0;
          }}
          h1 {{
            font-size: 3em;
            font-weight: bold;
            text-align: center;
            color: #333;
          }}
          p {{
            text-align: center;
            font-size: 1.2em;
            color: #666;
          }}
        </style>
      </head>
      <body>
        <div>
          <h1>A token has been written to your development machine to this file ~/.visivo/profile.yml</h1>
          <p>You'll now be redirected to your profile page with more instructions on
          how to create a new stage and project should this be necessary.</p>
        </div>
      </body>
    </html>
    """
