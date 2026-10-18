import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Xmark',
    description: 'Organize X bookmarks into custom folders.',
    version: '1.0.0',
    // unlimitedStorage: saved post snapshots are 5-20 KB each, which would
    // exceed the default ~10 MB storage.local quota in Chrome after a while.
    permissions: ['storage', 'unlimitedStorage'],
    browser_specific_settings: {
      gecko: {
        id: 'xmark@example.com',
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
  },
});
