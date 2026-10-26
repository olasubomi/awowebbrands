# Soft Web Services logo assets

Source: owner-designated SWS Logo2 folder in Google Drive. The original artwork remains unchanged in Drive. Exported vector paths retain the supplied lettering, globe, arrow and colors; blank page margins were trimmed for website use.

| Web asset                                          | Source artwork                                       | Intended placement                                             |
| -------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------- |
| `/assets/brand/soft-web-services-horizontal.svg`   | SOFTWEB SERVICES version 1 black and green color.pdf | Light website header; horizontal logo                          |
| `/assets/brand/soft-web-services-stacked.svg`      | SOFTWEB SERVICES version 2 black and green color.pdf | Larger light-background brand sections                         |
| `/assets/brand/soft-web-services-stacked-dark.svg` | SOFTWEB SERVICES version 2 white and green color.pdf | Black-background sections; supplied black background preserved |

PNG fallbacks are available beside each SVG. Use SVGs for sharp rendering and preserve their aspect ratios. Do not stretch the artwork or recolor it. Give linked logos accessible text such as Soft Web Services home. The bright green logo lettering is artwork; keep accessible darker green for small UI text/buttons rather than using the logo green indiscriminately.

These assets are prepared for the redesigned homepage Preview. They have not yet replaced the live homepage logo. Awo Web Brands remains appropriate in company-history content, not as the new site's primary brand.

## Browser favicon

The owner selected option 2 from the favicon comparison on 26 October 2026: bold white **SWS** initials on a near-black rounded square with a green underline. This replaces the detailed globe favicon that was difficult to read in a browser tab. The original globe asset remains in the SWS Logo2 folder; the website logo is unchanged.

- `/assets/brand/sws-favicon.svg`: scalable monogram with lettering converted to vector outlines, so it has no external font dependency.
- `/assets/brand/sws-favicon-32.png` and `sws-favicon-16.png`: raster fallbacks rendered from the same selected design.
- `/favicon.ico`: 16/32/48px fallback for browser requests at the root.

The homepage, shared service/About layout, and consultation form explicitly reference the new icons with the `sws-2` cache version. No external icon service, runtime dependency, database change, or environment variable is required. This change is deployed to Preview for review; production promotion remains separate.
