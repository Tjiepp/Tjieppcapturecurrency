import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Modal,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import axios from 'axios';

// Conditionally import native-only modules
let WebView: any = null;
let captureRef: any = null;

if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
  captureRef = require('react-native-view-shot').captureRef;
}

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface ExtractedInfo {
  name: string;
  price: string;
  original_price: string;
  currency: string;
  description: string;
  brand: string;
  color: string;
  size: string;
  material: string;
  category: string;
  availability: string;
  rating: string;
  weight: string;
  dimensions: string;
  delivery_available: boolean;
  confidence: number;
}

// Step type for multi-step flow
type CaptureStep = 'select' | 'selection_done' | 'measurements_done';

// Shipping size categories
type ShippingCategory = 'S' | 'M' | 'L' | 'XL' | 'XXL' | 'XXXL';

const SHIPPING_PRICES: Record<ShippingCategory, number> = {
  'S': 5,
  'M': 5,
  'L': 15,
  'XL': 24,
  'XXL': 44,
  'XXXL': 72,
};

const WEIGHT_PRICE_PER_100G = 0.75;

// Parse dimensions string like "30x20x15 cm", "~35x25x15 cm (estimated)" etc.
function parseDimensions(dimStr: string): { l: number; w: number; h: number; total: number } | null {
  if (!dimStr) return null;
  // Extract numbers from the string
  const numbers = dimStr.match(/[\d]+[.,]?[\d]*/g);
  if (!numbers || numbers.length < 3) return null;
  const vals = numbers.slice(0, 3).map(n => parseFloat(n.replace(',', '.')));
  // Sort descending so l >= w >= h
  vals.sort((a, b) => b - a);
  return { l: vals[0], w: vals[1], h: vals[2], total: vals[0] + vals[1] + vals[2] };
}

// Parse weight string like "500g", "1.2 kg", "~350g (estimated)", "2.5 lbs" etc.
function parseWeightGrams(weightStr: string): number {
  if (!weightStr) return 0;
  const numMatch = weightStr.match(/([\d]+[.,]?[\d]*)/);
  if (!numMatch) return 0;
  const value = parseFloat(numMatch[1].replace(',', '.'));
  const lower = weightStr.toLowerCase();
  if (lower.includes('kg') || lower.includes('kilo')) return value * 1000;
  if (lower.includes('lbs') || lower.includes('pound')) return value * 453.59;
  if (lower.includes('g') || lower.includes('gram')) return value;
  // Default: if value > 50, assume grams; otherwise kg
  return value > 50 ? value : value * 1000;
}

// Determine shipping category based on dimensions (sum of L+W+H in cm)
function getShippingCategory(dimStr: string): ShippingCategory {
  const dims = parseDimensions(dimStr);
  if (!dims) return 'M'; // Default if can't parse
  const total = dims.total;
  if (total <= 60) return 'S';
  if (total <= 90) return 'M';
  if (total <= 120) return 'L';
  if (total <= 175) return 'XL';
  if (total <= 240) return 'XXL';
  return 'XXXL';
}

// Calculate delivery prices (separate, not summed)
function calculateDeliveryPrices(dimStr: string, weightStr: string): { category: ShippingCategory; sizePrice: number; weightPrice: number; weightGrams: number; standardPrice: number } {
  const category = getShippingCategory(dimStr);
  const sizePrice = SHIPPING_PRICES[category];
  const weightGrams = parseWeightGrams(weightStr);
  const weightPrice = Math.round((weightGrams / 100) * WEIGHT_PRICE_PER_100G * 100) / 100;
  return { category, sizePrice, weightPrice, weightGrams, standardPrice: 5 };
}

export default function CaptureScreen() {
  const params = useLocalSearchParams<{ url?: string }>();
  const [url, setUrl] = useState(params.url || '');
  const [isLoading, setIsLoading] = useState(false);
  const [pageLoaded, setPageLoaded] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pageContent, setPageContent] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [productImageUrl, setProductImageUrl] = useState('');
  
  // Multi-step flow
  const [captureStep, setCaptureStep] = useState<CaptureStep>('select');
  const [extractingSelection, setExtractingSelection] = useState(false);
  const [extractingMeasurements, setExtractingMeasurements] = useState(false);
  
  // Product fields
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [description, setDescription] = useState('');
  const [brand, setBrand] = useState('');
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [material, setMaterial] = useState('');
  const [category, setCategory] = useState('');
  const [availability, setAvailability] = useState('');
  const [rating, setRating] = useState('');
  const [weight, setWeight] = useState('');
  const [dimensions, setDimensions] = useState('');

  const webViewRef = useRef<any>(null);
  const viewShotRef = useRef<View>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const [specsContent, setSpecsContent] = useState('');
  
  // Refs to always have latest content available (avoids stale closure in async functions)
  const pageContentRef = useRef('');
  const specsContentRef = useRef('');

  useEffect(() => {
    if (params.url) {
      setUrl(params.url);
      setIsLoading(true);
    }
  }, [params.url]);

  // Auto-scroll to top when form appears or step changes
  useEffect(() => {
    if ((showForm || captureStep !== 'select') && scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      }, 100);
    }
  }, [showForm, captureStep]);

  // JavaScript to inject into WebView to extract page content
  const extractPageContentJS = `
    (function() {
      try {
        const getTextContent = () => {
          const metaTags = {};
          document.querySelectorAll('meta').forEach(meta => {
            const name = meta.getAttribute('name') || meta.getAttribute('property');
            const content = meta.getAttribute('content');
            if (name && content) metaTags[name] = content;
          });
          
          const title = document.title || '';
          const priceElements = document.querySelectorAll('[class*="price"], [id*="price"], [data-price], .price, .product-price, .sale-price');
          const prices = Array.from(priceElements).map(el => el.textContent?.trim()).filter(Boolean);
          const nameElements = document.querySelectorAll('h1, [class*="product-title"], [class*="product-name"]');
          const names = Array.from(nameElements).slice(0, 3).map(el => el.textContent?.trim()).filter(Boolean);
          const descElements = document.querySelectorAll('[class*="description"], [class*="details"], meta[name="description"]');
          const descriptions = Array.from(descElements).map(el => el.textContent?.trim() || el.getAttribute('content')).filter(Boolean);
          
          // Find SELECTED color
          let selectedColor = '';
          const colorSelectors = [
            '[class*="color"][class*="selected"]', '[class*="color"][class*="active"]',
            '[class*="colour"][class*="selected"]', '[class*="colour"][class*="active"]',
            '[data-color][class*="selected"]', '[data-color][class*="active"]',
            'input[name*="color"]:checked + label', 'input[name*="colour"]:checked + label',
            '[class*="swatch"][class*="selected"]', '[class*="swatch"][class*="active"]',
            '[aria-checked="true"][class*="color"]', '[aria-selected="true"][class*="color"]'
          ];
          for (const selector of colorSelectors) {
            const el = document.querySelector(selector);
            if (el) {
              selectedColor = el.textContent?.trim() || el.getAttribute('data-color') || el.getAttribute('title') || '';
              if (selectedColor) break;
            }
          }
          
          // Find SELECTED size
          let selectedSize = '';
          const sizeSelectors = [
            '[class*="size"][class*="selected"]', '[class*="size"][class*="active"]',
            '[data-size][class*="selected"]', '[data-size][class*="active"]',
            'input[name*="size"]:checked + label', 'select[name*="size"] option:checked',
            '[class*="size-option"][class*="selected"]', '[class*="size-option"][class*="active"]',
            '[aria-checked="true"][class*="size"]', '[aria-selected="true"][class*="size"]',
            'button[class*="size"][class*="selected"]', 'button[class*="size"][class*="active"]',
            'button[class*="size"][aria-pressed="true"]'
          ];
          for (const selector of sizeSelectors) {
            const el = document.querySelector(selector);
            if (el) {
              selectedSize = el.textContent?.trim() || el.getAttribute('data-size') || el.getAttribute('value') || '';
              if (selectedSize) break;
            }
          }
          
          let structuredData = {};
          const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
          jsonLdScripts.forEach(script => {
            try {
              const data = JSON.parse(script.textContent || '{}');
              if (data['@type'] === 'Product' || data['@type']?.includes('Product')) {
                structuredData = data;
              }
              if (data['@graph']) {
                data['@graph'].forEach(item => {
                  if (item['@type'] === 'Product' || item['@type']?.includes('Product')) {
                    structuredData = item;
                  }
                });
              }
            } catch(e) {}
          });
          
          // Extract price from structured data
          let structuredPrice = '';
          let structuredOriginalPrice = '';
          if (structuredData.offers) {
            const offers = Array.isArray(structuredData.offers) ? structuredData.offers[0] : structuredData.offers;
            structuredPrice = offers?.price || offers?.lowPrice || '';
            structuredOriginalPrice = offers?.highPrice || '';
            if (offers?.priceCurrency && structuredPrice) {
              structuredPrice = offers.priceCurrency + ' ' + structuredPrice;
            }
          }
          
          // Extended price selectors
          const allPriceSelectors = [
            '[class*="price"]', '[id*="price"]', '[data-price]', 
            '.price', '.product-price', '.sale-price', '.current-price',
            '[class*="prijs"]', '[class*="amount"]', '[class*="cost"]',
            '.offer-price', '.selling-price', '.buy-price',
            '[itemprop="price"]', '[data-test*="price"]',
            '.promo-price', '.discount-price',
            'span[class*="Price"]', 'div[class*="Price"]'
          ];
          const allPriceElements = document.querySelectorAll(allPriceSelectors.join(','));
          const allPrices = Array.from(allPriceElements).map(el => {
            const text = el.textContent?.trim();
            const dataPrice = el.getAttribute('data-price') || el.getAttribute('content');
            return text || dataPrice;
          }).filter(Boolean).filter(p => /[\\d\u20AC$\u00A3\u00A5]/.test(p));
          
          // Find the main product image
          let productImageUrl = '';
          const imageSelectors = [
            '[itemprop="image"]',
            '.product-image img', '.product-gallery img', '.product-photo img',
            '#product-image img', '[class*="product-image"] img', '[class*="product-gallery"] img',
            '[class*="main-image"] img', '[class*="primary-image"] img', '[data-zoom-image]',
            '#landingImage', '#imgBlkFront', '.a-dynamic-image',
            'main img[src*="product"]', '.product img',
            '[class*="product"] img[src]:not([src*="icon"]):not([src*="logo"])',
          ];
          
          for (const selector of imageSelectors) {
            const img = document.querySelector(selector);
            if (img) {
              const src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-zoom-image');
              if (src && src.startsWith('http') && !src.includes('icon') && !src.includes('logo') && !src.includes('sprite')) {
                productImageUrl = src;
                break;
              }
            }
          }
          
          if (!productImageUrl) {
            const allImages = document.querySelectorAll('img[src^="http"]');
            let largestImg = null;
            let largestArea = 0;
            allImages.forEach(img => {
              const area = (img.naturalWidth || img.width || 0) * (img.naturalHeight || img.height || 0);
              if (area > largestArea && !img.src.includes('logo') && !img.src.includes('icon')) {
                largestArea = area;
                largestImg = img;
              }
            });
            if (largestImg) { productImageUrl = largestImg.src; }
          }
          
          if (!productImageUrl) {
            const ogImage = document.querySelector('meta[property="og:image"]');
            if (ogImage) { productImageUrl = ogImage.getAttribute('content') || ''; }
          }
          
          const mainContent = document.querySelector('main, [role="main"], .product, .product-detail')?.textContent?.substring(0, 3000) || '';
          
          return JSON.stringify({
            title, metaTags, prices: allPrices.slice(0, 10), names: names.slice(0, 3),
            descriptions: descriptions.slice(0, 2), 
            selectedColor, selectedSize,
            structuredPrice, structuredOriginalPrice, productImageUrl,
            mainContent, structuredData, url: window.location.href
          });
        };
        
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'PAGE_CONTENT',
          content: getTextContent()
        }));
      } catch(e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'PAGE_CONTENT',
          content: JSON.stringify({ error: e.message, bodyText: document.body?.innerText?.substring(0, 3000) || '' })
        }));
      }
    })();
    true;
  `;

  // JavaScript to extract specifications/measurements from the ENTIRE page DOM
  const extractSpecsJS = `
    (function() {
      try {
        const specSelectors = [
          'table', '[class*="spec"]', '[class*="Spec"]',
          '[class*="detail"]', '[class*="Detail"]',
          '[class*="feature"]', '[class*="Feature"]',
          '[class*="attribute"]', '[class*="kenmerken"]',
          '[class*="specificat"]', '[class*="afmeting"]',
          '[class*="gewicht"]', '[class*="dimension"]',
          '[class*="weight"]', '[class*="measure"]',
          '[class*="product-info"]', '[class*="product-detail"]',
          'dl', 'dd', 'dt'
        ];
        let specsText = '';
        const seen = new Set();
        for (const selector of specSelectors) {
          try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(function(el) {
              const text = el.textContent ? el.textContent.trim() : '';
              if (text && text.length > 5 && text.length < 2000 && !seen.has(text)) {
                seen.add(text);
                specsText += text + '\\n';
              }
            });
          } catch(e) {}
        }
        var allText = document.body ? document.body.innerText : '';
        var lines = allText.split('\\n');
        var keywords = ['weight','gewicht','dimension','afmeting','maat','lengte','breedte','hoogte','diepte','width','height','depth','length','cm','kg','gram','mm','liter','inhoud','volume','pakket','verpakking','package'];
        lines.forEach(function(line) {
          var lower = line.toLowerCase().trim();
          if (lower.length > 3 && lower.length < 200) {
            for (var i = 0; i < keywords.length; i++) {
              if (lower.indexOf(keywords[i]) !== -1 && !seen.has(line.trim())) {
                seen.add(line.trim());
                specsText += line.trim() + '\\n';
                break;
              }
            }
          }
        });
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'SPECS_CONTENT',
          content: specsText.substring(0, 8000)
        }));
      } catch(e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'SPECS_CONTENT',
          content: ''
        }));
      }
    })();
    true;
  `;

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'PAGE_CONTENT') {
        setPageContent(data.content);
        pageContentRef.current = data.content;
        try {
          const content = JSON.parse(data.content);
          if (content.productImageUrl) {
            setProductImageUrl(content.productImageUrl);
          }
        } catch (e) {}
      } else if (data.type === 'SPECS_CONTENT') {
        setSpecsContent(data.content || '');
        specsContentRef.current = data.content || '';
      }
    } catch (e) {
      console.log('WebView message parse error:', e);
    }
  };

  // Check delivery availability and show popup if not deliverable
  const checkDelivery = (info: any, productName: string): boolean => {
    if (info.delivery_available === false) {
      Alert.alert(
        'Not Available for Delivery',
        `"${productName || 'This product'}" is not available for delivery from this webshop.`,
        [
          {
            text: 'OK',
            onPress: () => router.push('/(tabs)/'),
          },
        ],
        { cancelable: false }
      );
      return false;
    }
    return true;
  };

  // Step 1 → Step 2: Extract price, size, color from page (JS only, no AI)
  const handleAllSelected = async () => {
    setExtractingSelection(true);
    
    try {
      // Re-inject JS to get fresh page content
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(extractPageContentJS);
        await new Promise(resolve => setTimeout(resolve, 800));
      }

      // Parse the page content for price/size/color
      let extractedPrice = '';
      let extractedOriginalPrice = '';
      let extractedSize = '';
      let extractedColor = '';

      try {
        const content = JSON.parse(pageContent);
        
        // Price: prefer structured data, then first price element
        extractedPrice = content.structuredPrice || '';
        extractedOriginalPrice = content.structuredOriginalPrice || '';
        
        if (!extractedPrice && content.prices && content.prices.length > 0) {
          // Find the first price-like value
          for (const p of content.prices) {
            if (p && /[\d]/.test(p) && p.length < 30) {
              extractedPrice = p;
              break;
            }
          }
        }
        
        // Size and Color from selected elements
        extractedSize = content.selectedSize || '';
        extractedColor = content.selectedColor || '';
        
        // Also get product image
        if (content.productImageUrl) {
          setProductImageUrl(content.productImageUrl);
        }
      } catch (e) {
        console.log('Parse error:', e);
      }

      // If JS extraction didn't find price, do a quick AI call
      if (!extractedPrice) {
        try {
          const uri = await captureRef(viewShotRef, {
            format: 'jpg',
            quality: 0.4,
            result: 'base64',
          });
          const base64Image = `data:image/jpeg;base64,${uri}`;
          
          const response = await axios.post(`${BACKEND_URL}/api/products/analyze-screenshot`, {
            screenshot_base64: base64Image,
            url: url,
            page_content: pageContent,
          });
          
          const info = response.data;
          if (!checkDelivery(info, info.name || '')) {
            setExtractingSelection(false);
            return;
          }
          extractedPrice = info.price || extractedPrice;
          extractedOriginalPrice = info.original_price || extractedOriginalPrice;
          extractedSize = info.size || extractedSize;
          extractedColor = info.color || extractedColor;
        } catch (e) {
          console.log('AI fallback error:', e);
        }
      }

      setPrice(extractedPrice);
      setOriginalPrice(extractedOriginalPrice);
      setSize(extractedSize);
      setColor(extractedColor);
      setCaptureStep('selection_done');
      
    } catch (error: any) {
      console.error('Selection extraction error:', error);
      Alert.alert('Error', 'Could not extract selection data. Please try again.');
    } finally {
      setExtractingSelection(false);
    }
  };

  // Step 2 → Step 3: Extract measurements and weight (AI screenshot + full DOM specs)
  const handleFindMeasurements = async () => {
    if (!viewShotRef.current || !captureRef) {
      Alert.alert('Error', 'WebView not ready');
      return;
    }

    setExtractingMeasurements(true);
    
    try {
      // First injection - extract from current page (could be a newly opened specs page)
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(extractSpecsJS);
        await new Promise(resolve => setTimeout(resolve, 600));
        webViewRef.current.injectJavaScript(extractPageContentJS);
        await new Promise(resolve => setTimeout(resolve, 600));
      }
      
      // Second injection - ensure we got data from the current screen
      // (handles cases where page was still loading from navigation)
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(extractSpecsJS);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Take screenshot of what's currently visible (could be the specs page)
      const uri = await captureRef(viewShotRef, {
        format: 'jpg',
        quality: 0.5,
        result: 'base64',
      });
      const base64Image = `data:image/jpeg;base64,${uri}`;
      setScreenshot(base64Image);

      // Read from REFS (not state) to get the freshly extracted data
      const freshPageContent = pageContentRef.current;
      const freshSpecsContent = specsContentRef.current;
      
      // Combine page content with extracted specs for better measurement data
      let combinedContent = freshPageContent;
      if (freshSpecsContent) {
        combinedContent = `PRODUCT SPECIFICATIONS AND MEASUREMENTS (extracted from entire page):\n${freshSpecsContent}\n\n---\nGENERAL PAGE CONTENT:\n${freshPageContent}`;
      }

      // Send to AI for measurements
      const response = await axios.post(`${BACKEND_URL}/api/products/analyze-screenshot`, {
        screenshot_base64: base64Image,
        url: url,
        page_content: combinedContent,
      });

      const info: ExtractedInfo = response.data;
      
      // Check delivery availability
      if (!checkDelivery(info, info.name || name || '')) {
        return;
      }
      
      // Update measurements
      setWeight(info.weight || '');
      setDimensions(info.dimensions || '');
      
      // Also update price/size/color if better values found
      if (!price && info.price) setPrice(info.price);
      if (!size && info.size) setSize(info.size);
      if (!color && info.color) setColor(info.color);
      
      setCaptureStep('measurements_done');
      
    } catch (error: any) {
      console.error('Measurements extraction error:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Could not extract measurements.');
    } finally {
      setExtractingMeasurements(false);
    }
  };

  // Step 3 → Form: Get full product info
  const handleGetProductInfo = async () => {
    if (!viewShotRef.current || !captureRef) {
      Alert.alert('Error', 'WebView not ready');
      return;
    }

    setAnalyzing(true);
    
    try {
      // Use the existing screenshot or take a new one
      let base64Image = screenshot;
      if (!base64Image) {
        const uri = await captureRef(viewShotRef, {
          format: 'jpg',
          quality: 0.5,
          result: 'base64',
        });
        base64Image = `data:image/jpeg;base64,${uri}`;
        setScreenshot(base64Image);
      }

      // Full AI extraction
      const response = await axios.post(`${BACKEND_URL}/api/products/analyze-screenshot`, {
        screenshot_base64: base64Image,
        url: url,
        page_content: pageContent,
      });

      const info: ExtractedInfo = response.data;
      
      // Check delivery availability
      if (!checkDelivery(info, info.name || name || '')) {
        return;
      }
      
      // Populate remaining fields from AI, keep user-verified values
      setName(info.name || '');
      if (!price) setPrice(info.price || '');
      if (!originalPrice) setOriginalPrice(info.original_price || '');
      setDescription(info.description || '');
      setBrand(info.brand || '');
      if (!color) setColor(info.color || '');
      if (!size) setSize(info.size || '');
      setMaterial(info.material || '');
      setCategory(info.category || '');
      setAvailability(info.availability || '');
      setRating(info.rating || '');
      if (!weight) setWeight(info.weight || '');
      if (!dimensions) setDimensions(info.dimensions || '');
      
      setShowForm(true);

    } catch (error: any) {
      console.error('Product info error:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to get product information.');
    } finally {
      setAnalyzing(false);
    }
  };

  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const handleSavePress = () => {
    if (!name.trim()) {
      Alert.alert('Name Required', 'Please enter a product name.');
      return;
    }
    setShowConfirmModal(true);
  };

  const confirmSave = async () => {
    setShowConfirmModal(false);
    setSaving(true);

    try {
      await axios.post(`${BACKEND_URL}/api/products`, {
        name: name.trim(),
        price: price.trim(),
        original_price: originalPrice.trim(),
        description: description.trim(),
        brand: brand.trim(),
        color: color.trim(),
        size: size.trim(),
        quantity: parseInt(quantity) || 1,
        material: material.trim(),
        category: category.trim(),
        availability: availability.trim(),
        rating: rating.trim(),
        weight: weight.trim(),
        dimensions: dimensions.trim(),
        original_url: url.trim(),
        image_base64: productImageUrl || '',
        screenshot_base64: screenshot || '',
      });

      router.push('/(tabs)/');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Could not save the product.');
    } finally {
      setSaving(false);
    }
  };

  const handleRecapture = () => {
    setShowConfirmModal(false);
    setShowForm(false);
    setCaptureStep('select');
    setScreenshot(null);
    setName('');
    setPrice('');
    setOriginalPrice('');
    setDescription('');
    setBrand('');
    setColor('');
    setSize('');
    setQuantity('1');
    setMaterial('');
    setCategory('');
    setAvailability('');
    setRating('');
    setWeight('');
    setDimensions('');
  };

  const handleLoadEnd = () => {
    setIsLoading(false);
    setPageLoaded(true);
    if (webViewRef.current) {
      setTimeout(() => {
        webViewRef.current?.injectJavaScript(extractPageContentJS);
        webViewRef.current?.injectJavaScript(extractSpecsJS);
      }, 1000);
    }
  };

  const handleLoadStart = () => {
    if (!pageLoaded) {
      setIsLoading(true);
    }
    if (webViewRef.current && pageLoaded) {
      setTimeout(() => {
        webViewRef.current?.injectJavaScript(extractPageContentJS);
        webViewRef.current?.injectJavaScript(extractSpecsJS);
      }, 1500);
    }
  };

  const FormField = ({ label, value, onChangeText, placeholder, multiline = false }: any) => (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, multiline && styles.multilineInput]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#6b7280"
        multiline={multiline}
      />
    </View>
  );

  // Web fallback
  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Capture Product</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.webFallback}>
          <Ionicons name="phone-portrait-outline" size={60} color="#6366f1" />
          <Text style={styles.webFallbackTitle}>Mobile Feature</Text>
          <Text style={styles.webFallbackText}>
            URL capture works on the mobile app. Use "Upload Screenshot" on web instead.
          </Text>
          <TouchableOpacity style={styles.goBackButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
            <Text style={styles.goBackButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Extracted data display component
  const ExtractedDataRow = ({ icon, label, value }: { icon: string; label: string; value: string }) => {
    if (!value) return null;
    return (
      <View style={styles.extractedRow}>
        <Ionicons name={icon as any} size={18} color="#6366f1" />
        <Text style={styles.extractedLabel}>{label}</Text>
        <Text style={styles.extractedValue}>{value}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Capture Product</Text>
          <View style={{ width: 40 }} />
        </View>

        {!showForm ? (
          <>
            {/* WebView - takes flexible space at top */}
            <View style={styles.webViewSection}>
              <View ref={viewShotRef} style={styles.webViewContainer} collapsable={false}>
                {WebView && (
                  <WebView
                    ref={webViewRef}
                    source={{ uri: url }}
                    style={styles.webView}
                    onLoadStart={handleLoadStart}
                    onLoadEnd={handleLoadEnd}
                    onMessage={handleWebViewMessage}
                    onError={() => {
                      setIsLoading(false);
                      Alert.alert('Error', 'Failed to load the page.');
                    }}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    startInLoadingState={true}
                    nestedScrollEnabled={true}
                  />
                )}
                {isLoading && (
                  <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#6366f1" />
                    <Text style={styles.loadingText}>Loading...</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Step content - scrollable below WebView */}
            <ScrollView ref={scrollViewRef} style={styles.stepScrollArea} contentContainerStyle={styles.stepScrollContent} nestedScrollEnabled={true}>

              {/* ===== STEP 1: Select size/color/quantity ===== */}
              {captureStep === 'select' && pageLoaded && (
                <>
                  <View style={styles.stepInstruction}>
                    <View style={styles.stepBadge}>
                      <Text style={styles.stepBadgeText}>1</Text>
                    </View>
                    <View style={styles.stepTextContainer}>
                      <Text style={styles.stepTitle}>Select your preferences</Text>
                      <Text style={styles.stepSubtitle}>
                        Choose size, color and quantity on the page above, then tap "All Selected"
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.actionButton, styles.primaryButton, extractingSelection && styles.disabledButton]}
                    onPress={handleAllSelected}
                    disabled={extractingSelection}
                  >
                    {extractingSelection ? (
                      <>
                        <ActivityIndicator color="#fff" size="small" />
                        <Text style={styles.actionButtonText}>Extracting...</Text>
                      </>
                    ) : (
                      <>
                        <Ionicons name="checkmark-done" size={22} color="#fff" />
                        <Text style={styles.actionButtonText}>All Selected</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {/* ===== STEP 2: Show extracted price/size/color + Find Measurements ===== */}
              {captureStep === 'selection_done' && (
                <>
                  <View style={styles.extractedCard}>
                    <View style={styles.extractedCardHeader}>
                      <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
                      <Text style={styles.extractedCardTitle}>Selection Extracted</Text>
                    </View>
                    
                    <ExtractedDataRow icon="pricetag" label="Price" value={price} />
                    {originalPrice ? <ExtractedDataRow icon="pricetag-outline" label="Was" value={originalPrice} /> : null}
                    <ExtractedDataRow icon="resize" label="Size" value={size} />
                    <ExtractedDataRow icon="color-palette" label="Color" value={color} />
                    
                    <View style={styles.quantityRowInline}>
                      <Ionicons name="layers" size={18} color="#6366f1" />
                      <Text style={styles.extractedLabel}>Quantity</Text>
                      <View style={styles.quantityControlSmall}>
                        <TouchableOpacity 
                          style={styles.quantityBtnSmall}
                          onPress={() => setQuantity(Math.max(1, parseInt(quantity) - 1).toString())}
                        >
                          <Ionicons name="remove" size={16} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.quantityValueSmall}>{quantity}</Text>
                        <TouchableOpacity 
                          style={styles.quantityBtnSmall}
                          onPress={() => setQuantity((parseInt(quantity) + 1).toString())}
                        >
                          <Ionicons name="add" size={16} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  <View style={styles.stepInstruction}>
                    <View style={styles.stepBadge}>
                      <Text style={styles.stepBadgeText}>2</Text>
                    </View>
                    <View style={styles.stepTextContainer}>
                      <Text style={styles.stepTitle}>Find measurements</Text>
                      <Text style={styles.stepSubtitle}>
                        Scroll to show the product specifications on the page, then tap "Find Measurements". The AI also scans the full page for measurement data.
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.actionButton, styles.secondaryButton, extractingMeasurements && styles.disabledButton]}
                    onPress={handleFindMeasurements}
                    disabled={extractingMeasurements}
                  >
                    {extractingMeasurements ? (
                      <>
                        <ActivityIndicator color="#fff" size="small" />
                        <Text style={styles.actionButtonText}>Extracting measurements...</Text>
                      </>
                    ) : (
                      <>
                        <Ionicons name="analytics-outline" size={22} color="#fff" />
                        <Text style={styles.actionButtonText}>Find Measurements</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {/* ===== STEP 3: Show all data + Get Product Info ===== */}
              {captureStep === 'measurements_done' && (
                <>
                  <View style={styles.extractedCard}>
                    <View style={styles.extractedCardHeader}>
                      <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
                      <Text style={styles.extractedCardTitle}>Extracted Data</Text>
                    </View>
                    
                    <ExtractedDataRow icon="pricetag" label="Price" value={price} />
                    {originalPrice ? <ExtractedDataRow icon="pricetag-outline" label="Was" value={originalPrice} /> : null}
                    <ExtractedDataRow icon="resize" label="Size" value={size} />
                    <ExtractedDataRow icon="color-palette" label="Color" value={color} />
                    
                    <View style={styles.quantityRowInline}>
                      <Ionicons name="layers" size={18} color="#6366f1" />
                      <Text style={styles.extractedLabel}>Quantity</Text>
                      <View style={styles.quantityControlSmall}>
                        <TouchableOpacity 
                          style={styles.quantityBtnSmall}
                          onPress={() => setQuantity(Math.max(1, parseInt(quantity) - 1).toString())}
                        >
                          <Ionicons name="remove" size={16} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.quantityValueSmall}>{quantity}</Text>
                        <TouchableOpacity 
                          style={styles.quantityBtnSmall}
                          onPress={() => setQuantity((parseInt(quantity) + 1).toString())}
                        >
                          <Ionicons name="add" size={16} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.extractedDivider} />
                    
                    <ExtractedDataRow icon="scale-outline" label="Weight" value={weight} />
                    <ExtractedDataRow icon="cube-outline" label="Dimensions" value={dimensions} />
                    
                    {!weight && !dimensions && (
                      <Text style={styles.noDataHint}>No measurements found on the page</Text>
                    )}
                  </View>

                  {/* Delivery Price Card */}
                  {(() => {
                    const delivery = calculateDeliveryPrices(dimensions, weight);
                    return (
                      <View style={styles.deliveryCard}>
                        <View style={styles.deliveryHeader}>
                          <Ionicons name="car-outline" size={22} color="#f59e0b" />
                          <Text style={styles.deliveryTitle}>Delivery Prices</Text>
                        </View>
                        
                        <View style={styles.deliveryCategoryRow}>
                          <Text style={styles.deliveryCategoryLabel}>Verpakkingscategorie</Text>
                          <View style={styles.categoryBadge}>
                            <Text style={styles.categoryBadgeText}>{delivery.category}</Text>
                          </View>
                        </View>

                        <View style={styles.deliveryBreakdown}>
                          <View style={styles.deliveryLine}>
                            <View style={styles.deliveryLineLabelRow}>
                              <Ionicons name="bicycle-outline" size={16} color="#9ca3af" />
                              <Text style={styles.deliveryLineLabel}>Standaard bezorging NL</Text>
                            </View>
                            <Text style={styles.deliveryLineValue}>€{delivery.standardPrice.toFixed(2)}</Text>
                          </View>
                          
                          <View style={[styles.deliveryLine, styles.deliveryLineBorder]}>
                            <View style={styles.deliveryLineLabelRow}>
                              <Ionicons name="cube-outline" size={16} color="#9ca3af" />
                              <Text style={styles.deliveryLineLabel}>Verpakkingsafmetingen ({delivery.category})</Text>
                            </View>
                            <Text style={styles.deliveryLineValue}>€{delivery.sizePrice.toFixed(2)}</Text>
                          </View>
                          
                          <View style={[styles.deliveryLine, styles.deliveryLineBorder]}>
                            <View style={styles.deliveryLineLabelRow}>
                              <Ionicons name="scale-outline" size={16} color="#9ca3af" />
                              <Text style={styles.deliveryLineLabel}>Verpakkingsgewicht ({delivery.weightGrams > 0 ? `${delivery.weightGrams}g` : '?'})</Text>
                            </View>
                            <Text style={styles.deliveryLineValue}>€{delivery.weightPrice.toFixed(2)}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })()}

                  <View style={styles.stepInstruction}>
                    <View style={styles.stepBadge}>
                      <Text style={styles.stepBadgeText}>3</Text>
                    </View>
                    <View style={styles.stepTextContainer}>
                      <Text style={styles.stepTitle}>Get full product info</Text>
                      <Text style={styles.stepSubtitle}>
                        AI will extract the remaining product details
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.actionButton, styles.primaryButton, analyzing && styles.disabledButton]}
                    onPress={handleGetProductInfo}
                    disabled={analyzing}
                  >
                    {analyzing ? (
                      <>
                        <ActivityIndicator color="#fff" size="small" />
                        <Text style={styles.actionButtonText}>Getting product info...</Text>
                      </>
                    ) : (
                      <>
                        <Ionicons name="sparkles" size={22} color="#fff" />
                        <Text style={styles.actionButtonText}>Get Product Information</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </>
        ) : (
          <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent}>
            /* ===== PRODUCT FORM (after all steps complete) ===== */
            <View style={styles.formSection}>
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>Product Details</Text>
                <TouchableOpacity onPress={handleRecapture}>
                  <Text style={styles.recaptureText}>Start Over</Text>
                </TouchableOpacity>
              </View>

              <FormField label="Name *" value={name} onChangeText={setName} placeholder="Product name" />
              
              <View style={styles.priceRow}>
                <View style={styles.priceField}>
                  <Text style={styles.fieldLabel}>Price</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={price}
                    onChangeText={setPrice}
                    placeholder="$0.00"
                    placeholderTextColor="#6b7280"
                  />
                </View>
                <View style={styles.priceField}>
                  <Text style={styles.fieldLabel}>Was</Text>
                  <TextInput
                    style={[styles.fieldInput, originalPrice ? styles.strikePrice : null]}
                    value={originalPrice}
                    onChangeText={setOriginalPrice}
                    placeholder="Original"
                    placeholderTextColor="#6b7280"
                  />
                </View>
              </View>

              <FormField label="Brand" value={brand} onChangeText={setBrand} placeholder="Brand name" />
              
              <View style={styles.twoColRow}>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>Color</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={color}
                    onChangeText={setColor}
                    placeholder="Color"
                    placeholderTextColor="#6b7280"
                  />
                </View>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>Size</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={size}
                    onChangeText={setSize}
                    placeholder="Size"
                    placeholderTextColor="#6b7280"
                  />
                </View>
              </View>

              {/* Quantity */}
              <View style={styles.quantityRow}>
                <Text style={styles.fieldLabel}>Quantity</Text>
                <View style={styles.quantityControl}>
                  <TouchableOpacity 
                    style={styles.quantityButton}
                    onPress={() => setQuantity(Math.max(1, parseInt(quantity) - 1).toString())}
                  >
                    <Ionicons name="remove" size={20} color="#fff" />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.quantityInput}
                    value={quantity}
                    onChangeText={(text) => setQuantity(text.replace(/[^0-9]/g, '') || '1')}
                    keyboardType="number-pad"
                    textAlign="center"
                  />
                  <TouchableOpacity 
                    style={styles.quantityButton}
                    onPress={() => setQuantity((parseInt(quantity) + 1).toString())}
                  >
                    <Ionicons name="add" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>

              <FormField label="Material" value={material} onChangeText={setMaterial} placeholder="Material/fabric" />
              <FormField label="Category" value={category} onChangeText={setCategory} placeholder="Product category" />
              
              <View style={styles.twoColRow}>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>Weight</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={weight}
                    onChangeText={setWeight}
                    placeholder="e.g. 500g"
                    placeholderTextColor="#6b7280"
                  />
                </View>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>Dimensions</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={dimensions}
                    onChangeText={setDimensions}
                    placeholder="e.g. 20x15x10 cm"
                    placeholderTextColor="#6b7280"
                  />
                </View>
              </View>

              <View style={styles.twoColRow}>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>Availability</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={availability}
                    onChangeText={setAvailability}
                    placeholder="In Stock"
                    placeholderTextColor="#6b7280"
                  />
                </View>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>Rating</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={rating}
                    onChangeText={setRating}
                    placeholder="4.5/5"
                    placeholderTextColor="#6b7280"
                  />
                </View>
              </View>

              <FormField 
                label="Description" 
                value={description} 
                onChangeText={setDescription} 
                placeholder="Product description" 
                multiline 
              />

              <TouchableOpacity
                style={[styles.saveButton, saving && styles.disabledButton]}
                onPress={handleSavePress}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="checkmark-circle" size={24} color="#fff" />
                )}
                <Text style={styles.saveButtonText}>
                  {saving ? 'Saving...' : 'Save to My Tjiepp'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
          </ScrollView>
        )}

        {/* Confirmation Modal */}
        <Modal
          visible={showConfirmModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowConfirmModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Confirm Order</Text>
              <Text style={styles.modalSubtitle}>Is this information correct?</Text>
              
              {(productImageUrl || screenshot) && (
                <View style={styles.thumbnailContainer}>
                  <Image 
                    source={{ uri: productImageUrl || screenshot }} 
                    style={styles.thumbnailImage}
                    resizeMode="cover"
                  />
                </View>
              )}
              
              <ScrollView style={styles.modalScrollView}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Product</Text>
                  <Text style={styles.summaryValue}>{name || '-'}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Brand</Text>
                  <Text style={styles.summaryValue}>{brand || '-'}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Price</Text>
                  <Text style={styles.summaryValuePrice}>{price || '-'}</Text>
                </View>
                {originalPrice ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Original Price</Text>
                    <Text style={styles.summaryValueStrike}>{originalPrice}</Text>
                  </View>
                ) : null}
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Size</Text>
                  <Text style={styles.summaryValue}>{size || '-'}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Color</Text>
                  <Text style={styles.summaryValue}>{color || '-'}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Quantity</Text>
                  <Text style={styles.summaryValueQuantity}>x{quantity}</Text>
                </View>
                {weight ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Weight</Text>
                    <Text style={styles.summaryValue}>{weight}</Text>
                  </View>
                ) : null}
                {dimensions ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Dimensions</Text>
                    <Text style={styles.summaryValue}>{dimensions}</Text>
                  </View>
                ) : null}
                {category ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Category</Text>
                    <Text style={styles.summaryValue}>{category}</Text>
                  </View>
                ) : null}
                
                {/* Delivery Prices in confirmation */}
                {(() => {
                  const delivery = calculateDeliveryPrices(dimensions, weight);
                  return (
                    <>
                      <View style={[styles.summaryRow, { paddingTop: 14 }]}>
                        <Text style={[styles.summaryLabel, { color: '#f59e0b' }]}>Standaard bezorging NL</Text>
                        <Text style={[styles.summaryValue, { color: '#f59e0b', fontWeight: '700' }]}>€{delivery.standardPrice.toFixed(2)}</Text>
                      </View>
                      <View style={styles.summaryRow}>
                        <Text style={[styles.summaryLabel, { color: '#f59e0b' }]}>Verpakkingsafmetingen ({delivery.category})</Text>
                        <Text style={[styles.summaryValue, { color: '#f59e0b', fontWeight: '700' }]}>€{delivery.sizePrice.toFixed(2)}</Text>
                      </View>
                      <View style={[styles.summaryRow, { borderBottomWidth: 0 }]}>
                        <Text style={[styles.summaryLabel, { color: '#f59e0b' }]}>Verpakkingsgewicht</Text>
                        <Text style={[styles.summaryValue, { color: '#f59e0b', fontWeight: '700' }]}>€{delivery.weightPrice.toFixed(2)}</Text>
                      </View>
                    </>
                  );
                })()}
              </ScrollView>
              
              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.recaptureButton} onPress={handleRecapture}>
                  <Ionicons name="refresh" size={20} color="#f59e0b" />
                  <Text style={styles.recaptureButtonText}>No, Recapture</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmButton} onPress={confirmSave}>
                  <Ionicons name="checkmark" size={20} color="#fff" />
                  <Text style={styles.confirmButtonText}>Yes, Save to Tjiepp</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f1f',
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  webViewSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  webViewContainer: {
    height: 380,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  webView: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 15, 15, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#9ca3af',
    marginTop: 12,
    fontSize: 14,
  },
  stepScrollArea: {
    flex: 1,
  },
  stepScrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },

  // Step instruction
  stepInstruction: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  stepBadge: {
    backgroundColor: '#6366f1',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  stepTextContainer: {
    flex: 1,
  },
  stepTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  stepSubtitle: {
    color: '#9ca3af',
    fontSize: 13,
    lineHeight: 19,
  },

  // Action buttons
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 16,
    gap: 12,
    marginTop: 12,
  },
  primaryButton: {
    backgroundColor: '#6366f1',
  },
  secondaryButton: {
    backgroundColor: '#4f46e5',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.7,
  },

  // Extracted data card
  extractedCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#22c55e30',
  },
  extractedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  extractedCardTitle: {
    color: '#22c55e',
    fontSize: 16,
    fontWeight: '700',
  },
  extractedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  extractedLabel: {
    color: '#9ca3af',
    fontSize: 14,
    flex: 1,
  },
  extractedValue: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    flex: 2,
    textAlign: 'right',
  },
  extractedDivider: {
    height: 1,
    backgroundColor: '#2a2a2a',
    marginVertical: 8,
  },
  noDataHint: {
    color: '#6b7280',
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: 6,
  },

  // Delivery card
  deliveryCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#f59e0b30',
  },
  deliveryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  deliveryTitle: {
    color: '#f59e0b',
    fontSize: 16,
    fontWeight: '700',
  },
  deliveryCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  deliveryCategoryLabel: {
    color: '#9ca3af',
    fontSize: 14,
  },
  categoryBadge: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  categoryBadgeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  deliveryBreakdown: {
    backgroundColor: '#0f0f0f',
    borderRadius: 10,
    padding: 12,
  },
  deliveryLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  deliveryLineLabel: {
    color: '#9ca3af',
    fontSize: 13,
    flex: 1,
  },
  deliveryLineLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  deliveryLineValue: {
    color: '#f59e0b',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
  deliveryLineBorder: {
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
    marginTop: 2,
    paddingTop: 8,
  },

  // Inline quantity
  quantityRowInline: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  quantityControlSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 2,
    justifyContent: 'flex-end',
    gap: 8,
  },
  quantityBtnSmall: {
    backgroundColor: '#6366f1',
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityValueSmall: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    minWidth: 30,
    textAlign: 'center',
  },

  // Form styles
  formSection: {
    padding: 16,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  recaptureText: {
    color: '#6366f1',
    fontSize: 15,
    fontWeight: '600',
  },
  fieldRow: {
    marginBottom: 16,
  },
  fieldLabel: {
    color: '#9ca3af',
    fontSize: 13,
    marginBottom: 6,
    fontWeight: '500',
  },
  fieldInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  priceRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  priceField: {
    flex: 1,
  },
  strikePrice: {
    color: '#9ca3af',
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  halfField: {
    flex: 1,
  },
  quantityRow: {
    marginBottom: 16,
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quantityButton: {
    backgroundColor: '#6366f1',
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    width: 80,
    textAlign: 'center',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22c55e',
    paddingVertical: 18,
    borderRadius: 16,
    gap: 12,
    marginTop: 16,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  webFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  webFallbackTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginTop: 16,
    marginBottom: 12,
  },
  webFallbackText: {
    color: '#9ca3af',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  goBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 10,
    marginTop: 24,
  },
  goBackButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 15,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 20,
  },
  thumbnailContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  thumbnailImage: {
    width: 120,
    height: 120,
    borderRadius: 12,
    backgroundColor: '#262626',
  },
  modalScrollView: {
    maxHeight: 300,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#9ca3af',
    flex: 1,
  },
  summaryValue: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  summaryValuePrice: {
    fontSize: 18,
    color: '#6366f1',
    fontWeight: '700',
    flex: 2,
    textAlign: 'right',
  },
  summaryValueStrike: {
    fontSize: 14,
    color: '#6b7280',
    textDecorationLine: 'line-through',
    flex: 2,
    textAlign: 'right',
  },
  summaryValueQuantity: {
    fontSize: 16,
    color: '#22c55e',
    fontWeight: '700',
    flex: 2,
    textAlign: 'right',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  recaptureButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#292524',
    borderWidth: 1,
    borderColor: '#f59e0b',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  recaptureButtonText: {
    color: '#f59e0b',
    fontSize: 15,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22c55e',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
