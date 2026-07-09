# Edge Text Expander

A Manifest V3 browser extension for expanding reusable text snippets from shortcuts inside web page input fields.

## Scripts

```bash
npm install
npm run build
```

The production extension bundle is generated in `dist/`.

## Project Structure

- `src/background`: background service worker
- `src/content`: content script for shortcut detection and insertion
- `src/popup`: popup UI
- `src/options`: options page
- `src/shared`: shared storage, templates, and types
- `public/manifest.json`: extension manifest
