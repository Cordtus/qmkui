# Third-party notices

This file covers third-party code included in QMKUI's browser bundle and in
the linked `qmkui-doctor` dependency graph. Versions are fixed by
`apps/desktop/package-lock.json` and `Cargo.lock`.

## Browser bundle

- `@awesome.me/webawesome` 3.9.0 — MIT
- `@shoelace-style/animations` 1.2.0 — MIT
- `@shoelace-style/localize` 3.2.2 — MIT
- `@lit/reactive-element` 2.1.2 — BSD-3-Clause
- `lit` 3.3.3 — BSD-3-Clause
- `lit-element` 4.2.2 — BSD-3-Clause
- `lit-html` 3.3.3 — BSD-3-Clause
- Vite module-preload runtime from `vite` 7.3.6 — MIT

Copyright (c) 2025 Fonticons, Inc.

Copyright (c) 2020 A Beautiful Site, LLC

Copyright (c) 2020 Daniel Eden

Copyright (c) 2019-present, VoidZero Inc. and Vite contributors

The Web Awesome bundle embeds Font Awesome Free 7.0.0, 7.1.0, and 7.2.0 SVG
icon data with these notices:

Copyright 2025 Fonticons, Inc.

Copyright 2026 Fonticons, Inc.

Font Awesome Free SVG and JavaScript icon data is licensed under CC BY 4.0:
<https://fontawesome.com/license/free> and
<https://creativecommons.org/licenses/by/4.0/>. QMKUI's production build
bundles and minifies the icon data as delivered by Web Awesome; it does not
intentionally modify the icon artwork.

### BSD-3-Clause license for Lit

Copyright (c) 2017 Google LLC. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.

## qmkui-doctor dependency graph

The linked runtime libraries are `serde` and `serde_core` 1.0.228,
`serde_json` 1.0.150, `itoa` 1.0.18, `memchr` 2.8.2, and `zmij` 1.0.21.
Compilation also uses `serde_derive` 1.0.228, `proc-macro2` 1.0.106, `quote`
1.0.46, `syn` 2.0.118, and `unicode-ident` 1.0.24.

These crates are licensed under MIT, or are distributed under their MIT
option where the package offers a choice.

The Serde crates name Erick Tryzelaar and David Tolnay as authors. `itoa`,
`quote`, `syn`, `unicode-ident`, and `zmij` name David Tolnay. `proc-macro2`
names David Tolnay and Alex Crichton.

Copyright (c) 2015 Andrew Gallant (`memchr`)

`unicode-ident` additionally contains Unicode data under the Unicode License
v3 reproduced below.

## MIT license

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Unicode License v3

COPYRIGHT AND PERMISSION NOTICE

Copyright © 1991-2023 Unicode, Inc.

NOTICE TO USER: Carefully read the following legal agreement. BY DOWNLOADING,
INSTALLING, COPYING OR OTHERWISE USING DATA FILES, AND/OR SOFTWARE, YOU
UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND BY, ALL OF THE TERMS AND
CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT DOWNLOAD, INSTALL,
COPY, DISTRIBUTE OR USE THE DATA FILES OR SOFTWARE.

Permission is hereby granted, free of charge, to any person obtaining a copy
of data files and any associated documentation (the "Data Files") or software
and any associated documentation (the "Software") to deal in the Data Files
or Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, and/or sell copies of the Data
Files or Software, and to permit persons to whom the Data Files or Software
are furnished to do so, provided that either (a) this copyright and
permission notice appear with all copies of the Data Files or Software, or
(b) this copyright and permission notice appear in associated Documentation.

THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF
THIRD PARTY RIGHTS.

IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE BE
LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES, OR
ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER
IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA FILES OR SOFTWARE.

Except as contained in this notice, the name of a copyright holder shall not
be used in advertising or otherwise to promote the sale, use or other
dealings in these Data Files or Software without prior written authorization
of the copyright holder.
