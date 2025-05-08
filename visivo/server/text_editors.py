import platform
import os


def get_editor_configs():
    """Get editor configurations based on operating system"""
    system = platform.system()
    is_windows = system == "Windows"
    is_mac = system == "Darwin"
    is_linux = system == "Linux"

    # Helper to generate Windows paths for Program Files
    def win_program_files_paths(app_path):
        return [
            os.path.join(os.environ.get("PROGRAMFILES", ""), app_path),
            os.path.join(os.environ.get("PROGRAMFILES(X86)", ""), app_path),
            os.path.join(os.environ.get("LOCALAPPDATA", ""), app_path),
        ]

    # Helper function to get VS Code command for macOS
    def get_vscode_mac_command():
        # Check for CLI command first
        if os.path.exists("/usr/local/bin/code"):
            return ["/usr/local/bin/code", "--wait"]
        # Check for app existence and use open command as fallback
        elif os.path.exists("/Applications/Visual Studio Code.app"):
            return ["open", "-a", "Visual Studio Code", "--wait-apps"]
        return None

    editors = [
        {
            "name": "Visual Studio Code",
            "id": "vscode",
            "paths": {
                "windows": win_program_files_paths(r"Microsoft VS Code\bin\code.cmd")
                + [r"C:\Users\%USERNAME%\AppData\Local\Programs\Microsoft VS Code\bin\code.cmd"],
                "mac": [
                    "/usr/local/bin/code",
                    "/Applications/Visual Studio Code.app",
                    os.path.expanduser("~/Applications/Visual Studio Code.app"),
                ],
                "linux": ["/usr/bin/code", "/usr/local/bin/code"],
            },
            "commands": {
                "windows": ["code", "--wait"],
                "mac": get_vscode_mac_command(),
                "linux": ["code", "--wait"],
            },
        },
        {
            "name": "Cursor",
            "id": "cursor",
            "paths": {
                "windows": win_program_files_paths(r"Cursor\cursor.exe"),
                "mac": ["/Applications/Cursor.app/Contents/MacOS/Cursor"],
                "linux": ["/usr/bin/cursor", "/usr/local/bin/cursor"],
            },
            "commands": {
                "windows": ["cursor", "--wait"],
                "mac": ["cursor", "--wait"],
                "linux": ["cursor", "--wait"],
            },
        },
        {
            "name": "Sublime Text",
            "id": "sublime",
            "paths": {
                "windows": win_program_files_paths(r"Sublime Text\subl.exe"),
                "mac": [
                    "/usr/local/bin/subl",
                    "/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl",
                ],
                "linux": ["/usr/bin/subl", "/usr/local/bin/subl"],
            },
            "commands": {
                "windows": ["subl", "--wait"],
                "mac": ["subl", "--wait"],
                "linux": ["subl", "--wait"],
            },
        },
        {
            "name": "Notepad++",
            "id": "notepadpp",
            "paths": {
                "windows": win_program_files_paths(r"Notepad++\notepad++.exe"),
                "mac": [],  # Not available on Mac
                "linux": ["/usr/bin/notepad++", "/usr/local/bin/notepad++"],
            },
            "commands": {
                "windows": ["notepad++", "-multiInst", "-nosession"],
                "mac": None,
                "linux": ["notepad++", "-multiInst", "-nosession"],
            },
        },
        {
            "name": "Atom",
            "id": "atom",
            "paths": {
                "windows": win_program_files_paths(r"Atom\atom.exe"),
                "mac": [
                    "/usr/local/bin/atom",
                    "/Applications/Atom.app/Contents/Resources/app/atom.sh",
                    os.path.expanduser("~/Applications/Atom.app/Contents/Resources/app/atom.sh"),
                ],
                "linux": ["/usr/bin/atom", "/usr/local/bin/atom"],
            },
            "commands": {
                "windows": ["atom", "--wait"],
                "mac": ["atom", "--wait"],
                "linux": ["atom", "--wait"],
            },
        },
        {
            "name": "Neovim",
            "id": "nvim",
            "paths": {
                "windows": [r"C:\Program Files\Neovim\bin\nvim.exe"],
                "mac": ["/usr/local/bin/nvim", "/opt/homebrew/bin/nvim"],
                "linux": ["/usr/bin/nvim", "/usr/local/bin/nvim"],
            },
            "commands": {"windows": ["nvim"], "mac": ["nvim"], "linux": ["nvim"]},
        },
        {
            "name": "TextMate",
            "id": "textmate",
            "paths": {
                "windows": [],  # Not available on Windows
                "mac": [
                    "/usr/local/bin/mate",
                    "/Applications/TextMate.app/Contents/Resources/mate",
                ],
                "linux": [],  # Not available on Linux
            },
            "commands": {"windows": None, "mac": ["mate", "--wait"], "linux": None},
        },
        {
            "name": "JetBrains WebStorm",
            "id": "webstorm",
            "paths": {
                "windows": win_program_files_paths(r"JetBrains\WebStorm\bin\webstorm64.exe"),
                "mac": [
                    "/usr/local/bin/webstorm",
                    "/Applications/WebStorm.app/Contents/MacOS/webstorm",
                ],
                "linux": ["/usr/bin/webstorm", "/usr/local/bin/webstorm"],
            },
            "commands": {
                "windows": ["webstorm64", "--wait"],
                "mac": ["webstorm", "--wait"],
                "linux": ["webstorm", "--wait"],
            },
        },
        {
            "name": "Vim",
            "id": "vim",
            "paths": {
                "windows": [r"C:\Program Files (x86)\Vim\vim82\vim.exe"],
                "mac": ["/usr/bin/vim", "/usr/local/bin/vim"],
                "linux": ["/usr/bin/vim", "/usr/local/bin/vim"],
            },
            "commands": {"windows": ["vim"], "mac": ["vim"], "linux": ["vim"]},
        },
    ]

    # Add platform-specific editors
    if is_windows:
        editors.append(
            {
                "name": "Notepad",
                "id": "notepad",
                "paths": {"windows": [r"C:\Windows\System32\notepad.exe"], "mac": [], "linux": []},
                "commands": {"windows": ["notepad"], "mac": None, "linux": None},
            }
        )

    if is_mac:
        editors.append(
            {
                "name": "BBEdit",
                "id": "bbedit",
                "paths": {
                    "windows": [],
                    "mac": [
                        "/usr/local/bin/bbedit",
                        "/Applications/BBEdit.app/Contents/Helpers/bbedit_tool",
                    ],
                    "linux": [],
                },
                "commands": {"windows": None, "mac": ["bbedit", "--wait"], "linux": None},
            }
        )

    return editors, "windows" if is_windows else "mac" if is_mac else "linux"
