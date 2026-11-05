"use strict";
const { services, categories } = require("./services");
const { details } = require("./service-details");
const { serviceMedia, serviceEvidence } = require("./service-media");
const origin = "https://www.softwebs.io";
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const list = (items) =>
  `<ul>${items.map((item) => `<li>${escape(item)}</li>`).join("")}</ul>`;
const consult = (id) => `/consultation?service=${encodeURIComponent(id)}`;

function layout(title, description, pathname, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} | Soft Web Services</title><meta name="description" content="${escape(description)}"><link rel="canonical" href="${origin}${pathname}"><link rel="icon" type="image/png" sizes="32x32" href="/assets/brand/sws-favicon-32.png?v=sws-2"><link rel="icon" type="image/png" sizes="16x16" href="/assets/brand/sws-favicon-16.png?v=sws-2"><link rel="shortcut icon" href="/favicon.ico?v=sws-2"><link rel="icon" type="image/svg+xml" sizes="any" href="/assets/brand/sws-favicon.svg?v=sws-2"><link rel="stylesheet" href="/assets/home/home.css"><link rel="stylesheet" href="/assets/home/pages.css"><script src="/assets/home/home.js" defer></script></head><body class="content-page"><a class="skip" href="#main">Skip to content</a><header class="site-header"><div class="wrap header-inner"><a class="brand" href="/" aria-label="Soft Web Services home"><img src="/assets/brand/soft-web-services-stacked-dark.svg" width="140" height="80" alt="Soft Web Services"></a><button class="menu-toggle" type="button" aria-expanded="false" aria-controls="main-nav" hidden>Menu <span aria-hidden="true">☰</span></button><nav id="main-nav" aria-label="Main navigation"><a href="/services"${pathname.startsWith("/services") ? ' aria-current="page"' : ""}>Services</a><a href="/about"${pathname === "/about" ? ' aria-current="page"' : ""}>About us</a><a href="/#work">Our work</a><a class="button" href="/consultation">Let’s talk</a></nav></div></header><main id="main">${body}</main><footer class="site-footer"><div class="wrap footer-grid"><div><img src="/assets/brand/soft-web-services-stacked-dark.svg" width="180" height="104" alt="Soft Web Services"><p>Technology. Learning. Progress.</p></div><div><h2>Explore</h2><a href="/services">All services</a><a href="/about">Our story</a><a href="/#work">Selected work</a></div><div><h2>Let’s connect</h2><a href="/consultation">Request a consultation</a><a href="/events">Community events</a><a href="/login">Member &amp; staff sign-in</a><a href="mailto:subomi@awokorp.com">subomi@awokorp.com</a></div></div><div class="wrap footer-bottom"><p>© ${new Date().getFullYear()} Soft Web Services. All rights reserved.</p><p>Awo Web Brands is part of our story.</p></div></footer></body></html>`;
}

function catalogPage() {
  const cards = categories
    .map(
      (category) =>
        `<section class="catalog-section" id="${category.id}"><h2>${escape(category.name)}</h2><div class="options-grid">${services
          .filter((service) => service.category === category.id)
          .map(
            (service) =>
              `<article class="option-card"><h3><a href="/services/${service.id}">${escape(service.name)}</a></h3><p>${escape(service.summary)}</p>${list(service.includes)}<a class="text-link" href="/services/${service.id}">Explore scope &amp; packages</a></article>`,
          )
          .join("")}</div></section>`,
    )
    .join("");
  return layout(
    "Services",
    "Explore web development, website management, digital marketing, tutoring and interview preparation, with service details and package options.",
    "/services",
    `<div class="wrap"><section class="detail-hero"><p class="eyebrow">Our services</p><h1>What would you like<br>to move forward?</h1><p class="page-lead">Build your online presence, reach customers, strengthen your understanding, or prepare for your next opportunity.</p><p>Explore the scope and options for each service, then tell us what you need.</p></section><nav class="service-jumps" aria-label="Service categories">${categories.map((category) => `<a href="#${category.id}">${escape(category.name)}</a>`).join("")}</nav>${cards}<aside class="next-step"><div><p class="eyebrow">Let’s work it out together</p><h2>Not sure which service fits?</h2><p>You don’t need a technical brief to start a conversation.</p></div><a class="button dark" href="${consult("not-sure")}">Help me choose</a></aside></div>`,
  );
}

function servicePage(id) {
  const service = services.find((item) => item.id === id);
  const detail = details[id];
  if (!service || !detail) return null;
  const pricing = detail.price
    ? `<aside class="rate-card"><h3>Service pricing</h3><p class="rate-amount">${escape(detail.price)}</p><p>${escape(detail.priceScope)}</p><p>We will agree on scope, availability, and any additional costs before work begins.</p></aside>`
    : "";
  const related = services
    .filter((item) => item.id !== id)
    .map((item) => `<a href="/services/${item.id}">${escape(item.name)}</a>`)
    .join("");
  const learningImages =
    id === "tutoring"
      ? `<section class="detail-section"><p class="eyebrow">Learning support</p><h2>Build understanding.<br>Grow your confidence.</h2><div class="learning-gallery"><figure><img src="/assets/img/learning/tutor.webp" width="2006" height="1334" loading="lazy" alt="A tutor and learner reviewing study material"><figcaption>Focused support with the topics you want to understand.</figcaption></figure><figure><img src="/assets/img/learning/group-tutoring.webp" width="700" height="350" loading="lazy" alt="A learning group working through a problem at a whiteboard"><figcaption>Working through ideas, questions, and practice.</figcaption></figure></div></section>`
      : "";
  const content = `<div class="wrap"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/services">Services</a></nav><section class="detail-hero"><p class="eyebrow">${escape(detail.audience)}</p><h1>${escape(service.name)}</h1><p class="page-lead">${escape(detail.intro)}</p><div class="actions"><a class="button dark" href="${consult(id)}">Discuss this service</a><a class="text-link" href="#packages">Explore options</a></div></section><section class="detail-section" aria-labelledby="includes"><p class="eyebrow">The starting point</p><h2 id="includes">What we can help with</h2>${list(service.includes)}</section>${serviceMedia(id, escape)}${learningImages}<section class="detail-section" id="packages" aria-labelledby="packages-heading"><p class="eyebrow">Scope &amp; packages</p><h2 id="packages-heading">Choose a starting point.</h2><p>These options help shape our conversation. We’ll agree on deliverables, timing, and pricing for your needs.</p><div class="options-grid">${detail.options.map((option) => `<article class="option-card"><h3>${escape(option.name)}</h3><p>${escape(option.description)}</p>${list(option.includes)}<a class="text-link" href="${consult(id)}">Discuss this option</a></article>`).join("")}</div></section>${serviceEvidence(id, escape)}<section class="detail-section pricing-grid" aria-labelledby="pricing"><div><p class="eyebrow">Pricing</p><h2 id="pricing">A clear scope.<br>A confirmed quote.</h2><p>We will confirm the scope and total cost for the work or support you need. An inquiry does not commit you to a purchase or confirm an appointment.</p><a class="button dark" href="${consult(id)}">Request a quote</a></div>${pricing}</section><section class="detail-section preparation"><div><p class="eyebrow">Before we talk</p><h2>What to share</h2>${list(detail.prepare)}</div><div><h3>How it works</h3><ol><li>Describe what you need in the consultation form.</li><li>Receive your saved inquiry reference.</li><li>We follow up to confirm scope, pricing, and scheduling.</li></ol><p>No account is required to send an inquiry.</p></div></section><section class="detail-section faqs" aria-labelledby="faq-heading"><p class="eyebrow">A few useful answers</p><h2 id="faq-heading">Frequently asked questions</h2>${detail.faqs.map(([question, answer]) => `<details><summary>${escape(question)}</summary><p>${escape(answer)}</p></details>`).join("")}</section><aside class="related"><h2>Explore other services</h2>${related}</aside></div>`;
  return layout(service.name, service.summary, `/services/${id}`, content);
}

function aboutPage() {
  return layout(
    "About us",
    "Meet Soft Web Services: our company history, web services and learning support, and Olasubomi Awokoya.",
    "/about",
    `<div class="wrap"><section class="detail-hero"><p class="eyebrow">Our story</p><h1>Technology and learning.<br>Built around people.</h1><p class="page-lead">Soft Web Services brings business web services and personalized learning support together.</p></section><section class="detail-section about-story"><div><h2>A familiar team.<br>A broader offering.</h2><p>Awo Web Brands is part of our company history. Its web services continue under Soft Web Services, alongside the tutoring and career-preparation services formerly offered through Awo STEM Coaching.</p><p>Awokorp is the umbrella company for Soft Web Services and ChopChow. Soft Web Services is our public-facing technology company; ChopChow is an internal brand with its own ecosystem.</p><a class="text-link" href="/services">Explore our services</a></div><div class="story-panel"><p class="eyebrow">What we do</p><h3>Build. Support. Teach.</h3><p>Web development and website management. Digital marketing. Tutoring and exam preparation. Interview practice and mentoring.</p><p>Each engagement starts with your goal and a conversation about the support you need.</p></div></section><section class="detail-section person-grid" aria-labelledby="person-heading"><figure class="portrait"><img src="/assets/img/about-us/nsbe_potrait_photo.jpeg" width="1370" height="1824" loading="lazy" alt="Olasubomi Awokoya at an NSBE conference"><figcaption>Olasubomi Awokoya · From our company archive</figcaption></figure><div><p class="eyebrow">People behind the work</p><h2 id="person-heading">Olasubomi Awokoya</h2><p>Soft Web Services builds on Subomi’s work in software engineering, digital projects, and learning support.</p><p>Our approach connects practical technology work with helping people understand, build, and prepare for their next opportunity.</p><a class="button dark" href="/consultation">Start a conversation</a></div></section><section class="detail-section archive-grid"><div><p class="eyebrow">Community &amp; connections</p><h2>Part of our story.</h2><p>We’re retaining the photographs and company history from our earlier website as the Soft Web Services site develops.</p></div><figure><img src="/assets/img/about-us/ola_and_nsbe_president_karl_reid.jpeg" width="1880" height="1312" loading="lazy" alt="A professional event photograph from our earlier company collection"><figcaption>Community connections · From our company archive</figcaption></figure></section></div>`,
  );
}

function notFoundPage() {
  return layout(
    "Page not found",
    "Explore the available Soft Web Services offerings.",
    "/services",
    '<section class="wrap detail-hero"><p class="eyebrow">Page not found</p><h1>Let’s find the right service.</h1><p>This service page is not available.</p><a class="button dark" href="/services">Explore all services</a></section>',
  );
}

function sitemap() {
  const paths = [
    "/",
    "/services",
    ...services.map((service) => `/services/${service.id}`),
    "/about",
    "/consultation",
  ];
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${origin}${path}</loc></url>`).join("")}</urlset>`;
}
module.exports = { catalogPage, servicePage, aboutPage, notFoundPage, sitemap };
