import { buildJS, buildCSS } from "./esbuild.mjs";

async function buildJSSync () {
    await buildJS(true);
	console.log("JS built!");
    buildCSSSync();
}

async function buildCSSSync() {
    await buildCSS(true);
	console.log("CSS built!");
}

buildJSSync();
// buildCSSSync();