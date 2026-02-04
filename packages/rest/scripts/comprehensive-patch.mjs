import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --------------------------------------------------------
// 1. Dynamic Project Root Resolution
// --------------------------------------------------------
let rootDir;
if (__dirname.includes('node_modules')) {
  // Case: Installed dependency -> node_modules/@credo-ts/rest/scripts/
  // Root is 4 levels up: node_modules/@credo-ts/rest/scripts -> ... -> project-root
  rootDir = path.resolve(__dirname, '../../../..');
} else {
  // Case: Monorepo dev -> packages/rest/scripts/
  // Root is 3 levels up: packages/rest/scripts -> ... -> monorepo-root
  rootDir = path.resolve(__dirname, '../../..');
}

console.log(`[Comprehensive Patch] Detected root directory: ${rootDir}`);
const nodeModulesDir = path.join(rootDir, 'node_modules');

// --------------------------------------------------------
// 2. Helpers
// --------------------------------------------------------
function replaceInFile(filePath, searchValue, replaceValue) {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const newContent = content.replace(searchValue, replaceValue);
    if (content !== newContent) {
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log(`Patched ${path.relative(rootDir, filePath)}`);
    }
  }
}

function findPackageRoot(packageName, startDir) {
    try {
        const entryPath = require.resolve(packageName, { paths: [startDir] });
        let currentDir = path.dirname(entryPath);
        while (currentDir !== path.parse(currentDir).root) {
            if (fs.existsSync(path.join(currentDir, 'package.json'))) {
                return currentDir;
            }
            currentDir = path.dirname(currentDir);
        }
    } catch (error) {
        return null;
    }
    return null;
}

// --------------------------------------------------------
// 3. Fix Source Imports (Consumer Request)
// --------------------------------------------------------
const srcDir = path.join(rootDir, 'src');
const srcItems = fs.existsSync(srcDir) 
  ? fs.readdirSync(srcDir).map(item => item.replace(/\.ts$/, ''))
  : [];

function fixImports(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    let stat;
    try { stat = fs.statSync(fullPath); } catch { continue; }

    if (stat.isDirectory()) {
      fixImports(fullPath);
    } else if (file.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      const relativeToSrc = path.relative(srcDir, dir);
      const depth = relativeToSrc === '' ? 0 : relativeToSrc.split(path.sep).length;

      const patchedContent = content.replace(
        /((?:import|export)\s+[\s\S]*?from\s+|import\s+)(['"])([^'"]+)\2/g,
        (match, p1, quote, p3) => {
          let cleanP3 = p3;
          if (p3.endsWith('.js')) cleanP3 = p3.slice(0, -3);

          // Relative import
          if (p3.startsWith('.')) {
             const targetPath = path.resolve(dir, cleanP3);
             if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
                 return `${p1}${quote}${cleanP3}/index.js${quote}`;
             } else if (fs.existsSync(targetPath + '.ts') || fs.existsSync(targetPath + '.js')) {
                 return `${p1}${quote}${cleanP3}.js${quote}`;
             }
             return match;
          }
          
          // Deep import into @credo-ts/rest/build
          if (p3.startsWith('@credo-ts/rest/build/')) {
             const targetPath = path.join(nodeModulesDir, cleanP3);
             if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
                 console.log(`Fixing @credo-ts/rest deep directory import in ${path.relative(rootDir, fullPath)}: ${p3} -> ${cleanP3}/index.js`);
                 return `${p1}${quote}${cleanP3}/index.js${quote}`;
             } else {
                 console.log(`Fixing @credo-ts/rest deep import in ${path.relative(rootDir, fullPath)}: ${p3} -> ${cleanP3}.js`);
                 return `${p1}${quote}${cleanP3}.js${quote}`;
             }
          }

          // Absolute-style import from src (e.g. import { x } from 'constants')
          const parts = p3.split('/');
          const firstPart = parts[0];

          if (srcItems.includes(firstPart) && !p3.startsWith('@')) {
            let relativePath = '';
            if (depth === 0) {
              relativePath = './' + cleanP3;
            } else {
              relativePath = '../'.repeat(depth) + cleanP3;
            }
            
            const targetPath = path.resolve(srcDir, cleanP3);
            if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
                relativePath += '/index.js';
            } else {
                relativePath += '.js';
            }
            console.log(`Fixing absolute-style import in ${path.relative(rootDir, fullPath)}: ${p3} -> ${relativePath}`);
            return `${p1}${quote}${relativePath}${quote}`;
          }

          return match;
        }
      );

      if (content !== patchedContent) {
        fs.writeFileSync(fullPath, patchedContent, 'utf8');
      }
    }
  }
}

if (fs.existsSync(srcDir)) {
    console.log('Fixing source imports in src/ ...');
    fixImports(srcDir);
}

// --------------------------------------------------------
// 4. Specific Node Modules Patches
// --------------------------------------------------------
console.log('Patching node_modules specific dependencies...');

// 4a. Patch @credo-ts/rest util.js (Drizzle)
// Handle both installed (node_modules) and monorepo (packages/rest) paths
let credoRestUtil = path.join(nodeModulesDir, '@credo-ts/rest/build/utils/util.js');
if (!fs.existsSync(credoRestUtil)) {
    credoRestUtil = path.join(rootDir, 'packages/rest/build/utils/util.js');
}

if (fs.existsSync(credoRestUtil)) {
    replaceInFile(credoRestUtil, /drizzle-orm\/node-postgres\/index\.js/g, 'drizzle-orm/node-postgres');
    replaceInFile(credoRestUtil, /drizzle-orm\/libsql\/index\.js/g, 'drizzle-orm/libsql');
}

// 4b. Patch @credo-ts/drizzle-storage recursively
const drizzleStorageBuildDir = path.join(nodeModulesDir, '@credo-ts/drizzle-storage/build');
if (fs.existsSync(drizzleStorageBuildDir)) {
    function recursivePatchDrizzle(dir) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            if (fs.statSync(fullPath).isDirectory()) {
                recursivePatchDrizzle(fullPath);
            } else if (file.endsWith('.js') || file.endsWith('.mjs')) {
                let content = fs.readFileSync(fullPath, 'utf8');
                let patched = false;
                
                if (content.includes('drizzle-orm/pg-core/index.js')) {
                    content = content.replace(/drizzle-orm\/pg-core\/index\.js/g, 'drizzle-orm/pg-core');
                    patched = true;
                }
                if (content.includes('drizzle-orm/sqlite-core/index.js')) {
                    content = content.replace(/drizzle-orm\/sqlite-core\/index\.js/g, 'drizzle-orm/sqlite-core');
                    patched = true;
                }
                if (patched) {
                    fs.writeFileSync(fullPath, content, 'utf8');
                    console.log(`Patched ${path.relative(rootDir, fullPath)}`);
                }
            }
        }
    }
    recursivePatchDrizzle(drizzleStorageBuildDir);
}

// 4c. Fix libsodium-wrappers
try {
    const wrapperRoot = findPackageRoot('libsodium-wrappers', nodeModulesDir);
    if (wrapperRoot) {
        console.log(`Found libsodium-wrappers at ${wrapperRoot}`);
        const wrapperDestDir = path.join(wrapperRoot, 'dist/modules-esm');
        
        let libsodiumRoot = findPackageRoot('libsodium', wrapperRoot);
        if (!libsodiumRoot) {
            // Check pnpm sibling
            const potentialSibling = path.resolve(wrapperRoot, '../libsodium');
            if (fs.existsSync(path.join(potentialSibling, 'package.json'))) {
                libsodiumRoot = potentialSibling;
            }
        }

        if (libsodiumRoot) {
            const libsodiumSrcFile = path.join(libsodiumRoot, 'dist/modules-esm/libsodium.mjs');
            if (fs.existsSync(libsodiumSrcFile) && fs.existsSync(wrapperDestDir)) {
                fs.copyFileSync(libsodiumSrcFile, path.join(wrapperDestDir, 'libsodium.mjs'));
                console.log('Refreshed libsodium.mjs in libsodium-wrappers');
            }
        }
    }
} catch (e) {
    console.warn('Skipping libsodium patch due to error:', e.message);
}

// 4d. Patch @cheqd/sdk-esm
// Removed: The previous patch attempted to force a default import on file-type (import fileType from 'file-type'), 
// but file-type v21+ is pure ESM and only has named exports. The original code (import { fileTypeFromBuffer } ...) is correct.


// --------------------------------------------------------
// 5. Generic Recursive Patching (File-Type & Indy-VDR)
// --------------------------------------------------------
// Maintains support for general dependencies that might need explicit extension fixes
console.log('Running generic scan for indy-vdr and file-type...');

const scanDirs = [
  path.join(nodeModulesDir, '@credo-ts'),
  path.join(nodeModulesDir, '@hyperledger'),
  path.join(nodeModulesDir, '@openwallet-foundation'),
  path.join(nodeModulesDir, '@2060.io'),
  // Monorepo specific locations
  path.join(rootDir, 'packages', 'rest', 'node_modules', '@credo-ts'),
  path.join(rootDir, 'packages', 'rest', 'node_modules', '@hyperledger'),
];

function patchDirectoryGeneric(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    let stat;
    try { stat = fs.statSync(fullPath); } catch { continue; }

    if (stat.isDirectory()) {
      patchDirectoryGeneric(fullPath);
    } else if (file.endsWith('.js') || file.endsWith('.mjs') || file.endsWith('.d.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      const originalContent = content;

      // Fix: @hyperledger/indy-vdr-nodejs imports
      content = content.replace(
          /'@hyperledger\/indy-vdr-nodejs\/build\/NodeJSIndyVdr'/g,
          "'@hyperledger/indy-vdr-nodejs/build/NodeJSIndyVdr.js'"
      );
      content = content.replace(
          /"@hyperledger\/indy-vdr-nodejs\/build\/NodeJSIndyVdr"/g,
          '"@hyperledger/indy-vdr-nodejs/build/NodeJSIndyVdr.js"'
      );
      
      // Patch libsodium-wrappers (consumer side fix just in case)
      content = content.replace(
          /import\s+e\s+from\s*"\.\/libsodium\.mjs"/g,
          'import e from "libsodium"'
      );

      // Generic extension fix for .d.ts if needed, or other mapped imports
      if (file.endsWith('.d.ts')) {
          // If a d.ts imports a file that exists as .js but import lacks extension, we might fix it
          // But strict regex replacement can be dangerous. 
          // Previous scripts handled this well with the exist check.
      }
      
      if (originalContent !== content) {
        fs.writeFileSync(fullPath, content, 'utf8');
        // console.log(`Generic patch applied to ${path.relative(rootDir, fullPath)}`);
      }
    }
  }
}

// Run generic patch on scanDirs
for (const dir of scanDirs) patchDirectoryGeneric(dir);

console.log('[Comprehensive Patch] Done.');
