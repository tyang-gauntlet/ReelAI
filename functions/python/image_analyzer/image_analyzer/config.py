"""Firebase configuration module for image analysis."""
import os
import logging
from typing import Optional
import firebase_admin
from firebase_admin import credentials, initialize_app
from dotenv import load_dotenv

# Configure logging
logger = logging.getLogger(__name__)


class FirebaseConfig:
    """Firebase configuration handler for image analysis."""

    def __init__(self):
        self.project_id: Optional[str] = None
        self.client_email: Optional[str] = None
        self.private_key: Optional[str] = None
        self.app: Optional[firebase_admin.App] = None

    def load_environment(self) -> None:
        """Load configuration from environment variables."""
        # Try to load from .env file if it exists
        load_dotenv()

        # Get environment variables
        self.project_id = os.getenv('FIREBASE_PROJECT_ID')
        self.client_email = os.getenv('FIREBASE_CLIENT_EMAIL')
        self.private_key = os.getenv('FIREBASE_PRIVATE_KEY')

        # Log configuration status (without sensitive data)
        logger.info(f"Project ID: {self.project_id}")
        logger.info(f"Client Email: {self.client_email}")
        logger.info(f"Private Key Present: {bool(self.private_key)}")

        if not all([self.project_id, self.client_email, self.private_key]):
            missing = []
            if not self.project_id:
                missing.append("FIREBASE_PROJECT_ID")
            if not self.client_email:
                missing.append("FIREBASE_CLIENT_EMAIL")
            if not self.private_key:
                missing.append("FIREBASE_PRIVATE_KEY")
            raise ValueError(
                f"Missing Firebase configuration environment variables: {', '.join(missing)}")

    def format_private_key(self) -> None:
        """Format the private key for Firebase authentication."""
        if not self.private_key:
            raise ValueError("Private key not loaded")

        # If the key doesn't start with BEGIN PRIVATE KEY, assume it needs formatting
        if "-----BEGIN PRIVATE KEY-----" not in self.private_key:
            # Remove any existing quotes and escape characters
            key = self.private_key.replace('"', '').replace('\\n', '\n')
            self.private_key = f"-----BEGIN PRIVATE KEY-----\n{key}\n-----END PRIVATE KEY-----"

        logger.info("Private key formatted successfully")

    def initialize(self) -> firebase_admin.App:
        """Initialize Firebase with the current configuration."""
        if not firebase_admin._apps:
            try:
                self.load_environment()
                self.format_private_key()

                logger.info("Creating Firebase credentials...")
                cred = credentials.Certificate({
                    "type": "service_account",
                    "project_id": self.project_id,
                    "private_key": self.private_key,
                    "client_email": self.client_email,
                    "token_uri": "https://oauth2.googleapis.com/token"
                })

                self.app = initialize_app(cred)
                logger.info("Firebase Admin SDK initialized successfully")
                return self.app

            except Exception as e:
                logger.error(f"Error initializing Firebase: {str(e)}")
                raise

        return firebase_admin.get_app()


# Global instance
firebase_config = FirebaseConfig()
