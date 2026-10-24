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

## Source and approved pricing

`original_wordpress_index.html` supplied the original rate/package references. During preview review the owner confirmed the management and interview rates and replaced the old campaign rate with a minimum plus commission.

| Service                        | Owner-approved display price | Scope and remaining terms                                                                                                                     |
| ------------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Website updates and management | $50/hour                     | Confirm the tasks and support arrangement before work                                                                                         |
| Interview preparation bundle   | $75/bundle                   | Preparation resources and two mock interview sessions; scheduling and session arrangements confirmed before booking                           |
| Online branding and marketing  | $500 minimum plus commission | Commission percentage, calculation basis, advertising spend and campaign scope agreed before work; no percentage or commission basis invented |
| Web development                | Request a quote              | Scope-based quotation                                                                                                                         |
| Tutoring and exam preparation  | Request a quote              | Subject, session arrangements and rate to be agreed                                                                                           |

The old $500/campaign listing is superseded by the owner's $500 minimum plus commission instruction. Current confirmed prices are no longer labeled historical. No automatic booking or payment is enabled. Prices remain editorial display content; the inquiry API catalog and stored inquiry schema are unchanged. Existing `lib/services.js` supplies the consolidated service IDs, names, inclusions and questions. Page scope options are discussion starters, except the approved interview bundle's stated inclusions.

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
- `lib/service-details.js`: page-only scope options, owner-approved pricing, preparation notes and FAQs.
- `lib/site-pages.js`: shared escaped HTML renderer, service index/details, About, 404, sitemap.
- `public_html/assets/home/pages.css`: responsive interior-page styles using the established homepage palette and components.
- `app.js`: routes, preview indexing controls and verified legacy About redirects.
- The earlier `service-intake/services.html` and `assets/services.js` remain in the repository but are superseded by the server-rendered `/services` route.
- No database migration or new environment variable is required.
- Automated checks cover all five server-rendered service pages, approved pricing and commission wording, real 404 responses, canonical links, About content, query-preserving redirects, Preview noindex, and production sitemap coverage. Run `npm test`.

Keep this change in Preview until the owner reviews service scope, pricing presentation, photos/captions and navigation. No live deployment or PR merge is included in this increment.

Validation completed: all 21 automated tests passed. Chromium checks at 1440, 834, 375 and 320px covered the homepage, index, five detail pages and About page, image decoding, in-page anchors, overflow, navigation, and each service's consultation preselection. The catalog was also checked with JavaScript disabled. Desktop and mobile screenshots were inspected. No real inquiries or emails were sent during these checks. The inquiry API contract and Postman collection remain unchanged because the new endpoints are website pages, not additional data APIs.

## Awo STEM Coaching image audit

The separate `olasubomi/awostemcoaching` repository contains additional images that were not in the awowebbrands homepage migration. Its `public_html/collegiate_services.html` uses the tutor and group-tutoring photographs. Restored these to the tutoring detail page:

| Original repository path                                      | New website path                                    | Original dimensions |
| ------------------------------------------------------------- | --------------------------------------------------- | ------------------- |
| public_html/assets/img/collegiate_services/tutor.png          | public_html/assets/img/learning/tutor.webp          | 2006 × 1334         |
| public_html/assets/img/collegiate_services/group-tutoring.png | public_html/assets/img/learning/group-tutoring.webp | 700 × 350           |

These are learning illustrations from the earlier site, not identified as current employees, clients, or proof of a specific class. Source PNGs were encoded as lossless WebP without resizing or cropping; decoded RGBA pixel equality was checked before use. Original files in the coaching repository are unchanged.

Additional unused candidates found: classroom_tutor.jpeg, happy_student.jpeg, and career_services/online_tutor.png, plus original interview-review screenshots. These have not all been imported or represented as current customers. Figma's tutoring-frame inspection hit the connected plan's tool-call limit, so this audit is based on the repository assets and legacy HTML, not a claim that every Figma image has been enumerated.

After the pricing confirmation and learning-image restoration, all 21 tests passed again. Chromium checks at 1440/834/375/320px passed for the site pages, image loading, overflow, navigation and service preselection, including the longer campaign price label. The catalog still works without JavaScript. No real inquiry or email was sent.
