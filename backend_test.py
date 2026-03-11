#!/usr/bin/env python3
"""
Backend API Test Suite for Product Capture App
Tests all CRUD operations and AI analysis endpoints
"""

import requests
import json
import time
import base64
from io import BytesIO
from PIL import Image
import random
import string

# Test Configuration
BASE_URL = "https://product-capture-3.preview.emergentagent.com/api"

class ProductCaptureAPITest:
    def __init__(self):
        self.base_url = BASE_URL
        self.created_product_id = None
        self.test_results = []
        
    def log_result(self, test_name, passed, details):
        """Log test result"""
        status = "✅ PASS" if passed else "❌ FAIL"
        self.test_results.append({
            "test": test_name,
            "passed": passed,
            "details": details
        })
        print(f"{status}: {test_name}")
        if details:
            print(f"    Details: {details}")
        print()
    
    def generate_test_image(self):
        """Generate a simple test image as base64"""
        # Create a simple 100x100 red square image
        img = Image.new('RGB', (100, 100), color='red')
        buffer = BytesIO()
        img.save(buffer, format='JPEG')
        img_base64 = base64.b64encode(buffer.getvalue()).decode()
        return img_base64
    
    def test_health_check(self):
        """Test the health check endpoint"""
        try:
            response = requests.get(f"{self.base_url}/health", timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if "status" in data and data["status"] == "healthy":
                    self.log_result("Health Check", True, f"Status: {data['status']}")
                    return True
                else:
                    self.log_result("Health Check", False, f"Unexpected response: {data}")
                    return False
            else:
                self.log_result("Health Check", False, f"Status code: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_result("Health Check", False, f"Exception: {str(e)}")
            return False
    
    def test_create_product_with_all_fields(self):
        """Test creating a product with ALL fields including weight and dimensions"""
        test_data = {
            "name": "Nike Air Max 270",
            "price": "$149.99",
            "original_price": "$179.99",
            "currency": "USD",
            "description": "Lifestyle running shoes with Max Air cushioning",
            "brand": "Nike",
            "color": "Black/White",
            "size": "42",
            "quantity": 2,
            "material": "Mesh and synthetic upper",
            "category": "Footwear",
            "availability": "In Stock",
            "rating": "4.5/5 (1,234 reviews)",
            "weight": "350g",
            "dimensions": "30x20x12 cm",
            "original_url": "https://example.com/nike-air-max-270",
            "image_base64": self.generate_test_image(),
            "screenshot_base64": self.generate_test_image()
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/products",
                json=test_data,
                headers={"Content-Type": "application/json"},
                timeout=15
            )
            
            if response.status_code == 200:
                created_product = response.json()
                self.created_product_id = created_product.get("id")
                
                # Verify ALL fields are present in response
                missing_fields = []
                for field, expected_value in test_data.items():
                    if field in created_product:
                        actual_value = created_product[field]
                        if actual_value != expected_value:
                            missing_fields.append(f"{field}: expected '{expected_value}', got '{actual_value}'")
                    else:
                        missing_fields.append(f"{field}: missing from response")
                
                # Check for required system fields
                required_system_fields = ["id", "created_at", "updated_at"]
                for field in required_system_fields:
                    if field not in created_product:
                        missing_fields.append(f"{field}: system field missing")
                
                if not missing_fields:
                    # Specifically verify weight and dimensions
                    weight_ok = created_product.get("weight") == "350g"
                    dimensions_ok = created_product.get("dimensions") == "30x20x12 cm"
                    
                    if weight_ok and dimensions_ok:
                        self.log_result(
                            "Create Product - All Fields", 
                            True, 
                            f"Product created with ID: {self.created_product_id}. Weight: {created_product.get('weight')}, Dimensions: {created_product.get('dimensions')}"
                        )
                        return True
                    else:
                        self.log_result(
                            "Create Product - All Fields", 
                            False, 
                            f"Weight/Dimensions not saved correctly. Weight: {created_product.get('weight')}, Dimensions: {created_product.get('dimensions')}"
                        )
                        return False
                else:
                    self.log_result(
                        "Create Product - All Fields", 
                        False, 
                        f"Field issues: {', '.join(missing_fields[:5])}"  # Show first 5 issues
                    )
                    return False
            else:
                self.log_result(
                    "Create Product - All Fields", 
                    False, 
                    f"Status code: {response.status_code}, Response: {response.text}"
                )
                return False
                
        except Exception as e:
            self.log_result("Create Product - All Fields", False, f"Exception: {str(e)}")
            return False
    
    def test_get_all_products(self):
        """Test getting all products"""
        try:
            response = requests.get(f"{self.base_url}/products", timeout=10)
            
            if response.status_code == 200:
                products = response.json()
                if isinstance(products, list):
                    # Verify our created product is in the list
                    found_product = False
                    if self.created_product_id:
                        for product in products:
                            if product.get("id") == self.created_product_id:
                                found_product = True
                                # Verify weight and dimensions are preserved
                                weight_ok = product.get("weight") == "350g"
                                dimensions_ok = product.get("dimensions") == "30x20x12 cm"
                                
                                if weight_ok and dimensions_ok:
                                    self.log_result(
                                        "Get All Products", 
                                        True, 
                                        f"Found {len(products)} products. Created product found with correct weight/dimensions."
                                    )
                                    return True
                                else:
                                    self.log_result(
                                        "Get All Products", 
                                        False, 
                                        f"Created product found but weight/dimensions incorrect: weight={product.get('weight')}, dimensions={product.get('dimensions')}"
                                    )
                                    return False
                        
                        if not found_product:
                            self.log_result(
                                "Get All Products", 
                                False, 
                                f"Created product ID {self.created_product_id} not found in {len(products)} products"
                            )
                            return False
                    else:
                        self.log_result(
                            "Get All Products", 
                            True, 
                            f"Retrieved {len(products)} products (no created product to verify)"
                        )
                        return True
                else:
                    self.log_result("Get All Products", False, f"Response is not a list: {type(products)}")
                    return False
            else:
                self.log_result("Get All Products", False, f"Status code: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_result("Get All Products", False, f"Exception: {str(e)}")
            return False
    
    def test_get_single_product(self):
        """Test getting a single product by ID"""
        if not self.created_product_id:
            self.log_result("Get Single Product", False, "No created product ID available")
            return False
        
        try:
            response = requests.get(f"{self.base_url}/products/{self.created_product_id}", timeout=10)
            
            if response.status_code == 200:
                product = response.json()
                
                # Verify key fields including weight and dimensions
                expected_fields = {
                    "name": "Nike Air Max 270",
                    "weight": "350g",
                    "dimensions": "30x20x12 cm",
                    "price": "$149.99",
                    "brand": "Nike"
                }
                
                missing_or_incorrect = []
                for field, expected_value in expected_fields.items():
                    if field not in product:
                        missing_or_incorrect.append(f"{field}: missing")
                    elif product[field] != expected_value:
                        missing_or_incorrect.append(f"{field}: expected '{expected_value}', got '{product[field]}'")
                
                if not missing_or_incorrect:
                    self.log_result(
                        "Get Single Product", 
                        True, 
                        f"Product retrieved successfully with ID: {product.get('id')}"
                    )
                    return True
                else:
                    self.log_result(
                        "Get Single Product", 
                        False, 
                        f"Field issues: {', '.join(missing_or_incorrect)}"
                    )
                    return False
            elif response.status_code == 404:
                self.log_result("Get Single Product", False, "Product not found (404)")
                return False
            else:
                self.log_result("Get Single Product", False, f"Status code: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_result("Get Single Product", False, f"Exception: {str(e)}")
            return False
    
    def test_update_product_weight_dimensions(self):
        """Test updating product weight and dimensions specifically"""
        if not self.created_product_id:
            self.log_result("Update Product Weight/Dimensions", False, "No created product ID available")
            return False
        
        update_data = {
            "weight": "400g",
            "dimensions": "35x25x15 cm",
            "price": "$139.99"  # Also update price to verify multiple fields
        }
        
        try:
            response = requests.put(
                f"{self.base_url}/products/{self.created_product_id}",
                json=update_data,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            if response.status_code == 200:
                updated_product = response.json()
                
                # Verify updates
                weight_updated = updated_product.get("weight") == "400g"
                dimensions_updated = updated_product.get("dimensions") == "35x25x15 cm"
                price_updated = updated_product.get("price") == "$139.99"
                
                # Verify other fields weren't changed
                name_preserved = updated_product.get("name") == "Nike Air Max 270"
                brand_preserved = updated_product.get("brand") == "Nike"
                
                if weight_updated and dimensions_updated and price_updated and name_preserved and brand_preserved:
                    self.log_result(
                        "Update Product Weight/Dimensions", 
                        True, 
                        f"Updated: weight={updated_product.get('weight')}, dimensions={updated_product.get('dimensions')}, price={updated_product.get('price')}"
                    )
                    return True
                else:
                    issues = []
                    if not weight_updated:
                        issues.append(f"weight not updated: {updated_product.get('weight')}")
                    if not dimensions_updated:
                        issues.append(f"dimensions not updated: {updated_product.get('dimensions')}")
                    if not price_updated:
                        issues.append(f"price not updated: {updated_product.get('price')}")
                    if not name_preserved:
                        issues.append(f"name changed: {updated_product.get('name')}")
                    if not brand_preserved:
                        issues.append(f"brand changed: {updated_product.get('brand')}")
                    
                    self.log_result(
                        "Update Product Weight/Dimensions", 
                        False, 
                        f"Update issues: {', '.join(issues)}"
                    )
                    return False
            else:
                self.log_result("Update Product Weight/Dimensions", False, f"Status code: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_result("Update Product Weight/Dimensions", False, f"Exception: {str(e)}")
            return False
    
    def test_ai_analysis_with_weight_dimensions(self):
        """Test AI screenshot analysis to verify weight and dimensions are returned"""
        # Create a more realistic test screenshot (simulate a product page)
        test_image = self.generate_test_image()
        
        test_data = {
            "screenshot_base64": f"data:image/jpeg;base64,{test_image}",
            "url": "https://example.com/test-product",
            "page_content": """
            Apple iPhone 15 Pro - 128GB - Natural Titanium
            Price: $999.00
            Was: $1099.00
            Brand: Apple
            Color: Natural Titanium (currently selected)
            Storage: 128GB (currently selected)
            Material: Titanium
            Category: Electronics
            In Stock - Ships in 1-2 days
            Rating: 4.8/5 (2,547 reviews)
            
            Technical Specifications:
            Weight: 187g
            Dimensions: 146.6 x 70.6 x 8.25 mm
            Display: 6.1-inch Super Retina XDR
            """
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/products/analyze-screenshot",
                json=test_data,
                headers={"Content-Type": "application/json"},
                timeout=30  # AI analysis can take longer
            )
            
            if response.status_code == 200:
                analysis_result = response.json()
                
                # Verify the response structure and that weight/dimensions are included
                required_fields = ["name", "price", "brand", "weight", "dimensions", "confidence"]
                missing_fields = [field for field in required_fields if field not in analysis_result]
                
                if not missing_fields:
                    weight = analysis_result.get("weight", "")
                    dimensions = analysis_result.get("dimensions", "")
                    confidence = analysis_result.get("confidence", 0)
                    
                    # Check if weight and dimensions are extracted (they should be strings, can be empty if not found)
                    weight_field_exists = isinstance(weight, str)
                    dimensions_field_exists = isinstance(dimensions, str)
                    confidence_valid = isinstance(confidence, (int, float)) and 0 <= confidence <= 1
                    
                    if weight_field_exists and dimensions_field_exists and confidence_valid:
                        self.log_result(
                            "AI Analysis - Weight/Dimensions Fields", 
                            True, 
                            f"Analysis completed. Weight field: '{weight}', Dimensions field: '{dimensions}', Confidence: {confidence}"
                        )
                        return True
                    else:
                        issues = []
                        if not weight_field_exists:
                            issues.append(f"weight field invalid: {type(weight)}")
                        if not dimensions_field_exists:
                            issues.append(f"dimensions field invalid: {type(dimensions)}")
                        if not confidence_valid:
                            issues.append(f"confidence invalid: {confidence}")
                        
                        self.log_result(
                            "AI Analysis - Weight/Dimensions Fields", 
                            False, 
                            f"Field type/value issues: {', '.join(issues)}"
                        )
                        return False
                else:
                    self.log_result(
                        "AI Analysis - Weight/Dimensions Fields", 
                        False, 
                        f"Missing required fields: {', '.join(missing_fields)}"
                    )
                    return False
            else:
                self.log_result(
                    "AI Analysis - Weight/Dimensions Fields", 
                    False, 
                    f"Status code: {response.status_code}, Response: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_result("AI Analysis - Weight/Dimensions Fields", False, f"Exception: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all tests in sequence"""
        print("🧪 Starting Product Capture API Tests")
        print("=" * 60)
        
        tests = [
            self.test_health_check,
            self.test_create_product_with_all_fields,
            self.test_get_all_products,
            self.test_get_single_product,
            self.test_update_product_weight_dimensions,
            self.test_ai_analysis_with_weight_dimensions
        ]
        
        passed_count = 0
        total_count = len(tests)
        
        for test_func in tests:
            if test_func():
                passed_count += 1
            time.sleep(1)  # Brief pause between tests
        
        print("=" * 60)
        print(f"📊 TEST SUMMARY: {passed_count}/{total_count} tests passed")
        
        if passed_count == total_count:
            print("🎉 ALL TESTS PASSED!")
        else:
            print("⚠️  Some tests failed. See details above.")
            
        return passed_count == total_count


if __name__ == "__main__":
    tester = ProductCaptureAPITest()
    success = tester.run_all_tests()
    
    # Print detailed results
    print("\n📋 DETAILED TEST RESULTS:")
    print("-" * 40)
    for result in tester.test_results:
        status = "✅" if result["passed"] else "❌"
        print(f"{status} {result['test']}")
        if result["details"]:
            print(f"   {result['details']}")
    
    if success:
        exit(0)
    else:
        exit(1)