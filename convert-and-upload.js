const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { execSync } = require('child_process');

// Configuration
const INPUT_FOLDER = './input-images';
const OUTPUT_FOLDERS = {
    cover: './covers',
    banner: './banners',
    screenshot: './screenshots'
};

// Auto-detect GitHub repository info
function getGitHubInfo() {
    try {
        // Get remote URL
        const remoteUrl = execSync('git config --get remote.origin.url', { encoding: 'utf8' }).trim();
        
        // Parse GitHub URL (supports both HTTPS and SSH)
        let match;
        if (remoteUrl.includes('github.com')) {
            // HTTPS: https://github.com/username/repo.git
            // SSH: git@github.com:username/repo.git
            match = remoteUrl.match(/github\.com[/:]([\w-]+)\/([\w-]+)(?:\.git)?$/);
            
            if (match) {
                return {
                    username: match[1],
                    repository: match[2]
                };
            }
        }
        
        // Fallback - try to get from package.json if available
        if (fs.existsSync('./package.json')) {
            const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
            if (packageJson.repository && packageJson.repository.url) {
                const repoMatch = packageJson.repository.url.match(/github\.com[/:]([\w-]+)\/([\w-]+)/);
                if (repoMatch) {
                    return {
                        username: repoMatch[1],
                        repository: repoMatch[2]
                    };
                }
            }
        }
        
        // Default fallback
        return {
            username: 'gamestorylog',
            repository: 'gamestorylog-assets'
        };
    } catch (error) {
        console.log('⚠️  Could not auto-detect GitHub info, using default values');
        return {
            username: 'gamestorylog',
            repository: 'gamestorylog-assets'
        };
    }
}

// Generate CDN URL
function generateCDNUrl(folder, filename) {
    const gitInfo = getGitHubInfo();
    return `https://cdn.jsdelivr.net/gh/${gitInfo.username}/${gitInfo.repository}@main/${folder}/${filename}`;
}

// Create input folder if it doesn't exist
if (!fs.existsSync(INPUT_FOLDER)) {
    fs.mkdirSync(INPUT_FOLDER);
    console.log('Created input-images folder. Put your images there!');
}

// Create output folders if they don't exist
Object.values(OUTPUT_FOLDERS).forEach(folder => {
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder);
    }
});

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
        
        // Convert to WebP with quality 80
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
    // Accept ALL image formats including WebP
    const imageFiles = files.filter(file => 
        /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file)
    );

    if (imageFiles.length === 0) {
        console.log('❌ No image files found in input-images folder!');
        console.log('💡 Supported formats: jpg, jpeg, png, gif, bmp, webp');
        return;
    }

    console.log(`Found ${imageFiles.length} images to process...\n`);

    let totalOriginalSize = 0;
    let totalConvertedSize = 0;
    let successCount = 0;
    const newUrls = [];

    for (const file of imageFiles) {
        const inputPath = path.join(INPUT_FOLDER, file);
        const nameWithoutExt = path.parse(file).name;
        
        // Determine output folder based on filename pattern
        let outputFolder = './covers'; // default
        let folderType = 'covers';
        if (file.toLowerCase().includes('banner') || file.toLowerCase().includes(' b.')) {
            outputFolder = './banners';
            folderType = 'banners';
        } else if (file.toLowerCase().includes('screenshot') || file.toLowerCase().includes('screen') || file.toLowerCase().includes(' s')) {
            outputFolder = './screenshots';
            folderType = 'screenshots';
        } else if (file.toLowerCase().includes('cover') || file.toLowerCase().includes(' c.')) {
            outputFolder = './covers';
            folderType = 'covers';
        }

        const outputPath = path.join(outputFolder, `${nameWithoutExt}.webp`);
        
        // Check if output file already exists
        if (fs.existsSync(outputPath)) {
            console.log(`⏭️  ${path.basename(inputPath)} - already converted, skipping`);
            continue;
        }
        
        const result = await convertToWebP(inputPath, outputPath);
        
        if (result) {
            totalOriginalSize += result.originalSize;
            totalConvertedSize += result.convertedSize;
            successCount++;
            
            // Add to new URLs list with auto-detected GitHub info
            newUrls.push({
                filename: `${nameWithoutExt}.webp`,
                folder: folderType,
                url: generateCDNUrl(folderType, `${nameWithoutExt}.webp`)
            });
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
        
        // Show URLs for newly converted images
        if (newUrls.length > 0) {
            const gitInfo = getGitHubInfo();
            console.log(`🔗 NEW IMAGE URLs (Auto-detected: ${gitInfo.username}/${gitInfo.repository}):`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            
            const groupedUrls = {
                covers: [],
                banners: [],
                screenshots: []
            };
            
            newUrls.forEach(item => {
                groupedUrls[item.folder].push(item.url);
            });
            
            Object.keys(groupedUrls).forEach(folder => {
                if (groupedUrls[folder].length > 0) {
                    console.log(`\n📁 ${folder.toUpperCase()}:`);
                    groupedUrls[folder].forEach(url => {
                        console.log(`   ${url}`);
                    });
                }
            });
            console.log('');
        }
    } else if (imageFiles.length > 0) {
        console.log('ℹ️  All images were already converted. No new files processed.');
    }

    console.log('🎉 Conversion complete!');
    console.log('\nNext steps:');
    console.log('1. Run: git add .');
    console.log('2. Run: git commit -m "Add new images"');
    console.log('3. Run: git push');
    console.log('4. Wait 1-2 minutes, then your URLs will be live!');
}

function generateAllUrls() {
    const gitInfo = getGitHubInfo();
    console.log(`\n📋 ALL IMAGE URLs IN REPOSITORY (${gitInfo.username}/${gitInfo.repository}):`);
    console.log('');
    
    Object.values(OUTPUT_FOLDERS).forEach(folder => {
        if (fs.existsSync(folder)) {
            const files = fs.readdirSync(folder).filter(f => f.endsWith('.webp'));
            if (files.length > 0) {
                const folderName = path.basename(folder);
                console.log(`📁 ${folderName.toUpperCase()}:`);
                files.forEach(file => {
                    console.log(`   ${generateCDNUrl(folderName, file)}`);
                });
                console.log('');
            }
        }
    });
}

function getFilesFromLastCommit() {
    try {
        // Get files changed in last commit
        const result = execSync('git diff --name-only HEAD~1 HEAD', { encoding: 'utf8' });
        const changedFiles = result.trim().split('\n').filter(f => f.trim());
        
        if (changedFiles.length === 0) {
            console.log('📝 No files changed in last commit.');
            return;
        }

        const gitInfo = getGitHubInfo();
        console.log(`\n🔗 URLs FOR FILES FROM LAST COMMIT (${gitInfo.username}/${gitInfo.repository}):`);
        console.log('');

        const imageFiles = changedFiles.filter(file => 
            file.endsWith('.webp') && 
            (file.startsWith('covers/') || file.startsWith('banners/') || file.startsWith('screenshots/'))
        );

        if (imageFiles.length === 0) {
            console.log('📝 No image files were changed in the last commit.');
            return;
        }

        const groupedUrls = {
            covers: [],
            banners: [],
            screenshots: []
        };

        imageFiles.forEach(file => {
            const parts = file.split('/');
            const folder = parts[0];
            const filename = parts[1];
            
            if (groupedUrls[folder]) {
                groupedUrls[folder].push(generateCDNUrl(folder, filename));
            }
        });

        Object.keys(groupedUrls).forEach(folder => {
            if (groupedUrls[folder].length > 0) {
                console.log(`📁 ${folder.toUpperCase()}:`);
                groupedUrls[folder].forEach(url => {
                    console.log(`   ${url}`);
                });
                console.log('');
            }
        });

    } catch (error) {
        console.log('❌ Error getting last commit info. Make sure you have commits in your repository.');
        console.log('💡 Tip: Run "git log --oneline" to see your commits');
    }
}

// Check command line arguments
const command = process.argv[2];

async function main() {
    if (command === 'convert') {
        await processImages();
    } else if (command === 'urls') {
        generateAllUrls();
    } else if (command === 'commit-urls') {
        getFilesFromLastCommit();
    } else {
        console.log('Usage:');
        console.log('  npm run convert     - Convert images from input-images folder');
        console.log('  npm run urls        - Generate URLs for ALL images in repository');
        console.log('  npm run commit-urls - Generate URLs for images from last commit only');
    }
}

main().catch(console.error);