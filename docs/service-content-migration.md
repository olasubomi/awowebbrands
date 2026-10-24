# Service discovery and company-content migration

## Delivered in Preview

The homepage now links to a server-rendered `/services` index and five dedicated service pages. Each page includes service scope, options/packages, pricing guidance, preparation notes, FAQs, related services, and a link to the existing consultation form with its service preselected. The public inquiry remains usable without an account. No checkout, automatic booking, or login is introduced.

| Page                                  | URL                             |
| ------------------------------------- | ------------------------------- |
| All services                          | /services                       |
| Website management                    | /services/website-management    |
| Web development                       | /services/web-development       |
| Digital marketing                     | /services/digital-marketing     |
| Tutoring and exam preparation         | /services/tutoring              |
| Interview preparation and bootcamps   | /services/interview-preparation |
| Company story and archive photographs | /about                          |

## Source and pricing review

`original_wordpress_index.html` is the source for the earlier rates below. `public_html3/about-us.html` identifies the portrait and supplies historical biographical context. Existing `lib/services.js` supplies the consolidated service IDs, names, inclusions, and consultation questions. Expanded scope options are editorial discussion starters derived from those existing services; they are not fixed packages with guaranteed quantities, timing, or prices.

| Earlier listing                | Historical rate           | Review before publishing as a current offer                                                   |
| ------------------------------ | ------------------------- | --------------------------------------------------------------------------------------------- |
| Website updates and management | $50/hour                  | Current hourly rate, minimum time, tasks and ongoing support terms                            |
| Interview preparation bundle   | $75/bundle                | Current price, resources, session count/duration; earlier listing specified two mock sessions |
| Online branding and marketing  | $500/campaign             | Current fee, campaign duration/deliverables, whether ad spend is separate                     |
| Web development                | No verified rate imported | Scope and quotation model                                                                     |
| Tutoring and exam preparation  | No verified rate imported | Subjects, session arrangements and rate                                                       |

Historical rates are visibly labeled as historical references, not current quotes or confirmed offers. No price is added to the inquiry API catalog, stored inquiry schema, checkout, or search Offer markup. Confirm current commercial terms before replacing this wording with active pricing. Preview approval is not approval of the earlier rates.

## Company photographs and content

- Reuses the existing portrait at `public_html/assets/img/about-us/nsbe_potrait_photo.jpeg`; the old About HTML identifies Olasubomi Awokoya at an NSBE conference.
- Reuses `ola_and_nsbe_president_karl_reid.jpeg` as a company-archive/community photograph. It is not presented as a current staff directory or endorsement. Its filename is not treated as evidence of a current title or employer.
- Retains Awo Web Brands history and the merger of Awo STEM Coaching services into Soft Web Services. Describes Awokorp as umbrella and ChopChow as an internal brand.
- Does not copy the earlier biography's time-sensitive employer/title claims. Current staff profiles, titles, expanded bios, and additional photos remain a separate content review; no current roster is invented.

## Indexing and old URLs

HTML content and service links are available without JavaScript. Pages carry unique titles, descriptions, and canonical URLs on `https://www.softwebs.io`. `/sitemap.xml` lists the homepage, service index/details, About, and consultation pages. The sitemap helps discovery but does not guarantee search-engine indexing.

Vercel Preview responses carry `X-Robots-Tag: noindex, nofollow`, and Preview `/robots.txt` disallows crawling. Production robots allows crawling and points to the production sitemap. Deployment protection is retained.

| Earlier entry point                   | Current destination           | Behavior                                  |
| ------------------------------------- | ----------------------------- | ----------------------------------------- |
| /about-us.html, /about-us, /about-us/ | /about                        | Permanent 308, query parameters preserved |
| /#About                               | Homepage company introduction | Uppercase anchor retained                 |
| /#Services                            | Homepage service panels       | Uppercase anchor retained                 |
| /awo_form, /awo_form/                 | Current consultation form     | Existing working aliases retained         |

The old WordPress View ALL SERVICES link pointed to an external demo URL; it is replaced with the local service index. A complete historical URL list was not available, so unverified service URLs are not claimed to have been migrated. Existing old-domain DNS/redirect work remains separate from these page routes.

## Maintenance and validation

- `lib/services.js`: existing catalog and intake questions; unchanged API contract.
- `lib/service-details.js`: page-only scope options, historical price references, preparation notes and FAQs.
- `lib/site-pages.js`: shared escaped HTML renderer, service index/details, About, 404, sitemap.
- `public_html/assets/home/pages.css`: responsive interior-page styles using the established homepage palette and components.
- `app.js`: routes, preview indexing controls and verified legacy About redirects.
- The earlier `service-intake/services.html` and `assets/services.js` remain in the repository but are superseded by the server-rendered `/services` route.
- No database migration or new environment variable is required.
- Automated checks cover all five server-rendered service pages, historical price labeling, real 404 responses, canonical links, About content, query-preserving redirects, Preview noindex, and production sitemap coverage. Run `npm test`.

Keep this change in Preview until the owner reviews service scope, historical pricing, photos/captions and navigation. No live deployment or PR merge is included in this increment.

Validation completed: all 21 automated tests passed. Chromium checks at 1440, 834, 375 and 320px covered the homepage, index, five detail pages and About page, image decoding, in-page anchors, overflow, navigation, and each service's consultation preselection. The catalog was also checked with JavaScript disabled. Desktop and mobile screenshots were inspected. No real inquiries or emails were sent during these checks. The inquiry API contract and Postman collection remain unchanged because the new endpoints are website pages, not additional data APIs.
