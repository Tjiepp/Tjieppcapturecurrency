import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  RefreshControl,
  Alert,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import axios from 'axios';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

interface Product {
  id: string;
  name: string;
  price: string;
  original_price: string;
  description: string;
  brand: string;
  color: string;
  size: string;
  category: string;
  availability: string;
  original_url: string;
  image_base64: string;
  screenshot_base64: string;
  created_at: string;
}

export default function ProductsScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchProducts = async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/products`);
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchProducts();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchProducts();
  };

  const handleDelete = async (productId: string) => {
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
              await axios.delete(`${BACKEND_URL}/api/products/${productId}`);
              setProducts(products.filter(p => p.id !== productId));
            } catch (error) {
              Alert.alert('Error', 'Failed to delete product');
            }
          },
        },
      ]
    );
  };

  const renderProduct = ({ item }: { item: Product }) => {
    const imageSource = item.screenshot_base64
      ? { uri: item.screenshot_base64.startsWith('data:') 
          ? item.screenshot_base64 
          : `data:image/jpeg;base64,${item.screenshot_base64}` }
      : null;

    return (
      <TouchableOpacity
        style={styles.productCard}
        onPress={() => router.push(`/product/${item.id}`)}
        activeOpacity={0.8}
      >
        <View style={styles.imageContainer}>
          {imageSource ? (
            <Image source={imageSource} style={styles.productImage} resizeMode="cover" />
          ) : (
            <View style={styles.placeholderImage}>
              <Ionicons name="image-outline" size={40} color="#4b5563" />
            </View>
          )}
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDelete(item.id)}
          >
            <Ionicons name="trash-outline" size={16} color="#ef4444" />
          </TouchableOpacity>
          {item.original_price ? (
            <View style={styles.saleBadge}>
              <Text style={styles.saleText}>SALE</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={2}>
            {item.name || 'Unnamed Product'}
          </Text>
          {item.brand ? (
            <Text style={styles.productBrand}>{item.brand}</Text>
          ) : null}
          <View style={styles.priceRow}>
            <Text style={styles.productPrice}>
              {item.price || 'Price N/A'}
            </Text>
            {item.original_price ? (
              <Text style={styles.originalPrice}>{item.original_price}</Text>
            ) : null}
          </View>
          {(item.color || item.size) ? (
            <Text style={styles.productMeta} numberOfLines={1}>
              {[item.color, item.size].filter(Boolean).join(' • ')}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const EmptyList = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="cart-outline" size={80} color="#4b5563" />
      <Text style={styles.emptyTitle}>No Products Yet</Text>
      <Text style={styles.emptySubtitle}>
        Capture products from screenshots or URLs
      </Text>
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => router.push('/(tabs)/add')}
      >
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.addButtonText}>Add Product</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.loadingText}>Loading products...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Products</Text>
        <Text style={styles.headerSubtitle}>{products.length} items saved</Text>
      </View>

      <FlashList
        data={products}
        renderItem={renderProduct}
        estimatedItemSize={220}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={EmptyList}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6366f1"
            colors={['#6366f1']}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
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
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  productCard: {
    width: CARD_WIDTH,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    marginHorizontal: 6,
    marginBottom: 16,
    overflow: 'hidden',
  },
  imageContainer: {
    width: '100%',
    height: 140,
    position: 'relative',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#262626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 20,
    padding: 8,
  },
  saleBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#ef4444',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  saleText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  productInfo: {
    padding: 12,
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  productBrand: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6366f1',
  },
  originalPrice: {
    fontSize: 12,
    color: '#6b7280',
    textDecorationLine: 'line-through',
  },
  productMeta: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});
