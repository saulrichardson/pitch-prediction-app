# Bundled fonts

Latin WOFF2 subsets of Barlow Condensed (500/600/700) and Source Sans 3
(variable 400–700), downloaded from the Google Fonts CSS API on 2026-10-05.
The accompanying OFL files retain each family's license and copyright notice.

These exact assets use `next/font/local`. Builds and development startup do not
fetch or parse remote Google Fonts CSS. This removes the intermittent Turbopack
Google-font import failure observed in CI run 37333356847.

Sources:

- https://fonts.google.com/specimen/Barlow+Condensed
- https://fonts.google.com/specimen/Source+Sans+3
- https://github.com/google/fonts/tree/main/ofl/barlowcondensed
- https://github.com/google/fonts/tree/main/ofl/sourcesans3
