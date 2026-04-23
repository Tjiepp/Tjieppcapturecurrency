import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ShareIntentProvider, useShareIntent } from 'expo-share-intent';
import { router } from 'expo-router';
import { Platform } from 'react-native';

function ShareIntentHandler({ children }: { children: React.ReactNode }) {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();

  useEffect(() => {
    if (hasShareIntent && shareIntent) {
      // Handle shared URL
      const sharedUrl = shareIntent.webUrl || shareIntent.text || '';
      
      if (sharedUrl && sharedUrl.startsWith('http')) {
        console.log('Received shared URL:', sharedUrl);
        // Navigate to capture screen with encoded URL
        router.push(`/capture?url=${encodeURIComponent(sharedUrl)}`);
        resetShareIntent();
      }
    }
  }, [hasShareIntent, shareIntent]);

  return <>{children}</>;
}

export default function RootLayout() {
  // Only use ShareIntentProvider on native platforms
  const content = (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0f0f0f' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen 
          name="product/[id]" 
          options={{ 
            headerShown: false,
            presentation: 'modal',
            animation: 'slide_from_bottom'
          }} 
        />
        <Stack.Screen 
          name="capture" 
          options={{ 
            headerShown: false,
            animation: 'slide_from_right'
          }} 
        />
      </Stack>
    </SafeAreaProvider>
  );

  // Wrap with ShareIntentProvider only on native
  if (Platform.OS === 'web') {
    return content;
  }

  return (
    <ShareIntentProvider>
      <ShareIntentHandler>
        {content}
      </ShareIntentHandler>
    </ShareIntentProvider>
  );
}
