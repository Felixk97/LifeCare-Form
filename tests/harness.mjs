// Test the actual handler using the same interface as Netlify Blobs, in memory.
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../netlify/functions/api.mjs',import.meta.url),'utf8')).replace('"@netlify/blobs"',JSON.stringify(new URL('./mock-store.mjs',import.meta.url).href));
export const {default:handler}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
export {reset,getStore} from './mock-store.mjs';
