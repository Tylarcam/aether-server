"""
Helper script to extract and set up ffmpeg from the archive.
This will extract ffmpeg to a local directory and add it to PATH for this session.
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path
import io

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def find_ffmpeg_archive():
    """Find the ffmpeg archive in the current directory."""
    current_dir = Path(__file__).parent
    archive = current_dir / "ffmpeg-release-full.7z"
    
    if archive.exists():
        return archive
    return None

def extract_ffmpeg(archive_path, extract_to=None):
    """Extract ffmpeg archive."""
    if extract_to is None:
        extract_to = Path(__file__).parent / "ffmpeg"
    
    extract_to = Path(extract_to)
    
    print(f"Extracting ffmpeg from {archive_path.name}...")
    print(f"Target directory: {extract_to}")
    
    # Check if 7z is available
    try:
        result = subprocess.run(['7z', 'x', str(archive_path), f'-o{extract_to}', '-y'], 
                              capture_output=True, text=True)
        if result.returncode == 0:
            print("✅ Extraction successful!")
            return extract_to
        else:
            print(f"❌ Extraction failed: {result.stderr}")
            return None
    except FileNotFoundError:
        print("❌ 7z not found. Please install 7-Zip to extract the archive.")
        print("\nAlternative: Extract manually:")
        print(f"  1. Extract {archive_path.name} using 7-Zip")
        print(f"  2. Find the 'bin' folder inside")
        print(f"  3. Add that folder to your Windows PATH")
        return None

def find_ffmpeg_bin(extracted_dir):
    """Find the ffmpeg.exe in the extracted directory."""
    extracted_dir = Path(extracted_dir)
    
    # Look for ffmpeg.exe in common locations
    possible_paths = [
        extracted_dir / "bin" / "ffmpeg.exe",
        extracted_dir / "ffmpeg" / "bin" / "ffmpeg.exe",
        extracted_dir / "ffmpeg-release-full" / "bin" / "ffmpeg.exe",
    ]
    
    for path in possible_paths:
        if path.exists():
            return path.parent  # Return the bin directory
    
    # Search recursively
    for ffmpeg_exe in extracted_dir.rglob("ffmpeg.exe"):
        return ffmpeg_exe.parent
    
    return None

def test_ffmpeg(ffmpeg_path):
    """Test if ffmpeg works."""
    ffmpeg_exe = Path(ffmpeg_path) / "ffmpeg.exe"
    try:
        result = subprocess.run([str(ffmpeg_exe), "-version"], 
                              capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            version_line = result.stdout.split('\n')[0]
            print(f"✅ FFmpeg is working: {version_line}")
            return True
    except Exception as e:
        print(f"❌ FFmpeg test failed: {e}")
    return False

def main():
    print("=" * 60)
    print("FFmpeg Setup Helper")
    print("=" * 60)
    print()
    
    # Check if ffmpeg is already in PATH
    try:
        result = subprocess.run(['ffmpeg', '-version'], 
                              capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            print("✅ FFmpeg is already installed and in PATH!")
            version_line = result.stdout.split('\n')[0]
            print(f"   {version_line}")
            return
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    
    # Look for archive
    archive = find_ffmpeg_archive()
    if not archive:
        print("❌ FFmpeg archive not found (ffmpeg-release-full.7z)")
        print("\nPlease download ffmpeg from:")
        print("  https://www.gyan.dev/ffmpeg/builds/")
        print("  or")
        print("  https://ffmpeg.org/download.html")
        return
    
    print(f"✅ Found ffmpeg archive: {archive.name}")
    print()
    
    # Extract
    extract_dir = extract_ffmpeg(archive)
    if not extract_dir:
        return
    
    # Find ffmpeg.exe
    bin_dir = find_ffmpeg_bin(extract_dir)
    if not bin_dir:
        print("❌ Could not find ffmpeg.exe in extracted files")
        print(f"   Please check: {extract_dir}")
        return
    
    print(f"✅ Found ffmpeg at: {bin_dir / 'ffmpeg.exe'}")
    print()
    
    # Test
    if test_ffmpeg(bin_dir):
        print()
        print("=" * 60)
        print("Next Steps:")
        print("=" * 60)
        print()
        print("To use ffmpeg, you have two options:")
        print()
        print("Option 1: Add to PATH permanently (Recommended)")
        print(f"  1. Copy this path: {bin_dir}")
        print("  2. Press Win + X → System")
        print("  3. Advanced system settings → Environment Variables")
        print("  4. Edit 'Path' under System variables")
        print("  5. Add new entry with the path above")
        print("  6. Restart terminal/IDE")
        print()
        print("Option 2: Use full path in scripts")
        print(f"  Use: {bin_dir / 'ffmpeg.exe'}")
        print()
        print("After adding to PATH, restart the server and try again!")

if __name__ == "__main__":
    main()

