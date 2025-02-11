def initialize():
    """Initialize Firebase Admin SDK if not already initialized."""
    try:
        if not firebase_admin._apps:
            cred = credentials.Certificate({
                "type": "service_account",
                "project_id": os.getenv('FIREBASE_PROJECT_ID'),
                "private_key": os.getenv('FIREBASE_PRIVATE_KEY').replace('\\n', '\n'),
                "client_email": os.getenv('FIREBASE_CLIENT_EMAIL')
            })

            bucket_name = os.getenv('FIREBASE_STORAGE_BUCKET')
            logger.info(f"Initializing Firebase with bucket: {bucket_name}")

            firebase_admin.initialize_app(cred, {
                'storageBucket': bucket_name
            })
            logger.info("Firebase initialized successfully")
    except Exception as e:
        logger.error(f"Error initializing Firebase: {str(e)}")
        raise
