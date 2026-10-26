"use strict";

// Navigation remains visible if JavaScript is unavailable.
(() => {
  const button = document.querySelector(".menu-toggle");
  const nav = document.getElementById("main-nav");
  const mobile = window.matchMedia("(max-width: 760px)");
  function syncMenu() {
    button.hidden = !mobile.matches;
    button.setAttribute("aria-expanded", "false");
    nav.hidden = mobile.matches;
  }
  button.addEventListener("click", () => {
    nav.hidden = !nav.hidden;
    button.setAttribute("aria-expanded", String(!nav.hidden));
  });
  nav.addEventListener("click", (event) => {
    if (mobile.matches && event.target.closest("a")) syncMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mobile.matches && !nav.hidden) {
      syncMenu();
      button.focus();
    }
  });
  if (mobile.addEventListener) mobile.addEventListener("change", syncMenu);
  else mobile.addListener(syncMenu);
  syncMenu();
})();
