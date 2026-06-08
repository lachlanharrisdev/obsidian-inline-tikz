# Inline TikZ

Render seamless TikZ, CircuiTikZ & PGFPlots LaTeX diagrams directly in
your notes.

## Installation

Search for `Inline TikZ` in *Settings → Community plugins*, then
click install and enable.

## Usage

Wrap TikZ code in a ```` ```tikz ```` code block:

    ```tikz
    \usepackage{circuitikz}
    \begin{document}

    \begin{circuitikz}[voltage shift=0.5]
    \draw (0,0) to[isource, l=$I_0$, v=$V_0$] (0,3)
    to[short, -*, i=$I_0$] (2,3)
    to[R=$R_1$, i>_=$i_1$] (2,0) -- (0,0);
    \end{circuitikz}

    \end{document}
    ```

## Mobile support

Diagrams are cached to `.tikz-cache/` in your vault. On desktop they are
compiled and cached automatically. On mobile, cached diagrams display
from the cache. Open the note on desktop first to render uncached
diagrams.

The cache will sync with whatever sync service you use, including
Obsidian Sync.

## Acknowledgements

This plugin would not be possible without the help from a few key
repositories and their maintainers:

- [obsidian-tikzjax](https://github.com/artisticat1/obsidian-tikzjax) -
  the original inspiration for this plugin, this repo aims to be a
  modernised spiritual successor
- [node-tikzjax](https://github.com/prinsss/node-tikzjax) - the underlying
  TikZ rendering library

## License

Copyright (c) 2026 Lachlan Harris. All Rights Reserved.

This project is licensed under the MIT License. See `./LICENSE.txt`.
