#!/usr/bin/env python3
"""
Backend API Testing for Product Capture App
Tests all CRUD endpoints and AI screenshot analysis functionality
"""

import requests
import json
import base64
import time
from datetime import datetime
from typing import Dict, Any

# Backend URL from frontend .env
BACKEND_URL = "https://share-screenshot.preview.emergentagent.com/api"

def create_sample_base64_image() -> str:
    """Create a simple base64 encoded PNG image for testing"""
    # This is a minimal 1x1 pixel PNG image in base64
    # For more realistic testing, we would use an actual product image
    return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="

def create_realistic_product_image() -> str:
    """Create a more realistic base64 encoded image for AI testing"""
    try:
        from PIL import Image, ImageDraw
        import io
        
        # Create a simple RGB image with product-like content
        img = Image.new('RGB', (300, 200), color='white')
        draw = ImageDraw.Draw(img)
        
        # Add some visual elements to simulate a product screenshot
        draw.rectangle([20, 20, 280, 180], fill='lightblue', outline='blue', width=2)
        draw.text((50, 80), 'iPhone 15 Pro', fill='black')
        draw.text((50, 100), '$1199.99', fill='green')
        draw.text((50, 120), 'Apple Inc.', fill='gray')
        
        # Convert to base64 JPEG
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=85)
        return base64.b64encode(buffer.getvalue()).decode()
    except ImportError:
        # Fallback to minimal valid JPEG if PIL is not available
        # This is a minimal valid JPEG header + data
        jpeg_data = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.\' ",#\x1c\x1c(7),01444\x1f\'9=82<.342\xff\xc0\x00\x11\x08\x00\x01\x00\x01\x01\x01\x11\x00\x02\x11\x01\x03\x11\x01\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x08\xff\xc4\x00\x14\x10\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xda\x00\x0c\x03\x01\x00\x02\x11\x03\x11\x00\x3f\x00\xaa\xff\xd9'
        return base64.b64encode(jpeg_data).decode()

class ProductCaptureAPITester:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        self.test_results = []
        self.created_product_id = None

    def log_test(self, test_name: str, success: bool, message: str = "", response: Any = None):
        """Log test results"""
        result = {
            'test_name': test_name,
            'success': success,
            'message': message,
            'timestamp': datetime.now().isoformat()
        }
        if response and hasattr(response, 'status_code'):
            result['status_code'] = response.status_code
            result['response_time'] = getattr(response, 'elapsed', None)
        
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} | {test_name}")
        if message:
            print(f"     {message}")
        if response and hasattr(response, 'status_code'):
            print(f"     Status Code: {response.status_code}")

    def test_health_check(self):
        """Test GET /api/health"""
        try:
            response = self.session.get(f"{self.base_url}/health", timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if 'status' in data and data['status'] == 'healthy':
                    self.log_test("Health Check", True, "API is healthy", response)
                    return True
                else:
                    self.log_test("Health Check", False, f"Invalid response format: {data}", response)
            else:
                self.log_test("Health Check", False, f"HTTP {response.status_code}: {response.text}", response)
                
        except requests.exceptions.RequestException as e:
            self.log_test("Health Check", False, f"Request failed: {str(e)}")
        except Exception as e:
            self.log_test("Health Check", False, f"Unexpected error: {str(e)}")
        
        return False

    def test_create_product(self):
        """Test POST /api/products"""
        try:
            product_data = {
                "name": "iPhone 15 Pro Max",
                "price": "$1199.99",
                "description": "Latest Apple iPhone with titanium design and advanced camera system",
                "brand": "Apple",
                "original_url": "https://apple.com/iphone-15-pro",
                "image_base64": create_sample_base64_image(),
                "screenshot_base64": create_realistic_product_image()
            }
            
            response = self.session.post(f"{self.base_url}/products", 
                                       json=product_data, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if 'id' in data and data['name'] == product_data['name']:
                    self.created_product_id = data['id']
                    self.log_test("Create Product", True, 
                                f"Product created with ID: {self.created_product_id}", response)
                    return True
                else:
                    self.log_test("Create Product", False, 
                                f"Invalid response format: {data}", response)
            else:
                self.log_test("Create Product", False, 
                            f"HTTP {response.status_code}: {response.text}", response)
                
        except requests.exceptions.RequestException as e:
            self.log_test("Create Product", False, f"Request failed: {str(e)}")
        except Exception as e:
            self.log_test("Create Product", False, f"Unexpected error: {str(e)}")
        
        return False

    def test_get_all_products(self):
        """Test GET /api/products"""
        try:
            response = self.session.get(f"{self.base_url}/products", timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_test("Get All Products", True, 
                                f"Retrieved {len(data)} products", response)
                    return True
                else:
                    self.log_test("Get All Products", False, 
                                f"Expected list, got: {type(data)}", response)
            else:
                self.log_test("Get All Products", False, 
                            f"HTTP {response.status_code}: {response.text}", response)
                
        except requests.exceptions.RequestException as e:
            self.log_test("Get All Products", False, f"Request failed: {str(e)}")
        except Exception as e:
            self.log_test("Get All Products", False, f"Unexpected error: {str(e)}")
        
        return False

    def test_get_single_product(self):
        """Test GET /api/products/{id}"""
        if not self.created_product_id:
            self.log_test("Get Single Product", False, "No product ID available (create product first)")
            return False
            
        try:
            response = self.session.get(f"{self.base_url}/products/{self.created_product_id}", 
                                      timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if 'id' in data and data['id'] == self.created_product_id:
                    self.log_test("Get Single Product", True, 
                                f"Retrieved product: {data['name']}", response)
                    return True
                else:
                    self.log_test("Get Single Product", False, 
                                f"Product ID mismatch or invalid format", response)
            elif response.status_code == 404:
                self.log_test("Get Single Product", False, 
                            "Product not found", response)
            else:
                self.log_test("Get Single Product", False, 
                            f"HTTP {response.status_code}: {response.text}", response)
                
        except requests.exceptions.RequestException as e:
            self.log_test("Get Single Product", False, f"Request failed: {str(e)}")
        except Exception as e:
            self.log_test("Get Single Product", False, f"Unexpected error: {str(e)}")
        
        return False

    def test_update_product(self):
        """Test PUT /api/products/{id}"""
        if not self.created_product_id:
            self.log_test("Update Product", False, "No product ID available (create product first)")
            return False
            
        try:
            update_data = {
                "name": "iPhone 15 Pro Max - Updated",
                "price": "$1099.99",
                "description": "Updated description with new pricing"
            }
            
            response = self.session.put(f"{self.base_url}/products/{self.created_product_id}", 
                                      json=update_data, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if data['name'] == update_data['name'] and data['price'] == update_data['price']:
                    self.log_test("Update Product", True, 
                                f"Product updated successfully", response)
                    return True
                else:
                    self.log_test("Update Product", False, 
                                f"Update not reflected in response", response)
            elif response.status_code == 404:
                self.log_test("Update Product", False, 
                            "Product not found for update", response)
            else:
                self.log_test("Update Product", False, 
                            f"HTTP {response.status_code}: {response.text}", response)
                
        except requests.exceptions.RequestException as e:
            self.log_test("Update Product", False, f"Request failed: {str(e)}")
        except Exception as e:
            self.log_test("Update Product", False, f"Unexpected error: {str(e)}")
        
        return False

    def test_analyze_screenshot(self):
        """Test POST /api/products/analyze-screenshot"""
        try:
            # Create a more realistic base64 image for AI analysis
            analyze_data = {
                "screenshot_base64": create_realistic_product_image(),
                "url": "https://apple.com/iphone-15-pro"
            }
            
            response = self.session.post(f"{self.base_url}/products/analyze-screenshot", 
                                       json=analyze_data, timeout=30)  # Longer timeout for AI
            
            if response.status_code == 200:
                data = response.json()
                # Check if response has expected fields from AI analysis
                expected_fields = ['name', 'price', 'description', 'brand', 'confidence']
                if all(field in data for field in expected_fields):
                    self.log_test("AI Screenshot Analysis", True, 
                                f"AI analysis completed. Confidence: {data.get('confidence', 'N/A')}", response)
                    return True
                else:
                    self.log_test("AI Screenshot Analysis", False, 
                                f"Missing expected fields in response: {data}", response)
            else:
                self.log_test("AI Screenshot Analysis", False, 
                            f"HTTP {response.status_code}: {response.text}", response)
                
        except requests.exceptions.RequestException as e:
            self.log_test("AI Screenshot Analysis", False, f"Request failed: {str(e)}")
        except Exception as e:
            self.log_test("AI Screenshot Analysis", False, f"Unexpected error: {str(e)}")
        
        return False

    def test_delete_product(self):
        """Test DELETE /api/products/{id}"""
        if not self.created_product_id:
            self.log_test("Delete Product", False, "No product ID available (create product first)")
            return False
            
        try:
            response = self.session.delete(f"{self.base_url}/products/{self.created_product_id}", 
                                         timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if 'message' in data:
                    self.log_test("Delete Product", True, 
                                "Product deleted successfully", response)
                    return True
                else:
                    self.log_test("Delete Product", False, 
                                f"Unexpected response format: {data}", response)
            elif response.status_code == 404:
                self.log_test("Delete Product", False, 
                            "Product not found for deletion", response)
            else:
                self.log_test("Delete Product", False, 
                            f"HTTP {response.status_code}: {response.text}", response)
                
        except requests.exceptions.RequestException as e:
            self.log_test("Delete Product", False, f"Request failed: {str(e)}")
        except Exception as e:
            self.log_test("Delete Product", False, f"Unexpected error: {str(e)}")
        
        return False

    def verify_deletion(self):
        """Verify that the product was actually deleted"""
        if not self.created_product_id:
            self.log_test("Verify Deletion", False, "No product ID to verify")
            return False
            
        try:
            response = self.session.get(f"{self.base_url}/products/{self.created_product_id}", 
                                      timeout=10)
            
            if response.status_code == 404:
                self.log_test("Verify Deletion", True, 
                            "Product successfully removed from database", response)
                return True
            elif response.status_code == 200:
                self.log_test("Verify Deletion", False, 
                            "Product still exists after deletion", response)
            else:
                self.log_test("Verify Deletion", False, 
                            f"Unexpected status during verification: {response.status_code}", response)
                
        except requests.exceptions.RequestException as e:
            self.log_test("Verify Deletion", False, f"Request failed: {str(e)}")
        except Exception as e:
            self.log_test("Verify Deletion", False, f"Unexpected error: {str(e)}")
        
        return False

    def run_full_test_suite(self):
        """Run the complete CRUD test flow"""
        print("=" * 60)
        print("PRODUCT CAPTURE APP - BACKEND API TESTING")
        print("=" * 60)
        print(f"Backend URL: {self.base_url}")
        print(f"Test Start Time: {datetime.now()}")
        print("=" * 60)

        # Test sequence as requested
        tests = [
            ("Health Check", self.test_health_check),
            ("Create Product", self.test_create_product),
            ("Get All Products", self.test_get_all_products),
            ("Get Single Product", self.test_get_single_product),
            ("Update Product", self.test_update_product),
            ("AI Screenshot Analysis", self.test_analyze_screenshot),
            ("Delete Product", self.test_delete_product),
            ("Verify Deletion", self.verify_deletion)
        ]

        for test_name, test_func in tests:
            print(f"\n--- Running {test_name} ---")
            test_func()
            time.sleep(0.5)  # Brief pause between tests

        self.print_summary()

    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for result in self.test_results if result['success'])
        failed = len(self.test_results) - passed
        
        print(f"Total Tests: {len(self.test_results)}")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")
        print(f"Success Rate: {(passed/len(self.test_results)*100):.1f}%")
        
        if failed > 0:
            print("\nFAILED TESTS:")
            for result in self.test_results:
                if not result['success']:
                    print(f"  ❌ {result['test_name']}: {result['message']}")
        
        print("=" * 60)

if __name__ == "__main__":
    # Initialize and run tests
    tester = ProductCaptureAPITester(BACKEND_URL)
    tester.run_full_test_suite()