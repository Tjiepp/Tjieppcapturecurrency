from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
import base64
import json
import re

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# LLM Integration
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# Define Models
class Product(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    price: str = ""
    original_price: str = ""  # Original price before discount
    currency: str = ""
    description: str = ""
    brand: str = ""
    color: str = ""
    size: str = ""
    quantity: int = 1  # Default quantity
    material: str = ""
    category: str = ""
    availability: str = ""
    rating: str = ""
    weight: str = ""  # Product/package weight
    dimensions: str = ""  # Product/package dimensions
    shipping_category: str = ""  # S, M, L, XL, XXL, XXXL
    delivery_cost_webshop: str = ""  # Extracted delivery cost from webshop
    delivery_cost_size: str = ""  # Delivery cost by package size
    delivery_cost_weight: str = ""  # Delivery cost by package weight
    original_url: str = ""
    image_base64: str = ""  # Product image
    screenshot_base64: str = ""  # Original screenshot
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ProductCreate(BaseModel):
    name: str = ""
    price: str = ""
    original_price: str = ""
    currency: str = ""
    description: str = ""
    brand: str = ""
    color: str = ""
    size: str = ""
    quantity: int = 1
    material: str = ""
    category: str = ""
    availability: str = ""
    rating: str = ""
    weight: str = ""
    dimensions: str = ""
    shipping_category: str = ""
    delivery_cost_webshop: str = ""
    delivery_cost_size: str = ""
    delivery_cost_weight: str = ""
    original_url: str = ""
    image_base64: str = ""
    screenshot_base64: str = ""

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[str] = None
    original_price: Optional[str] = None
    currency: Optional[str] = None
    description: Optional[str] = None
    brand: Optional[str] = None
    color: Optional[str] = None
    size: Optional[str] = None
    quantity: Optional[int] = None
    material: Optional[str] = None
    category: Optional[str] = None
    availability: Optional[str] = None
    rating: Optional[str] = None
    weight: Optional[str] = None
    dimensions: Optional[str] = None
    shipping_category: Optional[str] = None
    delivery_cost_webshop: Optional[str] = None
    delivery_cost_size: Optional[str] = None
    delivery_cost_weight: Optional[str] = None
    original_url: Optional[str] = None
    image_base64: Optional[str] = None

class AnalyzeScreenshotRequest(BaseModel):
    screenshot_base64: str
    url: str = ""
    page_content: str = ""  # Full page text content extracted via JS

class AnalyzeURLRequest(BaseModel):
    url: str

class ExtractedProductInfo(BaseModel):
    name: str = ""
    price: str = ""
    original_price: str = ""
    currency: str = ""
    description: str = ""
    brand: str = ""
    color: str = ""
    size: str = ""
    material: str = ""
    category: str = ""
    availability: str = ""
    rating: str = ""
    confidence: float = 0.0

# AI Analysis Function
async def analyze_product_screenshot(screenshot_base64: str, url: str = "", page_content: str = "") -> dict:
    """Use AI to analyze a product screenshot and page content to extract information."""
    try:
        # Clean the base64 string (remove data URL prefix if present)
        if ',' in screenshot_base64:
            screenshot_base64 = screenshot_base64.split(',')[1]
        
        # Create LLM chat instance
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"product-analysis-{uuid.uuid4()}",
            system_message="""You are a product info extraction expert. Extract product details from screenshots and page content. Always respond with valid JSON only."""
        ).with_model("openai", "gpt-5.2")
        
        # Create image content
        image_content = ImageContent(image_base64=screenshot_base64)
        
        # Build comprehensive prompt with page content if available
        page_context = ""
        if page_content:
            # Try to extract structured price from the page content JSON
            extracted_prices_hint = ""
            try:
                parsed_content = json.loads(page_content)
                # Get prices found by JS extraction
                js_prices = parsed_content.get("prices", [])
                structured_price = parsed_content.get("structuredPrice", "")
                structured_original_price = parsed_content.get("structuredOriginalPrice", "")
                
                if structured_price:
                    extracted_prices_hint += f"\nSTRUCTURED DATA PRICE: {structured_price}"
                if structured_original_price:
                    extracted_prices_hint += f"\nSTRUCTURED DATA ORIGINAL PRICE: {structured_original_price}"
                if js_prices:
                    extracted_prices_hint += f"\nPRICE ELEMENTS FOUND ON PAGE: {', '.join(str(p) for p in js_prices[:10])}"
                    
                # Get structured data (JSON-LD)
                structured_data = parsed_content.get("structuredData", {})
                if structured_data:
                    extracted_prices_hint += f"\nJSON-LD STRUCTURED DATA: {json.dumps(structured_data)[:2000]}"
            except (json.JSONDecodeError, TypeError):
                pass
            
            # Truncate page content to 6000 chars (optimized for cost)
            truncated_content = page_content[:6000] if len(page_content) > 6000 else page_content
            page_context = f"""
{extracted_prices_hint}

FULL PAGE CONTENT (extracted from entire page):
{truncated_content}
"""
        
        prompt = f"""Analyze this product page and extract ALL available information.

Product URL: {url if url else 'Not provided'}
{page_context}

Extract as much detail as possible. Return ONLY a valid JSON object with these fields:
{{
    "name": "Full product name/title",
    "price": "CURRENT selling price - the price the customer pays NOW. This is the LOWEST/BOLDEST price shown. On bol.com this is the large price next to 'Nu voor'. Include currency symbol (e.g., €29,99)",
    "original_price": "ONLY the OLD/CROSSED-OUT/STRIKETHROUGH price before discount. On bol.com this is the small price with a line through it. Leave EMPTY if there is no discount/strikethrough price",
    "currency": "Currency code (USD, EUR, GBP, etc.)",
    "description": "Product description - key features and details (max 300 chars)",
    "brand": "Brand/manufacturer name",
    "color": "The CURRENTLY SELECTED color only (look for highlighted/active/selected state)",
    "size": "The CURRENTLY SELECTED size only (look for highlighted/active/selected button or dropdown value)",
    "material": "Material/fabric composition if mentioned",
    "category": "Product category (e.g., Electronics, Clothing, Home & Garden)",
    "availability": "In Stock, Out of Stock, Limited, Pre-order, etc.",
    "rating": "Star rating and review count if shown (e.g., 4.5/5 (234 reviews))",
    "weight": "PACKAGE weight only (verpakkingsgewicht) - just the number and unit, e.g. 8.2 kg, 500g",
    "dimensions": "PACKAGE dimensions only (verpakkingsafmetingen) - just LxWxH with unit, e.g. 58x43x37 cm",
    "delivery_available": true or false - whether the product can be delivered/shipped to the customer,
    "delivery_cost": "Delivery/shipping cost within the Netherlands (e.g., €5.95, Gratis, Free). Look for: verzendkosten, bezorgkosten, shipping cost, delivery fee",
    "confidence": 0.0 to 1.0 based on extraction completeness
}}

CRITICAL RULES FOR SIZE AND COLOR:
- For SIZE: Extract ONLY the currently selected/active size (the one the user has chosen)
  - Look for: highlighted button, selected option, active state, checked radio, filled button
  - Do NOT list all available sizes, only the ONE that is selected
  - If size shows "38" as selected, return "38" not "36" or other sizes
- For COLOR: Extract ONLY the currently selected/active color
  - Look for: highlighted swatch, selected option, active state
  - Do NOT list all available colors, only the ONE that is selected

WEIGHT AND DIMENSIONS:
- ALWAYS look for PACKAGE weight (verpakkingsgewicht) and PACKAGE dimensions (verpakkingsafmetingen), NOT just the product itself
- Prefer shipping/package specs over product specs: look for "verpakkingsgewicht", "brutogewicht", "shipping weight", "package weight", "verpakkingsafmetingen", "package dimensions", "shipping dimensions", "afmetingen verpakking"
- If only product weight/dimensions are available, use those as a fallback
- Extract weight in grams (g), kilograms (kg), or pounds (lbs)
- Extract dimensions as length x width x height with units
- IMPORTANT: If NO weight or dimensions are mentioned on the page, you MUST ESTIMATE the PACKAGE weight and dimensions based on the product type and image:
  - Analyze what the product is (e.g., shoes, electronics, clothing, appliance)
  - Provide realistic ESTIMATED average package dimensions and weight for that product type
  - Use your knowledge of typical packaging sizes for similar products
  - Format estimates the same way as extracted values (e.g., "~1.2 kg (estimated)", "~35x25x15 cm (estimated)")
  - Always include "(estimated)" when the values are not from the page

OTHER RULES:
- Extract from BOTH the page content AND screenshot
- Use empty string "" for any field you cannot find
- PRICE RULES: "price" MUST be the LOWEST price shown = what the customer pays NOW. "original_price" is ONLY the higher crossed-out/strikethrough price. If there is only one price and no discount, put it in "price" and leave "original_price" empty. On bol.com: the big bold price = "price", the small strikethrough price = "original_price".
- PRICE IS CRITICAL: Look EVERYWHERE for the price - in headers, sidebars, "add to cart" sections, product tiles, price tags. Also look in the HTML for price-related classes, meta tags, or structured data. If you see ANY number with a currency symbol or in a price-like format near the product, extract it.
- Be specific with category (not just "Product")
- DELIVERY: Set delivery_available to false if the page shows: "not available for delivery", "only in-store pickup", "niet leverbaar", "geen bezorging", "alleen afhalen", "not shippable", "pickup only", "out of stock", "sold out", "uitverkocht", or any similar indication that the product cannot be shipped/delivered. Default to true if there's no clear indication either way.
- Return ONLY valid JSON, no markdown or explanation."""
        
        # Send message with image
        user_message = UserMessage(
            text=prompt,
            file_contents=[image_content]
        )
        
        response = await chat.send_message(user_message)
        logger.info(f"AI Response: {response}")
        
        # Parse JSON response
        # Try to extract JSON from the response - handle nested objects
        json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', response, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
        else:
            result = json.loads(response)
        
        return {
            "name": result.get("name", ""),
            "price": result.get("price", ""),
            "original_price": result.get("original_price", ""),
            "currency": result.get("currency", ""),
            "description": result.get("description", ""),
            "brand": result.get("brand", ""),
            "color": result.get("color", ""),
            "size": result.get("size", ""),
            "material": result.get("material", ""),
            "category": result.get("category", ""),
            "availability": result.get("availability", ""),
            "rating": result.get("rating", ""),
            "weight": result.get("weight", ""),
            "dimensions": result.get("dimensions", ""),
            "delivery_available": result.get("delivery_available", True),
            "delivery_cost": result.get("delivery_cost", ""),
            "confidence": float(result.get("confidence", 0.5))
        }
        
    except json.JSONDecodeError as e:
        logger.error(f"JSON parsing error: {e}")
        return {
            "name": "",
            "price": "",
            "original_price": "",
            "currency": "",
            "description": "Could not parse AI response",
            "brand": "",
            "color": "",
            "size": "",
            "material": "",
            "category": "",
            "availability": "",
            "rating": "",
            "weight": "",
            "dimensions": "",
            "confidence": 0.0
        }
    except Exception as e:
        logger.error(f"AI analysis error: {e}")
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")

# API Routes
@api_router.get("/")
async def root():
    return {"message": "Product Capture API", "status": "running"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

# Analyze screenshot with AI
@api_router.post("/products/analyze-screenshot")
async def analyze_screenshot(request: AnalyzeScreenshotRequest):
    """Analyze a product screenshot using AI to extract product information."""
    if not request.screenshot_base64:
        raise HTTPException(status_code=400, detail="Screenshot is required")
    
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="AI service not configured")
    
    result = await analyze_product_screenshot(
        request.screenshot_base64, 
        request.url,
        request.page_content
    )
    return result

# Get all products
@api_router.get("/products", response_model=List[Product])
async def get_products():
    """Get all saved products."""
    products = await db.products.find().sort("created_at", -1).to_list(1000)
    return [Product(**product) for product in products]

# Get single product
@api_router.get("/products/{product_id}", response_model=Product)
async def get_product(product_id: str):
    """Get a single product by ID."""
    product = await db.products.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return Product(**product)

# Create product
@api_router.post("/products", response_model=Product)
async def create_product(product: ProductCreate):
    """Save a new product."""
    product_obj = Product(
        name=product.name,
        price=product.price,
        original_price=product.original_price,
        currency=product.currency,
        description=product.description,
        brand=product.brand,
        color=product.color,
        size=product.size,
        quantity=product.quantity,
        material=product.material,
        category=product.category,
        availability=product.availability,
        rating=product.rating,
        weight=product.weight,
        dimensions=product.dimensions,
        shipping_category=product.shipping_category,
        delivery_cost_webshop=product.delivery_cost_webshop,
        delivery_cost_size=product.delivery_cost_size,
        delivery_cost_weight=product.delivery_cost_weight,
        original_url=product.original_url,
        image_base64=product.image_base64,
        screenshot_base64=product.screenshot_base64
    )
    await db.products.insert_one(product_obj.dict())
    return product_obj

# Update product
@api_router.put("/products/{product_id}", response_model=Product)
async def update_product(product_id: str, product_update: ProductUpdate):
    """Update an existing product."""
    existing = await db.products.find_one({"id": product_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")
    
    update_data = {k: v for k, v in product_update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    await db.products.update_one({"id": product_id}, {"$set": update_data})
    
    updated = await db.products.find_one({"id": product_id})
    return Product(**updated)

# Delete product
@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str):
    """Delete a product."""
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product deleted successfully"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
