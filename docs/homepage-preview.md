# Soft Web Services homepage preview

## Scope

Replaces the exported WordPress homepage with responsive HTML/CSS and a small progressively enhanced navigation script. No framework or dependency change. Existing `/services`, `/consultation`, inquiry API, MongoDB records, and transactional emails retain their existing behavior. No account, login, role assignment, or dashboard is introduced.

## Design and content

- Figma source: Soft Web Services file `0uU9fjNy3fLccPXUMqZWj2`, desktop Home `307:1588` and mobile Home `396:395`.
- Retains the dark hero, green accents, introduction, testimonials, service panels, contact panel, and dark footer structure.
- Uses owner-designated SWS Logo2 vector exports, preserving original proportions and colors.
- Adds approved Dentox, ROG Music Africa and ChopChow source screenshots. ChopChow is identified as an internal brand.
- Awo Web Brands appears only as historical context or original testimonial wording. Former Awo STEM Coaching services are included under Soft Web Services.
- Consolidated service links use the existing five service IDs and preselect the working consultation form. No historic prices or placeholder vacancies are published.
- Contact panel explains the inquiry flow and links to the existing form, rather than creating a second submission implementation. Submitting does not confirm an appointment.

## Uploaded artwork

The owner supplied the five previously unavailable assets and the monitor management detail as PNG exports. Copies are stored locally in `public_html/assets/home/`; originals are unchanged. No temporary Figma URLs are used at runtime. Following owner review, the network image was removed from the homepage banner in favor of a plain black background; the source file is retained for possible future use.

| Uploaded file                                              | Website file           | Dimensions | Placement                                                |
| ---------------------------------------------------------- | ---------------------- | ---------- | -------------------------------------------------------- |
| gradient-network-connection-background_23-2148870917 1.png | network-background.png | 1512 × 564 | Retained source; not displayed in the homepage banner    |
| Rectangle 88.png                                           | about-dashboard.png    | 346 × 302  | Beside the company introduction, preserving aspect ratio |
| Background.png                                             | footer-background.png  | 1512 × 516 | Footer background with an additional dark overlay        |
| Group.png                                                  | web-services.png       | 84 × 84    | Web services card, 44px display size                     |
| system-uicons_book-text.png                                | education.png          | 87 × 87    | Learning and career support card, 44px display size      |

All three icon exports include transparency. The dashboard export is capped at its native width to avoid enlargement. The company-history panel is retained below the introduction and artwork.

## Remaining visual differences

The known homepage artwork gaps are resolved. The owner also supplied `eos-icons_cluster-management-outlined.png` (31 × 31, transparent), saved as `web-services-management.png` and displayed at 18px inside the monitor outline. A higher-resolution dashboard export would be useful if a larger display is wanted, but is not necessary at its current size. These are not blockers for reviewing this preview.

This remains an adapted homepage, not a pixel-identical copy of every Figma layer: testimonial decorations, animated cursor effects and some utility icons are not reproduced. Unsupported sample client logos are deliberately excluded. Approved source logos and portfolio screenshots are included locally. The stacked logo is used on dark backgrounds; the horizontal source uses black lettering. No further uploads are required for the current preview.

## Review and release

Deploy only the feature branch to Vercel Preview for owner review. Keep production on the accepted release until the preview is approved. Review desktop, tablet and mobile navigation; service preselection; original screenshot links; company history; and inquiry copy. Do not submit real inquiries just to test layout. No database migration is required. A production release can be rolled back by restoring the previous homepage commit/deployment.

## Validation

- All 17 existing backend tests passed.
- Chromium checks at 1440, 834, 375 and 320px: no horizontal overflow, missing images, broken in-page anchors or browser script errors.
- Mobile menu toggle and Escape-to-close passed. Website-development consultation preselection passed at each size without submitting an inquiry.
- Desktop and mobile screenshots were inspected. Portfolio thumbnails preserve the original image content with `object-fit: contain`; full source screenshots open from their links. Logo proportions are preserved.
- Styling uses the system font fallback when Inter is unavailable; no external font request is required.
- After integrating the uploaded artwork, Chromium checks were repeated at all four widths. All five PNG routes returned image/png with HTTP 200; hero/footer background URLs, image decoding, mobile navigation, anchors, and consultation preselection passed. New desktop and mobile screenshots were inspected. No inquiry was submitted.
