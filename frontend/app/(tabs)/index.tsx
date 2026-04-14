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
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

type Currency = 'EUR' | 'USD' | 'SRD';
const CURRENCY_SYMBOLS: Record<Currency, string> = { EUR: '€', USD: '$', SRD: 'SRD ' };

interface ExchangeRates {
  base: string;
  rates: Record<string, number>;
  last_updated: string;
}

interface Product {
  id: string;
  name: string;
  price: string;
  original_price: string;
  description: string;
  brand: string;
  color: string;
  size: string;
  quantity: number;
  weight: string;
  dimensions: string;
  shipping_category: string;
  delivery_cost_webshop: string;
  delivery_cost_size: string;
  delivery_cost_weight: string;
  category: string;
  availability: string;
  original_url: string;
  image_base64: string;
  screenshot_base64: string;
  created_at: string;
}

// Parse a price string like "€69,99", "$75.50", "EUR 28.63" into { value, currency }
function parsePrice(priceStr: string): { value: number; currency: Currency } | null {
  if (!priceStr) return null;
  const cleaned = priceStr.replace(/\s+/g, ' ').trim();
  
  let currency: Currency = 'EUR'; // default
  if (cleaned.includes('$') || cleaned.toUpperCase().includes('USD')) currency = 'USD';
  else if (cleaned.toUpperCase().includes('SRD')) currency = 'SRD';
  else if (cleaned.includes('€') || cleaned.toUpperCase().includes('EUR')) currency = 'EUR';
  
  // Extract the number: handle both "69,99" (EU) and "69.99" (US) formats
  const numMatch = cleaned.match(/([\d]+[.,]?[\d]*)/);
  if (!numMatch) return null;
  
  let numStr = numMatch[1];
  // If format is "1.234,56" (EU thousands), convert to standard
  if (numStr.includes('.') && numStr.includes(',')) {
    numStr = numStr.replace(/\./g, '').replace(',', '.');
  } else if (numStr.includes(',') && !numStr.includes('.')) {
    // "69,99" → "69.99"
    numStr = numStr.replace(',', '.');
  }
  
  const value = parseFloat(numStr);
  if (isNaN(value)) return null;
  return { value, currency };
}

function convertPrice(priceStr: string, targetCurrency: Currency, rates: ExchangeRates | null): string {
  if (!rates || !priceStr) return priceStr;
  
  const parsed = parsePrice(priceStr);
  if (!parsed) return priceStr;
  
  if (parsed.currency === targetCurrency) return priceStr;
  
  // Convert: source → EUR → target
  const sourceRate = rates.rates[parsed.currency] || 1;
  const targetRate = rates.rates[targetCurrency] || 1;
  const eurValue = parsed.value / sourceRate;
  const converted = eurValue * targetRate;
  
  const symbol = CURRENCY_SYMBOLS[targetCurrency];
  // Format with 2 decimal places, using comma for EUR
  if (targetCurrency === 'EUR') {
    return `${symbol}${converted.toFixed(2).replace('.', ',')}`;
  }
  return `${symbol}${converted.toFixed(2)}`;
}

export default function ProductsScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>('EUR');
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates | null>(null);

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

  const fetchExchangeRates = async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/exchange-rates`);
      setExchangeRates(response.data);
    } catch (error) {
      console.error('Error fetching exchange rates:', error);
    }
  };

  const loadSavedCurrency = async () => {
    try {
      const saved = await AsyncStorage.getItem('selectedCurrency');
      if (saved && ['EUR', 'USD', 'SRD'].includes(saved)) {
        setSelectedCurrency(saved as Currency);
      }
    } catch (error) {
      console.error('Error loading currency:', error);
    }
  };

  const handleCurrencyChange = async (currency: Currency) => {
    setSelectedCurrency(currency);
    try {
      await AsyncStorage.setItem('selectedCurrency', currency);
    } catch (error) {
      console.error('Error saving currency:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchProducts();
      fetchExchangeRates();
      loadSavedCurrency();
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
    // Prefer product image URL over screenshot
    const imageSource = item.image_base64 && item.image_base64.startsWith('http')
      ? { uri: item.image_base64 }  // Product image URL
      : item.screenshot_base64
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
          {item.quantity && item.quantity > 1 ? (
            <View style={styles.quantityBadge}>
              <Text style={styles.quantityBadgeText}>x{item.quantity}</Text>
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
            {selectedCurrency === 'EUR' || !exchangeRates ? (
              <Text style={styles.productPrice}>
                {item.price || 'Price N/A'}
              </Text>
            ) : (
              <Text style={styles.productPrice}>
                {convertPrice(item.price, selectedCurrency, exchangeRates)}
              </Text>
            )}
            {item.original_price ? (
              <Text style={styles.originalPrice}>
                {selectedCurrency === 'EUR' || !exchangeRates 
                  ? item.original_price 
                  : convertPrice(item.original_price, selectedCurrency, exchangeRates)}
              </Text>
            ) : null}
          </View>
          {/* Show original EUR price hint when converted */}
          {selectedCurrency !== 'EUR' && exchangeRates && item.price ? (
            <Text style={styles.originalCurrencyHint}>
              {item.price}
            </Text>
          ) : null}
          {/* Size and Color underneath price */}
          {(item.color || item.size) ? (
            <View style={styles.attributesRow}>
              {item.color ? (
                <View style={styles.attributeTag}>
                  <Ionicons name="color-palette-outline" size={12} color="#9ca3af" />
                  <Text style={styles.attributeText}>{item.color}</Text>
                </View>
              ) : null}
              {item.size ? (
                <View style={styles.attributeTag}>
                  <Ionicons name="resize-outline" size={12} color="#9ca3af" />
                  <Text style={styles.attributeText}>{item.size}</Text>
                </View>
              ) : null}
              {item.shipping_category ? (
                <View style={[styles.attributeTag, styles.shippingTag]}>
                  <Ionicons name="car-outline" size={12} color="#f59e0b" />
                  <Text style={[styles.attributeText, styles.shippingText]}>{item.shipping_category}</Text>
                </View>
              ) : null}
            </View>
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
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>My Products</Text>
            <Text style={styles.headerSubtitle}>{products.length} items saved</Text>
          </View>
          <View style={styles.currencyToggle}>
            {(['EUR', 'USD', 'SRD'] as Currency[]).map((c) => (
              <TouchableOpacity
                key={c}
                style={[
                  styles.currencyButton,
                  selectedCurrency === c && styles.currencyButtonActive,
                ]}
                onPress={() => handleCurrencyChange(c)}
              >
                <Text style={[
                  styles.currencyButtonText,
                  selectedCurrency === c && styles.currencyButtonTextActive,
                ]}>
                  {c === 'EUR' ? '€' : c === 'USD' ? '$' : 'SRD'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
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
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  currencyToggle: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  currencyButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 42,
    alignItems: 'center',
  },
  currencyButtonActive: {
    backgroundColor: '#6366f1',
  },
  currencyButtonText: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '600',
  },
  currencyButtonTextActive: {
    color: '#fff',
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
  quantityBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: '#6366f1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  quantityBadgeText: {
    color: '#fff',
    fontSize: 12,
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
  originalCurrencyHint: {
    fontSize: 11,
    color: '#6b728099',
    fontStyle: 'italic',
    marginTop: 2,
  },
  attributesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  attributeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#262626',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  attributeText: {
    fontSize: 11,
    color: '#9ca3af',
    maxWidth: 70,
  },
  shippingTag: {
    borderColor: '#f59e0b30',
  },
  shippingText: {
    color: '#f59e0b',
    fontWeight: '700',
    maxWidth: 50,
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
