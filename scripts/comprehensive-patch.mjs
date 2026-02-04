import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const scanDirs = [
  path.join(rootDir, 'node_modules', '@credo-ts'),
  path.join(rootDir, 'node_modules', '@hyperledger'),
  path.join(rootDir, 'node_modules', '@openwallet-foundation'),
  path.join(rootDir, 'node_modules', '@2060.io'),
  path.join(rootDir, 'node_modules', 'libsodium-wrappers'),
  path.join(rootDir, 'packages', 'rest', 'node_modules', '@credo-ts'),
  path.join(rootDir, 'packages', 'rest', 'node_modules', '@hyperledger'),
  path.join(rootDir, 'packages', 'rest', 'node_modules', '@2060.io'),
];

function findFileTypePath(startDir) {
  // Common pnpm locations
  const possiblePaths = [
    path.join(rootDir, 'node_modules', 'file-type', 'index.js'),
  ];
  try {
    const pnpmDir = path.join(rootDir, 'node_modules', '.pnpm');
    if (fs.existsSync(pnpmDir)) {
      const pnpmFiles = fs.readdirSync(pnpmDir);
      pnpmFiles.filter(dir => dir.startsWith('file-type@'))
        .forEach(dir => {
          possiblePaths.push(path.join(rootDir, 'node_modules', '.pnpm', dir, 'node_modules', 'file-type', 'index.js'));
        });
    }
  } catch (e) {
    // Ignore errors reading .pnpm
  }

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function patchFileType() {
  const fileTypePath = findFileTypePath(rootDir);
  if (fileTypePath) {
    let content = fs.readFileSync(fileTypePath, 'utf8');
    if (!content.includes('exports.fileTypeFromBuffer')) {
      console.log(`Patching file-type at ${fileTypePath} to include fileTypeFromBuffer export...`);
      content += '\nexports.fileTypeFromBuffer = fileType;\n';
      fs.writeFileSync(fileTypePath, content, 'utf8');
    } else {
      console.log(`file-type at ${fileTypePath} is already patched.`);
    }
  } else {
    console.warn('Could not find file-type/index.js to patch.');
  }
}

function patchDirectory(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch (e) {
      continue;
    }

    if (stat.isDirectory()) {
      patchDirectory(fullPath);
    } else if (file.endsWith('.js') || file.endsWith('.mjs')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      const originalContent = content;

      // Specialized replacement for the most problematic known case
      content = content.replace(
          /'@hyperledger\/indy-vdr-nodejs\/build\/NodeJSIndyVdr'/g,
          "'@hyperledger/indy-vdr-nodejs/build/NodeJSIndyVdr.js'"
      );
      content = content.replace(
          /"@hyperledger\/indy-vdr-nodejs\/build\/NodeJSIndyVdr"/g,
          '"@hyperledger/indy-vdr-nodejs/build/NodeJSIndyVdr.js"'
      );
      
      // Patch libsodium-wrappers broken ESM import
      content = content.replace(
          /import\s+e\s+from\s*"\.\/libsodium\.mjs"/g,
          'import e from "libsodium"'
      );
      content = content.replace(
          /import\s+e\s+from\s*'\.\/libsodium\.mjs'/g,
          "import e from 'libsodium'"
      );

      const patchedContent = content.replace(
        /((?:import|export)\s+[\s\S]*?from\s+|import\s+)(['"])([^'"]+)\2/g,
        (match, prefix, quote, p3) => {
          if (p3.endsWith('.js') || p3.endsWith('.json') || p3.endsWith('.mjs') || p3.endsWith('.css')) {
            return match;
          }
          
          if (!p3.startsWith('.') && !p3.includes('/')) return match;
          if (p3.startsWith('@') && p3.split('/').length <= 2) return match;

          let targetPath;
          if (p3.startsWith('.')) {
              targetPath = path.resolve(dir, p3);
          } else {
              targetPath = path.join(rootDir, 'node_modules', p3);
          }
          
          if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
            if (fs.existsSync(path.join(targetPath, 'index.mjs'))) return `${prefix}${quote}${p3}/index.mjs${quote}`;
            if (fs.existsSync(path.join(targetPath, 'index.js'))) return `${prefix}${quote}${p3}/index.js${quote}`;
          }
          
          if (fs.existsSync(`${targetPath}.mjs`)) return `${prefix}${quote}${p3}.mjs${quote}`;
          if (fs.existsSync(`${targetPath}.js`)) return `${prefix}${quote}${p3}.js${quote}`;

          return match;
        }
      );

      if (originalContent !== patchedContent) {
        console.log(`Patching ${path.relative(rootDir, fullPath)}`);
        fs.writeFileSync(fullPath, patchedContent, 'utf8');
      }
    }
  }
}

console.log('Running comprehensive patch...');
patchFileType();
for (const scanDir of scanDirs) patchDirectory(scanDir);
console.log('Done.');
