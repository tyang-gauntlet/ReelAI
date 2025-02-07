"""Firebase configuration module."""
import os
from typing import Optional
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, initialize_app, storage, firestore

# Load environment variables from .env file
load_dotenv()


def initialize() -> None:
    """Initialize Firebase Admin SDK with credentials from environment variables."""
    if not firebase_admin._apps:  # Check if Firebase is not already initialized
        cred = credentials.Certificate({
            "type": "service_account",
            "project_id": os.getenv("FIREBASE_PROJECT_ID"),
            "private_key": os.getenv("FIREBASE_PRIVATE_KEY").replace("\\n", "\n"),
            "client_email": os.getenv("FIREBASE_CLIENT_EMAIL"),
            "token_uri": "https://oauth2.googleapis.com/token",
        })

        initialize_app(cred, {
            'storageBucket': os.getenv("FIREBASE_STORAGE_BUCKET")
        })


def get_storage_bucket() -> storage.bucket.Bucket:
    """Get the Firebase Storage bucket instance."""
    return storage.bucket()


def get_firestore_client() -> firestore.Client:
    """Get the Firestore client instance."""
    return firestore.client()
