import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const files = [
  'src/App.tsx',
  'src/components/Auth.tsx',
  'src/components/CameraView.tsx',
  'src/components/ReportPromptModal.tsx',
  'src/components/AlertLog.tsx',
  'src/index.css'
];

const replacements = [
  { from: /text-zinc-700/g, to: 'text-zinc-900' },
  { from: /text-zinc-600/g, to: 'text-zinc-800' },
  { from: /text-zinc-500/g, to: 'text-zinc-700' },
  { from: /text-zinc-400/g, to: 'text-zinc-600' },
  { from: /text-zinc-300/g, to: 'text-zinc-500' },
  { from: /text-zinc-200/g, to: 'text-zinc-400' },
  
  // Also fix some background contrast
  { from: /bg-black\/5/g, to: 'bg-black/10' },
  { from: /border-black\/5/g, to: 'border-black/15' },
  { from: /border-black\/10/g, to: 'border-black/20' },
];

files.forEach(file => {
  let content = fs.readFileSync(path.join(__dirname, file), 'utf8');
  
  replacements.forEach(r => {
    content = content.replace(r.from, r.to);
  });
  
  fs.writeFileSync(path.join(__dirname, file), content);
});

console.log('Done fixing contrast');
