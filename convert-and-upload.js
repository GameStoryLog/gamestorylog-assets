const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Configuration
const INPUT_FOLDER = './input-images'; // Put your original images here
const OUTPUT_FOLDERS = {
    cover: './covers',
    banner: './banners',
    screenshot: './screenshots'
};

// Create input folder if it doesn't exist
if (!fs.existsSync(INPUT_FOLDER)) {
    fs.mkdirSync(INPUT_FOLDER);
    console.log('Created input-images folder. Put your images there!');
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function convertToWebP(inputPath, outputPath) {
    try {
        // Get original file size
        const originalStats = fs.statSync(inputPath);
        const originalSize = originalStats.size;
        
        await sharp(inputPath)
            .webp({ quality: 80 })
            .toFile(outputPath);
        
        // Get converted file size
        const convertedStats = fs.statSync(outputPath);
        const convertedSize = convertedStats.size;
        
        // Calculate compression
        const compressionRatio = ((originalSize - convertedSize) / originalSize * 100).toFixed(1);
        const savedSpace = originalSize - convertedSize;
        
        console.log(`✅ ${path.basename(inputPath)}`);
        console.log(`   Before: ${formatFileSize(originalSize)} → After: ${formatFileSize(convertedSize)}`);
        console.log(`   Saved: ${formatFileSize(savedSpace)} (${compressionRatio}% smaller)`);
        console.log('');
        
        return { originalSize, convertedSize, savedSpace };
    } catch (error) {
        console.log(`❌ Failed to convert: ${path.basename(inputPath)} - ${error.message}`);
        console.log('');
        return null;
    }
}

async function processImages() {
    if (!fs.existsSync(INPUT_FOLDER)) {
        console.log('❌ input-images folder not found!');
        return;
    }

    const files = fs.readdirSync(INPUT_FOLDER);
    const imageFiles = files.filter(file => 
        /\.(jpg|jpeg|png|gif|bmp)$/i.test(file)
    );

    if (imageFiles.length === 0) {
        console.log('❌ No image files found in input-images folder!');
        return;
    }

    console.log(`Found ${imageFiles.length} images to process...\n`);

    let totalOriginalSize = 0;
    let totalConvertedSize = 0;
    let successCount = 0;

    for (const file of imageFiles) {
        const inputPath = path.join(INPUT_FOLDER, file);
        const nameWithoutExt = path.parse(file).name;
        
        // Determine output folder based on filename pattern
        let outputFolder = './covers'; // default
        if (file.toLowerCase().includes('banner') || file.toLowerCase().includes(' b.')) {
            outputFolder = './banners';
        } else if (file.toLowerCase().includes('screenshot') || file.toLowerCase().includes('screen') || file.toLowerCase().includes(' s')) {
            outputFolder = './screenshots';
        } else if (file.toLowerCase().includes('cover') || file.toLowerCase().includes(' c.')) {
            outputFolder = './covers';
        }

        const outputPath = path.join(outputFolder, `${nameWithoutExt}.webp`);
        const result = await convertToWebP(inputPath, outputPath);
        
        if (result) {
            totalOriginalSize += result.originalSize;
            totalConvertedSize += result.convertedSize;
            successCount++;
        }
    }

    // Show summary
    if (successCount > 0) {
        const totalSaved = totalOriginalSize - totalConvertedSize;
        const totalCompressionRatio = ((totalSaved / totalOriginalSize) * 100).toFixed(1);
        
        console.log('📊 CONVERSION SUMMARY:');
        console.log(`✅ ${successCount} images converted successfully`);
        console.log(`📁 Total original size: ${formatFileSize(totalOriginalSize)}`);
        console.log(`📁 Total converted size: ${formatFileSize(totalConvertedSize)}`);
        console.log(`💾 Total space saved: ${formatFileSize(totalSaved)} (${totalCompressionRatio}% reduction)`);
        console.log('');
    }

    console.log('\n🎉 Conversion complete!');
    console.log('\nNext steps:');
    console.log('1. Run: git add .');
    console.log('2. Run: git commit -m "Add new images"');
    console.log('3. Run: git push');
    console.log('\nThen your images will be available at:');
    console.log('https://cdn.jsdelivr.net/gh/yourusername/gamestory-assets@main/covers/filename.webp');
}

function generateUrls() {
    console.log('\n📋 Generated URLs for your images:');
    console.log('Replace "yourusername" with your actual GitHub username\n');
    
    Object.values(OUTPUT_FOLDERS).forEach(folder => {
        if (fs.existsSync(folder)) {
            const files = fs.readdirSync(folder).filter(f => f.endsWith('.webp'));
            if (files.length > 0) {
                const folderName = path.basename(folder);
                console.log(`${folderName.toUpperCase()}:`);
                files.forEach(file => {
                    console.log(`https://cdn.jsdelivr.net/gh/yourusername/gamestory-assets@main/${folderName}/${file}`);
                });
                console.log('');
            }
        }
    });
}

// Check command line arguments
const command = process.argv[2];

async function main() {
    if (command === 'convert') {
        await processImages();
    } else if (command === 'urls') {
        generateUrls();
    } else {
        console.log('Usage:');
        console.log('  npm run convert  - Convert images from input-images folder');
        console.log('  npm run urls     - Generate jsdelivr URLs for existing images');
    }
}

main().catch(console.error);