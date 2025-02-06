"""Cloud Functions entry point."""

import functions_framework
from thumbnail_generator.main import generate_video_thumbnail, health

# Export the functions
generate_video_thumbnail = functions_framework.http(generate_video_thumbnail)
health = functions_framework.http(health)
