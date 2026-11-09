'use strict';

function workspaceHeader(member, features = {}, current) {
  const admin = member.permissions.includes('team:manage');
  const scheduling = member.permissions.some(p => ['scheduling:manage:own', 'scheduling:manage:any'].includes(p));
  const links = [
    ['/workspace', 'My workspace'],
    ['/workspace/profile', 'My profile &amp; roles'],
    ...(features.community ? [['/workspace/events', 'Events &amp; attendance']] : []),
    ...(features.scheduling && scheduling ? [['/workspace/scheduling', 'Meeting polls']] : []),
    ...(admin && features.team ? [['/admin/team', 'Team &amp; Access']] : []),
    ...(admin ? [['/admin/inquiries', 'Inquiries']] : [])
  ];
  return '<header><div class="header-inner"><a class="brand" href="/" aria-label="Soft Web Services home"><img src="/assets/brand/soft-web-services-stacked-dark.svg" width="126" height="73" alt="Soft Web Services"></a>' +
    '<nav class="workspace-nav" aria-label="Workspace navigation">' +
    links.map(([href, label]) => '<a href="' + href + '"' + (current === href ? ' aria-current="page"' : '') + '>' + label + '</a>').join('') +
    '<button id="sign-out" class="secondary" type="button">Sign out</button><span id="sign-out-status" role="status" hidden></span></nav></div><script src="/admin-assets/workspace-navigation.js" defer></script></header>';
}

module.exports = { workspaceHeader };
