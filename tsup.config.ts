import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'adapters.web': 'src/adapters.web.ts',
    'adapters.native': 'src/adapters.native.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: true,
  treeshake: true,
  clean: true,
  sourcemap: true,
  external: [
    'react',
    '@react-native-async-storage/async-storage',
    '@react-native-community/netinfo',
  ],
});
