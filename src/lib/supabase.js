import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Storage helper functions
export const storage = {
  // Generate public URL for images
  getPublicUrl: (bucket, path) => {
    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
  },

  // Upload file to storage
  uploadFile: async (bucket, path, file, options = {}) => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, options);
    
    if (error) throw error;
    return data;
  },

  // Delete file from storage
  deleteFile: async (bucket, path) => {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([path]);
    
    if (error) throw error;
  }
};
