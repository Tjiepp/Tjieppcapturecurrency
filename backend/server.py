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
    description: str = ""
    brand: str = ""
    original_url: str = ""
    image_base64: str = ""  # Product image
    screenshot_base64: str = ""  # Original screenshot
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ProductCreate(BaseModel):
    name: str = ""
    price: str = ""
    description: str = ""
    brand: str = ""
    original_url: str = ""
    image_base64: str = ""
    screenshot_base64: str = ""

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[str] = None
    description: Optional[str] = None
    brand: Optional[str] = None
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
    description: str = ""
    brand: str = ""
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
            system_message="""You are a product information extraction expert. 
            Analyze product screenshots and page content to extract structured information.
            Always respond with valid JSON only, no other text.
            Extract product details accurately from all available sources."""
        ).with_model("openai", "gpt-5.2")
        
        # Create image content
        image_content = ImageContent(image_base64=screenshot_base64)
        
        # Build comprehensive prompt with page content if available
        page_context = ""
        if page_content:
            # Truncate if too long (keep first 4000 chars)
            truncated_content = page_content[:4000] if len(page_content) > 4000 else page_content
            page_context = f"""
            
FULL PAGE CONTENT (extracted from entire page, not just visible area):
{truncated_content}
"""
        
        prompt = f"""Analyze this product page and extract the following information.
        
Product URL: {url if url else 'Not provided'}
{page_context}

I'm also providing a screenshot of the visible portion. Use BOTH the page content AND the screenshot to extract accurate product information.

Return ONLY a valid JSON object with these exact fields:
{{
    "name": "Full product name",
    "price": "Price including currency symbol (e.g., $29.99). Look for sale price, current price, or listed price.",
    "description": "Product description (max 250 chars). Summarize key features.",
    "brand": "Brand name",
    "confidence": 0.0 to 1.0 based on how complete the extraction was
}}

IMPORTANT: 
- Extract info from the FULL PAGE CONTENT, not just what's visible in the screenshot
- Look for price in various formats: $XX.XX, €XX,XX, £XX.XX, etc.
- If multiple prices exist, prefer the sale/current price over original price
- Return ONLY the JSON, no explanation or markdown."""
        
        # Send message with image
        user_message = UserMessage(
            text=prompt,
            file_contents=[image_content]
        )
        
        response = await chat.send_message(user_message)
        logger.info(f"AI Response: {response}")
        
        # Parse JSON response
        # Try to extract JSON from the response
        json_match = re.search(r'\{[^{}]*\}', response, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
        else:
            result = json.loads(response)
        
        return {
            "name": result.get("name", ""),
            "price": result.get("price", ""),
            "description": result.get("description", ""),
            "brand": result.get("brand", ""),
            "confidence": float(result.get("confidence", 0.5))
        }
        
    except json.JSONDecodeError as e:
        logger.error(f"JSON parsing error: {e}")
        return {
            "name": "",
            "price": "",
            "description": "Could not parse AI response",
            "brand": "",
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
        description=product.description,
        brand=product.brand,
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
