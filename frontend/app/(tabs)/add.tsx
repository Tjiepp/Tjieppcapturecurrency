import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import axios from 'axios';
import { router } from 'expo-router';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface ExtractedInfo {
  name: string;
  price: string;
  description: string;
  brand: string;
  confidence: number;
}

export default function AddProductScreen() {
  const [url, setUrl] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [extractedInfo, setExtractedInfo] = useState<ExtractedInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Editable fields
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [brand, setBrand] = useState('');

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please grant photo library access to upload screenshots.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setScreenshot(base64Image);
      setExtractedInfo(null);
      // Reset form
      setName('');
      setPrice('');
      setDescription('');
      setBrand('');
    }
  };

  const handleGetInfoFromUrl = () => {
    if (!url.trim()) {
      Alert.alert('URL Required', 'Please enter a product URL first.');
      return;
    }

    if (!url.startsWith('http')) {
      Alert.alert('Invalid URL', 'Please enter a valid URL starting with http:// or https://');
      return;
    }

    // Navigate to capture screen with the URL
    router.push({
      pathname: '/capture',
      params: { url: url.trim() }
    });
  };

  const pasteFromClipboard = async () => {
    try {
      const clipboardContent = await Clipboard.getStringAsync();
      if (clipboardContent) {
        if (clipboardContent.startsWith('http')) {
          // Navigate directly to capture screen with the URL
          const trimmedUrl = clipboardContent.trim();
          router.push(`/capture?url=${encodeURIComponent(trimmedUrl)}`);
        } else {
          Alert.alert('Invalid URL', 'Clipboard does not contain a valid URL (must start with http:// or https://)');
        }
      } else {
        Alert.alert('Clipboard Empty', 'No content found in clipboard');
      }
    } catch (error) {
      Alert.alert('Error', 'Could not read from clipboard');
    }
  };

  const analyzeScreenshot = async () => {
    if (!screenshot) {
      Alert.alert('No Screenshot', 'Please upload or take a screenshot first.');
      return;
    }

    setLoading(true);
    Keyboard.dismiss();

    try {
      const response = await axios.post(`${BACKEND_URL}/api/products/analyze-screenshot`, {
        screenshot_base64: screenshot,
        url: url,
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
      console.error('Analysis error:', error);
      Alert.alert(
        'Analysis Failed',
        error.response?.data?.detail || 'Could not analyze the screenshot. Please try again.'
      );
    } finally {
      setLoading(false);
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
          onPress: () => {
            // Reset form
            setUrl('');
            setScreenshot(null);
            setExtractedInfo(null);
            setName('');
            setPrice('');
            setDescription('');
            setBrand('');
            router.push('/(tabs)/');
          },
        },
      ]);
    } catch (error: any) {
      console.error('Save error:', error);
      Alert.alert(
        'Save Failed',
        error.response?.data?.detail || 'Could not save the product. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const clearForm = () => {
    Alert.alert('Clear Form', 'Are you sure you want to clear all data?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          setUrl('');
          setScreenshot(null);
          setExtractedInfo(null);
          setName('');
          setPrice('');
          setDescription('');
          setBrand('');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Add Product</Text>
            <Text style={styles.headerSubtitle}>
              Share a URL or upload a screenshot
            </Text>
          </View>

          {/* URL Input Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Product URL</Text>
            <View style={styles.urlInputRow}>
              <TextInput
                style={styles.urlInput}
                placeholder="https://amazon.com/product..."
                placeholderTextColor="#6b7280"
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
                keyboardType="url"
              />
              {url.length > 0 && (
                <TouchableOpacity 
                  style={styles.clearUrlButton}
                  onPress={() => setUrl('')}
                >
                  <Ionicons name="close-circle" size={22} color="#6b7280" />
                </TouchableOpacity>
              )}
            </View>
            
            {/* Add to Tjiepp Button */}
            <TouchableOpacity 
              style={styles.pasteUrlButton}
              onPress={pasteFromClipboard}
            >
              <Ionicons name="add-circle-outline" size={20} color="#fff" />
              <Text style={styles.pasteUrlButtonText}>Add to my Tjiepp</Text>
            </TouchableOpacity>

            {url.length > 0 && (
              <TouchableOpacity 
                style={styles.deleteUrlButton}
                onPress={() => setUrl('')}
              >
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
                <Text style={styles.deleteUrlButtonText}>Clear URL</Text>
              </TouchableOpacity>
            )}
            
            <Text style={styles.hintText}>
              Copy a product URL, then tap "Add to my Tjiepp"
            </Text>
          </View>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Screenshot Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upload Screenshot</Text>
            
            {screenshot ? (
              <View style={styles.screenshotContainer}>
                <Image
                  source={{ uri: screenshot }}
                  style={styles.screenshotPreview}
                  resizeMode="contain"
                />
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => setScreenshot(null)}
                >
                  <Ionicons name="close-circle" size={28} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.uploadButtonFull} onPress={pickImage}>
                <Ionicons name="images-outline" size={32} color="#6366f1" />
                <Text style={styles.uploadButtonText}>Choose from Gallery</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Analyze Button */}
          {screenshot && !extractedInfo && (
            <TouchableOpacity
              style={[styles.analyzeButton, loading && styles.disabledButton]}
              onPress={analyzeScreenshot}
              disabled={loading}
            >
              {loading ? (
                <>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.analyzeButtonText}>Analyzing with AI...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="sparkles" size={20} color="#fff" />
                  <Text style={styles.analyzeButtonText}>Analyze with AI</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Extracted Info / Edit Form */}
          {(extractedInfo || screenshot) && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Product Details</Text>
                {extractedInfo && (
                  <View style={styles.confidenceBadge}>
                    <Text style={styles.confidenceText}>
                      {Math.round((extractedInfo.confidence || 0) * 100)}% confidence
                    </Text>
                  </View>
                )}
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
            </View>
          )}

          {/* Action Buttons */}
          {screenshot && (
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.clearButton}
                onPress={clearForm}
              >
                <Ionicons name="trash-outline" size={20} color="#ef4444" />
                <Text style={styles.clearButtonText}>Clear</Text>
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
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f1f',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  urlInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  urlInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    paddingRight: 44,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  clearUrlButton: {
    position: 'absolute',
    right: 12,
    padding: 4,
  },
  pasteUrlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
    marginTop: 12,
  },
  pasteUrlButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  deleteUrlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
    marginTop: 10,
  },
  deleteUrlButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
  hintText: {
    color: '#6b7280',
    fontSize: 13,
    marginTop: 10,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#2a2a2a',
  },
  dividerText: {
    color: '#6b7280',
    paddingHorizontal: 16,
    fontSize: 14,
    fontWeight: '500',
  },
  uploadButtonFull: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#2a2a2a',
    borderStyle: 'dashed',
  },
  uploadOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  uploadButton: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#2a2a2a',
    borderStyle: 'dashed',
  },
  uploadButtonText: {
    color: '#9ca3af',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  screenshotContainer: {
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  screenshotPreview: {
    width: '100%',
    height: 250,
    borderRadius: 16,
  },
  removeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
  },
  analyzeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    marginHorizontal: 16,
    marginTop: 20,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
  },
  analyzeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.7,
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
    paddingHorizontal: 16,
    paddingTop: 24,
    gap: 12,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  clearButtonText: {
    color: '#ef4444',
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
