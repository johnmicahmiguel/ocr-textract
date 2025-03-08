import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Image, Alert, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';

// Backend API URL - replace with your actual backend URL when deployed
// When using ngrok, replace this with the URL provided by ngrok
// For example: const API_URL = 'https://abcd-123-456-789-123.ngrok.io';
const API_URL = 'https://3d1b-158-62-4-248.ngrok-free.app'; // New ngrok URL

// Uncomment one of these for local development without ngrok:
// const API_URL = 'http://10.0.2.2:3000'; // Use this for Android emulator
// const API_URL = 'http://localhost:3000'; // Use this for iOS simulator
// const API_URL = 'http://YOUR_LOCAL_IP:3000'; // Use this for physical devices

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaLibraryPermission, requestMediaLibraryPermission] = MediaLibrary.usePermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Use useRef instead of useState for the camera reference
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    // Request permissions when component mounts
    const requestPermissions = async () => {
      try {
        await requestPermission();
        await requestMediaLibraryPermission();
      } catch (error) {
        console.error('Error requesting permissions:', error);
      }
    };
    
    requestPermissions();
    
    // Test backend connectivity
    testBackendConnection();
  }, []);
  
  // Function to test backend connectivity
  const testBackendConnection = async () => {
    try {
      console.log(`Testing connection to backend at ${API_URL}/api/test`);
      const response = await fetch(`${API_URL}/api/test`);
      
      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Backend connection successful:', data);
    } catch (error) {
      console.error('Backend connection test failed:', error);
      Alert.alert(
        'Backend Connection Failed',
        `Could not connect to the backend server at ${API_URL}. Please check your server and network settings.`
      );
    }
  };

  const takePicture = async () => {
    if (!cameraRef.current) {
      console.log('Camera ref is not available');
      return;
    }
    
    try {
      console.log('Taking picture');
      setIsLoading(true);
      const photo = await cameraRef.current.takePictureAsync({ 
        quality: 0.7,
        exif: false // Disable exif to reduce potential issues
      });
      
      if (photo && photo.uri) {
        setCapturedImage(photo.uri);
        setIsCameraActive(false);
      } else {
        throw new Error('Photo capture failed');
      }
    } catch (error) {
      console.error('Error taking picture:', error);
      Alert.alert('Error', 'Failed to take picture. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const pickImage = async () => {
    try {
      setIsLoading(true);
      // Use the updated mediaTypes format
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
        exif: false // Disable exif to reduce potential issues
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setCapturedImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetImage = () => {
    try {
      setCapturedImage(null);
    } catch (error) {
      console.error('Error resetting image:', error);
      Alert.alert('Error', 'Failed to reset image. Please try again.');
    }
  };

  const saveImage = async () => {
    if (!capturedImage) {
      console.log('No image to save');
      return;
    }
    
    try {
      setIsLoading(true);
      await MediaLibrary.saveToLibraryAsync(capturedImage);
      Alert.alert('Success', 'Image saved to gallery');
    } catch (error) {
      console.error('Error saving image:', error);
      Alert.alert('Error', 'Failed to save image. Please check app permissions.');
    } finally {
      setIsLoading(false);
    }
  };

  // New function to process image with AWS Textract
  const processImageWithTextract = async () => {
    if (!capturedImage) {
      console.log('No image to process');
      return;
    }
    
    try {
      // Set processing state to true to show loading indicator
      setIsProcessing(true);
      console.log('Starting image processing with Textract...');
      
      // Make sure the image URI is properly formatted for the platform
      // On Android, we need to ensure the URI starts with file://
      // On iOS, we may need to remove the file:// prefix
      let normalizedImageUri = capturedImage;
      
      // Log the original URI for debugging
      console.log(`Original image URI: ${normalizedImageUri}`);
      
      // Ensure the URI is properly formatted for the platform
      if (Platform.OS === 'android') {
        // For Android, ensure the URI starts with file://
        normalizedImageUri = capturedImage.startsWith('file://') 
          ? capturedImage 
          : `file://${capturedImage}`;
      } else if (Platform.OS === 'ios') {
        // For iOS, we might need to handle the URI differently
        // Some iOS versions work better without the file:// prefix
        normalizedImageUri = capturedImage;
      }
      
      // Log the normalized URI for debugging
      console.log(`Normalized image URI: ${normalizedImageUri}`);
      
      // Create a FormData object to send the image
      const formData = new FormData();
      
      // Add the image file to the form data
      // We need to extract the filename from the URI
      const uriParts = normalizedImageUri.split('/');
      const fileName = uriParts[uriParts.length - 1];
      
      // Log the request details for debugging
      console.log(`Sending request to ${API_URL}/api/extract-text`);
      console.log(`Image URI: ${normalizedImageUri}`);
      console.log(`Image filename: ${fileName}`);
      
      formData.append('image', {
        uri: normalizedImageUri,
        name: fileName,
        type: 'image/jpeg', // Adjust based on your image type
      } as any);
      
      console.log('FormData created, sending request...');
      
      // Send the image to the backend for processing
      const response = await fetch(`${API_URL}/api/extract-text`, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'multipart/form-data',
        },
      });
      
      console.log(`Received response with status: ${response.status}`);
      
      // Check if the response is ok
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Server error response: ${errorText}`);
        throw new Error(`Server responded with ${response.status}: ${errorText}`);
      }
      
      // Parse the response
      const responseText = await response.text();
      console.log(`Raw response text (first 100 chars): ${responseText.substring(0, 100)}...`);
      
      let result;
      try {
        result = JSON.parse(responseText);
        console.log('Successfully parsed JSON response');
      } catch (parseError: any) {
        console.error('Error parsing JSON response:', parseError);
        // Even if parsing fails, try to extract text content using regex
        const textMatch = /text":"([^"]+)/.exec(responseText);
        if (textMatch && textMatch[1]) {
          console.log('Extracted text from malformed JSON response');
          result = {
            success: true,
            text: textMatch[1],
            blocks: []
          };
        } else {
          throw new Error(`Failed to parse server response: ${parseError.message}`);
        }
      }
      
      // Log the result structure
      console.log(`Result structure: ${Object.keys(result).join(', ')}`);
      console.log(`Text length: ${result.text?.length || 0}`);
      console.log(`Number of blocks: ${result.blocks?.length || 0}`);
      
      // Check if we have an S3 image URL in the result
      if (result.imageUrl) {
        console.log(`S3 image URL received from backend: ${result.imageUrl}`);
      }
      
      // Sanitize the result to ensure it can be safely encoded
      // Remove any characters that might cause URI encoding issues
      const sanitizeText = (text: string | undefined): string => {
        if (!text) return '';
        
        // Replace problematic characters that might cause URI encoding issues
        return text
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
          .replace(/\\+/g, '\\') // Fix multiple backslashes
          .replace(/[^\x20-\x7E\s]/g, ' '); // Replace non-ASCII with spaces
      };
      
      const sanitizedResult = {
        success: true,
        text: sanitizeText(result.text || ''),
        imageUrl: result.imageUrl || '', // Include the S3 image URL if available
        blocks: Array.isArray(result.blocks) ? result.blocks.map((block: any) => ({
          id: block.id || '',
          text: sanitizeText(block.text || ''),
          confidence: block.confidence || 0,
          // Omit geometry data which might contain complex objects that don't serialize well
        })) : []
      };
      
      // Log the sanitized result
      console.log('Sanitized result for URL params');
      
      // Convert to JSON string
      const resultJson = JSON.stringify(sanitizedResult);
      console.log(`JSON string length: ${resultJson.length}`);
      
      // Try to encode for URL, with fallback for encoding errors
      let encodedResult;
      try {
        encodedResult = encodeURIComponent(resultJson);
        console.log(`Encoded URI length: ${encodedResult.length}`);
      } catch (encodeError) {
        console.error('Error encoding result for URL:', encodeError);
        
        // If encoding fails, create a simplified version with just the text and image URL
        const simplifiedResult = {
          success: true,
          text: sanitizedResult.text,
          imageUrl: sanitizedResult.imageUrl, // Keep the S3 image URL
          blocks: []
        };
        
        console.log('Using simplified result due to encoding error');
        const simplifiedJson = JSON.stringify(simplifiedResult);
        try {
          encodedResult = encodeURIComponent(simplifiedJson);
        } catch (secondEncodeError) {
          // If encoding still fails, create an even more basic result
          console.error('Second encoding attempt failed:', secondEncodeError);
          encodedResult = encodeURIComponent(JSON.stringify({
            success: true,
            text: 'Text was extracted but could not be encoded for display. The image might contain special characters.',
            error: 'Encoding error'
          }));
        }
      }
      
      // Check if the encoded result is too large for URL params
      if (encodedResult.length > 2000) {
        console.warn('Warning: Encoded result is very large, may cause issues with URL params');
        
        // Create a simplified version with just the text and image URL if it's too large
        const simplifiedResult = {
          success: true,
          text: sanitizedResult.text,
          imageUrl: sanitizedResult.imageUrl, // Keep the S3 image URL
          blocks: []
        };
        
        console.log('Using simplified result without blocks due to size constraints');
        const simplifiedJson = JSON.stringify(simplifiedResult);
        const simplifiedEncoded = encodeURIComponent(simplifiedJson);
        console.log(`Simplified encoded length: ${simplifiedEncoded.length}`);
        
        // Now that we have the results, navigate to the results page
        console.log('Processing complete, navigating to results page');
        router.push({
          pathname: '/textract-results' as any,
          params: {
            results: simplifiedEncoded,
            timestamp: Date.now().toString() // Add timestamp to prevent caching issues
          }
        });
      } else {
        // Now that we have the results, navigate to the results page
        console.log('Processing complete, navigating to results page');
        router.push({
          pathname: '/textract-results' as any,
          params: {
            results: encodedResult,
            timestamp: Date.now().toString() // Add timestamp to prevent caching issues
          }
        });
      }
      
    } catch (error) {
      console.error('Error processing image with Textract:', error);
      
      // Get more detailed error information
      const errorMessage = error instanceof Error 
        ? `${error.name}: ${error.message}` 
        : 'Unknown error occurred';
      
      console.error('Detailed error:', errorMessage);
      
      // Show error alert to the user
      Alert.alert(
        'Processing Error',
        `Failed to process image: ${errorMessage}`,
        [{ text: 'OK' }]
      );
      
    } finally {
      // Reset processing state regardless of success or failure
      setIsProcessing(false);
    }
  };

  if (!permission || !mediaLibraryPermission) {
    return <View style={styles.container}><ActivityIndicator size="large" color="#0000ff" /></View>;
  }

  if (!permission.granted || !mediaLibraryPermission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>No access to camera or gallery</Text>
        <Text style={styles.subText}>Please enable camera and media library permissions.</Text>
        <TouchableOpacity 
          style={styles.actionButton} 
          onPress={() => {
            requestPermission();
            requestMediaLibraryPermission();
          }}
        >
          <Text style={styles.actionButtonText}>Grant Permissions</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Camera & Gallery' }} />
      
      {(isLoading || isProcessing) && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loadingText}>
            {isProcessing ? 'Processing image...' : 'Loading...'}
          </Text>
        </View>
      )}

      {isCameraActive ? (
        <View style={styles.cameraContainer}>
          <CameraView 
            ref={cameraRef}
            style={styles.camera} 
            facing={facing}
          >
            <View style={styles.cameraControls}>
              <TouchableOpacity 
                style={styles.flipButton}
                onPress={() => setFacing(
                  facing === 'back' ? 'front' : 'back'
                )}
              >
                <Ionicons name="camera-reverse" size={28} color="white" />
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
                <View style={styles.captureButtonInner} />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => setIsCameraActive(false)}
              >
                <Ionicons name="close" size={28} color="white" />
              </TouchableOpacity>
            </View>
          </CameraView>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.contentContainer}>
          {capturedImage ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: capturedImage }} style={styles.previewImage} />
              
              <View style={styles.actionButtons}>
                <TouchableOpacity style={styles.actionButton} onPress={resetImage}>
                  <MaterialIcons name="refresh" size={24} color="#fff" />
                  <Text style={styles.actionButtonText}>Reset</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.actionButton} onPress={saveImage}>
                  <MaterialIcons name="save" size={24} color="#fff" />
                  <Text style={styles.actionButtonText}>Save</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[
                    styles.actionButton, 
                    { backgroundColor: isProcessing ? '#999' : '#4CAF50' }
                  ]} 
                  onPress={processImageWithTextract}
                  disabled={isProcessing}
                >
                  <MaterialIcons name="text-fields" size={24} color="#fff" />
                  <Text style={styles.actionButtonText}>
                    {isProcessing ? 'Processing...' : 'Extract Text'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.optionsContainer}>
              <Text style={styles.title}>Capture or Select an Image</Text>
              
              <TouchableOpacity 
                style={styles.optionButton} 
                onPress={() => setIsCameraActive(true)}
              >
                <View style={styles.optionIconContainer}>
                  <MaterialIcons name="camera-alt" size={32} color="#fff" />
                </View>
                <Text style={styles.optionText}>Take a Photo</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.optionButton} 
                onPress={pickImage}
              >
                <View style={styles.optionIconContainer}>
                  <MaterialIcons name="photo-library" size={32} color="#fff" />
                </View>
                <Text style={styles.optionText}>Choose from Gallery</Text>
              </TouchableOpacity>
              
              {/* Debug button - only visible in development */}
              {__DEV__ && (
                <TouchableOpacity 
                  style={[styles.optionButton, { backgroundColor: '#ff9800', marginTop: 20 }]} 
                  onPress={testBackendConnection}
                >
                  <View style={styles.optionIconContainer}>
                    <MaterialIcons name="bug-report" size={32} color="#fff" />
                  </View>
                  <Text style={styles.optionText}>Test Backend Connection</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 30,
    color: '#333',
  },
  text: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  subText: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
    paddingHorizontal: 30,
    marginBottom: 20,
  },
  optionsContainer: {
    width: '100%',
    alignItems: 'center',
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  optionIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#4285F4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 20,
  },
  optionText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#333',
  },
  cameraContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  camera: {
    flex: 1,
  },
  cameraControls: {
    flex: 1,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    padding: 30,
  },
  flipButton: {
    alignSelf: 'flex-end',
    marginBottom: 15,
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 5,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButtonInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'white',
  },
  closeButton: {
    alignSelf: 'flex-end',
    marginBottom: 15,
  },
  previewContainer: {
    width: '100%',
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: 400,
    borderRadius: 12,
    marginBottom: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  actionButton: {
    backgroundColor: '#4285F4',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    flexDirection: 'row',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    marginTop: 12,
  },
}); 