from setuptools import setup

setup(
    name="video_thumbnail_generator",
    version="1.0.0",
    packages=["thumbnail_generator"],
    install_requires=[
        "firebase-functions==0.4.2",
        "firebase-admin==6.2.0",
        "opencv-python-headless==4.8.1.78",
        "numpy==1.26.0",
        "Pillow==10.0.1",
        "google-cloud-storage==2.10.0",
        "imageio-ffmpeg==0.4.9",
    ],
    python_requires=">=3.11",
)
