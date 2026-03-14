const fs = require('fs');
const path = require('path');

const files = [
  'src/App.tsx',
  'src/components/Auth.tsx',
  'src/components/CameraView.tsx',
  'src/components/ReportPromptModal.tsx',
  'src/components/AlertLog.tsx'
];

const replacements = [
  { from: /bg-black/g, to: 'bg-zinc-50 dark:bg-black' },
  { from: /bg-zinc-50 dark:bg-zinc-50 dark:bg-black/g, to: 'bg-zinc-50 dark:bg-black' }, // Fix double replacements
  { from: /bg-zinc-50 dark:bg-black\/40/g, to: 'bg-white/40 dark:bg-black/40' },
  { from: /bg-zinc-50 dark:bg-black\/60/g, to: 'bg-white/60 dark:bg-black/60' },
  { from: /bg-zinc-50 dark:bg-black\/80/g, to: 'bg-white/80 dark:bg-black/80' },
  { from: /bg-zinc-50 dark:bg-black\/20/g, to: 'bg-black/5 dark:bg-black/20' },
  
  { from: /text-white/g, to: 'text-zinc-900 dark:text-white' },
  { from: /text-zinc-900 dark:text-zinc-900 dark:text-white/g, to: 'text-zinc-900 dark:text-white' }, // Fix double
  { from: /text-zinc-900 dark:text-white\/60/g, to: 'text-zinc-500 dark:text-white/60' },
  { from: /text-zinc-900 dark:text-white\/40/g, to: 'text-zinc-400 dark:text-white/40' },
  { from: /text-zinc-900 dark:text-white\/30/g, to: 'text-zinc-400 dark:text-white/30' },
  { from: /text-zinc-900 dark:text-white\/20/g, to: 'text-zinc-300 dark:text-white/20' },
  { from: /text-zinc-900 dark:text-white\/10/g, to: 'text-zinc-200 dark:text-white/10' },
  { from: /text-zinc-900 dark:text-white\/50/g, to: 'text-zinc-500 dark:text-white/50' },
  { from: /text-zinc-900 dark:text-white\/70/g, to: 'text-zinc-600 dark:text-white/70' },
  { from: /text-zinc-900 dark:text-white\/80/g, to: 'text-zinc-700 dark:text-white/80' },
  { from: /text-zinc-900 dark:text-white\/90/g, to: 'text-zinc-800 dark:text-white/90' },
  { from: /text-zinc-900 dark:text-white\/5/g, to: 'text-zinc-200 dark:text-white/5' },

  { from: /border-white\/5/g, to: 'border-black/5 dark:border-white/5' },
  { from: /border-white\/10/g, to: 'border-black/10 dark:border-white/10' },
  { from: /border-white\/20/g, to: 'border-black/20 dark:border-white/20' },
  { from: /border-white\/30/g, to: 'border-black/30 dark:border-white/30' },
  
  { from: /bg-zinc-900/g, to: 'bg-white dark:bg-zinc-900' },
  { from: /bg-white dark:bg-zinc-900\/50/g, to: 'bg-white dark:bg-zinc-900/50' },
  { from: /bg-white dark:bg-zinc-900\/30/g, to: 'bg-white/50 dark:bg-zinc-900/30' },
  
  { from: /bg-white\/5/g, to: 'bg-black/5 dark:bg-white/5' },
  { from: /bg-white\/10/g, to: 'bg-black/10 dark:bg-white/10' },
  { from: /bg-white\/20/g, to: 'bg-black/20 dark:bg-white/20' },
  
  { from: /hover:bg-white\/5/g, to: 'hover:bg-black/5 dark:hover:bg-white/5' },
  { from: /hover:bg-white\/10/g, to: 'hover:bg-black/10 dark:hover:bg-white/10' },
  { from: /hover:text-white/g, to: 'hover:text-zinc-900 dark:hover:text-white' },
  { from: /hover:border-white\/10/g, to: 'hover:border-black/10 dark:hover:border-white/10' },
  
  { from: /from-zinc-800/g, to: 'from-zinc-100 dark:from-zinc-800' },
  { from: /to-zinc-950/g, to: 'to-zinc-200 dark:to-zinc-950' },
  
  // Fix cases where bg-white is used as text color
  { from: /bg-white text-black/g, to: 'bg-zinc-900 dark:bg-white text-white dark:text-black' },
  { from: /hover:bg-zinc-200/g, to: 'hover:bg-zinc-800 dark:hover:bg-zinc-200' },
];

files.forEach(file => {
  let content = fs.readFileSync(path.join(__dirname, file), 'utf8');
  
  replacements.forEach(r => {
    content = content.replace(r.from, r.to);
  });
  
  fs.writeFileSync(path.join(__dirname, file), content);
});

console.log('Done');
