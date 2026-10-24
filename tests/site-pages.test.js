"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../app");
const { services } = require("../lib/services");

async function server(t, env = {}) {
  const app = createApp({ env, enablePhoneVerification: false });
  const listener = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => listener.once("listening", resolve));
  t.after(() => new Promise((resolve) => listener.close(resolve)));
  return (path) =>
    fetch(`http://127.0.0.1:${listener.address().port}${path}`, {
      redirect: "manual",
    });
}

test("service discovery is rendered as HTML with crawlable detail links and canonical URLs", async (t) => {
  const get = await server(t);
  const index = await (await get("/services")).text();
  assert.doesNotMatch(index, /Loading services/);
  for (const service of services) {
    assert.ok(index.includes(`href="/services/${service.id}"`));
    const response = await get(`/services/${service.id}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes(`<h1>${service.name.replace(/&/g, "&amp;")}</h1>`));
    assert.ok(
      html.includes(
        `rel="canonical" href="https://www.softwebs.io/services/${service.id}"`,
      ),
    );
    assert.ok(html.includes(`/consultation?service=${service.id}`));
    assert.match(html, /Frequently asked questions/);
    assert.match(
      response.headers.get("content-security-policy"),
      /script-src 'self'/,
    );
    assert.doesNotMatch(html, /<script type="application\/ld\+json">.*Offer/);
  }
});

test("historical rates are clearly labeled and unknown services produce real 404s", async (t) => {
  const get = await server(t);
  for (const [id, rate] of [
    ["website-management", "$50/hour"],
    ["digital-marketing", "$500/campaign"],
    ["interview-preparation", "$75/bundle"],
  ]) {
    const html = await (await get(`/services/${id}`)).text();
    assert.ok(html.includes(rate));
    assert.match(html, /Historical reference only/);
    assert.match(html, /not a current quote or confirmed offer/);
  }
  for (const id of ["web-development", "tutoring"]) {
    assert.doesNotMatch(
      await (await get(`/services/${id}`)).text(),
      /historic-amount/,
    );
  }
  const response = await get("/services/%3Cscript%3E");
  assert.equal(response.status, 404);
  assert.doesNotMatch(await response.text(), /<script>/);
});

test("About content restores archive photos and legacy paths retain query strings", async (t) => {
  const get = await server(t);
  const html = await (await get("/about")).text();
  assert.match(html, /Olasubomi Awokoya/);
  assert.match(html, /nsbe_potrait_photo.jpeg/);
  assert.match(html, /ola_and_nsbe_president_karl_reid.jpeg/);
  assert.doesNotMatch(
    html,
    /now a Software Engineer at a tech startup|current NSBE president/i,
  );
  const response = await get("/about-us.html?from=archive");
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "/about?from=archive");
});

test("preview indexing is blocked and production sitemap lists every service", async (t) => {
  const preview = await server(t, { VERCEL_ENV: "preview" });
  for (const path of ["/", "/services", "/services/tutoring", "/about"]) {
    assert.equal(
      (await preview(path)).headers.get("x-robots-tag"),
      "noindex, nofollow",
    );
  }
  assert.match(await (await preview("/robots.txt")).text(), /Disallow: \//);
  const production = await server(t, { VERCEL_ENV: "production" });
  assert.equal(
    (await production("/services")).headers.get("x-robots-tag"),
    null,
  );
  const xml = await (await production("/sitemap.xml")).text();
  for (const service of services)
    assert.ok(xml.includes(`https://www.softwebs.io/services/${service.id}`));
  assert.match(
    await (await production("/robots.txt")).text(),
    /Sitemap: https:\/\/www.softwebs.io\/sitemap.xml/,
  );
});
