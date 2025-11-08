/**
 * PDF Medical Coding Routes
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const PDFCodingService = require('../services/pdf-coding-service');

// Configure multer for PDF uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

/**
 * POST /api/pdf-coding/process
 * Upload PDF and extract medical codes
 */
router.post('/process', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No PDF file uploaded'
      });
    }

    console.log('📄 Processing PDF:', req.file.originalname);
    console.log('   Size:', req.file.size, 'bytes');

    // Process PDF
    const result = await PDFCodingService.processPDF(req.file.buffer, {
      appointmentType: req.body.appointmentType || 'Unknown',
      durationMinutes: req.body.durationMinutes ? parseInt(req.body.durationMinutes) : 60,
      patientContext: req.body.patientContext ? (typeof req.body.patientContext === 'string' ? JSON.parse(req.body.patientContext) : req.body.patientContext) : {}
    });

    // Return result with PDF metadata
    res.json({
      success: true,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      ...result
    });
  } catch (error) {
    console.error('❌ Error processing PDF:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

