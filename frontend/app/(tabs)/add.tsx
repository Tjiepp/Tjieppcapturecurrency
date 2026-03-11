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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import axios from 'axios';
import { router } from 'expo-router';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function AddProductScreen() {
  const [url, setUrl] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  
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
  const [productImageUrl, setProductImageUrl] = useState('');
  const [weight, setWeight] = useState('');
  const [dimensions, setDimensions] = useState('');

  const pickImageAndAnalyze = async () => {
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
      
      // Auto-analyze the screenshot
      setAnalyzing(true);
      
      try {
        const response = await axios.post(`${BACKEND_URL}/api/products/analyze-screenshot`, {
          screenshot_base64: base64Image,
          url: '',
          page_content: '',
        });

        const info = response.data;
        
        // Populate form with extracted data
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
        setWeight(info.weight || '');
        setDimensions(info.dimensions || '');
        
        setShowForm(true);

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
        setAnalyzing(false);
      }
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const clipboardContent = await Clipboard.getStringAsync();
      if (clipboardContent) {
        if (clipboardContent.startsWith('http')) {
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
        original_url: '',
        image_base64: productImageUrl || '',
        screenshot_base64: screenshot || '',
      });

      // Reset and go to products list
      resetForm();
      router.push('/(tabs)/');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Could not save the product.');
    } finally {
      setSaving(false);
    }
  };

  const handleRecapture = () => {
    setShowConfirmModal(false);
    resetForm();
  };

  const resetForm = () => {
    setScreenshot(null);
    setShowForm(false);
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
    setProductImageUrl('');
    setWeight('');
    setDimensions('');
  };

  const FormField = ({ label, value, onChangeText, placeholder, multiline = false }: any) => (
    <View style={styles.formGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.textArea]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#6b7280"
        multiline={multiline}
      />
    </View>
  );

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
              Paste a URL or upload a screenshot
            </Text>
          </View>

          {!showForm ? (
            <>
              {/* Analyzing Overlay */}
              {analyzing && (
                <View style={styles.analyzingContainer}>
                  <ActivityIndicator size="large" color="#6366f1" />
                  <Text style={styles.analyzingText}>Analyzing screenshot...</Text>
                  <Text style={styles.analyzingSubtext}>Extracting product information</Text>
                </View>
              )}

              {!analyzing && (
                <>
                  {/* URL Section */}
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
                    
                    <TouchableOpacity 
                      style={styles.mainButton}
                      onPress={pasteFromClipboard}
                    >
                      <Ionicons name="add-circle-outline" size={22} color="#fff" />
                      <Text style={styles.mainButtonText}>Add to my Tjiepp</Text>
                    </TouchableOpacity>

                    {url.length > 0 && (
                      <TouchableOpacity 
                        style={styles.clearButton}
                        onPress={() => setUrl('')}
                      >
                        <Ionicons name="trash-outline" size={18} color="#ef4444" />
                        <Text style={styles.clearButtonText}>Clear URL</Text>
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
                    
                    <TouchableOpacity style={styles.uploadButton} onPress={pickImageAndAnalyze}>
                      <Ionicons name="images-outline" size={40} color="#6366f1" />
                      <Text style={styles.uploadButtonTitle}>Choose from Gallery</Text>
                      <Text style={styles.uploadButtonSubtext}>Select a product screenshot to analyze</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </>
          ) : (
            /* Product Form */
            <View style={styles.formSection}>
              {/* Screenshot Preview */}
              {screenshot && (
                <View style={styles.previewContainer}>
                  <Image 
                    source={{ uri: screenshot }} 
                    style={styles.previewImage}
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    style={styles.changeImageButton}
                    onPress={resetForm}
                  >
                    <Ionicons name="refresh" size={16} color="#fff" />
                    <Text style={styles.changeImageText}>Change</Text>
                  </TouchableOpacity>
                </View>
              )}

              <Text style={styles.formTitle}>Product Details</Text>

              <FormField label="Name *" value={name} onChangeText={setName} placeholder="Product name" />
              
              <View style={styles.rowFields}>
                <View style={styles.halfField}>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Price</Text>
                    <View style={styles.readOnlyField}>
                      <Text style={styles.readOnlyText}>{price || 'N/A'}</Text>
                      <Ionicons name="lock-closed" size={14} color="#6b7280" />
                    </View>
                  </View>
                </View>
                <View style={styles.halfField}>
                  <FormField label="Original Price" value={originalPrice} onChangeText={setOriginalPrice} placeholder="Was" />
                </View>
              </View>

              <FormField label="Brand" value={brand} onChangeText={setBrand} placeholder="Brand name" />
              
              <View style={styles.rowFields}>
                <View style={styles.halfField}>
                  <FormField label="Color" value={color} onChangeText={setColor} placeholder="Color" />
                </View>
                <View style={styles.halfField}>
                  <FormField label="Size" value={size} onChangeText={setSize} placeholder="Size" />
                </View>
              </View>

              {/* Quantity */}
              <View style={styles.quantityRow}>
                <Text style={styles.label}>Quantity</Text>
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

              <View style={styles.rowFields}>
                <View style={styles.halfField}>
                  <FormField label="Weight" value={weight} onChangeText={setWeight} placeholder="e.g. 500g" />
                </View>
                <View style={styles.halfField}>
                  <FormField label="Dimensions" value={dimensions} onChangeText={setDimensions} placeholder="e.g. 20x15x10 cm" />
                </View>
              </View>

              <FormField label="Description" value={description} onChangeText={setDescription} placeholder="Product description" multiline />

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
                  {saving ? 'Saving...' : 'Save to My Tjiepp'}
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
  mainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
    marginTop: 12,
  },
  mainButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  clearButton: {
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
  clearButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
  hintText: {
    color: '#6b7280',
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
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
  uploadButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#2a2a2a',
    borderStyle: 'dashed',
  },
  uploadButtonTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  uploadButtonSubtext: {
    color: '#6b7280',
    fontSize: 13,
    marginTop: 4,
  },
  analyzingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  analyzingText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 20,
  },
  analyzingSubtext: {
    color: '#6b7280',
    fontSize: 14,
    marginTop: 8,
  },
  formSection: {
    padding: 16,
  },
  previewContainer: {
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
  },
  previewImage: {
    width: '100%',
    height: 200,
  },
  changeImageButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  changeImageText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    color: '#9ca3af',
    fontSize: 13,
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  rowFields: {
    flexDirection: 'row',
    gap: 12,
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
    marginTop: 8,
  },
  quantityButton: {
    backgroundColor: '#6366f1',
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readOnlyField: {
    backgroundColor: '#141414',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  readOnlyText: {
    color: '#9ca3af',
    fontSize: 16,
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
  disabledButton: {
    opacity: 0.7,
  },
  // Modal Styles
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
    maxHeight: 250,
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
    fontSize: 14,
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
    fontSize: 14,
    fontWeight: '600',
  },
});
