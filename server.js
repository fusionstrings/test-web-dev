import { listenAndServe } from "https://deno.land/std@0.115.1/http/server.ts";
import { serveFile } from "https://deno.land/std@0.115.1/http/file_server.ts";
import {
  common,
  extname,
  toFileUrl,
} from "https://deno.land/std@0.115.1/path/mod.ts";
import { MEDIA_TYPES } from "./media-type.js";

const staticAssets = {
  "/": "./index.html",
  "/index.html": "./index.html",
  "/css/style.css": "./css/style.css",
  "/js/main.js": "./js/main.js"
};

/**
 * @param {string} path
 * @returns {string}
 */
function removeLeadingSlash(path) {
  if (path.startsWith("/")) {
    return path.slice(1);
  }
  return path;
}

/**
 * @param {string} path
 * @returns {string}
 */
function removeTrailingSlash(path) {
  if (path.endsWith("/")) {
    return path.slice(0, -1);
  }
  return path;
}

/**
 * @param {string} path
 * @returns {string}
 */
function removeSlashes(path) {
  return removeTrailingSlash(removeLeadingSlash(path));
}

/**
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function requestHandler(request) {
  const mode = request.headers.get("sec-fetch-mode");
  const dest = request.headers.get("sec-fetch-dest");
  const site = request.headers.get("sec-fetch-site");

  const { pathname } = new URL(request.url);

  if (globalThis.sessionStorage) {
    const storedFileKey = removeSlashes(pathname);
    const storedFile = globalThis.sessionStorage.getItem(storedFileKey);

    if (storedFile) {
      return new Response(storedFile, {
        // @ts-ignore
        headers: {
          // @ts-ignore
          "content-type": MEDIA_TYPES[extname(storedFileKey)],
          "x-cache": "HIT",
        },
      });
    }
  }

  // @ts-ignore
  const staticFile = staticAssets[pathname];
  // Check if the request is for static file.
  if (staticFile) {
    try {
      if (mode === "navigate" || dest === "document") {
        const content = await Deno.readTextFile(staticFile);
        const { main } = await import("./importmap-generator.js");
        const importMap = await main();

        const [beforeImportmap, afterImportmap] = content.split(
          "//__importmap",
        );
        const html = `${beforeImportmap}${importMap}${afterImportmap}`;
        return new Response(html, {
          headers: {
            "content-type": MEDIA_TYPES[".html"],
          },
        });
      }
      return serveFile(request, staticFile);
    } catch (error) {
      return new Response(error.message || error.toString(), { status: 500 });
    }
  }

  if (
    dest === "script" && mode === "cors" && site === "same-origin" &&
    pathname.endsWith(".jsx.js")
  ) {
    try {
      const { files, diagnostics } = await Deno.emit(
        `.${pathname}`.slice(0, -3),
      );

      if (diagnostics.length) {
        // there is something that impacted the emit
        console.warn(Deno.formatDiagnostics(diagnostics));
      }
      // @ts-ignore
      const [, content] = Object.entries(files).find(([fileName]) => {
        const cwd = toFileUrl(Deno.cwd()).href;
        const commonPath = common([
          cwd,
          fileName,
        ]);
        const shortFileName = fileName.replace(commonPath, `/`);

        return shortFileName === pathname;
      });
      return new Response(content, {
        headers: {
          "content-type": MEDIA_TYPES[".js"],
        },
      });
    } catch (error) {
      return new Response(error.message || error.toString(), { status: 500 });
    }
  }

  if (extname(pathname) === ".jsx") {
    try {
      return new Response(pathname, {
        status: 303,
        headers: {
          "location": `${request.url}.js`,
        },
      });
    } catch (error) {
      return new Response(error.message || error.toString(), { status: 500 });
    }
  }

  if (pathname.endsWith(".excalidraw.json")) {
    try {
      const filePath = `.${pathname}`.slice(0, -5);
      // return fetch(new URL(filePath, import.meta.url), {
      //   headers: {
      //     "content-type": MEDIA_TYPES[".json"],
      //   },
      // });

      const content = await Deno.readTextFile(filePath);
      return new Response(content, {
        headers: {
          "content-type": MEDIA_TYPES['.json'],
        }
      });
    } catch (error) {
      return new Response(error.message || error.toString(), { status: 500 });
    }
  }

  if (extname(pathname) === ".excalidraw") {
    try {
      return new Response(pathname, {
        status: 303,
        headers: {
          "location": `${request.url}.json`,
        },
      });
    } catch (error) {
      return new Response(error.message || error.toString(), { status: 500 });
    }
  }

  return new Response(null, {
    status: 404,
  });
}

if (import.meta.main) {
  const PORT = Deno.env.get("PORT") || 1729;
  const timestamp = Date.now();
  const humanReadableDateTime = new Date(timestamp).toLocaleString();
  console.log("Current Date: ", humanReadableDateTime);
  console.info(`Server Listening on http://localhost:${PORT}`);
  listenAndServe(`:${PORT}`, requestHandler);
}
