# Actual Starter Materials and Telugu Font

Acquired on 17 October 2026. Exact retrieval times, original URLs, authors, byte counts, and SHA-256 hashes are in the manifests. The material downloads also match the provider's listed MD5 and byte counts. The font files match the official Google Fonts directory's Git object hashes and sizes.

These are usable original asset bytes. They are generic surfaces and a font, not photographed Hyderabad streets, verified storefronts, a finished car, or completed production meshes. None has been integrated into or performance-tested in the game.

## Included materials

All six textures decode successfully at **1024 × 1024** pixels. Original downloaded bytes are preserved without image editing.

| Asset | Downloaded files | Source and author |
|---|---|---|
| Aerial Asphalt 01 | Diffuse JPEG, OpenGL normal PNG, packed ARM JPEG | [Poly Haven asset page](https://polyhaven.com/a/aerial_asphalt_01); Rob Tuytel. |
| Concrete Wall 006 | Diffuse JPEG, OpenGL normal PNG, packed ARM PNG | [Poly Haven asset page](https://polyhaven.com/a/concrete_wall_006); Charlotte Baglioni, photography; Dario Barresi, processing. |

Files are in `materials/aerial_asphalt_01/` and `materials/concrete_wall_006/`, relative to this document. The complete inventory is `materials/asset-manifest.json`. Its `local_path` values are relative to `resources/`.

Both downloaded diffuse images were visually inspected. The asphalt shows grey aggregate, cracks, and dark curved marks. The concrete has grey-brown weathering, pits, holes, and uneven staining. This inspection establishes what these image files contain. It does not validate their appearance on a game mesh or their correspondence to a particular Hyderabad location.

### Material setup

Use the diffuse map as sRGB base color. Treat the OpenGL normal map and packed ARM map as non-color data. ARM means red ambient occlusion, green roughness, and blue metalness. Use the selected Three.js version's documented UV requirements for ambient occlusion. Check normal orientation, material scalar multipliers, tiling, lighting, and seam visibility in the actual scene. The [Three.js material documentation](https://threejs.org/docs/pages/MeshStandardMaterial.html) specifies the relevant texture channels and color-space treatment.

The asphalt ARM uses the provider's original JPEG to keep this starter addition below 15 MB. It is lossy scalar data. Check for artifacts and consider the provider's lossless source during final production. The two normal maps are PNG originals. The concrete normal and ARM PNG files are relatively large source files; production compression should be generated separately and measured on the target devices.

Do not derive surveyed road dimensions from these materials. The asphalt metadata contains both a legacy `15x15 M` scale string and a separate dimensions value. Preserve that disagreement and establish artistic tiling through inspected scene references. Neither value measures a Hyderabad road. The concrete page advertises a two-metre material width, not the dimensions of any local structure.

## Included Telugu font

`fonts/noto-sans-telugu/NotoSansTelugu-Variable.ttf` contains the unmodified bytes of the official Google Fonts `NotoSansTelugu[wdth,wght].ttf`. Only the local filename was normalized. The same folder includes the original `OFL.txt` and `METADATA.pb`. The inventory is `fonts/asset-manifest.json`.

The font parses as **Noto Sans Telugu, version 2.005**, with weight 100–900 and width 62.5–100 axes. Its character map includes 100 Unicode code points in the Telugu block. This binary inspection does not prove correct shaping of every sign or correctness of local spelling. Test the actual reviewed Telugu names in the chosen browser/text renderer, including conjuncts, vowel marks, fallback, and small-screen readability.

The copyright holder is The Noto Project Authors. Distribute the font with its included SIL Open Font License 1.1 and copyright notice. If producing a modified font or subset, follow that license and document the derived file separately. Do not claim support for unrelated scripts from this Telugu font alone.

Official directory: [Google Fonts Noto Sans Telugu](https://github.com/google/fonts/tree/main/ofl/notosanstelugu).

## Rights, acquisition, and remaining work

Poly Haven publishes these assets under [CC0](https://polyhaven.com/license). Its [live API terms](https://github.com/Poly-Haven/Public-API/blob/master/ToS.md) were inspected before acquisition. They permit the retrieval used here and require identifiable requests. Requests used `HyderabadMetroDelivery-StarterAssetAcquisition/1.0`. The game should serve packaged assets without depending on the live API. The source is credited here without implying endorsement.

`materials/source/` preserves the asset API metadata. `fonts/source/` preserves the official directory response. `materials/source/source-acquisition.json` distinguishes five bundled source records from two external-only licensing-review captures. Bundled records have `bundled: true` and a `local_path` relative to `resources/`; verify their bytes and SHA-256 against that file. Records marked `bundled: false` and `record_type: external_review_capture` preserve the reviewed URL, retrieval time, byte count, and hash without claiming a bundled local file. Explicitly skip bundled-file verification for those two records. The full website pages are retained outside this handoff bundle; the concise licensing summary and links above remain available here. All asset URLs were taken from observed official metadata, rather than guessed filenames.

Remaining production work includes geometry and UV authoring, local facade and vehicle assets, color and lighting calibration, compression and mipmaps, text shaping tests, and actual mobile rendering measurements. Keep the source files intact and place processed runtime derivatives in the implementation project's asset pipeline.
