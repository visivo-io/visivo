#!/usr/bin/env python3
"""
Quick test script to verify thumbnail processing changes work correctly.
"""

import os
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO

# Add the visivo package to path
sys.path.insert(0, '/Users/tgsoverly/code/visivo')

from visivo.server.flask_app import save_thumbnail_async, thumbnail_executor


def test_async_thumbnail_saving():
    """Test that async thumbnail saving works correctly."""
    print("🧪 Testing async thumbnail saving...")
    
    # Create test PNG content
    test_png_content = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x00\x01\x00\x00\x00\x00IEND\xaeB`\x82'
    
    with tempfile.TemporaryDirectory() as temp_dir:
        dashboard_hash = "test_dashboard_hash"
        
        try:
            # Test synchronous version
            print("  📁 Testing synchronous save...")
            result_path = save_thumbnail_async(test_png_content, dashboard_hash, temp_dir)
            assert os.path.exists(result_path), "Synchronous save failed"
            print("  ✅ Synchronous save works")
            
            # Test async version with ThreadPoolExecutor
            print("  ⚡ Testing asynchronous save...")
            dashboard_hash_2 = "test_dashboard_hash_2"
            future = thumbnail_executor.submit(save_thumbnail_async, test_png_content, dashboard_hash_2, temp_dir)
            result_path_2 = future.result(timeout=5)
            assert os.path.exists(result_path_2), "Asynchronous save failed"
            print("  ✅ Asynchronous save works")
            
            # Test concurrent saves
            print("  🔄 Testing concurrent saves...")
            futures = []
            for i in range(3):
                future = thumbnail_executor.submit(
                    save_thumbnail_async, 
                    test_png_content, 
                    f"concurrent_test_{i}", 
                    temp_dir
                )
                futures.append(future)
            
            results = [future.result(timeout=5) for future in futures]
            for path in results:
                assert os.path.exists(path), f"Concurrent save failed for {path}"
            
            print("  ✅ Concurrent saves work")
            print("🎉 All thumbnail processing tests passed!")
            
        except Exception as e:
            print(f"  ❌ Test failed: {e}")
            return False
    
    return True


def test_threadpool_executor():
    """Test that the ThreadPoolExecutor is configured correctly."""
    print("🔧 Testing ThreadPoolExecutor configuration...")
    
    try:
        assert thumbnail_executor._max_workers == 2, "ThreadPoolExecutor should have 2 max workers"
        assert thumbnail_executor._thread_name_prefix == "thumbnail", "ThreadPoolExecutor should use 'thumbnail' prefix"
        print("  ✅ ThreadPoolExecutor configured correctly")
        return True
    except Exception as e:
        print(f"  ❌ ThreadPoolExecutor test failed: {e}")
        return False


def main():
    """Run all thumbnail tests."""
    print("🚀 Starting thumbnail processing tests...\n")
    
    tests = [
        test_threadpool_executor,
        test_async_thumbnail_saving,
    ]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            if test():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"❌ Test {test.__name__} crashed: {e}")
            failed += 1
        print()
    
    print(f"📊 Results: {passed} passed, {failed} failed")
    
    if failed == 0:
        print("🎉 All tests passed! Thumbnail processing improvements are working correctly.")
        return 0
    else:
        print("❌ Some tests failed. Please check the implementation.")
        return 1


if __name__ == "__main__":
    exit(main())