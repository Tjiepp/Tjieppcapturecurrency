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
  shipping_category: string;
  delivery_cost_webshop: string;
  delivery_cost_size: string;
  delivery_cost_weight: string;
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
  const [originalPrice, setOriginalPrice] = useState('');
  const [description, setDescription] = useState('');
  const [brand, setBrand] = useState('');
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [material, setMaterial] = useState('');
  const [category, setCategory] = useState('');
  const [availability, setAvailability] = useState('');
  const [rating, setRating] = useState('');
  const [weight, setWeight] = useState('');
  const [dimensions, setDimensions] = useState('');

  useEffect(() => {
    fetchProduct();
  }, [id]);

  const fetchProduct = async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/products/${id}`);
      const p = response.data;
      setProduct(p);
      setName(p.name || '');
      setPrice(p.price || '');
      setOriginalPrice(p.original_price || '');
      setDescription(p.description || '');
      setBrand(p.brand || '');
      setColor(p.color || '');
      setSize(p.size || '');
      setMaterial(p.material || '');
      setCategory(p.category || '');
      setAvailability(p.availability || '');
      setRating(p.rating || '');
      setWeight(p.weight || '');
      setDimensions(p.dimensions || '');
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
        original_price: originalPrice.trim(),
        description: description.trim(),
        brand: brand.trim(),
        color: color.trim(),
        size: size.trim(),
        material: material.trim(),
        category: category.trim(),
        availability: availability.trim(),
        rating: rating.trim(),
        weight: weight.trim(),
        dimensions: dimensions.trim(),
      });

      setProduct(response.data);
      setEditing(false);
      Alert.alert('Saved', 'Product updated successfully!');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Could not update product.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Product', 'Are you sure you want to delete this product?', [
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
    ]);
  };

  const openURL = () => {
    if (product?.original_url) {
      Linking.openURL(product.original_url).catch(() => {
        Alert.alert('Error', 'Could not open URL');
      });
    }
  };

  const DetailRow = ({ icon, label, value }: { icon: string; label: string; value: string }) => {
    if (!value) return null;
    return (
      <View style={styles.detailRow}>
        <Ionicons name={icon as any} size={18} color="#6b7280" />
        <Text style={styles.detailLabel}>{label}:</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    );
  };

  const EditField = ({ label, value, onChangeText, placeholder, multiline = false }: any) => (
    <View style={styles.editField}>
      <Text style={styles.editLabel}>{label}</Text>
      <TextInput
        style={[styles.editInput, multiline && styles.multilineInput]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#6b7280"
        multiline={multiline}
      />
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.loadingText}>Loading...</Text>
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

  // Prefer product image URL over screenshot
  const imageSource = product.image_base64 && product.image_base64.startsWith('http')
    ? { uri: product.image_base64 }  // Product image URL
    : product.screenshot_base64
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
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>Product Details</Text>
          <View style={styles.headerActions}>
            {editing ? (
              <TouchableOpacity style={styles.headerBtn} onPress={() => setEditing(false)}>
                <Ionicons name="close" size={24} color="#9ca3af" />
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity style={styles.headerBtn} onPress={() => setEditing(true)}>
                  <Ionicons name="pencil" size={22} color="#6366f1" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.headerBtn} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={22} color="#ef4444" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent}>
          {/* Image */}
          {imageSource && (
            <View style={styles.imageContainer}>
              <Image source={imageSource} style={styles.productImage} resizeMode="contain" />
            </View>
          )}

          {editing ? (
            /* Edit Mode */
            <View style={styles.editSection}>
              <EditField label="Name *" value={name} onChangeText={setName} placeholder="Product name" />
              
              <View style={styles.rowFields}>
                <View style={styles.halfField}>
                  <EditField label="Price" value={price} onChangeText={setPrice} placeholder="$0.00" />
                </View>
                <View style={styles.halfField}>
                  <EditField label="Original Price" value={originalPrice} onChangeText={setOriginalPrice} placeholder="Was" />
                </View>
              </View>

              <EditField label="Brand" value={brand} onChangeText={setBrand} placeholder="Brand" />
              
              <View style={styles.rowFields}>
                <View style={styles.halfField}>
                  <EditField label="Color" value={color} onChangeText={setColor} placeholder="Color" />
                </View>
                <View style={styles.halfField}>
                  <EditField label="Size" value={size} onChangeText={setSize} placeholder="Size" />
                </View>
              </View>

              <EditField label="Material" value={material} onChangeText={setMaterial} placeholder="Material" />
              <EditField label="Category" value={category} onChangeText={setCategory} placeholder="Category" />
              
              <View style={styles.rowFields}>
                <View style={styles.halfField}>
                  <EditField label="Availability" value={availability} onChangeText={setAvailability} placeholder="In Stock" />
                </View>
                <View style={styles.halfField}>
                  <EditField label="Rating" value={rating} onChangeText={setRating} placeholder="4.5/5" />
                </View>
              </View>

              <View style={styles.rowFields}>
                <View style={styles.halfField}>
                  <EditField label="Weight" value={weight} onChangeText={setWeight} placeholder="e.g. 500g" />
                </View>
                <View style={styles.halfField}>
                  <EditField label="Dimensions" value={dimensions} onChangeText={setDimensions} placeholder="e.g. 20x15x10 cm" />
                </View>
              </View>

              <EditField label="Description" value={description} onChangeText={setDescription} placeholder="Description" multiline />

              <TouchableOpacity
                style={[styles.saveButton, saving && styles.disabledButton]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Ionicons name="checkmark" size={20} color="#fff" />}
                <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* View Mode */
            <View style={styles.infoSection}>
              <Text style={styles.productName}>{product.name || 'Unnamed Product'}</Text>
              
              {product.brand ? <Text style={styles.productBrand}>{product.brand}</Text> : null}
              
              <View style={styles.priceContainer}>
                <Text style={styles.productPrice}>{product.price || 'Price N/A'}</Text>
                {product.original_price ? (
                  <Text style={styles.originalPrice}>{product.original_price}</Text>
                ) : null}
              </View>

              {/* Quick Details */}
              <View style={styles.detailsCard}>
                <DetailRow icon="color-palette-outline" label="Color" value={product.color} />
                <DetailRow icon="resize-outline" label="Size" value={product.size} />
                <DetailRow icon="layers-outline" label="Material" value={product.material} />
                <DetailRow icon="pricetag-outline" label="Category" value={product.category} />
                <DetailRow icon="checkmark-circle-outline" label="Availability" value={product.availability} />
                <DetailRow icon="star-outline" label="Rating" value={product.rating} />
                <DetailRow icon="scale-outline" label="Weight" value={product.weight} />
                <DetailRow icon="cube-outline" label="Dimensions" value={product.dimensions} />
                
                {/* Delivery info */}
                {(product.shipping_category || product.delivery_cost_webshop || product.delivery_cost_size || product.delivery_cost_weight) ? (
                  <View style={styles.deliverySection}>
                    <Text style={styles.deliverySectionTitle}>Delivery Prices</Text>
                    {product.shipping_category ? (
                      <DetailRow icon="car-outline" label="Verpakkingscategorie" value={product.shipping_category} />
                    ) : null}
                    {product.delivery_cost_webshop ? (
                      <DetailRow icon="bicycle-outline" label="Verzendkosten webshop (NL)" value={product.delivery_cost_webshop} />
                    ) : null}
                    {product.delivery_cost_size ? (
                      <DetailRow icon="cube-outline" label="Verpakkingsafmetingen" value={product.delivery_cost_size} />
                    ) : null}
                    {product.delivery_cost_weight ? (
                      <DetailRow icon="scale-outline" label="Verpakkingsgewicht" value={product.delivery_cost_weight} />
                    ) : null}
                  </View>
                ) : null}
              </View>

              {/* Description */}
              {product.description ? (
                <View style={styles.descriptionCard}>
                  <Text style={styles.descriptionLabel}>Description</Text>
                  <Text style={styles.descriptionText}>{product.description}</Text>
                </View>
              ) : null}

              {/* URL */}
              {product.original_url ? (
                <TouchableOpacity style={styles.urlButton} onPress={openURL}>
                  <Ionicons name="link-outline" size={20} color="#6366f1" />
                  <Text style={styles.urlText} numberOfLines={1}>{product.original_url}</Text>
                  <Ionicons name="open-outline" size={18} color="#6366f1" />
                </TouchableOpacity>
              ) : null}

              <View style={styles.metaInfo}>
                <Text style={styles.metaText}>
                  Added: {new Date(product.created_at).toLocaleDateString()}
                </Text>
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
  headerBtn: {
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
    height: 260,
  },
  infoSection: {
    paddingHorizontal: 16,
  },
  productName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
  },
  productBrand: {
    fontSize: 16,
    color: '#9ca3af',
    marginBottom: 12,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  productPrice: {
    fontSize: 28,
    fontWeight: '700',
    color: '#6366f1',
  },
  originalPrice: {
    fontSize: 18,
    color: '#6b7280',
    textDecorationLine: 'line-through',
  },
  detailsCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  detailLabel: {
    color: '#9ca3af',
    fontSize: 14,
    width: 90,
  },
  detailValue: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
  deliverySection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  deliverySectionTitle: {
    color: '#f59e0b',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  descriptionCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  descriptionLabel: {
    color: '#6b7280',
    fontSize: 14,
    marginBottom: 8,
  },
  descriptionText: {
    color: '#d1d5db',
    fontSize: 15,
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
  urlText: {
    flex: 1,
    color: '#6366f1',
    fontSize: 14,
  },
  metaInfo: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1f1f1f',
  },
  metaText: {
    color: '#6b7280',
    fontSize: 13,
  },
  editSection: {
    padding: 16,
  },
  editField: {
    marginBottom: 16,
  },
  editLabel: {
    color: '#9ca3af',
    fontSize: 13,
    marginBottom: 6,
    fontWeight: '500',
  },
  editInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  multilineInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  rowFields: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
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
