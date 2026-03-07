import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import axios from 'axios';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface Product {
  id: string;
  name: string;
  price: string;
  description: string;
  brand: string;
  original_url: string;
  image_base64: string;
  screenshot_base64: string;
  created_at: string;
  updated_at: string;
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Edit fields
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [brand, setBrand] = useState('');

  useEffect(() => {
    fetchProduct();
  }, [id]);

  const fetchProduct = async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/products/${id}`);
      setProduct(response.data);
      setName(response.data.name);
      setPrice(response.data.price);
      setDescription(response.data.description);
      setBrand(response.data.brand);
    } catch (error) {
      console.error('Error fetching product:', error);
      Alert.alert('Error', 'Could not load product details');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Name Required', 'Please enter a product name.');
      return;
    }

    setSaving(true);

    try {
      const response = await axios.put(`${BACKEND_URL}/api/products/${id}`, {
        name: name.trim(),
        price: price.trim(),
        description: description.trim(),
        brand: brand.trim(),
      });

      setProduct(response.data);
      setEditing(false);
      Alert.alert('Success', 'Product updated successfully!');
    } catch (error: any) {
      Alert.alert(
        'Update Failed',
        error.response?.data?.detail || 'Could not update product.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Product',
      'Are you sure you want to delete this product?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${BACKEND_URL}/api/products/${id}`);
              router.back();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete product');
            }
          },
        },
      ]
    );
  };

  const openURL = () => {
    if (product?.original_url) {
      Linking.openURL(product.original_url).catch(() => {
        Alert.alert('Error', 'Could not open URL');
      });
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.loadingText}>Loading product...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!product) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Product not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const imageSource = product.screenshot_base64
    ? {
        uri: product.screenshot_base64.startsWith('data:')
          ? product.screenshot_base64
          : `data:image/jpeg;base64,${product.screenshot_base64}`,
      }
    : null;

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
          <Text style={styles.headerTitle} numberOfLines={1}>
            Product Details
          </Text>
          <View style={styles.headerActions}>
            {editing ? (
              <TouchableOpacity
                style={styles.headerButton}
                onPress={() => setEditing(false)}
              >
                <Ionicons name="close" size={24} color="#9ca3af" />
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.headerButton}
                  onPress={() => setEditing(true)}
                >
                  <Ionicons name="pencil" size={22} color="#6366f1" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.headerButton}
                  onPress={handleDelete}
                >
                  <Ionicons name="trash-outline" size={22} color="#ef4444" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Screenshot */}
          {imageSource && (
            <View style={styles.imageContainer}>
              <Image
                source={imageSource}
                style={styles.productImage}
                resizeMode="contain"
              />
            </View>
          )}

          {/* Product Info */}
          <View style={styles.infoContainer}>
            {editing ? (
              <>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Name</Text>
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Product name"
                    placeholderTextColor="#6b7280"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Price</Text>
                  <TextInput
                    style={styles.input}
                    value={price}
                    onChangeText={setPrice}
                    placeholder="$0.00"
                    placeholderTextColor="#6b7280"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Brand</Text>
                  <TextInput
                    style={styles.input}
                    value={brand}
                    onChangeText={setBrand}
                    placeholder="Brand name"
                    placeholderTextColor="#6b7280"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Description</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Description"
                    placeholderTextColor="#6b7280"
                    multiline
                    numberOfLines={4}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.saveButton, saving && styles.disabledButton]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Ionicons name="checkmark" size={20} color="#fff" />
                  )}
                  <Text style={styles.saveButtonText}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.productName}>{product.name || 'Unnamed Product'}</Text>
                
                {product.brand ? (
                  <Text style={styles.productBrand}>{product.brand}</Text>
                ) : null}
                
                <Text style={styles.productPrice}>{product.price || 'Price N/A'}</Text>
                
                {product.description ? (
                  <View style={styles.descriptionContainer}>
                    <Text style={styles.descriptionLabel}>Description</Text>
                    <Text style={styles.productDescription}>{product.description}</Text>
                  </View>
                ) : null}

                {product.original_url ? (
                  <TouchableOpacity style={styles.urlButton} onPress={openURL}>
                    <Ionicons name="link-outline" size={20} color="#6366f1" />
                    <Text style={styles.urlButtonText} numberOfLines={1}>
                      {product.original_url}
                    </Text>
                    <Ionicons name="open-outline" size={18} color="#6366f1" />
                  </TouchableOpacity>
                ) : null}

                <View style={styles.metaContainer}>
                  <Text style={styles.metaText}>
                    Added: {new Date(product.created_at).toLocaleDateString()}
                  </Text>
                </View>
              </>
            )}
          </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#9ca3af',
    fontSize: 16,
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
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    padding: 8,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  imageContainer: {
    backgroundColor: '#1a1a1a',
    margin: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: 280,
  },
  infoContainer: {
    paddingHorizontal: 16,
  },
  productName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  productBrand: {
    fontSize: 16,
    color: '#9ca3af',
    marginBottom: 12,
  },
  productPrice: {
    fontSize: 28,
    fontWeight: '700',
    color: '#6366f1',
    marginBottom: 20,
  },
  descriptionContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  descriptionLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  productDescription: {
    fontSize: 15,
    color: '#d1d5db',
    lineHeight: 22,
  },
  urlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    marginBottom: 16,
  },
  urlButtonText: {
    flex: 1,
    color: '#6366f1',
    fontSize: 14,
  },
  metaContainer: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1f1f1f',
  },
  metaText: {
    color: '#6b7280',
    fontSize: 13,
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
    minHeight: 100,
    textAlignVertical: 'top',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22c55e',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.7,
  },
});
