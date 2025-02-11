"""Cloud Functions entry point for image analyzer."""

import functions_framework
import logging
from typing import Dict, Any
from image_analyzer.main import analyze_video
from image_analyzer.main import health

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


@functions_framework.http
def analyze_video_function(request) -> Dict[str, Any]:
    """Cloud Function entry point for video analysis."""
    try:
        return analyze_video(request)
    except Exception as e:
        logger.error(f"Error in analyze_video_function: {str(e)}")
        return {"error": str(e)}, 500


@functions_framework.http
def health_check(request) -> Dict[str, Any]:
    """Health check endpoint."""
    try:
        return health(request)
    except Exception as e:
        logger.error(f"Error in health_check: {str(e)}")
        return {"error": str(e)}, 500
