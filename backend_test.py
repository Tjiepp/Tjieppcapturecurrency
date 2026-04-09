#!/usr/bin/env python3
"""
Backend Testing Script for Product Capture App
Tests the specific requirements from the review request:
1. Health check endpoint
2. Create product with shipping fields
3. Get products to verify shipping fields
4. Delete test product
"""

import requests
import json
import sys
from datetime import datetime

# Backend URL from frontend .env
BACKEND_URL = "https://product-capture-3.preview.emergentagent.com/api"

def test_health_check():
    """Test the health check endpoint"""
    print("🔍 Testing Health Check Endpoint...")
    try:
        response = requests.get(f"{BACKEND_URL}/health", timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get("status") == "healthy":
                print("✅ Health check passed - status is healthy")
                return True
            else:
                print(f"❌ Health check failed - unexpected status: {data.get('status')}")
                return False
        else:
            print(f"❌ Health check failed - status code: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Health check failed with error: {e}")
        return False

def test_create_product_with_shipping():
    """Test creating a product with shipping fields"""
    print("\n🔍 Testing Create Product with Shipping Fields...")
    
    # Test product data with all shipping fields as specified in the review request
    test_product = {
        "name": "Test Product",
        "price": "€29.99",
        "weight": "500g",
        "dimensions": "30x20x15 cm",
        "shipping_category": "M",
        "delivery_cost_webshop": "€5.95",
        "delivery_cost_size": "€5.00",
        "delivery_cost_weight": "€3.75",
        "description": "Test product for shipping verification",
        "brand": "Test Brand",
        "category": "Test Category",
        "original_url": "https://test.example.com/product"
    }
    
    try:
        response = requests.post(
            f"{BACKEND_URL}/products", 
            json=test_product,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            created_product = response.json()
            print(f"✅ Product created successfully with ID: {created_product.get('id')}")
            
            # Verify all shipping fields are present
            shipping_fields = [
                "weight", "dimensions", "shipping_category", 
                "delivery_cost_webshop", "delivery_cost_size", "delivery_cost_weight"
            ]
            
            all_fields_present = True
            for field in shipping_fields:
                if field in created_product and created_product[field] == test_product[field]:
                    print(f"✅ {field}: {created_product[field]}")
                else:
                    print(f"❌ {field}: Expected '{test_product[field]}', got '{created_product.get(field, 'MISSING')}'")
                    all_fields_present = False
            
            if all_fields_present:
                print("✅ All shipping fields saved correctly")
                return created_product.get('id'), True
            else:
                print("❌ Some shipping fields missing or incorrect")
                return created_product.get('id'), False
        else:
            print(f"❌ Product creation failed - status code: {response.status_code}")
            print(f"Response: {response.text}")
            return None, False
            
    except Exception as e:
        print(f"❌ Product creation failed with error: {e}")
        return None, False

def test_get_products(product_id):
    """Test getting all products and verify the created product has shipping fields"""
    print("\n🔍 Testing Get Products Endpoint...")
    
    try:
        response = requests.get(f"{BACKEND_URL}/products", timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            products = response.json()
            print(f"✅ Retrieved {len(products)} products")
            
            # Find our test product
            test_product = None
            for product in products:
                if product.get('id') == product_id:
                    test_product = product
                    break
            
            if test_product:
                print(f"✅ Found test product with ID: {product_id}")
                
                # Verify shipping fields are present in the retrieved product
                expected_shipping_data = {
                    "name": "Test Product",
                    "price": "€29.99",
                    "weight": "500g",
                    "dimensions": "30x20x15 cm",
                    "shipping_category": "M",
                    "delivery_cost_webshop": "€5.95",
                    "delivery_cost_size": "€5.00",
                    "delivery_cost_weight": "€3.75"
                }
                
                all_fields_correct = True
                for field, expected_value in expected_shipping_data.items():
                    actual_value = test_product.get(field)
                    if actual_value == expected_value:
                        print(f"✅ {field}: {actual_value}")
                    else:
                        print(f"❌ {field}: Expected '{expected_value}', got '{actual_value}'")
                        all_fields_correct = False
                
                if all_fields_correct:
                    print("✅ All shipping fields verified in retrieved product")
                    return True
                else:
                    print("❌ Some shipping fields incorrect in retrieved product")
                    return False
            else:
                print(f"❌ Test product with ID {product_id} not found in products list")
                return False
        else:
            print(f"❌ Get products failed - status code: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Get products failed with error: {e}")
        return False

def test_delete_product(product_id):
    """Test deleting the test product"""
    print(f"\n🔍 Testing Delete Product (ID: {product_id})...")
    
    try:
        response = requests.delete(f"{BACKEND_URL}/products/{product_id}", timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Product deleted successfully: {result.get('message')}")
            return True
        else:
            print(f"❌ Product deletion failed - status code: {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Product deletion failed with error: {e}")
        return False

def main():
    """Run all backend tests"""
    print("🚀 Starting Backend Tests for Product Capture App")
    print(f"Backend URL: {BACKEND_URL}")
    print("=" * 60)
    
    test_results = []
    product_id = None
    
    # Test 1: Health Check
    health_result = test_health_check()
    test_results.append(("Health Check", health_result))
    
    # Test 2: Create Product with Shipping Fields
    product_id, create_result = test_create_product_with_shipping()
    test_results.append(("Create Product with Shipping", create_result))
    
    # Test 3: Get Products and Verify Shipping Fields (only if product was created)
    if product_id:
        get_result = test_get_products(product_id)
        test_results.append(("Get Products & Verify Shipping", get_result))
        
        # Test 4: Delete Test Product
        delete_result = test_delete_product(product_id)
        test_results.append(("Delete Test Product", delete_result))
    else:
        print("\n⚠️  Skipping Get Products and Delete tests due to failed product creation")
        test_results.append(("Get Products & Verify Shipping", False))
        test_results.append(("Delete Test Product", False))
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 TEST SUMMARY")
    print("=" * 60)
    
    passed = 0
    total = len(test_results)
    
    for test_name, result in test_results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{test_name}: {status}")
        if result:
            passed += 1
    
    print(f"\nOverall: {passed}/{total} tests passed ({(passed/total)*100:.1f}%)")
    
    if passed == total:
        print("🎉 All tests passed! Backend is working correctly.")
        return 0
    else:
        print("⚠️  Some tests failed. Check the details above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())