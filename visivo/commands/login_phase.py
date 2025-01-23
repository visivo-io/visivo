import os
import http.server
import socketserver
import threading
from urllib.parse import urlparse, parse_qs
import webbrowser
import yaml
import requests
import click
from visivo.logging.logger import Logger


class CallbackHandler(http.server.SimpleHTTPRequestHandler):
    jwt_data = None
    error = None

    def do_GET(self):
        parsed_path = urlparse(self.path)
        query_params = parse_qs(parsed_path.query)

        if "code" in query_params and "state" in query_params:
            code = query_params["code"][0]
            state = query_params["state"][0]
            try:
                CallbackHandler.jwt_data = exchange_code_for_jwt(code, state)
                self.send_response(200)
                self.end_headers()
                self.wfile.write(
                    b"Login successful! JWT received. You can close this window."
                )
            except Exception as e:
                CallbackHandler.error = str(e)
                self.send_response(500)
                self.end_headers()
                self.wfile.write(b"Error occurred during login.")
        else:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Missing code or state in callback URL.")


def exchange_code_for_jwt(code, state):
    url = "http://localhost:8000/api/register/o/google-oauth2/"
    response = requests.post(url, json={"code": code, "state": state})
    if response.status_code == 201:
        return response.json()["jwt"]
    else:
        raise Exception(f"Failed to get JWT: {response.status_code} {response.text}")


def start_callback_server(port):
    server = socketserver.TCPServer(("localhost", port), CallbackHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def redirect_to_login_page(host, redirect_uri):
    login_page_url = f"{host}login/?redirect_uri={redirect_uri}"
    webbrowser.open(login_page_url)


def save_jwt(jwt):
    visivo_dir = os.path.expanduser("~/.visivo")
    os.makedirs(visivo_dir, exist_ok=True)
    jwt_file = os.path.join(visivo_dir, "jwt.yml")

    with open(jwt_file, "w") as f:
        yaml.dump({"jwt": jwt}, f, default_flow_style=False)


def login_phase(host, port=8888):
    Logger.instance().success("Initialized")

    server = None
    try:
        server = start_callback_server(port)
        redirect_uri = f"http://localhost:{port}/oauth/callback"
        redirect_to_login_page(host, redirect_uri)

        timeout = 300
        for _ in range(timeout):
            if CallbackHandler.jwt_data or CallbackHandler.error:
                break

        if CallbackHandler.error:
            raise Exception(f"OAuth flow error: {CallbackHandler.error}")
        elif not CallbackHandler.jwt_data:
            raise Exception("Timeout: No callback received within the specified time.")

        jwt = CallbackHandler.jwt_data
        save_jwt(jwt)

    except Exception as e:
        raise click.ClickException(f"Login flow failed: {e}")

    finally:
        if server:
            server.shutdown()
