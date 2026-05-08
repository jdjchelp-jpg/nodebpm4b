#!/usr/bin/env python3
"""
Command-line interface for BPM4B (MP3 to M4B Converter).

Usage:
    bpm4b web [options]    Start the web interface
    bpm4b convert [args]   Convert MP3 to M4B from command line
    bpm4b process [args]   Process folder to M4B with full features
    bpm4b --help           Show help
"""

import sys
import argparse
import os
from .core import convert_mp3_to_m4b, parse_time_to_seconds
from .main import BPM4B

def web_command(args):
    """Start the web interface"""
    from .app import app
    from importlib_metadata import version
    
    ver = version('bpm4b') if 'importlib_metadata' in sys.modules else '10.0.0'
    
    print(f"""
╔═══════════════════════════════════════════════════════════════╗
║              BPM4B v{ver} - Professional Audiobook Converter     ║
║                                                               ║
║  Web interface starting...                                    ║
║  URL: http://{args.host if args.host != '0.0.0.0' else 'localhost'}:{args.port}                    ║
║  Debug mode: {'ON' if args.debug else 'OFF'}                                   ║
╚═══════════════════════════════════════════════════════════════╝
    """)
    
    try:
        app.run(host=args.host, port=args.port, debug=args.debug)
    except KeyboardInterrupt:
        print("\n\nServer stopped. Goodbye!")
        sys.exit(0)
    except Exception as e:
        print(f"Error starting server: {e}", file=sys.stderr)
        sys.exit(1)

def convert_command(args):
    """Convert MP3 to M4B from command line"""
    import subprocess
    
    if not os.path.exists(args.input):
        print(f"Error: Input file '{args.input}' not found", file=sys.stderr)
        sys.exit(1)
    
    output_dir = os.path.dirname(args.output)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
    
    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("Error: FFmpeg is not installed or not in PATH", file=sys.stderr)
        print("Install FFmpeg: https://ffmpeg.org/download.html", file=sys.stderr)
        sys.exit(1)
    
    print(f"Converting: {args.input} -> {args.output}")
    
    try:
        convert_mp3_to_m4b(args.input, args.output, args.chapters)
        print(f"Conversion complete: {args.output}")
    except Exception as e:
        print(f"Error during conversion: {e}", file=sys.stderr)
        sys.exit(1)

def process_command(args):
    """Process folder with full feature set"""
    from .config import Config
    
    bpm4b = BPM4B()
    
    if args.metadata:
        from .metadata import MetadataAggregator
        agg = MetadataAggregator()
        result = agg.aggregate(args.metadata)
        
    if args.vbr:
        bpm4b.config.audio.vbr = args.vbr
        
    print(f"Processing folder: {args.input_dir}")
    print(f"Output: {args.output}")
    
    try:
        bpm4b.process_folder(args.input_dir, args.output, args.range, args.titles)
        print("\nProcessing complete!")
        
        if args.verify:
            print("Running quality verification...")
            qa_results = bpm4b.verify_quality(args.output)
            print(f"Verification: {qa_results}")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

def combine_command(args):
    """Combine multiple M4B files into one"""
    from .main import BPM4B
    bpm4b = BPM4B()
    
    print(f"Combining {len(args.inputs)} files into: {args.output}")
    
    try:
        metadata = {'title': args.title} if args.title else None
        bpm4b.combine_m4bs(args.inputs, args.output, metadata)
        print("Combination complete!")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

def chapters_command(args):
    """Detect chapters in audio file"""
    from .core import detect_chapters_smart
    
    if not os.path.exists(args.input):
        print(f"Error: Input file '{args.input}' not found", file=sys.stderr)
        sys.exit(1)
    
    print(f"Detecting chapters in: {args.input}")
    chapters = detect_chapters_smart(args.input)
    
    print(f"Found {len(chapters)} chapter markers:")
    for ch in chapters:
        print(f"  - {ch['title']}: {ch['start_time']:.2f}s")

def checksum_command(args):
    """Generate checksum for file"""
    from .core import generate_checksum
    
    if not os.path.exists(args.input):
        print(f"Error: Input file '{args.input}' not found", file=sys.stderr)
        sys.exit(1)
    
    checksum = generate_checksum(args.input)
    print(f"SHA-256: {checksum}")

def main():
    """Main entry point for the CLI command"""
    parser = argparse.ArgumentParser(
        description="BPM4B - Professional Audiobook Converter (20 Advanced Features)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Start web interface
  bpm4b web
  bpm4b web --port 8080 --debug

  # Convert MP3 to M4B
  bpm4b convert input.mp3 output.m4b
  bpm4b convert input.mp3 output.m4b --chapter "Chapter 1" 0

  # Process folder with full features
  bpm4b process ./audiobooks/Author_Title/ output.m4b --verify

  # Combine M4B files
  bpm4b combine file1.m4b file2.m4b --output combined.m4b --title "My Audiobook"

  # Detect chapters
  bpm4b chapters input.mp3

  # Generate checksum
  bpm4b checksum output.m4b
        """
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Web command
    web_parser = subparsers.add_parser('web', help='Start the web interface')
    web_parser.add_argument('--host', default='0.0.0.0',
                           help='Host to bind to (default: 0.0.0.0)')
    web_parser.add_argument('--port', type=int, default=5000,
                           help='Port to bind to (default: 5000)')
    web_parser.add_argument('--debug', action='store_true',
                           help='Enable debug mode')
    
    # Convert command
    convert_parser = subparsers.add_parser('convert', help='Convert MP3 to M4B')
    convert_parser.add_argument('input', help='Input MP3 file path')
    convert_parser.add_argument('output', help='Output M4B file path')
    convert_parser.add_argument('--chapter', nargs=2, metavar=('TITLE', 'START_TIME'),
                               action='append',
                               help='Add chapter marker (title and start time in seconds or MM:SS format)')
    
    # Process command
    process_parser = subparsers.add_parser('process', help='Process folder to M4B with all features')
    process_parser.add_argument('input_dir', help='Input directory with audio files')
    process_parser.add_argument('output', help='Output M4B file path')
    process_parser.add_argument('--range', help='Process range (e.g., 1-5)')
    process_parser.add_argument('--metadata', help='Book title for metadata lookup')
    process_parser.add_argument('--verify', action='store_true', help='Run quality verification')
    process_parser.add_argument('--titles', nargs='+', help='Custom titles for chapters (one per file)')
    process_parser.add_argument('--vbr', type=int, choices=range(1, 6), help='VBR mode (1-5) for libfdk_aac')
    
    # Chapters command
    chapters_parser = subparsers.add_parser('chapters', help='Detect chapters in audio')
    chapters_parser.add_argument('input', help='Input audio file')
    
    # Combine command
    combine_parser = subparsers.add_parser('combine', help='Combine multiple M4B files')
    combine_parser.add_argument('inputs', nargs='+', help='Input M4B files')
    combine_parser.add_argument('--output', '-o', required=True, help='Output M4B file path')
    combine_parser.add_argument('--title', help='Title for the combined audiobook')
    
    # Checksum command
    checksum_parser = subparsers.add_parser('checksum', help='Generate SHA-256 checksum')
    checksum_parser.add_argument('input', help='Input file')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    if args.command == 'web':
        web_command(args)
    elif args.command == 'convert':
        if args.chapter:
            chapters = []
            for title, start_time in args.chapter:
                try:
                    parsed_time = parse_time_to_seconds(start_time)
                except ValueError as e:
                    print(f"Error: Invalid time format for chapter '{title}': {e}", file=sys.stderr)
                    sys.exit(1)
                chapters.append({
                    'title': title,
                    'start_time': parsed_time
                })
            args.chapters = chapters
        else:
            args.chapters = None
        convert_command(args)
    elif args.command == 'process':
        process_command(args)
    elif args.command == 'combine':
        combine_command(args)
    elif args.command == 'chapters':
        chapters_command(args)
    elif args.command == 'checksum':
        checksum_command(args)

if __name__ == '__main__':
    main()