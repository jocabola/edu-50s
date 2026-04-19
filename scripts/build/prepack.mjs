import { cpSync, rmSync } from "fs";

console.log('Cleaning up...');
try {
  rmSync('app/packaged', {recursive: true});
  rmSync('app/out', {recursive: true});
  rmSync('app/public', {recursive: true});
} catch(e) {}

console.log('Copying public...');
cpSync('public', 'app/public', {recursive: true});