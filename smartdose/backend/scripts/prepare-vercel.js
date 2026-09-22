const fs = require('fs');
const path = require('path');

const sourceDirectory = path.resolve(__dirname, '../../frontend');
const publicDirectory = path.resolve(__dirname, '../public');

fs.mkdirSync(publicDirectory, { recursive: true });
fs.cpSync(sourceDirectory, publicDirectory, { recursive: true, force: true });

console.log('Frontend preparado para o Vercel.');
