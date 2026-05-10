import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
    srcDir: 'src',
    modules: ['@wxt-dev/module-react'],
    vite: () => ({
        plugins: [tailwindcss()],
    }),
    manifest: {
        name: 'Medical Planning Agent',
        description: 'AI intelligent agent for medical planning software',
        permissions: ['sidePanel', 'storage', 'tabs', 'scripting', 'activeTab', 'debugger'],
        host_permissions: ['<all_urls>'],
        action: {
            default_title: 'Medical Agent',
        },
        side_panel: {
            default_path: 'sidepanel/index.html',
        },
    },
});
