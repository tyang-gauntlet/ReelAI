"""Firebase configuration module."""

import os
import logging
from typing import Optional
import firebase_admin
from firebase_admin import credentials, initialize_app
from google.cloud import storage as google_storage
from dotenv import load_dotenv

# Configure logging
logger = logging.getLogger(__name__)


class FirebaseConfig:
    """Firebase configuration handler."""

    def __init__(self):
        """Initialize Firebase configuration."""
        self.project_id: Optional[str] = None
        self.storage_bucket: Optional[str] = None
        self.client_email: Optional[str] = None
        self.private_key: Optional[str] = None
        self.app: Optional[firebase_admin.App] = None

    def load_environment(self) -> None:
        """Load configuration from environment variables."""
        load_dotenv()

        self.project_id = os.getenv('FIREBASE_PROJECT_ID')
        self.storage_bucket = os.getenv('FIREBASE_STORAGE_BUCKET')
        self.client_email = os.getenv('FIREBASE_CLIENT_EMAIL')
        self.private_key = os.getenv('FIREBASE_PRIVATE_KEY', '')

        if not all([self.project_id, self.storage_bucket, self.client_email, self.private_key]):
            raise ValueError(
                "Missing required Firebase configuration environment variables")

    def format_private_key(self) -> None:
        """Format the private key for use with Firebase."""
        if not self.private_key:
            raise ValueError("Private key not loaded")

        # Handle escaped newlines from environment variable
        self.private_key = self.private_key.replace('\\n', '\n')

        # Remove any existing headers/footers and extra whitespace
        self.private_key = self.private_key.replace(
            '-----BEGIN PRIVATE KEY-----', '')
        self.private_key = self.private_key.replace(
            '-----END PRIVATE KEY-----', '')
        self.private_key = self.private_key.replace('\n', '')
        self.private_key = self.private_key.strip()

        # Add proper PEM formatting with line breaks every 64 characters
        lines = [self.private_key[i:i+64]
                 for i in range(0, len(self.private_key), 64)]
        self.private_key = '-----BEGIN PRIVATE KEY-----\n' + \
            '\n'.join(lines) + '\n-----END PRIVATE KEY-----\n'

    def initialize(self) -> firebase_admin.App:
        """Initialize Firebase with the current configuration."""
        if not firebase_admin._apps:
            try:
                self.load_environment()
                self.format_private_key()

                cred = credentials.Certificate({
                    "type": "service_account",
                    "project_id": self.project_id,
                    "private_key": self.private_key,
                    "client_email": self.client_email,
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                    "client_x509_cert_url": f"https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc@{self.project_id}.iam.gserviceaccount.com"
                })

                self.app = initialize_app(credential=cred, options={
                    'storageBucket': self.storage_bucket
                })

                logger.info(
                    "=== Firebase Admin SDK initialized successfully ===")
                return self.app

            except Exception as e:
                logger.error("=== Error initializing Firebase Admin SDK ===")
                logger.error(f"Error type: {type(e).__name__}")
                logger.error(f"Error message: {str(e)}")
                raise

        return firebase_admin.get_app()


# Global instance
firebase_config = FirebaseConfig()
