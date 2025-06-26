const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const ProgressBar = require('progress');
const { execSync } = require('child_process');
const config = require('./config');

// Create input and output folders if they don't exist
if (!fs.existsSync(config.inputFolder)) {
    fs.mkdirSync(config.inputFolder, { recursive: true });
    console.log('Created input-images folder. Put your images there!');
}
Object.values(config.outputFolders).forEach(folder => {
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
    }
});

// Initialize log file
const logStream = fs.createWriteStream(config.logFile, { flags: 'a' });
const originalConsoleLog = console.log;
console.log = (...args) => {
    logStream.write(args.join(' ') + '\n');
    originalConsoleLog(...args);
};

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getAllFiles(dir) {
    const baseDir = path.resolve(dir);
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => {
        const fullPath = path.join(dir, item.name);
        const relativePath = path.relative(baseDir, fullPath);
        return item.isDirectory() ? getAllFiles(fullPath) : [relativePath];
    });
}

async function convertToWebP(inputPath, outputPath, quality) {
    try {
        const originalStats = fs.statSync(inputPath);
        const originalSize = originalStats.size;

        // Validate image dimensions
        const metadata = await sharp(inputPath).metadata();
        const aspectRatio = metadata.width / metadata.height;
        if (aspectRatio > config.maxAspectRatio || aspectRatio < 1 / config.maxAspectRatio) {
            console.log(`⚠️ Warning: ${path.basename(inputPath)} has unusual aspect ratio (${metadata.width}x${metadata.height})`);
        }

        await sharp(inputPath)
            .webp({ quality })
            .toFile(outputPath);

        const convertedStats = fs.statSync(outputPath);
        const convertedSize = convertedStats.size;
        const compressionRatio = ((originalSize - convertedSize) / originalSize * 100).toFixed(1);
        const savedSpace = originalSize - convertedSize;

        console.log(`✅ Converted ${path.basename(inputPath)}`);
        console.log(`   Before: ${formatFileSize(originalSize)} → After: ${formatFileSize(convertedSize)}`);
        console.log(`   Saved: ${formatFileSize(savedSpace)} (${compressionRatio}% smaller)`);
        console.log('');

        return { originalSize, convertedSize, savedSpace, inputPath };
    } catch (error) {
        console.log(`❌ Failed to convert: ${path.basename(inputPath)} - ${error.message}`);
        console.log('');
        return { error: error.message, inputPath };
    }
}

async function recompressWebP(inputPath, outputPath, quality) {
    try {
        const originalStats = fs.statSync(inputPath);
        const originalSize = originalStats.size;

        // Validate image dimensions
        const metadata = await sharp(inputPath).metadata();
        const aspectRatio = metadata.width / metadata.height;
        if (aspectRatio > config.maxAspectRatio || aspectRatio < 1 / config.maxAspectRatio) {
            console.log(`⚠️ Warning: ${path.basename(inputPath)} has unusual aspect ratio (${metadata.width}x${metadata.height})`);
        }

        await sharp(inputPath)
            .webp({ quality })
            .toFile(outputPath);

        const convertedStats = fs.statSync(outputPath);
        const convertedSize = convertedStats.size;
        const compressionRatio = ((originalSize - convertedSize) / originalSize * 100).toFixed(1);
        const savedSpace = originalSize - convertedSize;

        console.log(`✅ Recompressed ${path.basename(inputPath)}`);
        console.log(`   Before: ${formatFileSize(originalSize)} → After: ${formatFileSize(convertedSize)}`);
        console.log(`   Saved: ${formatFileSize(savedSpace)} (${compressionRatio}% smaller)`);
        console.log('');

        return { originalSize, convertedSize, savedSpace, inputPath };
    } catch (error) {
        console.log(`❌ Failed to recompress: ${path.basename(inputPath)} - ${error.message}`);
        console.log('');
        return { error: error.message, inputPath };
    }
}

async function copyWebP(inputPath, outputPath) {
    try {
        fs.copyFileSync(inputPath, outputPath);
        const stats = fs.statSync(inputPath);
        const fileSize = stats.size;

        console.log(`✅ Copied ${path.basename(inputPath)}`);
        console.log(`   WebP Size: ${formatFileSize(fileSize)}`);
        console.log('');

        return { originalSize: fileSize, convertedSize: fileSize, savedSpace: 0, inputPath };
    } catch (error) {
        console.log(`❌ Failed to copy: ${path.basename(inputPath)} - ${error.message}`);
        console.log('');
        return { error: error.message, inputPath };
    }
}

async function processImages() {
    if (!fs.existsSync(config.inputFolder)) {
        console.log('❌ input-images folder not found!');
        return;
    }

    const allFiles = getAllFiles(config.inputFolder);
    const imageFiles = allFiles.filter(file =>
        /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file)
    );

    if (imageFiles.length === 0) {
        console.log('❌ No image files found in input-images folder!');
        console.log('💡 Supported formats: jpg, jpeg, png, gif, bmp, webp');
        return;
    }

    console.log(`Found ${imageFiles.length} images to process...\n`);

    const quality = parseInt(process.argv[3]) || config.defaultQuality;
    let totalOriginalSize = 0;
    let totalConvertedSize = 0;
    let successCount = 0;
    const newUrls = [];
    const errors = [];

    const bar = new ProgressBar('Processing [:bar] :percent :etas', { total: imageFiles.length });

    const results = await Promise.all(imageFiles.map(async file => {
        const inputPath = path.join(config.inputFolder, file);
        const nameWithoutExt = path.parse(file).name;

        let outputFolder = config.outputFolders.cover;
        let folderType = 'cover';
        if (file.toLowerCase().includes('banner') || file.toLowerCase().includes(' b.')) {
            outputFolder = config.outputFolders.banner;
            folderType = 'banner';
        } else if (file.toLowerCase().includes('screenshot') || file.toLowerCase().includes('screen') || file.toLowerCase().includes(' s')) {
            outputFolder = config.outputFolders.screenshot;
            folderType = 'screenshot';
        } else if (file.toLowerCase().includes('cover') || file.toLowerCase().includes(' c.')) {
            outputFolder = config.outputFolders.cover;
            folderType = 'cover';
        }

        const outputPath = path.join(outputFolder, `${nameWithoutExt}.webp`);

        if (fs.existsSync(outputPath)) {
            console.log(`⏭️ ${path.basename(inputPath)} - already exists in output, skipping`);
            bar.tick();
            return null;
        }

        let result;
        if (/\.webp$/i.test(file)) {
            if (process.argv.includes('--no-recompress')) {
                result = await copyWebP(inputPath, outputPath);
            } else {
                result = await recompressWebP(inputPath, outputPath, quality);
            }
        } else {
            result = await convertToWebP(inputPath, outputPath, quality);
        }
        bar.tick();

        if (result && !result.error) {
            totalOriginalSize += result.originalSize;
            totalConvertedSize += result.convertedSize;
            successCount++;

            newUrls.push({
                filename: `${nameWithoutExt}.webp`,
                folder: folderType,
                url: `https://cdn.jsdelivr.net/gh/${config.githubUsername}/${config.repoName}@${config.branch}/${folderType}/${nameWithoutExt}.webp`
            });

            if (process.argv.includes('--clean')) {
                fs.unlinkSync(inputPath);
                console.log(`🗑️ Deleted original: ${path.basename(inputPath)}`);
            }
        } else if (result && result.error) {
            errors.push({ file: path.basename(result.inputPath), error: result.error });
        }

        return result;
    }));

    // Show summary
    if (successCount > 0) {
        const totalSaved = totalOriginalSize - totalConvertedSize;
        const totalCompressionRatio = totalSaved > 0 ? ((totalSaved / totalOriginalSize) * 100).toFixed(1) : 0;

        console.log('\n📊 PROCESSING SUMMARY:');
        console.log(`✅ ${successCount} images processed successfully`);
        console.log(`📁 Total original size: ${formatFileSize(totalOriginalSize)}`);
        console.log(`✅ Total output size: ${formatFileSize(totalConvertedSize)}`);
        console.log(`🎉 Total saved: ${formatFileSize(totalSaved)} (${totalCompressionRatio}% reduction)`);
        console.log('');

        if (errors.length > 0) {
            console.log('❌ FAILED OPERATIONS:');
            errors.forEach(e => console.log(`   ${e.file}: ${e.error}`));
            console.log('');
        }

        if (newUrls.length > 0) {
            console.log(`🔗 NEW IMAGE URLs (replace "${config.githubUsername}" if needed):`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

            const groupedUrls = { cover: [], banner: [], screenshot: [] };
            newUrls.forEach(item => groupedUrls[item.folder].push(item.url));

            Object.keys(groupedUrls).forEach(folder => {
                if (groupedUrls[folder].length > 0) {
                    console.log(`\n📁 ${folder.toUpperCase()}:`);
                    groupedUrls[folder].forEach(url => console.log(`   ${url}`));
                }
            });
            console.log('');
        }

        if (process.argv.includes('--git')) {
            try {
                execSync('git add .');
                execSync('git commit -m "Images"');
                execSync('git push');
                console.log('✅ Pushed to GitHub');
            } catch (error) {
                console.log(`❌ Failed to push to Git: ${error.message}`);
            }
        }
    } else if (imageFiles.length > 0) {
        console.log('ℹ️ All images were already processed or failed. No new files handled.');
    }

    console.log('\n🎉 Processing complete!');
    if (successCount > 0 && !process.argv.includes('--git')) {
        console.log('\nNext Steps:');
        console.log('1. Run: git add .');
        console.log('2. Run: git commit -m "Images"');
        console.log('3. Run: git push');
        console.log('\nThen your images will be available at:');
        console.log(`https://cdn.jsdelivr.net/gh/${config.githubUsername}/${config.repoName}@${config.branch}/covers/filename.webp`);
    }
}

function generateUrls() {
    console.log('\n📋 URLs for images in the latest Git commit:');
    console.log(`Replace "${config.githubUsername}" with your actual GitHub username if needed\n`);

    let recentFiles = [];
    try {
        const gitDiff = execSync('git log -1 --name-only --pretty=format:', { encoding: 'utf8' });
        recentFiles = gitDiff.split('\n').filter(file => file && /\.webp$/i.test(file));
    } catch (error) {
        console.log(`❌ Failed to get latest commit files: ${error.message}`);
        return;
    }

    if (recentFiles.length === 0) {
        console.log('ℹ️ No WebP files found in the latest commit. Use "npm run recent" to see all URLs.');
        return;
    }

    const groupedUrls = { cover: [], banner: [], screenshot: [] };
    recentFiles.forEach(file => {
        const folderType = Object.keys(config.outputFolders).find(key =>
            file.startsWith(config.outputFolders[key].replace('./', ''))
        );
        if (folderType) {
            const url = `https://cdn.jsdelivr.net/gh/${config.githubUsername}/${config.repoName}@${config.branch}/${folderType}/${path.basename(file)}`;
            groupedUrls[folderType].push(url);
        }
    });

    let hasFiles = false;
    Object.keys(groupedUrls).forEach(folder => {
        if (groupedUrls[folder].length > 0) {
            console.log(`\n📁 ${folder.toUpperCase()}:`);
            groupedUrls[folder].forEach(url => console.log(`   ${url}`));
            hasFiles = true;
        }
    });

    if (!hasFiles) {
        console.log('ℹ️ No WebP files found in the latest commit.');
    }
    console.log('');
}

function generateAllUrls() {
    console.log('\n📋 URLs for all images:');
    console.log(`Replace "${config.githubUsername}" with your actual GitHub username if needed\n`);

    let hasFiles = false;
    Object.entries(config.outputFolders).forEach(([folderType, folderPath]) => {
        if (fs.existsSync(folderPath)) {
            const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.webp'));
            if (files.length > 0) {
                console.log(`\n📁 ${folderType.toUpperCase()}:`);
                files.forEach(file => {
                    console.log(`https://cdn.jsdelivr.net/gh/${config.githubUsername}/${config.repoName}@${config.branch}/${folderType}/${file}`);
                });
                hasFiles = true;
            }
        }
    });

    if (!hasFiles) {
        console.log('ℹ️ No WebP files found in output folders.');
    }
    console.log('');
}

async function main() {
    const command = process.argv[2];
    if (command === 'convert') {
        await processImages();
    } else if (command === 'urls') {
        generateUrls();
    } else if (command === 'recent') {
        generateAllUrls();
    } else {
        console.log('Usage:');
        console.log('  npm run convert [--quality N] [--clean] [--git] [--no-recompress] - Process images from input-images folder');
        console.log('  npm run urls     - Generate URLs for images in the latest Git commit');
        console.log('  npm run recent   - Generate URLs for all existing images');
    }
    logStream.end();
}

main().catch(error => {
    console.error(`❌ Error: ${error.message}`);
    logStream.end();
});