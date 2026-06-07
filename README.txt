Inline TikZ
===========

Render seamless TikZ, CircuiTikZ & other PGFPlots LaTeX diagrams directly in
your notes.


Usage
-----

Any code inside of `tikz` code blocks will be rendered, for example,

```tikz
\usepackage{circuitikz}
\begin{document}

\begin{circuitikz}[american, voltage shift=0.5]
\draw (0,0)
to[isource, l=$I_0$, v=$V_0$] (0,3)
to[short, -*, i=$I_0$] (2,3)
to[R=$R_1$, i>_=$i_1$] (2,0) -- (0,0);
\draw (2,3) -- (4,3)
to[R=$R_2$, i>_=$i_2$]
(4,0) to[short, -*] (2,0);
\end{circuitikz}

\end{document}
```


Acknowledgements
----------------

This plugin would not be possible without the help from a few key repositories,
their maintainers and the (recursive) acknowledgements they have:

* `obsidian-tikzjax` for the original inspiration for this plugin. This plugin
  is meant as a modernised, spiritual successor that fills the same gap.
      [https://github.com/artisticat1/obsidian-tikzjax]
* `node-tikzjax` for the underlying library that allows this modernisation to
  take place.
      [https://github.com/prinsss/node-tikzjax]


Disclaimer
==========

Copyright (c) 2026 Lachlan Harris. All Rights Reserved.
This project is licensed under the MIT License. For more information please see
`./LICENSE.txt`.
