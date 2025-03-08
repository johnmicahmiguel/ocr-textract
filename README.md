# OCR Text Extraction App with AWS Textract

This application allows users to take photos or select images from their gallery and extract text using AWS Textract.

## Project Structure

The project consists of two main parts:

1. **Frontend**: A React Native mobile app built with Expo and Expo Router
2. **Backend**: A Node.js server that integrates with AWS Textract

## Prerequisites

- Node.js (v16+)
- npm or yarn
- AWS Account with Textract access
- AWS Access Key ID and Secret Access Key

## Setup Instructions

### Backend Setup

1. Navigate to the backend directory:
   ```
   cd backend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the backend directory with your AWS credentials:
   ```
   AWS_ACCESS_KEY_ID=your_access_key_id
   AWS_SECRET_ACCESS_KEY=your_secret_access_key
   AWS_REGION=your_aws_region
   PORT=3000
   ```

4. Start the backend server with ngrok:
   ```
   npm run ngrok
   ```
   
   This will start the server and expose it to the internet using ngrok. You'll see a URL like `https://abcd-123-456-789-123.ngrok.io` in the console.

### Frontend Setup

1. Navigate to the frontend directory:
   ```
   cd frontend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Update the API URL in `frontend/app/(tabs)/camera.tsx` with the ngrok URL:
   ```javascript
   const API_URL = 'https://your-ngrok-url.ngrok.io';
   ```

4. Start the Expo development server:
   ```
   npm start
   ```

5. Use the Expo Go app on your mobile device to scan the QR code, or run on an emulator.

## Using ngrok for Development

This project uses ngrok to expose your local backend server to the internet, making it accessible from your mobile device regardless of network configuration.

### Benefits of using ngrok:

1. **No network configuration needed**: Works across different networks and firewalls
2. **Public URL**: Provides a public URL that can be accessed from anywhere
3. **Request inspection**: Allows you to inspect and debug requests
4. **Works with physical devices**: Solves the "Network request failed" error when testing on physical devices

### How to use:

1. Start the backend server with ngrok:
   ```
   cd backend
   npm run ngrok
   ```

2. Copy the ngrok URL from the console (e.g., `https://abcd-123-456-789-123.ngrok.io`)

3. Update the API_URL in the frontend:
   ```javascript
   const API_URL = 'https://abcd-123-456-789-123.ngrok.io';
   ```

4. Restart your Expo app to apply the changes

## Usage

1. Open the app and navigate to the Camera tab.
2. Take a photo or select an image from your gallery.
3. Tap the "Extract Text" button to process the image with AWS Textract.
4. View the extracted text on the results page.

## Features

- Camera integration for taking photos
- Gallery access for selecting existing images
- Text extraction using AWS Textract
- Display of extracted text with confidence scores

## Technologies Used

- React Native / Expo
- Expo Router for navigation
- AWS Textract for OCR
- Node.js / Express for the backend
- AWS SDK for JavaScript
- ngrok for exposing the local server

## Troubleshooting

### Network Request Failed Error

If you encounter a "Network request failed" error when trying to extract text:

1. **Use ngrok**: 
   - Start the backend with `npm run ngrok`
   - Update the frontend API_URL with the ngrok URL
   - This should resolve most network connectivity issues

2. **Verify Backend Server**:
   - Ensure your backend server is running
   - Check the console logs for any errors
   - Try accessing the test endpoint in your browser: `https://your-ngrok-url.ngrok.io/api/test`

3. **AWS Credentials**:
   - Verify your AWS credentials are correct
   - Ensure your AWS account has access to the Textract service
   - Check the AWS region is set correctly

4. **Image Issues**:
   - Try with a smaller or simpler image
   - Make sure the image format is supported (JPEG, PNG)
   - Check if the image contains clear, readable text

### AWS Textract Permissions

If you're getting AWS permission errors:

1. Make sure your AWS user has the `AmazonTextractFullAccess` policy attached
2. Verify your AWS credentials in the `.env` file are correct and up to date
3. Check if your AWS account has any service limits or restrictions

## License

This project is licensed under the MIT License - see the LICENSE file for details.
