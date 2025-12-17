#!/bin/bash
# Manual test script for FFmpeg.wasm integration
# This script verifies that the build and basic functionality works

set -e

echo "=========================================="
echo "FFmpeg.wasm Integration Test"
echo "=========================================="
echo ""

# Test 1: Build verification
echo "Test 1: Verifying build..."
npm run build > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✓ Build successful"
else
    echo "✗ Build failed"
    exit 1
fi

# Test 2: Linting verification
echo "Test 2: Running linter..."
npm run lint > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✓ Linting passed"
else
    echo "✗ Linting failed"
    exit 1
fi

# Test 3: Check for FFmpeg.wasm dependencies
echo "Test 3: Checking FFmpeg.wasm dependencies..."
if npm list @ffmpeg/ffmpeg @ffmpeg/util > /dev/null 2>&1; then
    echo "✓ FFmpeg.wasm dependencies installed"
else
    echo "✗ FFmpeg.wasm dependencies missing"
    exit 1
fi

# Test 4: Verify FFmpegRecorder module exists
echo "Test 4: Checking FFmpegRecorder module..."
if [ -f "src/components/ffmpegRecorder.ts" ]; then
    echo "✓ FFmpegRecorder module exists"
else
    echo "✗ FFmpegRecorder module not found"
    exit 1
fi

# Test 5: Verify AdvancedCamera imports FFmpegRecorder
echo "Test 5: Checking AdvancedCamera integration..."
if grep -q "import FFmpegRecorder from './ffmpegRecorder'" src/components/AdvancedCamera.tsx; then
    echo "✓ AdvancedCamera imports FFmpegRecorder"
else
    echo "✗ AdvancedCamera does not import FFmpegRecorder"
    exit 1
fi

# Test 6: Verify MediaRecorder references are removed
echo "Test 6: Checking MediaRecorder removal..."
if grep -q "mediaRecorderRef" src/components/AdvancedCamera.tsx; then
    echo "✗ MediaRecorder references still exist"
    exit 1
else
    echo "✓ MediaRecorder references removed"
fi

echo ""
echo "=========================================="
echo "All tests passed! ✓"
echo "=========================================="
echo ""
echo "Manual testing instructions:"
echo "1. Run 'npm run dev' to start the development server"
echo "2. Open http://localhost:5173/camera/ in your browser"
echo "3. Grant camera and microphone permissions"
echo "4. Test photo capture (camera icon)"
echo "5. Test video recording (video icon)"
echo "6. Test microphone toggle"
echo "7. Test zoom and pan features"
echo ""
