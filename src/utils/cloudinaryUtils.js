const CLOUDINARY_UPLOAD_PRESET = "vahansetu_kyc";
const CLOUDINARY_CLOUD_NAME = "dhzlmcsbu";

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_SIZE_MB = 5;

export const uploadToCloudinary = async (file) => {
  if (!file) return null;

  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error(`Sirf JPG, PNG ya WebP image upload karein. Aapne upload kiya: ${file.type || 'unknown'}`);
  }

  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    throw new Error(`File size ${MAX_SIZE_MB}MB se kam honi chahiye. Aapki file: ${(file.size / 1024 / 1024).toFixed(1)}MB`);
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", "vahansetu_kyc");

  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: "POST", body: formData }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || "Upload failed");
    }

    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    console.error("Cloudinary Upload Error:", error);
    throw error;
  }
};
