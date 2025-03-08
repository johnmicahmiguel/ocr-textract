require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Configure AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

// Create an instance of the Textract service
const textract = new AWS.Textract();

// Create an instance of the S3 service
const s3 = new AWS.S3();
const S3_BUCKET = process.env.S3_BUCKET;
const S3_FOLDER = 'ocr/';

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  console.log(`Creating uploads directory: ${uploadDir}`);
  fs.mkdirSync(uploadDir, { recursive: true });
} else {
  console.log(`Uploads directory exists: ${uploadDir}`);
}

// Create a logs directory for storing responses
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  console.log(`Creating logs directory: ${logsDir}`);
  fs.mkdirSync(logsDir, { recursive: true });
} else {
  console.log(`Logs directory exists: ${logsDir}`);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Middleware
// Configure CORS to accept requests from any origin
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization']
}));
app.use(express.json());

// Simple test endpoint to verify connectivity
app.get('/api/test', (req, res) => {
  console.log('Test endpoint called');
  res.json({ 
    message: 'Backend server is running correctly',
    timestamp: new Date().toISOString()
  });
});

// Function to upload file to S3
async function uploadToS3(filePath, fileName) {
  console.log(`Uploading file to S3: ${filePath}`);
  
  const fileContent = fs.readFileSync(filePath);
  const s3Key = `${S3_FOLDER}${fileName}`;
  
  const params = {
    Bucket: S3_BUCKET,
    Key: s3Key,
    Body: fileContent,
    ContentType: 'image/jpeg' // Adjust based on your image type
    // Removed ACL: 'public-read' as the bucket doesn't allow ACLs
  };
  
  try {
    // Upload the file to S3
    const uploadResult = await s3.upload(params).promise();
    console.log(`File uploaded successfully to S3: ${uploadResult.Location}`);
    
    // Instead of using a pre-signed URL, construct a direct URL to the S3 object
    // Using the correct region format
    const directS3Url = `https://${S3_BUCKET}.s3.us-east-1.amazonaws.com/${s3Key}`;
    console.log(`Direct S3 URL: ${directS3Url}`);
    
    return directS3Url;
  } catch (error) {
    console.error('Error uploading to S3:', error);
    throw error;
  }
}

// Routes
app.post('/api/extract-text', upload.single('image'), async (req, res) => {
  console.log('Received request to /api/extract-text');
  const requestId = Date.now().toString(); // Create a unique ID for this request
  
  try {
    if (!req.file) {
      console.error('No image file provided in the request');
      return res.status(400).json({ error: 'No image file provided' });
    }

    console.log(`[${requestId}] Received file: ${req.file.originalname}, size: ${req.file.size} bytes`);
    const imageFile = req.file.path;
    
    // Upload the image to S3
    const s3FileName = `${requestId}-${req.file.originalname}`;
    const s3Url = await uploadToS3(imageFile, s3FileName);
    console.log(`[${requestId}] Image uploaded to S3: ${s3Url}`);
    
    // Read the image file for Textract processing
    console.log(`[${requestId}] Reading file from path: ${imageFile}`);
    const imageBytes = fs.readFileSync(imageFile);
    console.log(`[${requestId}] Successfully read ${imageBytes.length} bytes`);
    
    // Call AWS Textract to detect text
    console.log(`[${requestId}] Calling AWS Textract...`);
    const params = {
      Document: {
        Bytes: imageBytes
      }
    };

    const textractResponse = await textract.detectDocumentText(params).promise();
    console.log(`[${requestId}] Received response from AWS Textract`);
    
    // Save the raw Textract response to a file for debugging
    const responseLogPath = path.join(logsDir, `textract-response-${requestId}.json`);
    fs.writeFileSync(responseLogPath, JSON.stringify(textractResponse, null, 2));
    console.log(`[${requestId}] Saved raw Textract response to ${responseLogPath}`);
    
    // Process the response
    const extractedText = processTextractResponse(textractResponse);
    console.log(`[${requestId}] Extracted ${extractedText.blocks?.length || 0} text blocks`);
    
    // Save the processed response to a file for debugging
    const processedLogPath = path.join(logsDir, `processed-response-${requestId}.json`);
    fs.writeFileSync(processedLogPath, JSON.stringify(extractedText, null, 2));
    console.log(`[${requestId}] Saved processed response to ${processedLogPath}`);
    
    // Create a sanitized version of the response with minimal data
    const sanitizedResponse = {
      success: true,
      text: extractedText.text,
      imageUrl: s3Url, // Include the S3 URL in the response
      blocks: extractedText.blocks.map(block => ({
        id: block.id || '',
        text: block.text || '',
        confidence: block.confidence || 0
        // Explicitly omit geometry data which might cause serialization issues
      }))
    };
    
    // Save the sanitized response to a file for debugging
    const sanitizedLogPath = path.join(logsDir, `sanitized-response-${requestId}.json`);
    fs.writeFileSync(sanitizedLogPath, JSON.stringify(sanitizedResponse, null, 2));
    console.log(`[${requestId}] Saved sanitized response to ${sanitizedLogPath}`);
    
    // Log the final response size
    const responseSize = JSON.stringify(sanitizedResponse).length;
    console.log(`[${requestId}] Final response size: ${responseSize} bytes`);
    
    // COMMENTED OUT: Don't delete the uploaded file for debugging purposes
    // fs.unlinkSync(imageFile);
    // console.log(`Deleted temporary file: ${imageFile}`);
    console.log(`[${requestId}] Keeping uploaded file for debugging: ${imageFile}`);
    
    res.json(sanitizedResponse);
  } catch (error) {
    console.error(`[${requestId}] Error processing image:`, error);
    
    // Provide more detailed error information
    const errorDetails = {
      message: error.message,
      stack: error.stack,
      name: error.name
    };
    
    console.error(`[${requestId}] Error details:`, JSON.stringify(errorDetails, null, 2));
    
    // Save error details to a file
    const errorLogPath = path.join(logsDir, `error-${requestId}.json`);
    fs.writeFileSync(errorLogPath, JSON.stringify({
      error: errorDetails,
      file: req.file ? {
        originalname: req.file.originalname,
        path: req.file.path,
        size: req.file.size,
        mimetype: req.file.mimetype
      } : null
    }, null, 2));
    console.log(`[${requestId}] Saved error details to ${errorLogPath}`);
    
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to process image',
      details: errorDetails
    });
  }
});

// Helper function to process Textract response
function processTextractResponse(textractResponse) {
  const blocks = textractResponse.Blocks || [];
  
  // Extract all text blocks
  const textBlocks = blocks
    .filter(block => block.BlockType === 'LINE')
    .map(block => ({
      id: block.Id,
      text: block.Text,
      confidence: block.Confidence,
      geometry: block.Geometry
    }));
  
  // Combine all text lines
  const fullText = textBlocks.map(block => block.text).join('\n');
  
  return {
    text: fullText,
    blocks: textBlocks
  };
}

// Start the server
const startServer = async () => {
  try {
    // Start the Express server
    const server = app.listen(port, () => {
      console.log(`Server running on port ${port}`);
      console.log(`
      ✅ Backend server is running!
      
      🔍 Test endpoint: http://localhost:${port}/api/test
      📝 OCR endpoint: http://localhost:${port}/api/extract-text
      
      Press Ctrl+C to stop the server.
      `);
    });
    
    // Handle server shutdown
    process.on('SIGINT', () => {
      console.log('Shutting down server...');
      server.close();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
};

// Start the server
startServer(); 