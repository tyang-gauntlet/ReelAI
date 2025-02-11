#!/usr/bin/env python3
"""Test Cloud Functions locally using Functions Framework."""
import os
import sys
import argparse
import subprocess
from pathlib import Path
from dotenv import load_dotenv


def setup_environment():
    """Set up the environment variables needed for testing."""
    # Correct Python path for package structure
    function_dir = Path(__file__).parent.parent / 'functions' / \
        'python' / 'image_analyzer' / 'image_analyzer'
    sys.path.insert(0, str(function_dir))

    # Load environment variables
    env_path = function_dir / '.env'
    if not env_path.exists():
        print(f"Error: .env file not found at {env_path}")
        sys.exit(1)
    load_dotenv(env_path)

    # Set function target to match updated name
    os.environ['FUNCTION_TARGET'] = 'analyze_screenshot'


def start_functions_framework(function_name: str, port: int = 8080, no_browser: bool = False):
    """Start the Functions Framework server."""
    function_dir = Path(__file__).parent.parent / \
        'functions' / 'python' / function_name

    print(f"Starting {function_name} function on port {port}...")
    print(f"Function directory: {function_dir}")

    try:
        # Change to the function directory
        os.chdir(function_dir)

        # Create virtual environment if it doesn't exist
        if not os.path.exists('venv'):
            print("Creating virtual environment...")
            subprocess.run(['python3', '-m', 'venv', 'venv'], check=True)

        # Activate virtual environment and install dependencies
        venv_python = os.path.join('venv', 'bin', 'python')

        print("Installing dependencies...")
        subprocess.run([venv_python, '-m', 'pip', 'install',
                       '-r', 'requirements.txt'], check=True)

        # Install additional development dependencies
        print("Installing development dependencies...")
        for package in ['functions-framework', 'python-dotenv']:
            subprocess.run([venv_python, '-m', 'pip',
                           'install', package], check=True)

        # Set PYTHONPATH to include the function directory
        os.environ['PYTHONPATH'] = str(function_dir)

        # Start Functions Framework
        cmd = [
            venv_python, '-m', 'functions_framework',
            '--target', os.environ['FUNCTION_TARGET'],
            '--port', str(port),
            '--debug'
        ]

        print("\nStarting Functions Framework...")
        print(f"Command: {' '.join(cmd)}")
        print("\nFunction is ready for testing!")
        print(f"URL: http://localhost:{port}")
        print("\nExample curl command:")
        print(f'''curl -X POST http://localhost:{port} \\
    -H "Content-Type: application/json" \\
    -d '{{"imageData": "YOUR_BASE64_IMAGE_DATA"}}'
''')

        # Start the server
        subprocess.run(cmd, check=True)

    except subprocess.CalledProcessError as e:
        print(f"Error running command: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description='Test Cloud Functions locally')
    parser.add_argument(
        '--function',
        default='image_analyzer',
        help='Name of the function directory to test (default: image_analyzer)'
    )
    parser.add_argument(
        '--port',
        type=int,
        default=8080,
        help='Port to run the function on (default: 8080)'
    )
    parser.add_argument(
        '--no-browser',
        action='store_true',
        help='Do not open browser automatically'
    )

    args = parser.parse_args()

    setup_environment()
    start_functions_framework(args.function, args.port, args.no_browser)


if __name__ == '__main__':
    main()
