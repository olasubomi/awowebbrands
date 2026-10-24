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

## Known visual differences

Figma's temporary asset download endpoints returned an unavailable HTML page in the implementation environment. Decorative network/stock/background assets and service icons could not be imported. The preview uses a plain dark hero, a company-history panel in place of the stock image, text service marks, and a plain dark footer. These are reviewable adaptations, not a claim of pixel-identical implementation. Approved source logos and portfolio screenshots are included locally. Unsupported sample client logos are excluded. The stacked logo is used on dark backgrounds; the horizontal source uses black lettering.

## Review and release

Deploy only the feature branch to Vercel Preview for owner review. Keep production on the accepted release until the preview is approved. Review desktop, tablet and mobile navigation; service preselection; original screenshot links; company history; and inquiry copy. Do not submit real inquiries just to test layout. No database migration is required. A production release can be rolled back by restoring the previous homepage commit/deployment.

## Validation

- All 17 existing backend tests passed.
- Chromium checks at 1440, 834, 375 and 320px: no horizontal overflow, missing images, broken in-page anchors or browser script errors.
- Mobile menu toggle and Escape-to-close passed. Website-development consultation preselection passed at each size without submitting an inquiry.
- Desktop and mobile screenshots were inspected. Portfolio thumbnails preserve the original image content with `object-fit: contain`; full source screenshots open from their links. Logo proportions are preserved.
- Styling uses the system font fallback when Inter is unavailable; no external font request is required.
