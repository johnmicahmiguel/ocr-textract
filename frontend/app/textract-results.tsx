import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, Dimensions, Share, Platform, Modal } from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
// @ts-ignore
import * as Clipboard from 'expo-clipboard';

// Define types for the Textract results
interface TextBlock {
  id: string;
  text: string;
  confidence: number;
  geometry?: any;
}

interface TextractResults {
  success?: boolean;
  text: string;
  blocks?: TextBlock[];
  error?: string;
  imageUrl?: string; // Add imageUrl field for S3 image URL
}

export default function TextractResultsScreen() {
  const { imageUri, results, timestamp } = useLocalSearchParams();
  const [imageError, setImageError] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [imageHeight, setImageHeight] = useState(250);
  const [isImageFullscreen, setIsImageFullscreen] = useState(false);
  const [processedImageUri, setProcessedImageUri] = useState<string | null>(null);
  const [s3ImageUrl, setS3ImageUrl] = useState<string | null>(null);
  const [parsedResults, setParsedResults] = useState<TextractResults | null>(null);
  
  console.log('TextractResultsScreen: Received params');
  console.log(`imageUri: ${imageUri ? 'present' : 'missing'}`);
  console.log(`results: ${results ? `present (${typeof results}, length: ${(results as string).length})` : 'missing'}`);
  console.log(`timestamp: ${timestamp || 'not provided'}`);
  
  // Parse the results if they exist, with error handling
  useEffect(() => {
    if (!results) return;
    
    try {
      console.log('Attempting to decode URI component...');
      // Log the first few characters of the results for debugging
      if (typeof results === 'string') {
        console.log(`Results string starts with: ${results.substring(0, 50)}...`);
      }
      
      // First try to decode the URI component
      let decodedResults;
      try {
        decodedResults = decodeURIComponent(results as string);
        console.log('Successfully decoded URI component');
      } catch (decodeError: any) {
        console.error('Error decoding URI component:', decodeError);
        console.error(`Error name: ${decodeError.name}, message: ${decodeError.message}`);
        
        // If there's a URI decoding error, try to extract the JSON directly
        // This assumes the string starts with {"success":true,"text":"...
        if (typeof results === 'string' && results.startsWith('{"success":')) {
          console.log('Attempting to extract JSON directly from the encoded string...');
          decodedResults = results as string;
        } else {
          // If we can't extract JSON directly, try to create a basic result with whatever text we can salvage
          const textMatch = /text":"([^"]+)/.exec(results as string);
          if (textMatch && textMatch[1]) {
            console.log('Extracted partial text from malformed result');
            // Create a simple result object with just the extracted text
            decodedResults = JSON.stringify({
              success: true,
              text: textMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
              blocks: []
            });
          } else {
            throw decodeError; // Re-throw if we couldn't salvage anything
          }
        }
      }
      
      console.log(`Decoded length: ${decodedResults.length}`);
      console.log(`Decoded starts with: ${decodedResults.substring(0, 50)}...`);
      
      // Then parse the JSON
      console.log('Attempting to parse JSON...');
      try {
        const parsed = JSON.parse(decodedResults);
        console.log('Successfully parsed JSON');
        
        // Check if we have an S3 image URL in the results
        if (parsed && parsed.imageUrl) {
          console.log(`Found S3 image URL in results: ${parsed.imageUrl}`);
          setS3ImageUrl(parsed.imageUrl);
        }
        
        setParsedResults(parsed);
      } catch (jsonError: any) {
        console.error('Error parsing JSON:', jsonError);
        
        // If JSON parsing fails, try to create a basic result with the raw text
        // This is a last resort fallback
        const fallbackResults = {
          success: true,
          text: decodedResults.replace(/\\n/g, '\n').replace(/\\"/g, '"'),
          blocks: []
        };
        console.log('Created fallback result with raw text');
        setParsedResults(fallbackResults);
      }
      
    } catch (error: any) {
      console.error('Error parsing results:', error);
      console.error(`Error name: ${error.name}, message: ${error.message}`);
      
      if (error.name === 'URIError') {
        console.error('This is a URI decoding error. The encoded string might contain invalid characters.');
        // Try to log problematic parts of the string
        if (typeof results === 'string') {
          try {
            // Try to find problematic characters in the string
            for (let i = 0; i < results.length; i += 50) {
              const chunk = results.substring(i, i + 50);
              try {
                decodeURIComponent(chunk);
                // If we get here, this chunk is fine
              } catch (e) {
                console.error(`Problematic chunk at position ${i}: ${chunk}`);
                break; // Stop after finding the first problematic chunk
              }
            }
          } catch (e) {
            console.error('Error while trying to identify problematic characters:', e);
          }
        }
        
        // Even if there's a URI error, try to extract any text content that might be useful
        if (typeof results === 'string') {
          const textMatch = /text":"([^"]+)/.exec(results as string);
          if (textMatch && textMatch[1]) {
            console.log('Extracted text from malformed URI component');
            setParsedResults({
              success: true,
              text: textMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
              blocks: []
            });
          } else {
            // If we can't extract text, create a generic error message
            setParsedResults({
              success: false,
              text: 'Some text was detected but could not be fully processed. The image might contain special characters or formatting that caused parsing issues.',
              error: `URI decoding error: ${error.message}`
            });
          }
        }
      } else {
        // Create an error object if parsing fails
        setParsedResults({
          success: false,
          text: '',
          error: `Failed to parse results data. The response may contain invalid characters. Error: ${error.message}`
        });
      }
    }
  }, [results]);
  
  // Process the image URI to ensure it's valid
  useEffect(() => {
    // Prioritize S3 image URL if available
    if (s3ImageUrl) {
      console.log(`Using S3 image URL: ${s3ImageUrl}`);
      
      // For direct S3 URLs, we can use them directly
      // No need to prefetch as we know the URL is valid
      setProcessedImageUri(s3ImageUrl);
      return;
    }
    
    // Fall back to local image URI if S3 URL is not available
    if (imageUri) {
      processLocalImageUri();
    }
  }, [imageUri, s3ImageUrl]);
  
  // Helper function to process local image URI
  const processLocalImageUri = useCallback(() => {
    try {
      // Clean up the URI to handle potential encoding issues
      let uri = imageUri as string;
      
      // Handle URI encoding issues
      uri = decodeURIComponent(uri);
      
      // Ensure the URI has the correct format for the platform
      if (Platform.OS === 'android' && !uri.startsWith('file://')) {
        uri = `file://${uri}`;
      } else if (Platform.OS === 'ios' && uri.startsWith('file://')) {
        // On iOS, remove file:// prefix if it causes issues
        uri = uri.replace('file://', '');
      }
      
      console.log(`Processed local image URI: ${uri}`);
      setProcessedImageUri(uri);
    } catch (error) {
      console.error('Error processing local image URI:', error);
      setImageError(true);
    }
  }, [imageUri]);
  
  // Calculate image dimensions based on the device width
  useEffect(() => {
    if (processedImageUri) {
      console.log(`Loading image from URI: ${processedImageUri}`);
      const screenWidth = Dimensions.get('window').width - 32; // Accounting for padding
      
      try {
        // Get the image dimensions to maintain aspect ratio
        Image.getSize(
          processedImageUri,
          (width, height) => {
            console.log(`Image dimensions: ${width}x${height}`);
            const aspectRatio = width / height;
            const calculatedHeight = screenWidth / aspectRatio;
            setImageHeight(calculatedHeight);
          },
          (error) => {
            console.error('Error getting image dimensions:', error);
            // Use default height if there's an error
            setImageHeight(250);
            setImageError(true);
          }
        );
      } catch (error) {
        console.error('Exception in Image.getSize:', error);
        setImageHeight(250);
        setImageError(true);
      }
    }
  }, [processedImageUri]);
  
  const handleBack = () => {
    router.back();
  };
  
  const copyToClipboard = async () => {
    if (parsedResults?.text) {
      await Clipboard.setStringAsync(parsedResults.text);
      setCopiedText(true);
      
      // Reset the copied state after 2 seconds
      setTimeout(() => {
        setCopiedText(false);
      }, 2000);
    }
  };
  
  const shareText = async () => {
    if (parsedResults?.text) {
      try {
        await Share.share({
          message: parsedResults.text,
          title: 'Extracted Text'
        });
      } catch (error) {
        console.error('Error sharing text:', error);
      }
    }
  };
  
  const handleImageError = () => {
    console.error('Error loading image from URI:', processedImageUri);
    setImageError(true);
  };
  
  const toggleImageFullscreen = () => {
    setIsImageFullscreen(!isImageFullscreen);
  };
  
  // Format the extracted text for better readability
  const formatExtractedText = (text: string) => {
    if (!text) return '';
    
    // Replace multiple spaces with a single space
    let formattedText = text.replace(/\s+/g, ' ');
    
    // Ensure proper line breaks
    formattedText = formattedText.replace(/\\n/g, '\n');
    
    // Replace escaped quotes
    formattedText = formattedText.replace(/\\"/g, '"');
    
    return formattedText;
  };
  
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ 
        title: 'Text Recognition Results',
        headerShown: true,
      }} />
      
      {/* Fullscreen Image Modal */}
      <Modal
        visible={isImageFullscreen}
        transparent={true}
        animationType="fade"
        onRequestClose={toggleImageFullscreen}
      >
        <View style={styles.fullscreenContainer}>
          {processedImageUri && !imageError ? (
            <Image 
              source={{ uri: processedImageUri }} 
              style={styles.fullscreenImage}
              resizeMode="contain"
              onError={handleImageError}
            />
          ) : (
            <View style={styles.imageErrorContainer}>
              <MaterialIcons name="broken-image" size={48} color="#fff" />
              <Text style={styles.imageErrorText}>Could not load image</Text>
            </View>
          )}
          <TouchableOpacity 
            style={styles.closeFullscreenButton} 
            onPress={toggleImageFullscreen}
          >
            <MaterialIcons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>
      
      <ScrollView contentContainerStyle={styles.contentContainer}>
        {processedImageUri && !imageError ? (
          <View style={[styles.imageContainer, { height: imageHeight }]}>
            <Image 
              source={{ uri: processedImageUri }} 
              style={styles.image}
              resizeMode="contain"
              onError={handleImageError}
            />
            <TouchableOpacity 
              style={styles.zoomButton}
              onPress={toggleImageFullscreen}
            >
              <MaterialIcons name="zoom-out-map" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : imageError ? (
          <View style={styles.imageErrorContainer}>
            <MaterialIcons name="broken-image" size={48} color="#888" />
            <Text style={styles.imageErrorText}>Could not load image</Text>
            <Text style={styles.imageErrorSubText}>
              {processedImageUri ? `URL: ${processedImageUri.substring(0, 50)}...` : 'No image URL available'}
            </Text>
          </View>
        ) : null}
        
        <View style={styles.resultsContainer}>
          <View style={styles.sectionTitleContainer}>
            <Text style={styles.sectionTitle}>Extracted Text</Text>
            
            {parsedResults?.text && parsedResults.text.trim() !== '' && (
              <View style={styles.actionButtonsContainer}>
                <TouchableOpacity 
                  style={styles.iconButton} 
                  onPress={copyToClipboard}
                >
                  <MaterialIcons 
                    name={copiedText ? "check" : "content-copy"} 
                    size={22} 
                    color={copiedText ? "#4CAF50" : "#666"} 
                  />
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.iconButton} 
                  onPress={shareText}
                >
                  <Ionicons name="share-outline" size={22} color="#666" />
                </TouchableOpacity>
              </View>
            )}
          </View>
          
          {!parsedResults ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#0000ff" />
              <Text style={styles.loadingText}>Processing image...</Text>
            </View>
          ) : parsedResults.error && !parsedResults.text ? (
            <View style={styles.errorContainer}>
              <MaterialIcons name="error" size={48} color="#ff0000" />
              <Text style={styles.errorText}>Error: {parsedResults.error}</Text>
            </View>
          ) : !parsedResults.text || parsedResults.text.trim() === '' ? (
            <View style={styles.noTextContainer}>
              <MaterialIcons name="text-fields" size={48} color="#888" />
              <Text style={styles.noTextMessage}>No text detected in the image</Text>
            </View>
          ) : (
            <View style={styles.textContainer}>
              {parsedResults.error && (
                <View style={styles.warningContainer}>
                  <MaterialIcons name="warning" size={24} color="#ff9800" />
                  <Text style={styles.warningText}>
                    Note: Some parsing issues occurred, but we've displayed all text that could be extracted.
                  </Text>
                </View>
              )}
              
              <View style={styles.extractedTextContainer}>
                <Text style={styles.extractedText}>
                  {formatExtractedText(parsedResults.text)}
                </Text>
              </View>
              
              {parsedResults.blocks && parsedResults.blocks.length > 0 && (
                <View style={styles.blocksContainer}>
                  <Text style={styles.blocksSectionTitle}>Text Blocks</Text>
                  {parsedResults.blocks.map((block: TextBlock, index: number) => (
                    <View key={block.id || index} style={styles.blockItem}>
                      <Text style={styles.blockText}>{block.text}</Text>
                      <Text style={styles.confidenceText}>
                        Confidence: {Math.round(block.confidence)}%
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
      
      <View style={styles.bottomButtonsContainer}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
          <Text style={styles.backButtonText}>Back to Camera</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 80, // Add padding for the back button
  },
  imageContainer: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#e0e0e0',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  zoomButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageErrorContainer: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  imageErrorText: {
    marginTop: 8,
    color: '#666',
    fontSize: 16,
  },
  imageErrorSubText: {
    marginTop: 4,
    color: '#999',
    fontSize: 14,
  },
  resultsContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  actionButtonsContainer: {
    flexDirection: 'row',
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    color: '#ff0000',
    textAlign: 'center',
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff9e6',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  warningText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#996500',
  },
  noTextContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  noTextMessage: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  textContainer: {
    width: '100%',
  },
  extractedTextContainer: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  extractedText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  blocksContainer: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 16,
  },
  blocksSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  blockItem: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  blockText: {
    fontSize: 15,
    color: '#333',
  },
  confidenceText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  bottomButtonsContainer: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
  },
  backButton: {
    backgroundColor: '#4285F4',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: '100%',
    height: '80%',
  },
  closeFullscreenButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
}); 