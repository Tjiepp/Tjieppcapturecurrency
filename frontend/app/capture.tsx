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
  description: string;
  brand: string;
  confidence: number;
}

export default function CaptureScreen() {
  const params = useLocalSearchParams<{ url?: string }>();
  const [url, setUrl] = useState(params.url || '');
  const [isLoading, setIsLoading] = useState(false);
  const [pageLoaded, setPageLoaded] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [extractedInfo, setExtractedInfo] = useState<ExtractedInfo | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pageContent, setPageContent] = useState('');
  
  // Editable fields
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [brand, setBrand] = useState('');

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
        // Get all text content from the page
        const getTextContent = () => {
          // Get meta tags
          const metaTags = {};
          document.querySelectorAll('meta').forEach(meta => {
            const name = meta.getAttribute('name') || meta.getAttribute('property');
            const content = meta.getAttribute('content');
            if (name && content) metaTags[name] = content;
          });
          
          // Get title
          const title = document.title || '';
          
          // Get price - look for common price patterns
          const priceElements = document.querySelectorAll('[class*="price"], [id*="price"], [data-price], .price, .product-price, .sale-price, .current-price');
          const prices = Array.from(priceElements).map(el => el.textContent?.trim()).filter(Boolean);
          
          // Get product name - look for h1, product title elements
          const nameElements = document.querySelectorAll('h1, [class*="product-title"], [class*="product-name"], [class*="title"]');
          const names = Array.from(nameElements).slice(0, 3).map(el => el.textContent?.trim()).filter(Boolean);
          
          // Get description
          const descElements = document.querySelectorAll('[class*="description"], [class*="details"], [id*="description"], meta[name="description"]');
          const descriptions = Array.from(descElements).map(el => el.textContent?.trim() || el.getAttribute('content')).filter(Boolean);
          
          // Get brand
          const brandElements = document.querySelectorAll('[class*="brand"], [data-brand], [itemprop="brand"]');
          const brands = Array.from(brandElements).map(el => el.textContent?.trim()).filter(Boolean);
          
          // Get main content area text
          const mainContent = document.querySelector('main, [role="main"], .product, .product-detail, #product')?.textContent?.substring(0, 2000) || '';
          
          // Get structured data if available
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
          
          return JSON.stringify({
            title,
            metaTags,
            prices: prices.slice(0, 5),
            names: names.slice(0, 3),
            descriptions: descriptions.slice(0, 2),
            brands: brands.slice(0, 2),
            mainContent: mainContent.substring(0, 1500),
            structuredData,
            url: window.location.href
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
        console.log('Received page content');
        setPageContent(data.content);
      }
    } catch (e) {
      console.log('WebView message parse error:', e);
    }
  };

  const captureScreenshot = async () => {
    if (!viewShotRef.current || !captureRef) {
      Alert.alert('Error', 'WebView not ready');
      return;
    }

    try {
      setAnalyzing(true);
      
      // First, inject JS to extract page content
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(extractPageContentJS);
        // Wait a bit for the content to be extracted
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Capture the WebView screenshot
      const uri = await captureRef(viewShotRef, {
        format: 'jpg',
        quality: 0.8,
        result: 'base64',
      });

      const base64Image = `data:image/jpeg;base64,${uri}`;
      setScreenshot(base64Image);

      // Send to AI for analysis with both screenshot AND page content
      const response = await axios.post(`${BACKEND_URL}/api/products/analyze-screenshot`, {
        screenshot_base64: base64Image,
        url: url,
        page_content: pageContent, // Include full page content!
      });

      const info = response.data;
      setExtractedInfo(info);
      
      // Populate form with extracted data
      setName(info.name || '');
      setPrice(info.price || '');
      setDescription(info.description || '');
      setBrand(info.brand || '');

      if (info.confidence < 0.5) {
        Alert.alert(
          'Low Confidence',
          'The AI had difficulty extracting product info. Please review and edit the details.'
        );
      }
    } catch (error: any) {
      console.error('Capture/Analysis error:', error);
      Alert.alert(
        'Error',
        error.response?.data?.detail || 'Failed to capture and analyze the page.'
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const saveProduct = async () => {
    if (!name.trim()) {
      Alert.alert('Name Required', 'Please enter a product name.');
      return;
    }

    setSaving(true);

    try {
      await axios.post(`${BACKEND_URL}/api/products`, {
        name: name.trim(),
        price: price.trim(),
        description: description.trim(),
        brand: brand.trim(),
        original_url: url.trim(),
        image_base64: '',
        screenshot_base64: screenshot || '',
      });

      Alert.alert('Success', 'Product saved successfully!', [
        {
          text: 'OK',
          onPress: () => router.push('/(tabs)/'),
        },
      ]);
    } catch (error: any) {
      console.error('Save error:', error);
      Alert.alert(
        'Save Failed',
        error.response?.data?.detail || 'Could not save the product.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleLoadEnd = () => {
    setIsLoading(false);
    setPageLoaded(true);
    // Extract page content when loaded
    if (webViewRef.current) {
      setTimeout(() => {
        webViewRef.current?.injectJavaScript(extractPageContentJS);
      }, 1000); // Wait for dynamic content to load
    }
  };

  const handleLoadStart = () => {
    setIsLoading(true);
    setPageLoaded(false);
  };

  const loadUrl = () => {
    if (!url.trim()) {
      Alert.alert('URL Required', 'Please enter a URL.');
      return;
    }
    if (!url.startsWith('http')) {
      Alert.alert('Invalid URL', 'URL must start with http:// or https://');
      return;
    }
    setIsLoading(true);
    setPageLoaded(false);
    setScreenshot(null);
    setExtractedInfo(null);
    // Force WebView to reload
    webViewRef.current?.reload();
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Capture Product</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* URL Input */}
        <View style={styles.urlBar}>
          <TextInput
            style={styles.urlInput}
            value={url}
            onChangeText={setUrl}
            placeholder="Enter product URL"
            placeholderTextColor="#6b7280"
            autoCapitalize="none"
            keyboardType="url"
          />
          <TouchableOpacity style={styles.goButton} onPress={loadUrl}>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent}>
          {/* WebView Container */}
          {url ? (
            <View style={styles.webViewSection}>
              {Platform.OS === 'web' ? (
                // Web platform fallback - show iframe or message
                <View style={styles.webFallback}>
                  <Ionicons name="phone-portrait-outline" size={60} color="#6366f1\" />
                  <Text style={styles.webFallbackTitle}>Mobile Feature</Text>
                  <Text style={styles.webFallbackText}>
                    The URL capture feature with automatic screenshot and AI analysis works on the mobile app.
                  </Text>
                  <Text style={styles.webFallbackText}>
                    On web, you can use the "Upload Screenshot" option instead.
                  </Text>
                  <TouchableOpacity
                    style={styles.goBackButton}
                    onPress={() => router.back()}
                  >
                    <Ionicons name="arrow-back" size={20} color="#fff" />
                    <Text style={styles.goBackButtonText}>Go Back & Upload Screenshot</Text>
                  </TouchableOpacity>
                  
                  {/* Show a preview iframe for reference */}
                  <View style={styles.iframeContainer}>
                    <Text style={styles.previewLabel}>Page Preview (read-only):</Text>
                    <iframe
                      src={url}
                      style={{ width: '100%', height: 300, border: 'none', borderRadius: 12 }}
                      sandbox="allow-scripts allow-same-origin"
                    />
                  </View>
                </View>
              ) : WebView ? (
                // Native platform - use WebView
                <>
                  <View 
                    ref={viewShotRef} 
                    style={styles.webViewContainer}
                    collapsable={false}
                  >
                    <WebView
                      ref={webViewRef}
                      source={{ uri: url }}
                      style={styles.webView}
                      onLoadStart={handleLoadStart}
                      onLoadEnd={handleLoadEnd}
                      onMessage={handleWebViewMessage}
                      onError={(e: any) => {
                        setIsLoading(false);
                        Alert.alert('Error', 'Failed to load the page.');
                      }}
                      javaScriptEnabled={true}
                      domStorageEnabled={true}
                      startInLoadingState={true}
                      scalesPageToFit={true}
                      allowsInlineMediaPlayback={true}
                    />
                    {isLoading && (
                      <View style={styles.loadingOverlay}>
                        <ActivityIndicator size="large" color="#6366f1" />
                        <Text style={styles.loadingText}>Loading page...</Text>
                      </View>
                    )}
                  </View>

                  {/* Status indicator for page content extraction */}
                  {pageLoaded && (
                    <View style={styles.statusBar}>
                      <Ionicons 
                        name={pageContent ? "checkmark-circle" : "hourglass-outline"} 
                        size={16} 
                        color={pageContent ? "#22c55e" : "#f59e0b"} 
                      />
                      <Text style={[styles.statusText, { color: pageContent ? "#22c55e" : "#f59e0b" }]}>
                        {pageContent ? "Full page content extracted" : "Extracting page content..."}
                      </Text>
                    </View>
                  )}

                  {/* Get Info Button */}
                  {pageLoaded && !extractedInfo && (
                    <TouchableOpacity
                      style={[styles.captureButton, analyzing && styles.disabledButton]}
                      onPress={captureScreenshot}
                      disabled={analyzing}
                    >
                      {analyzing ? (
                        <>
                          <ActivityIndicator color="#fff" size="small" />
                          <Text style={styles.captureButtonText}>Analyzing full page...</Text>
                        </>
                      ) : (
                        <>
                          <Ionicons name="sparkles" size={20} color="#fff" />
                          <Text style={styles.captureButtonText}>Get Info (Full Page)</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </>
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>WebView not available</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="globe-outline" size={60} color="#4b5563" />
              <Text style={styles.emptyText}>Enter a URL to capture product info</Text>
            </View>
          )}

          {/* Extracted Info Form */}
          {extractedInfo && (
            <View style={styles.formSection}>
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>Product Details</Text>
                <View style={styles.confidenceBadge}>
                  <Text style={styles.confidenceText}>
                    {Math.round((extractedInfo.confidence || 0) * 100)}% confidence
                  </Text>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Product name"
                  placeholderTextColor="#6b7280"
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Price</Text>
                <TextInput
                  style={styles.input}
                  placeholder="$0.00"
                  placeholderTextColor="#6b7280"
                  value={price}
                  onChangeText={setPrice}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Brand</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Brand name"
                  placeholderTextColor="#6b7280"
                  value={brand}
                  onChangeText={setBrand}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Product description"
                  placeholderTextColor="#6b7280"
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => {
                    setExtractedInfo(null);
                    setScreenshot(null);
                  }}
                >
                  <Ionicons name="refresh" size={20} color="#6366f1" />
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.saveButton, saving && styles.disabledButton]}
                  onPress={saveProduct}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Ionicons name="checkmark" size={20} color="#fff" />
                  )}
                  <Text style={styles.saveButtonText}>
                    {saving ? 'Saving...' : 'Save Product'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
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
  urlBar: {
    flexDirection: 'row',
    padding: 12,
    gap: 10,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  urlInput: {
    flex: 1,
    backgroundColor: '#262626',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
  },
  goButton: {
    backgroundColor: '#6366f1',
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  webViewSection: {
    padding: 16,
  },
  webViewContainer: {
    height: 350,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#fff',
    position: 'relative',
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
  captureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
    marginTop: 16,
  },
  captureButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.7,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 6,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
  },
  webFallback: {
    flex: 1,
    alignItems: 'center',
    padding: 20,
    paddingTop: 40,
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
    marginBottom: 8,
  },
  goBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 10,
    marginTop: 20,
    marginBottom: 24,
  },
  goBackButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  iframeContainer: {
    width: '100%',
    marginTop: 16,
  },
  previewLabel: {
    color: '#6b7280',
    fontSize: 13,
    marginBottom: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 16,
    marginTop: 16,
  },
  formSection: {
    padding: 16,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  confidenceBadge: {
    backgroundColor: '#1e3a5f',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  confidenceText: {
    color: '#60a5fa',
    fontSize: 12,
    fontWeight: '500',
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    color: '#9ca3af',
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#6366f1',
  },
  retryButtonText: {
    color: '#6366f1',
    fontSize: 15,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22c55e',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
