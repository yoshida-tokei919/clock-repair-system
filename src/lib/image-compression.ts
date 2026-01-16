import imageCompression from 'browser-image-compression';

export interface CompressionResult {
    file: File;
    previewUrl: string;
}

/**
 * Compresses an image file to WebP format, aiming for <500KB.
 * Enforces Max 1920px width/height.
 */
export async function compressImageForUpload(file: File): Promise<CompressionResult> {
    const options = {
        maxSizeMB: 0.5,           // Target: 500KB
        maxWidthOrHeight: 1920,   // Resize to 4K friendly logic
        useWebWorker: true,
        fileType: 'image/webp'    // Force WebP conversion
    };

    try {
        const compressedFile = await imageCompression(file, options);

        // Create a preview URL for immediate UI feedback
        const previewUrl = await imageCompression.getDataUrlFromFile(compressedFile);

        return {
            file: compressedFile,
            previewUrl
        };
    } catch (error) {
        console.error("Image compression failed:", error);
        throw error;
    }
}
