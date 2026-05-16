from setuptools import setup, find_packages

with open("README.md", encoding="utf-8") as f:
    long_description = f.read()

with open("requirements.txt", encoding="utf-8") as f:
    requirements = [line.strip() for line in f if line.strip() and not line.startswith("#")]

setup(
    name="bpm4b",
    version="12.0.0",
    author="Jdjchelp",
    author_email="JDJCHELP@proton.me",
    description="Professional Multimedia Converter - 20 Advanced Audiobook Processing Features",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/jdjchelp-jpg/bpm4b",
    packages=find_packages(),
    include_package_data=True,
    package_data={
        "bpm4b": [
            "templates/*.html",
        ],
    },
    install_requires=requirements + [
        "mutagen>=1.47.0",
        "Pillow>=10.0.0",
        "pyyaml>=6.0",
    ],
    extras_require={
        "web": ["fastapi>=0.100.0", "uvicorn>=0.23.0"],
        "gpu": ["onnxruntime-gpu>=1.15.0"],
    },
    entry_points={
        "console_scripts": [
            "bpm4b=bpm4b.cli:main",
            "bpm4b-web=bpm4b.web:create_app",
        ],
    },
    classifiers=[
        "Development Status :: 5 - Production/Stable",
        "Intended Audience :: End Users/Desktop",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: Multimedia :: Sound/Audio :: Conversion",
        "Topic :: Utilities",
    ],
    python_requires=">=3.8",
    keywords="mp3 m4b audiobook converter audio ffmpeg libfdk_aac loudnorm",
    project_urls={
        "Bug Reports": "https://github.com/jdjchelp-jpg/bpm4b/issues",
        "Source": "https://github.com/jdjchelp-jpg/bpm4b",
        "Documentation": "https://github.com/jdjchelp-jpg/bpm4b#readme",
    },
)