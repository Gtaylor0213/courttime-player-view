import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

function proxyToApi(target: string) {
  return {
    target,
    changeOrigin: true,
    configure: (proxy) => {
      proxy.on('error', (err: NodeJS.ErrnoException) => {
        console.error(
          `\n[Vite proxy] Cannot reach API at ${target} (${err.code ?? err.message}).`,
        );
        console.error(
          '  → Run `npm run dev` (starts API + Vite) or `npm run dev:server` in another terminal.',
        );
        console.error(
          '  → Ensure `.env` has DATABASE_URL so the API can start (copy from .env.example).\n',
        );
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  /** Backend for `npm run dev:client` — browser only talks to Vite; Vite forwards /api and /health here. */
  const devApiProxy = env.VITE_DEV_API_PROXY || 'http://127.0.0.1:3001';
  const devWebPort = Number(env.VITE_DEV_PORT) || 5173;

  return {
    plugins: [tailwindcss(), react()],
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
      alias: {
        'sonner@2.0.3': 'sonner',
        'react-hook-form@7.55.0': 'react-hook-form',
        'react-day-picker@8.10.1': 'react-day-picker',
        'lucide-react@0.487.0': 'lucide-react',
        'figma:asset/8775e46e6be583b8cd937eefe50d395e0a3fcf52.png': path.resolve(__dirname, './src/assets/8775e46e6be583b8cd937eefe50d395e0a3fcf52.png'),
        'class-variance-authority@0.7.1': 'class-variance-authority',
        '@radix-ui/react-tooltip@1.1.8': '@radix-ui/react-tooltip',
        '@radix-ui/react-tabs@1.1.3': '@radix-ui/react-tabs',
        '@radix-ui/react-switch@1.1.3': '@radix-ui/react-switch',
        '@radix-ui/react-slot@1.1.2': '@radix-ui/react-slot',
        '@radix-ui/react-separator@1.1.2': '@radix-ui/react-separator',
        '@radix-ui/react-select@2.1.6': '@radix-ui/react-select',
        '@radix-ui/react-scroll-area@1.2.3': '@radix-ui/react-scroll-area',
        '@radix-ui/react-radio-group@1.2.3': '@radix-ui/react-radio-group',
        '@radix-ui/react-popover@1.1.6': '@radix-ui/react-popover',
        '@radix-ui/react-label@2.1.2': '@radix-ui/react-label',
        '@radix-ui/react-dropdown-menu@2.1.6': '@radix-ui/react-dropdown-menu',
        '@radix-ui/react-dialog@1.1.6': '@radix-ui/react-dialog',
        '@radix-ui/react-checkbox@1.1.4': '@radix-ui/react-checkbox',
        '@radix-ui/react-avatar@1.1.3': '@radix-ui/react-avatar',
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      target: 'esnext',
      outDir: 'build',
    },
    server: {
      /** `0.0.0.0` is more reliable than `true` for LAN access from phones on some setups. */
      host: '0.0.0.0',
      port: devWebPort,
      strictPort: false,
      open: true,
      /**
       * Default Vite CORS only allows localhost origins. Opening the app via `http://192.168.x.x:5173`
       * sends that origin on module/HMR requests and can break loading from a phone.
       */
      cors: mode === 'development',
      /** Tell the HMR client to use the HTTP port (important when opening the site via a LAN IP). */
      hmr: {
        clientPort: devWebPort,
      },
      proxy: {
        '/api': proxyToApi(devApiProxy),
        '/health': proxyToApi(devApiProxy),
      },
    },
  };
});
