"use strict";

// Owner-approved catalog IDs and editorial placements; originals remain in Drive.
const photos = {
  "web-development": [
    "website-work",
    750,
    501,
    "A person working on a laptop by a window",
    "Built around your business",
    "A useful website starts with the people who will use it and the work it needs to support.",
  ],
  "website-management": [
    "business-support",
    1280,
    854,
    "Two people shaking hands across a desk",
    "Support as your business grows",
    "Bring your updates, questions, and priorities. We will work out the next steps together.",
  ],
  "digital-marketing": [
    "campaign-planning",
    1440,
    1080,
    "A team reviewing campaign plans and charts",
    "Start with a clear goal",
    "Connect your audience, message, and channels to the outcome you want to work toward.",
  ],
  "interview-preparation": [
    "career-community",
    1440,
    959,
    "Two people beside a laptop at a professional event",
    "People behind the preparation",
    "Our career-preparation work is part of the Awo STEM Coaching story, now continued through Soft Web Services.",
  ],
};

function serviceMedia(id, escape) {
  const photo = photos[id];
  if (!photo) return "";
  const [name, width, height, alt, title, copy] = photo;
  return `<section class="detail-section service-photo"><figure><img src="/assets/img/services/${name}.webp" width="${width}" height="${height}" loading="lazy" alt="${escape(alt)}"><figcaption>${id === "interview-preparation" ? "From our career-services archive" : "Illustrative image from our website collection"}</figcaption></figure><div><p class="eyebrow">${id === "interview-preparation" ? "Our story" : "Working together"}</p><h2>${escape(title)}</h2><p>${escape(copy)}</p></div></section>`;
}

const reviews = [
  {
    name: "Ibrahim Kallon",
    image: "ibrahim-review",
    width: 2556,
    height: 704,
    quote:
      "The instructor, Subomi, went above and beyond to help with prepping for take-home tests and white board interviews. Even on days that I was super tired and unmotivated, he'll reach out to provide assistant, he was like my sensei for the software engineer technical interviews prep. In the end, I received a full time developer position with a well know company; thank you so much for your help Subomi, you are a life saver!!!",
  },
  {
    name: "Khalil Adams",
    image: "khalil-review",
    width: 1314,
    height: 292,
    quote:
      "I had a great learning experience. We stayed diligent on the details of a technical coding interview such as timing, talking through code, and clean code styling. An obvious attention to detail required by a programmer! Would definitely recommend.",
  },
];

function serviceEvidence(id, escape) {
  if (id === "interview-preparation") {
    return `<section class="detail-section" aria-labelledby="review-heading"><p class="eyebrow">In their words</p><h2 id="review-heading">Preparation that made a difference.</h2><p>Feedback from our earlier interview-preparation work.</p><div class="options-grid">${reviews.map((review) => `<article class="option-card service-review"><h3>${escape(review.name)}</h3><blockquote><p>${escape(review.quote)}</p></blockquote><details class="source-image"><summary>View original review</summary><a href="/assets/img/services/${review.image}.webp"><img src="/assets/img/services/${review.image}.webp" width="${review.width}" height="${review.height}" loading="lazy" alt="Original review by ${escape(review.name)}; transcribed above"></a><p><a href="/assets/img/services/${review.image}.webp">Open full-size review</a></p></details></article>`).join("")}</div></section>`;
  }
  if (id === "digital-marketing") {
    return `<section class="detail-section" aria-labelledby="results-heading"><p class="eyebrow">Selected work</p><h2 id="results-heading">Campaigns &amp; client feedback.</h2><p>Original reporting from earlier campaigns. Each result reflects its own campaign and business context.</p><div class="options-grid"><article class="option-card"><h3>Dentox</h3><p>Advertising campaign reporting from our earlier work.</p><a class="text-link" href="/assets/img/case-studies/dentox-campaign-results.png">View original campaign results</a></article><article class="option-card"><h3>ChopChow</h3><p>Campaign reporting for an internal Awokorp brand.</p><a class="text-link" href="/assets/img/case-studies/chopchow-campaign-results.png">View original campaign results</a></article></div><figure class="marketing-review"><blockquote><p>It has been a great experience so far with Awo Web Brands, the quality of work and attention to detail is great, They have been able to identity my target market and potential new clients ver efficiently and wallet friendly prices! thumbs up</p></blockquote><figcaption>ROG Music Africa · Digital marketing</figcaption><a class="text-link" href="/assets/img/case-studies/rog-music-africa-review.png">Read the original review</a></figure></section>`;
  }
  if (id === "tutoring") {
    return `<section class="detail-section" aria-labelledby="remote-heading"><p class="eyebrow">Remote learning</p><h2 id="remote-heading">Work through it together, online.</h2><p>Discuss your subject, learning goals, and availability when you inquire.</p><details class="source-image"><summary>See remote-learning images</summary><div class="learning-gallery"><figure><a href="/assets/img/services/remote-tutoring.webp"><img src="/assets/img/services/remote-tutoring.webp" width="1440" height="744" loading="lazy" alt="An archived online tutoring call with a shared mathematics exercise"></a><figcaption>Online tutoring · From the Awo STEM Coaching archive</figcaption></figure><figure><img src="/assets/img/services/remote-learning.webp" width="1200" height="675" loading="lazy" alt="A learner joining an online lesson on a laptop"><figcaption>Remote learning · Illustrative image from our collection</figcaption></figure></div></details></section>`;
  }
  return "";
}
module.exports = { serviceMedia, serviceEvidence };
