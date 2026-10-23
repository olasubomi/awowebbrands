'use strict';

(async function loadCatalog() {
  const status = document.getElementById('catalog-status');
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  try {
    const response = await fetch('/api/services');
    if (!response.ok) throw new Error('catalog');
    const catalog = await response.json();
    for (const category of catalog.categories) {
      const jump = element('a', category.name);
      jump.href = `#${category.id}`;
      document.getElementById('category-nav').appendChild(jump);
      const section = element('section', '', 'service-section');
      section.id = category.id;
      section.appendChild(element('h2', category.name));
      const grid = element('div', '', 'service-grid');
      for (const service of catalog.services.filter(item => item.category === category.id)) {
        const card = element('article', '', 'service-card');
        card.appendChild(element('h3', service.name));
        card.appendChild(element('p', service.summary));
        const items = element('ul');
        for (const offering of service.includes) items.appendChild(element('li', offering));
        card.appendChild(items);
        const link = element('a', `Discuss ${service.name.toLowerCase()}`, 'text-link');
        link.href = `/consultation?service=${encodeURIComponent(service.id)}`;
        link.target = '_top';
        card.appendChild(link);
        grid.appendChild(card);
      }
      section.appendChild(grid);
      document.getElementById('catalog').appendChild(section);
    }
    status.hidden = true;
  } catch (_) {
    status.textContent = 'We could not load the services. Please refresh the page or contact us through the home page.';
  }
}());
