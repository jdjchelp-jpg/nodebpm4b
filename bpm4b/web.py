"""
Web Dashboard and Notification Interface.
FastAPI with HTMX for dynamic updates.
"""

import os
import json
import logging
import hashlib
from pathlib import Path
from typing import List, Optional, Dict
from datetime import datetime
from dataclasses import dataclass

try:
    from fastapi import FastAPI, WebSocket, UploadFile, File, HTTPException
    from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
    from fastapi.staticfiles import StaticFiles
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn
except ImportError:
    FastAPI = None
    logger = logging.getLogger(__name__)
    logger.warning("FastAPI not installed. Web interface will not be available.")

logger = logging.getLogger(__name__)


class JobTracker:
    """Track job progress for WebSocket updates."""
    
    def __init__(self):
        self.jobs = {}
    
    def create_job(self, job_id: str, total_work: int = 100):
        self.jobs[job_id] = {
            'progress': 0,
            'total': total_work,
            'status': 'pending',
            'current_file': '',
            'eta': ''
        }
    
    def update_progress(self, job_id: str, progress: int, current_file: str = '', eta: str = ''):
        if job_id in self.jobs:
            self.jobs[job_id]['progress'] = progress
            self.jobs[job_id]['current_file'] = current_file
            self.jobs[job_id]['eta'] = eta
            if progress >= 100:
                self.jobs[job_id]['status'] = 'complete'
    
    def get_job(self, job_id: str) -> Dict:
        return self.jobs.get(job_id, {})


job_tracker = JobTracker()


def create_app(config: Optional[Any] = None) -> 'FastAPI':
    """Create FastAPI application."""
    
    if FastAPI is None:
        raise RuntimeError("FastAPI is not installed. Run: pip install fastapi uvicorn")
    
    app = FastAPI(
        title="BPM4B - Audiobook Converter",
        description="Professional Multimedia Converter with advanced audio processing",
        version="10.0.0"
    )
    
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    upload_dir = Path('uploads')
    output_dir = Path('outputs')
    upload_dir.mkdir(exist_ok=True)
    output_dir.mkdir(exist_ok=True)
    
    @app.get("/", response_class=HTMLResponse)
    async def index():
        return """
        <!DOCTYPE html>
        <html>
        <head>
            <title>BPM4B - Audiobook Converter</title>
            <script src="https://unpkg.com/htmx.org@1.9.10"></script>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        </head>
        <body>
            <div class="container mt-4">
                <h1>BPM4B Audiobook Converter</h1>
                <div id="job-status"></div>
                <form hx-post="/api/convert" hx-target="#job-status" enctype="multipart/form-data">
                    <div class="mb-3">
                        <input type="file" name="files" multiple class="form-control">
                    </div>
                    <button type="submit" class="btn btn-primary">Convert</button>
                </form>
            </div>
        </body>
        </html>
        """
    
    @app.post("/api/convert")
    async def convert(files: List[UploadFile] = File(...)):
        import uuid
        job_id = str(uuid.uuid4())
        job_tracker.create_job(job_id)
        
        for file in files:
            content = await file.read()
            input_path = upload_dir / file.filename
            with open(input_path, 'wb') as f:
                f.write(content)
            
            output_path = output_dir / f"{input_path.stem}.m4b"
            
            try:
                from .encoder import AudioEncoder, Metadata
                encoder = AudioEncoder(config)
                
                for pct in range(0, 101, 10):
                    job_tracker.update_progress(job_id, pct, file.filename, '5 min remaining')
                
                encoder.convert_to_m4b(str(input_path), str(output_path))
                
                job_tracker.update_progress(job_id, 100, file.filename, 'Done')
                
                return JSONResponse({
                    'job_id': job_id,
                    'status': 'complete',
                    'download_url': f'/api/download/{output_path.name}'
                })
            except Exception as e:
                return JSONResponse({'error': str(e)}, status_code=500)
    
    @app.get("/api/download/{filename}")
    async def download(filename: str):
        path = output_dir / filename
        if path.exists():
            return FileResponse(path, media_type='audio/x-m4b')
        raise HTTPException(status_code=404)
    
    @app.get("/api/progress/{job_id}")
    async def get_progress(job_id: str):
        return job_tracker.get_job(job_id)
    
    @app.websocket("/ws/{job_id}")
    async def websocket_endpoint(websocket: WebSocket, job_id: str):
        await websocket.accept()
        try:
            while True:
                job = job_tracker.get_job(job_id)
                await websocket.send_json(job)
                if job.get('status') == 'complete':
                    break
                await websocket.receive_text()
        except Exception:
            pass
        finally:
            await websocket.close()
    
    @app.get("/openapi.json")
    async def openapi():
        return app.openapi()
    
    return app


class DiscordNotifier:
    """Send Discord notifications via webhook."""
    
    def __init__(self, webhook_url: str):
        self.webhook_url = webhook_url
    
    def send(self, title: str, author: str, duration: float, 
             file_size: int, cover_url: Optional[str] = None) -> bool:
        import urllib.request
        
        payload = {
            'embeds': [{
                'title': f'Audiobook Conversion Complete: {title}',
                'description': f'Author: {author}\nDuration: {duration/60:.1f} min\nSize: {file_size/1024/1024:.1f} MB',
                'thumbnail': {'url': cover_url} if cover_url else None
            }]
        }
        
        try:
            req = urllib.request.Request(
                self.webhook_url,
                data=json.dumps(payload).encode(),
                headers={'Content-Type': 'application/json'}
            )
            with urllib.request.urlopen(req) as response:
                return response.status == 204
        except Exception as e:
            logger.error(f"Discord notification failed: {e}")
            return False


class HomeAssistantMQTTPublisher:
    """Publish status to Home Assistant via MQTT discovery."""
    
    def __init__(self, mqtt_client):
        self.client = mqtt_client
    
    def publish(self, job_id: str, status: str, queue_length: int, library_size: int):
        config = {
            'name': 'BPM4B',
            'state_topic': f'homeassistant/sensor/bpm4b/{job_id}/state',
            'json_attributes_topic': f'homeassistant/sensor/bpm4b/{job_id}/attributes'
        }
        
        state = {
            'status': status,
            'queue_length': queue_length
        }
        
        attributes = {
            'library_total_size': library_size,
            'last_updated': datetime.now().isoformat()
        }
        
        self.client.publish(f'homeassistant/sensor/bpm4b/{job_id}/state', json.dumps(state))
        self.client.publish(f'homeassistant/sensor/bpm4b/{job_id}/attributes', json.dumps(attributes))