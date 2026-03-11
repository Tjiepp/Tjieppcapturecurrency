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
  confidence: number;
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

  const webViewRef = useRef<any>(null);
  const viewShotRef = useRef<View>(null);

  useEffect(() => {
    if (params.url) {
      setUrl(params.url);
      setIsLoading(true);
    }
  }, [params.url]);

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
          
          // Find SELECTED color - look for active/selected states
          let selectedColor = '';
          const colorSelectors = [
            '[class*="color"][class*="selected"]',
            '[class*="color"][class*="active"]',
            '[class*="colour"][class*="selected"]',
            '[class*="colour"][class*="active"]',
            '[data-color][class*="selected"]',
            '[data-color][class*="active"]',
            'input[name*="color"]:checked + label',
            'input[name*="colour"]:checked + label',
            '[class*="swatch"][class*="selected"]',
            '[class*="swatch"][class*="active"]',
            '[aria-checked="true"][class*="color"]',
            '[aria-selected="true"][class*="color"]'
          ];
          for (const selector of colorSelectors) {
            const el = document.querySelector(selector);
            if (el) {
              selectedColor = el.textContent?.trim() || el.getAttribute('data-color') || el.getAttribute('title') || '';
              if (selectedColor) break;
            }
          }
          
          // Find SELECTED size - look for active/selected states
          let selectedSize = '';
          const sizeSelectors = [
            '[class*="size"][class*="selected"]',
            '[class*="size"][class*="active"]',
            '[data-size][class*="selected"]',
            '[data-size][class*="active"]',
            'input[name*="size"]:checked + label',
            'select[name*="size"] option:checked',
            '[class*="size-option"][class*="selected"]',
            '[class*="size-option"][class*="active"]',
            '[aria-checked="true"][class*="size"]',
            '[aria-selected="true"][class*="size"]',
            'button[class*="size"][class*="selected"]',
            'button[class*="size"][class*="active"]',
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
            } catch(e) {}
          });
          
          const mainContent = document.querySelector('main, [role="main"], .product, .product-detail')?.textContent?.substring(0, 3000) || '';
          
          return JSON.stringify({
            title, metaTags, prices: prices.slice(0, 5), names: names.slice(0, 3),
            descriptions: descriptions.slice(0, 2), 
            selectedColor: selectedColor,
            selectedSize: selectedSize,
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

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'PAGE_CONTENT') {
        setPageContent(data.content);
      }
    } catch (e) {
      console.log('WebView message parse error:', e);
    }
  };

  const captureAndAnalyze = async () => {
    if (!viewShotRef.current || !captureRef) {
      Alert.alert('Error', 'WebView not ready');
      return;
    }

    try {
      setAnalyzing(true);
      
      // Inject JS to get latest page content
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(extractPageContentJS);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Capture screenshot
      const uri = await captureRef(viewShotRef, {
        format: 'jpg',
        quality: 0.8,
        result: 'base64',
      });

      const base64Image = `data:image/jpeg;base64,${uri}`;
      setScreenshot(base64Image);

      // Send to AI
      const response = await axios.post(`${BACKEND_URL}/api/products/analyze-screenshot`, {
        screenshot_base64: base64Image,
        url: url,
        page_content: pageContent,
      });

      const info: ExtractedInfo = response.data;
      
      // Populate form
      setName(info.name || '');
      setPrice(info.price || '');
      setOriginalPrice(info.original_price || '');
      setDescription(info.description || '');
      setBrand(info.brand || '');
      setColor(info.color || '');
      setSize(info.size || '');
      setMaterial(info.material || '');
      setCategory(info.category || '');
      setAvailability(info.availability || '');
      setRating(info.rating || '');
      
      setShowForm(true);

    } catch (error: any) {
      console.error('Analysis error:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to analyze the page.');
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
        original_url: url.trim(),
        screenshot_base64: screenshot || '',
      });

      // Navigate back to products list
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
    setScreenshot(null);
    // Reset form fields
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
  };

  const handleLoadEnd = () => {
    setIsLoading(false);
    setPageLoaded(true);
    if (webViewRef.current) {
      setTimeout(() => {
        webViewRef.current?.injectJavaScript(extractPageContentJS);
      }, 1000);
    }
  };

  const handleLoadStart = () => {
    // Don't hide the button when page reloads due to user interaction
    // Only show loading indicator if page wasn't loaded yet
    if (!pageLoaded) {
      setIsLoading(true);
    }
    // Re-extract page content after any navigation/reload
    if (webViewRef.current && pageLoaded) {
      setTimeout(() => {
        webViewRef.current?.injectJavaScript(extractPageContentJS);
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

        <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent}>
          {/* WebView */}
          {!showForm ? (
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
                  />
                )}
                {isLoading && (
                  <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#6366f1" />
                    <Text style={styles.loadingText}>Loading...</Text>
                  </View>
                )}
              </View>

              {/* Status */}
              {pageLoaded && (
                <View style={styles.statusBar}>
                  <Ionicons 
                    name={pageContent ? "checkmark-circle" : "hourglass-outline"} 
                    size={16} 
                    color={pageContent ? "#22c55e" : "#f59e0b"} 
                  />
                  <Text style={[styles.statusText, { color: pageContent ? "#22c55e" : "#f59e0b" }]}>
                    {pageContent ? "Ready to capture" : "Loading page data..."}
                  </Text>
                </View>
              )}

              {/* Instructions */}
              {pageLoaded && (
                <View style={styles.instructionBox}>
                  <Ionicons name="information-circle" size={20} color="#f59e0b" />
                  <Text style={styles.instructionText}>
                    Select your size & color in the page above, then tap "Get Product Info"
                  </Text>
                </View>
              )}

              {/* Big Capture Button */}
              {pageLoaded && (
                <TouchableOpacity
                  style={[styles.captureButton, analyzing && styles.disabledButton]}
                  onPress={captureAndAnalyze}
                  disabled={analyzing}
                >
                  {analyzing ? (
                    <>
                      <ActivityIndicator color="#fff" size="small" />
                      <Text style={styles.captureButtonText}>Extracting product info...</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="sparkles" size={24} color="#fff" />
                      <Text style={styles.captureButtonText}>Get Product Info</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          ) : (
            /* Product Form */
            <View style={styles.formSection}>
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>Product Details</Text>
                <TouchableOpacity onPress={() => setShowForm(false)}>
                  <Text style={styles.recaptureText}>Re-capture</Text>
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

              {/* Quantity Field */}
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

              {/* Save Button */}
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
                  {saving ? 'Saving...' : 'Save Product'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

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
              
              {/* Product Thumbnail */}
              {screenshot && (
                <View style={styles.thumbnailContainer}>
                  <Image 
                    source={{ uri: screenshot }} 
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
                
                {category ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Category</Text>
                    <Text style={styles.summaryValue}>{category}</Text>
                  </View>
                ) : null}
              </ScrollView>
              
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.recaptureButton}
                  onPress={handleRecapture}
                >
                  <Ionicons name="refresh" size={20} color="#f59e0b" />
                  <Text style={styles.recaptureButtonText}>No, Recapture</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={confirmSave}
                >
                  <Ionicons name="checkmark" size={20} color="#fff" />
                  <Text style={styles.confirmButtonText}>Yes, Save</Text>
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
    padding: 16,
  },
  webViewContainer: {
    height: 400,
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
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  instructionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#292524',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    gap: 10,
  },
  instructionText: {
    flex: 1,
    color: '#fbbf24',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  captureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    paddingVertical: 18,
    borderRadius: 16,
    gap: 12,
    marginTop: 8,
  },
  captureButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.7,
  },
  helpText: {
    color: '#6b7280',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 20,
  },
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
