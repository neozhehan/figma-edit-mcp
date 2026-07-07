#!/usr/bin/env node
/**
 * Build script for Figma plugin
 * Uses esbuild to bundle all modules into a single code.js file
 */

import * as esbuild from 'esbuild';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkgPath = join(__dirname, '../package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

const isWatch = process.argv.includes('--watch');

async function build() {
    const ctx = await esbuild.context({
        entryPoints: [join(__dirname, 'src/main.ts')],
        bundle: true,
        outfile: join(__dirname, 'code.js'),
        format: 'iife',
        target: ['es2018'],
        platform: 'browser',
        minify: false,
        sourcemap: false,
        logLevel: 'info',
        define: {
            __PLUGIN_VERSION__: JSON.stringify(pkg.version),
        },
    });

    if (isWatch) {
        await ctx.watch();
        console.log('Watching for changes...');
    } else {
        await ctx.rebuild();
        await ctx.dispose();
        console.log('Build complete!');
    }
}

build().catch((err) => {
    console.error(err);
    process.exit(1);
});
