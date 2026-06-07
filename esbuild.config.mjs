import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const buildDir = './';

async function generateAssets() {
    const nodeTikzJaxPath = path.join(process.cwd(), 'node_modules', 'node-tikzjax');
    const assets = {};
    
    // Encode TeX binary assets
    const binAssets = ['tex.wasm.gz', 'core.dump.gz', 'tex_files.tar.gz'];
    for (const asset of binAssets) {
        const src = path.join(nodeTikzJaxPath, 'tex', asset);
        if (fs.existsSync(src)) {
            assets[asset] = fs.readFileSync(src).toString('base64');
        }
    }

    // Encode fonts and generate CSS
    let fontsCss = '';
    const originalFontsCssPath = path.join(nodeTikzJaxPath, 'css', 'fonts.css');
    if (fs.existsSync(originalFontsCssPath)) {
        let content = fs.readFileSync(originalFontsCssPath, 'utf8');
        const fontRegex = /font-family:\s*([^;]+);\s*src:\s*url\('([^']+)'\);/g;
        let match;
        let newCss = '';
        while ((match = fontRegex.exec(content)) !== null) {
            const family = match[1].trim();
            const relPath = match[2].trim(); 
            const fullPath = path.join(nodeTikzJaxPath, 'css', relPath);
            if (fs.existsSync(fullPath)) {
                const b64 = fs.readFileSync(fullPath).toString('base64');
                newCss += `@font-face { font-family: ${family}; src: url(data:font/ttf;base64,${b64}); }\n`;
            }
        }
        fontsCss = newCss;
    }

    const assetsContent = `export const ASSETS = ${JSON.stringify(assets, null, 2)};\nexport const FONTS_CSS = \`${fontsCss.replace(/`/g, '\\`')} \`;`;
    fs.writeFileSync('src/assets.ts', assetsContent);
    
    // Generate styles.css from source CSS + fonts
    const srcStylesPath = path.join('src', 'styles.css');
    const stylesPath = path.join(buildDir, 'styles.css');
    const srcCss = fs.existsSync(srcStylesPath) ? fs.readFileSync(srcStylesPath, 'utf8') : '';
    fs.writeFileSync(stylesPath, srcCss + '\n' + fontsCss);
    
    console.log('Generated src/assets.ts and updated styles.css');
}

async function build() {
    await generateAssets();
    await esbuild.build({
        entryPoints: ['src/main.ts'],
        bundle: true,
        external: ['obsidian'],
        format: 'cjs',
        platform: 'node',
        target: 'node18',
        outfile: 'main.js',
        logLevel: 'info',
    });
}

build().catch(err => {
    console.error(err);
    process.exit(1);
});
